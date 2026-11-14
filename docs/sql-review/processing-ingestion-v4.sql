-- MEMORA verified processing ingestion v4: REVIEW ONLY. Not applied.
-- Execution order: approved dispatch-v3.sql, then this file in one transaction.
-- Replaces v3's temporary guards with transaction-local verified ingestion controls.
-- No original files, storage objects, approval records or RLS policies are modified.

DO $preflight$
DECLARE required text; mismatch integer;
BEGIN
  FOREACH required IN ARRAY ARRAY[
    'public.claim_approved_processing_job(uuid,uuid,uuid,text,integer)',
    'public.assert_processing_attempt(uuid,uuid,uuid,text)',
    'public.fail_processing_attempt(uuid,uuid,uuid,text,text)'
  ] LOOP
    IF pg_catalog.to_regprocedure(required) IS NULL THEN
      RAISE EXCEPTION 'Approved dispatch v3 prerequisite missing: %', required;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='extensions' AND p.proname='digest') THEN
    RAISE EXCEPTION 'pgcrypto digest function required';
  END IF;
  SELECT pg_catalog.count(*) INTO mismatch FROM (VALUES
    ('processing_jobs','dispatch_token','uuid'),('processing_jobs','dispatch_worker_id','text'),
    ('processing_jobs','dispatch_actor_id','uuid'),('processing_jobs','dispatch_attempts','int4'),
    ('processing_jobs','lease_expires_at','timestamptz'),('videos','file_id','uuid'),
    ('documents','file_id','uuid'),('transcript_segments','video_id','uuid'),
    ('video_frames','video_id','uuid'),('document_pages','document_id','uuid'),
    ('document_slides','document_id','uuid'),('knowledge_chunks','file_id','uuid')
  ) AS e(tbl,col,typ)
  LEFT JOIN pg_catalog.pg_class c ON c.relnamespace='public'::pg_catalog.regnamespace AND c.relname=e.tbl
  LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attname=e.col AND NOT a.attisdropped
  LEFT JOIN pg_catalog.pg_type ty ON ty.oid=a.atttypid
  WHERE a.attname IS NULL OR ty.typname<>e.typ;
  IF mismatch<>0 THEN RAISE EXCEPTION 'Required ingestion base schema incompatible'; END IF;
END $preflight$;

CREATE TABLE public.processing_artifacts (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  job_id uuid NOT NULL REFERENCES public.processing_jobs(id),
  file_id uuid NOT NULL REFERENCES public.files(id),
  kind text NOT NULL CHECK(kind IN ('frame','thumbnail')),
  storage_path text NOT NULL UNIQUE,
  size_bytes bigint NOT NULL CHECK(size_bytes>0 AND size_bytes<=2097152),
  sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
GRANT SELECT ON public.processing_artifacts TO authenticated;
GRANT ALL ON public.processing_artifacts TO service_role;
ALTER TABLE public.processing_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_read ON public.processing_artifacts FOR SELECT TO authenticated
  USING(public.is_workspace_member(workspace_id));

CREATE TABLE public.processing_results (
  job_id uuid PRIMARY KEY REFERENCES public.processing_jobs(id),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  file_id uuid NOT NULL REFERENCES public.files(id),
  kind text NOT NULL CHECK(kind IN ('video','document')),
  language text,
  duration_seconds double precision,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  manifest_sha256 text NOT NULL CHECK(manifest_sha256 ~ '^[0-9a-f]{64}$'),
  completed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
GRANT SELECT ON public.processing_results TO authenticated;
GRANT ALL ON public.processing_results TO service_role;
ALTER TABLE public.processing_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_read ON public.processing_results FOR SELECT TO authenticated
  USING(public.is_workspace_member(workspace_id));

-- Existing output rows remain valid with NULL attempt metadata. New writes are attempt-bound.
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS processing_job_id uuid,
  ADD COLUMN IF NOT EXISTS language text;
ALTER TABLE public.video_speakers ADD COLUMN IF NOT EXISTS processing_job_id uuid,
  ADD COLUMN IF NOT EXISTS speaker_key text;
ALTER TABLE public.transcript_segments ADD COLUMN IF NOT EXISTS processing_job_id uuid,
  ADD COLUMN IF NOT EXISTS content_sha256 text;
ALTER TABLE public.speaker_turns ADD COLUMN IF NOT EXISTS processing_job_id uuid;
ALTER TABLE public.video_frames ADD COLUMN IF NOT EXISTS processing_job_id uuid,
  ADD COLUMN IF NOT EXISTS thumbnail_path text,
  ADD COLUMN IF NOT EXISTS thumbnail_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS thumbnail_sha256 text;
ALTER TABLE public.slide_intervals ADD COLUMN IF NOT EXISTS processing_job_id uuid;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS processing_job_id uuid,
  ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE public.document_pages ADD COLUMN IF NOT EXISTS processing_job_id uuid,
  ADD COLUMN IF NOT EXISTS ocr_required boolean;
ALTER TABLE public.document_slides ADD COLUMN IF NOT EXISTS processing_job_id uuid,
  ADD COLUMN IF NOT EXISTS title text, ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.knowledge_chunks ADD COLUMN IF NOT EXISTS processing_job_id uuid,
  ADD COLUMN IF NOT EXISTS source_key text, ADD COLUMN IF NOT EXISTS content_sha256 text;

DO $columns$
DECLARE mismatch integer;
BEGIN
  SELECT pg_catalog.count(*) INTO mismatch FROM (VALUES
    ('videos','processing_job_id','uuid'),('videos','language','text'),
    ('video_speakers','processing_job_id','uuid'),('video_speakers','speaker_key','text'),
    ('transcript_segments','processing_job_id','uuid'),('transcript_segments','content_sha256','text'),
    ('speaker_turns','processing_job_id','uuid'),('video_frames','processing_job_id','uuid'),
    ('video_frames','thumbnail_path','text'),('video_frames','thumbnail_size_bytes','int8'),
    ('video_frames','thumbnail_sha256','text'),('slide_intervals','processing_job_id','uuid'),
    ('documents','processing_job_id','uuid'),('documents','metadata','jsonb'),
    ('document_pages','processing_job_id','uuid'),('document_pages','ocr_required','bool'),
    ('document_slides','processing_job_id','uuid'),('document_slides','title','text'),
    ('document_slides','notes','text'),('knowledge_chunks','processing_job_id','uuid'),
    ('knowledge_chunks','source_key','text'),('knowledge_chunks','content_sha256','text')
  ) AS e(tbl,col,typ)
  LEFT JOIN pg_catalog.pg_class c ON c.relnamespace='public'::pg_catalog.regnamespace AND c.relname=e.tbl
  LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attname=e.col AND NOT a.attisdropped
  LEFT JOIN pg_catalog.pg_type ty ON ty.oid=a.atttypid
  WHERE a.attname IS NULL OR ty.typname<>e.typ;
  IF mismatch<>0 THEN RAISE EXCEPTION 'Conflicting ingestion columns; transaction rolled back'; END IF;
END $columns$;

-- Multiple reviewed processing jobs may retain their own result sets for one original.
-- Only the two historical one-row-per-file UNIQUE constraints are replaced; rows are preserved.
DO $history$
DECLARE c record;
BEGIN
  FOR c IN SELECT conrelid,conname,pg_catalog.pg_get_constraintdef(oid) AS definition
    FROM pg_catalog.pg_constraint WHERE (conrelid='public.videos'::pg_catalog.regclass AND conname='videos_file_id_key')
      OR (conrelid='public.documents'::pg_catalog.regclass AND conname='documents_file_id_key') LOOP
    IF c.definition<>'UNIQUE (file_id)' THEN RAISE EXCEPTION 'Unexpected file uniqueness constraint'; END IF;
    EXECUTE pg_catalog.format('ALTER TABLE %s DROP CONSTRAINT %I',c.conrelid,c.conname);
  END LOOP;
END $history$;

CREATE INDEX IF NOT EXISTS videos_file_history ON public.videos(file_id,created_at);
CREATE INDEX IF NOT EXISTS documents_file_history ON public.documents(file_id,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS videos_processing_job_unique ON public.videos(processing_job_id) WHERE processing_job_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS documents_processing_job_unique ON public.documents(processing_job_id) WHERE processing_job_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS speakers_job_key_unique ON public.video_speakers(processing_job_id,speaker_key) WHERE processing_job_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS transcript_job_time_unique ON public.transcript_segments(processing_job_id,start_seconds,end_seconds) WHERE processing_job_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS turns_job_time_unique ON public.speaker_turns(processing_job_id,speaker_id,start_seconds,end_seconds) WHERE processing_job_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS frames_job_path_unique ON public.video_frames(processing_job_id,storage_path) WHERE processing_job_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pages_job_number_unique ON public.document_pages(processing_job_id,page_number) WHERE processing_job_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS slides_job_number_unique ON public.document_slides(processing_job_id,slide_number) WHERE processing_job_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_job_source_unique ON public.knowledge_chunks(processing_job_id,source_key) WHERE processing_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS processing_artifacts_job ON public.processing_artifacts(job_id,created_at);
CREATE INDEX IF NOT EXISTS processing_results_workspace ON public.processing_results(workspace_id,created_at);
CREATE INDEX IF NOT EXISTS knowledge_workspace_content ON public.knowledge_chunks(workspace_id,content_sha256);

-- The old guards remain in place, but now recognize only the transaction-local context
-- installed by finalize_processing_attempt after its locked fencing checks.
CREATE OR REPLACE FUNCTION public.block_uninstalled_processing_ingestion()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
BEGIN
  IF NEW.processing_job_id IS NULL OR
     pg_catalog.current_setting('memora.verified_ingestion',true) IS DISTINCT FROM NEW.processing_job_id::text THEN
    RAISE EXCEPTION 'Verified fenced ingestion context required' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $fn$;
CREATE OR REPLACE FUNCTION public.block_unverified_processing_completion()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
BEGIN
  IF NEW.status='Completed' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'Completed') AND
     pg_catalog.current_setting('memora.verified_ingestion',true) IS DISTINCT FROM NEW.id::text THEN
    RAISE EXCEPTION 'Verified fenced finalization required' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $fn$;

DO $guards$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['videos','video_speakers','transcript_segments','speaker_turns',
    'video_frames','slide_intervals','documents','document_pages','document_slides','knowledge_chunks'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=pg_catalog.format('public.%I',t)::pg_catalog.regclass
      AND tgname='memora_ingestion_not_installed' AND NOT tgisinternal) THEN
      EXECUTE pg_catalog.format('CREATE TRIGGER memora_ingestion_not_installed BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.block_uninstalled_processing_ingestion()',t);
    END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.processing_jobs'::pg_catalog.regclass
    AND tgname='memora_completion_not_installed' AND NOT tgisinternal) THEN
    CREATE TRIGGER memora_completion_not_installed BEFORE INSERT OR UPDATE ON public.processing_jobs
      FOR EACH ROW EXECUTE FUNCTION public.block_unverified_processing_completion();
  END IF;
END $guards$;

CREATE OR REPLACE FUNCTION public.progress_processing_attempt(
  p_job uuid,p_workspace uuid,p_token uuid,p_worker_id text,p_stage text,p_progress integer,p_lease_seconds integer DEFAULT 300
) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE j public.processing_jobs; expiry timestamptz;
BEGIN
  IF p_progress IS NULL OR p_progress NOT BETWEEN 0 AND 99 OR p_lease_seconds NOT BETWEEN 60 AND 900 OR p_stage NOT IN
    ('Downloading original','Original verified','Extracting audio','Transcribing audio','Extracting keyframes',
     'Extracting document','Uploading frame artifacts','Persisting results') THEN
    RAISE EXCEPTION 'Invalid progress event' USING ERRCODE='22023';
  END IF;
  j:=public.assert_processing_attempt(p_job,p_workspace,p_token,p_worker_id);
  expiry:=pg_catalog.clock_timestamp()+pg_catalog.make_interval(secs=>p_lease_seconds);
  UPDATE public.processing_jobs SET stage=p_stage,progress=GREATEST(COALESCE(progress,0),p_progress),
    heartbeat_at=pg_catalog.clock_timestamp(),lease_expires_at=expiry WHERE id=j.id;
  RETURN expiry;
END $fn$;

CREATE OR REPLACE FUNCTION public.register_processing_artifact(
  p_job uuid,p_workspace uuid,p_token uuid,p_worker_id text,p_kind text,p_path text,p_size bigint,p_sha256 text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE j public.processing_jobs; artifact uuid; expected text;
BEGIN
  j:=public.assert_processing_attempt(p_job,p_workspace,p_token,p_worker_id);
  expected:=pg_catalog.format('%s/%s/%s/%s-%s.jpg',p_workspace,p_job,p_token,p_kind,p_sha256);
  IF p_kind NOT IN ('frame','thumbnail') OR p_path IS DISTINCT FROM expected OR
     p_size IS NULL OR p_size<=0 OR p_size>2097152 OR p_sha256 IS NULL OR p_sha256!~'^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid attempt artifact' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.processing_artifacts(workspace_id,job_id,file_id,kind,storage_path,size_bytes,sha256)
    VALUES(p_workspace,p_job,j.file_id,p_kind,p_path,p_size,p_sha256)
    ON CONFLICT(storage_path) DO NOTHING RETURNING id INTO artifact;
  IF artifact IS NULL THEN
    SELECT id INTO artifact FROM public.processing_artifacts WHERE storage_path=p_path AND job_id=p_job
      AND workspace_id=p_workspace AND file_id=j.file_id AND kind=p_kind AND size_bytes=p_size AND sha256=p_sha256;
    IF artifact IS NULL THEN RAISE EXCEPTION 'Conflicting artifact registration' USING ERRCODE='23505'; END IF;
  END IF;
  RETURN artifact;
END $fn$;

CREATE OR REPLACE FUNCTION public.finalize_processing_attempt(
  p_job uuid,p_workspace uuid,p_token uuid,p_worker_id text,p_manifest jsonb,p_manifest_sha256 text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  j public.processing_jobs; f public.files; v_video uuid; v_document uuid;
  v_count integer; v_expected integer; v_generated bigint; v_kind text;
BEGIN
  SELECT * INTO j FROM public.processing_jobs WHERE id=p_job AND workspace_id=p_workspace;
  IF j.status='Completed' AND j.dispatch_token IS NOT NULL AND j.dispatch_token=p_token
    AND j.dispatch_worker_id=p_worker_id AND EXISTS(SELECT 1 FROM public.processing_results r
      WHERE r.job_id=p_job AND r.manifest_sha256=p_manifest_sha256) THEN
    RETURN 'Completed';
  END IF;
  j:=public.assert_processing_attempt(p_job,p_workspace,p_token,p_worker_id);
  SELECT * INTO f FROM public.files WHERE id=j.file_id AND workspace_id=p_workspace FOR SHARE;
  IF p_manifest_sha256 IS NULL OR p_manifest_sha256!~'^[0-9a-f]{64}$' OR
     p_manifest IS NULL OR p_manifest->>'action'<>'complete' OR (p_manifest->>'version')::integer<>1 OR
     p_manifest->>'job_id'<>p_job::text OR p_manifest->>'workspace_id'<>p_workspace::text OR
     p_manifest->>'dispatch_token'<>p_token::text OR p_manifest->>'worker_id'<>p_worker_id OR
     p_manifest->>'format'<>f.format OR pg_catalog.jsonb_typeof(p_manifest->'metadata')<>'object' THEN
    RAISE EXCEPTION 'Manifest identity or integrity fields are invalid' USING ERRCODE='22023';
  END IF;
  v_kind:=p_manifest->>'kind';
  IF (v_kind='video' AND f.format NOT IN ('MP4','MOV')) OR
     (v_kind='document' AND f.format NOT IN ('PDF','PPTX','DOCX')) OR v_kind NOT IN ('video','document') THEN
    RAISE EXCEPTION 'Manifest kind does not match original' USING ERRCODE='22023';
  END IF;
  IF pg_catalog.jsonb_array_length(p_manifest->'transcript_segments')>20000 OR
     pg_catalog.jsonb_array_length(p_manifest->'speaker_turns')>20000 OR
     pg_catalog.jsonb_array_length(p_manifest->'frames')>60 OR
     pg_catalog.jsonb_array_length(p_manifest->'pages')>5000 OR
     pg_catalog.jsonb_array_length(p_manifest->'slides')>2000 THEN
    RAISE EXCEPTION 'Manifest exceeds bounded result limits' USING ERRCODE='22023';
  END IF;

  PERFORM pg_catalog.set_config('memora.verified_ingestion',p_job::text,true);
  -- A retried finalization replaces only this attempt's generated rows, never originals or prior attempts.
  DELETE FROM public.knowledge_chunks WHERE processing_job_id=p_job;
  DELETE FROM public.slide_intervals WHERE processing_job_id=p_job;
  DELETE FROM public.speaker_turns WHERE processing_job_id=p_job;
  DELETE FROM public.transcript_segments WHERE processing_job_id=p_job;
  DELETE FROM public.video_frames WHERE processing_job_id=p_job;
  DELETE FROM public.video_speakers WHERE processing_job_id=p_job;
  DELETE FROM public.document_pages WHERE processing_job_id=p_job;
  DELETE FROM public.document_slides WHERE processing_job_id=p_job;
  DELETE FROM public.videos WHERE processing_job_id=p_job;
  DELETE FROM public.documents WHERE processing_job_id=p_job;
  DELETE FROM public.processing_results WHERE job_id=p_job;

  IF v_kind='video' THEN
    IF (p_manifest->>'duration_seconds')::double precision IS NULL OR
       pg_catalog.jsonb_array_length(p_manifest->'frames')=0 OR
       pg_catalog.jsonb_array_length(p_manifest->'pages')<>0 OR pg_catalog.jsonb_array_length(p_manifest->'slides')<>0 THEN
      RAISE EXCEPTION 'Complete video output required' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.videos(workspace_id,file_id,processing_job_id,duration_seconds,language)
      VALUES(p_workspace,j.file_id,p_job,(p_manifest->>'duration_seconds')::double precision,p_manifest->>'language') RETURNING id INTO v_video;
    INSERT INTO public.video_speakers(workspace_id,video_id,processing_job_id,speaker_key,label)
      SELECT p_workspace,v_video,p_job,x.key,x.label FROM pg_catalog.jsonb_to_recordset(p_manifest->'speakers') AS x(key text,label text);
    INSERT INTO public.speaker_turns(workspace_id,speaker_id,processing_job_id,start_seconds,end_seconds)
      SELECT p_workspace,s.id,p_job,x.start_seconds,x.end_seconds FROM pg_catalog.jsonb_to_recordset(p_manifest->'speaker_turns')
        AS x(speaker_key text,start_seconds double precision,end_seconds double precision)
        JOIN public.video_speakers s ON s.video_id=v_video AND s.speaker_key=x.speaker_key
      WHERE x.end_seconds>x.start_seconds AND x.start_seconds>=0;
    GET DIAGNOSTICS v_count=ROW_COUNT;
    IF v_count<>pg_catalog.jsonb_array_length(p_manifest->'speaker_turns') THEN RAISE EXCEPTION 'Invalid speaker turns'; END IF;
    INSERT INTO public.transcript_segments(workspace_id,video_id,processing_job_id,speaker_id,start_seconds,end_seconds,content,content_sha256)
      SELECT p_workspace,v_video,p_job,s.id,x.start_seconds,x.end_seconds,x.content,x.content_sha256
      FROM pg_catalog.jsonb_to_recordset(p_manifest->'transcript_segments')
        AS x(start_seconds double precision,end_seconds double precision,content text,content_sha256 text,speaker_key text)
        LEFT JOIN public.video_speakers s ON s.video_id=v_video AND s.speaker_key=x.speaker_key
      WHERE x.end_seconds>x.start_seconds AND x.start_seconds>=0 AND pg_catalog.length(x.content)>0
        AND x.content_sha256=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(x.content,'UTF8'),'sha256'),'hex');
    GET DIAGNOSTICS v_count=ROW_COUNT;
    IF v_count<>pg_catalog.jsonb_array_length(p_manifest->'transcript_segments') THEN RAISE EXCEPTION 'Invalid transcript content or timing'; END IF;

    INSERT INTO public.video_frames(workspace_id,video_id,processing_job_id,timestamp_seconds,storage_path,size_bytes,sha256,
      thumbnail_path,thumbnail_size_bytes,thumbnail_sha256)
      SELECT p_workspace,v_video,p_job,x.timestamp_seconds,x.storage_path,x.size_bytes,x.sha256,
        x.thumbnail_path,x.thumbnail_size_bytes,x.thumbnail_sha256
      FROM pg_catalog.jsonb_to_recordset(p_manifest->'frames') AS x(timestamp_seconds double precision,storage_path text,
        size_bytes bigint,sha256 text,thumbnail_path text,thumbnail_size_bytes bigint,thumbnail_sha256 text)
      JOIN public.processing_artifacts a ON a.job_id=p_job AND a.kind='frame' AND a.storage_path=x.storage_path
        AND a.size_bytes=x.size_bytes AND a.sha256=x.sha256
      JOIN public.processing_artifacts t ON t.job_id=p_job AND t.kind='thumbnail' AND t.storage_path=x.thumbnail_path
        AND t.size_bytes=x.thumbnail_size_bytes AND t.sha256=x.thumbnail_sha256
      WHERE x.timestamp_seconds>=0 AND x.timestamp_seconds<=(p_manifest->>'duration_seconds')::double precision+1;
    GET DIAGNOSTICS v_count=ROW_COUNT;
    IF v_count<>pg_catalog.jsonb_array_length(p_manifest->'frames') THEN RAISE EXCEPTION 'Frame artifacts are missing or unverified'; END IF;

    INSERT INTO public.knowledge_chunks(workspace_id,file_id,processing_job_id,source_key,content,content_sha256,source_reference)
      SELECT p_workspace,j.file_id,p_job,pg_catalog.format('segment:%s',x.ord),x.content,x.content_sha256,
        pg_catalog.jsonb_build_object('type','video_segment','video_id',v_video,'start_seconds',x.start_seconds,
          'end_seconds',x.end_seconds,'speaker_key',x.speaker_key,'processing_job_id',p_job)
      FROM ROWS FROM (pg_catalog.jsonb_to_recordset(p_manifest->'transcript_segments')
        AS (start_seconds double precision,end_seconds double precision,content text,content_sha256 text,speaker_key text))
        WITH ORDINALITY AS x(start_seconds,end_seconds,content,content_sha256,speaker_key,ord);
  ELSE
    INSERT INTO public.documents(workspace_id,file_id,processing_job_id,metadata)
      VALUES(p_workspace,j.file_id,p_job,p_manifest->'metadata') RETURNING id INTO v_document;
    IF f.format IN ('PDF','DOCX') THEN
      IF pg_catalog.jsonb_array_length(p_manifest->'pages')=0 OR pg_catalog.jsonb_array_length(p_manifest->'slides')<>0 THEN
        RAISE EXCEPTION 'Document pages required'; END IF;
      INSERT INTO public.document_pages(workspace_id,document_id,processing_job_id,page_number,content,sha256,size_bytes,ocr_required)
        SELECT p_workspace,v_document,p_job,x.page_number,x.content,x.sha256,pg_catalog.octet_length(x.content),x.ocr_required
        FROM pg_catalog.jsonb_to_recordset(p_manifest->'pages') AS x(page_number integer,content text,sha256 text,ocr_required boolean)
        WHERE x.page_number>0 AND x.sha256=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(x.content,'UTF8'),'sha256'),'hex');
      GET DIAGNOSTICS v_count=ROW_COUNT;
      IF v_count<>pg_catalog.jsonb_array_length(p_manifest->'pages') THEN RAISE EXCEPTION 'Invalid or missing document pages'; END IF;
      INSERT INTO public.knowledge_chunks(workspace_id,file_id,processing_job_id,source_key,content,content_sha256,source_reference)
        SELECT p_workspace,j.file_id,p_job,'page:'||x.page_number,x.content,x.sha256,
          pg_catalog.jsonb_build_object('type','document_page','document_id',v_document,'page_number',x.page_number,
            'ocr_required',x.ocr_required,'processing_job_id',p_job)
        FROM pg_catalog.jsonb_to_recordset(p_manifest->'pages') AS x(page_number integer,content text,sha256 text,ocr_required boolean);
    ELSE
      IF pg_catalog.jsonb_array_length(p_manifest->'slides')=0 OR pg_catalog.jsonb_array_length(p_manifest->'pages')<>0 THEN
        RAISE EXCEPTION 'Presentation slides required'; END IF;
      INSERT INTO public.document_slides(workspace_id,document_id,processing_job_id,slide_number,title,notes,content,sha256,size_bytes)
        SELECT p_workspace,v_document,p_job,x.slide_number,x.title,x.notes,x.content,x.sha256,pg_catalog.octet_length(x.content)
        FROM pg_catalog.jsonb_to_recordset(p_manifest->'slides') AS x(slide_number integer,title text,notes text,content text,sha256 text)
        WHERE x.slide_number>0 AND x.sha256=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(x.content||COALESCE(E'\n'||x.notes,''),'UTF8'),'sha256'),'hex');
      GET DIAGNOSTICS v_count=ROW_COUNT;
      IF v_count<>pg_catalog.jsonb_array_length(p_manifest->'slides') THEN RAISE EXCEPTION 'Invalid or missing presentation slides'; END IF;
      INSERT INTO public.knowledge_chunks(workspace_id,file_id,processing_job_id,source_key,content,content_sha256,source_reference)
        SELECT p_workspace,j.file_id,p_job,'slide:'||x.slide_number,x.content||COALESCE(E'\n'||x.notes,''),x.sha256,
          pg_catalog.jsonb_build_object('type','document_slide','document_id',v_document,'slide_number',x.slide_number,
            'title',x.title,'processing_job_id',p_job)
        FROM pg_catalog.jsonb_to_recordset(p_manifest->'slides') AS x(slide_number integer,title text,notes text,content text,sha256 text);
    END IF;
  END IF;

  SELECT COALESCE(pg_catalog.sum(size_bytes),0) INTO v_generated FROM public.processing_artifacts WHERE job_id=p_job;
  INSERT INTO public.processing_results(job_id,workspace_id,file_id,kind,language,duration_seconds,metadata,manifest_sha256,completed_at)
    VALUES(p_job,p_workspace,j.file_id,v_kind,p_manifest->>'language',(p_manifest->>'duration_seconds')::double precision,
      p_manifest->'metadata',p_manifest_sha256,pg_catalog.clock_timestamp());
  INSERT INTO public.storage_analytics(workspace_id,file_id,generated_size_bytes,package_verified_at,reclaimed_size_bytes)
    VALUES(p_workspace,j.file_id,v_generated,pg_catalog.clock_timestamp(),0);
  UPDATE public.processing_jobs SET status='Completed',stage='Results verified',progress=100,error=NULL,
    dispatch_error=NULL,lease_expires_at=NULL WHERE id=p_job;
  INSERT INTO public.activity_logs(workspace_id,user_id,file_id,file_name,action)
    VALUES(p_workspace,j.user_id,j.file_id,f.name,'Processing results verified');
  RETURN 'Completed';
END $fn$;

CREATE OR REPLACE FUNCTION public.cancel_processing_attempt(p_job uuid,p_workspace uuid,p_actor uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE j public.processing_jobs;
BEGIN
  SELECT * INTO j FROM public.processing_jobs WHERE id=p_job AND workspace_id=p_workspace FOR UPDATE;
  IF NOT FOUND OR j.status NOT IN ('Awaiting Review','Approved','Processing') THEN RAISE EXCEPTION 'Active processing job required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.workspace_members WHERE workspace_id=p_workspace AND user_id=p_actor AND role IN ('owner','reviewer') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Current reviewer access required' USING ERRCODE='42501'; END IF;
  UPDATE public.processing_jobs SET status='Cancelled',stage='Cancelled by reviewer',progress=NULL,
    error=NULL,dispatch_error=NULL,dispatch_token=NULL,lease_expires_at=NULL WHERE id=j.id;
  INSERT INTO public.activity_logs(workspace_id,user_id,file_id,action) VALUES(p_workspace,p_actor,j.file_id,'Processing cancelled');
  RETURN 'Cancelled';
END $fn$;

REVOKE ALL ON FUNCTION public.cancel_processing_attempt(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_processing_attempt(uuid,uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.progress_processing_attempt(uuid,uuid,uuid,text,text,integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.register_processing_artifact(uuid,uuid,uuid,text,text,text,bigint,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finalize_processing_attempt(uuid,uuid,uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.progress_processing_attempt(uuid,uuid,uuid,text,text,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_processing_artifact(uuid,uuid,uuid,text,text,text,bigint,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_processing_attempt(uuid,uuid,uuid,text,jsonb,text) TO service_role;

COMMENT ON FUNCTION public.finalize_processing_attempt(uuid,uuid,uuid,text,jsonb,text)
IS 'Atomic attempt-bound ingestion; verifies content hashes and artifact receipts before Completed. Expired or superseded workers cannot write.';
