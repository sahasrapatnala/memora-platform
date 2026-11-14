-- MEMORA VIDEO-ONLY DEMO: REVIEW ONLY. NEVER applied by this file's creation.
-- Standalone alternative to v3/v4, not a migration to run before/after them.
-- One transaction through the managed migration tool AFTER SEPARATE APPROVAL.
-- No INSERT/UPDATE/DELETE executes on existing application rows during migration.
-- Runtime finalization only INSERTs new results, never replaces/deletes saved results.
DO $preflight$
DECLARE target text;
BEGIN
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE NOT tgisinternal
   AND tgname IN ('memora_ingestion_not_installed','memora_completion_not_installed')) THEN
   RAISE EXCEPTION 'Existing processing guards require explicit reconciliation'; END IF;
 IF pg_catalog.to_regclass('public.processing_artifacts') IS NOT NULL OR pg_catalog.to_regclass('public.processing_results') IS NOT NULL THEN
   RAISE EXCEPTION 'Processing already or partially installed; manual reconciliation required'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE pronamespace='public'::pg_catalog.regnamespace AND proname IN
   ('claim_approved_processing_job','assert_processing_attempt','heartbeat_processing_job','fail_processing_attempt','expire_processing_attempt',
    'progress_processing_attempt','register_processing_artifact','finalize_processing_attempt','cancel_processing_attempt',
    'validate_video_demo_manifest','block_uninstalled_processing_ingestion','block_unverified_processing_completion')) THEN
   RAISE EXCEPTION 'Conflicting processing API; do not mix with v3/v4 or historical 0009'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND
   ((table_name='processing_jobs' AND column_name IN ('dispatch_token','dispatch_started_at','dispatch_attempts','dispatch_error','dispatch_worker_id','heartbeat_at','lease_expires_at','dispatch_actor_id')) OR
    (table_name IN ('videos','transcript_segments','video_frames','knowledge_chunks') AND column_name='processing_job_id'))) THEN
   RAISE EXCEPTION 'Partial processing columns already exist'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='public.videos'::regclass AND conname='videos_file_id_key' AND pg_catalog.pg_get_constraintdef(oid)='UNIQUE (file_id)') THEN
   RAISE EXCEPTION 'Expected one-video-per-original uniqueness required'; END IF;
 IF EXISTS(SELECT 1 FROM public.processing_jobs WHERE status='Processing') THEN RAISE EXCEPTION 'Unfenced active processing exists'; END IF;
 IF pg_catalog.to_regprocedure('extensions.digest(bytea,text)') IS NULL OR
    pg_catalog.to_regprocedure('public.decide_processing_job(uuid,uuid,text,text)') IS NULL OR
    pg_catalog.to_regprocedure('public.is_workspace_member(uuid)') IS NULL THEN RAISE EXCEPTION 'Missing baseline authorization/hash functions'; END IF;
 FOREACH target IN ARRAY ARRAY['videos','transcript_segments','video_frames','knowledge_chunks','storage_analytics','activity_logs'] LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE oid=pg_catalog.to_regclass('public.'||target) AND relrowsecurity) OR
      NOT pg_catalog.has_table_privilege('authenticated','public.'||target,'SELECT') OR
      NOT pg_catalog.has_table_privilege('service_role','public.'||target,'INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Unexpected RLS/grants on %',target; END IF;
   IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid=pg_catalog.to_regclass('public.'||target) AND polcmd='r' AND polname='workspace_read'
     AND polroles=ARRAY[(SELECT oid FROM pg_catalog.pg_roles WHERE rolname='authenticated')]
     AND pg_catalog.regexp_replace(pg_catalog.pg_get_expr(polqual,polrelid),'public\.|[[:space:]()]','','g')='is_workspace_memberworkspace_id') OR
     EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid=pg_catalog.to_regclass('public.'||target) AND polname<>'workspace_read') THEN
     RAISE EXCEPTION 'Unexpected output policies on %',target; END IF;
 END LOOP;
END $preflight$;
-- Defense in depth: live grants currently allow writes, but SELECT-only RLS blocks them.
-- Revoke unused writes only on six touched output/accounting tables; preserve SELECT/RLS.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.videos,public.transcript_segments,public.video_frames,public.knowledge_chunks,public.storage_analytics,public.activity_logs FROM authenticated,anon;
-- Preserve the authorization bodies/signatures/owners/ACLs; remove object shadowing.
-- Live pg_get_functiondef checked 2026-11-14: all application tables/types use
-- public.*, auth.uid() is qualified, and public.is_workspace_member() is qualified.
-- decide_processing_job's length/trim are built-ins resolved through implicit
-- pg_catalog even with an empty search_path. No authorization body replacement.
ALTER FUNCTION public.is_workspace_member(uuid) SET search_path='';
ALTER FUNCTION public.decide_processing_job(uuid,uuid,text,text) SET search_path='';

ALTER TABLE public.processing_jobs
  ADD COLUMN IF NOT EXISTS dispatch_token uuid,
  ADD COLUMN IF NOT EXISTS dispatch_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dispatch_error text,
  ADD COLUMN IF NOT EXISTS dispatch_worker_id text,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_actor_id uuid;

DO $checks$
DECLARE c record; d text;
BEGIN
  -- Fail closed on incompatible historical rows; do not silently repair data.
  IF EXISTS (SELECT 1 FROM public.processing_jobs
             WHERE dispatch_attempts IS NULL OR dispatch_attempts < 0) THEN
    RAISE EXCEPTION 'Invalid attempt counts exist; review data before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM public.processing_jobs WHERE status='Processing'
    AND (dispatch_token IS NULL OR dispatch_worker_id IS NULL
         OR lease_expires_at IS NULL OR dispatch_actor_id IS NULL)) THEN
    RAISE EXCEPTION 'Unfenced Processing jobs exist; explicit recovery review required';
  END IF;
  ALTER TABLE public.processing_jobs ALTER COLUMN dispatch_attempts SET DEFAULT 0;
  ALTER TABLE public.processing_jobs ALTER COLUMN dispatch_attempts SET NOT NULL;
  SELECT pg_catalog.pg_get_constraintdef(oid) INTO d FROM pg_catalog.pg_constraint
    WHERE conrelid='public.processing_jobs'::pg_catalog.regclass
      AND conname='processing_jobs_dispatch_attempts_nonnegative';
  IF FOUND THEN
    IF pg_catalog.regexp_replace(d,'[[:space:]()]','','g') <> 'CHECKdispatch_attempts>=0' THEN
      RAISE EXCEPTION 'Conflicting attempt constraint';
    END IF;
  ELSE
    ALTER TABLE public.processing_jobs ADD CONSTRAINT processing_jobs_dispatch_attempts_nonnegative
      CHECK(dispatch_attempts >= 0) NOT VALID;
  END IF;
  ALTER TABLE public.processing_jobs VALIDATE CONSTRAINT processing_jobs_dispatch_attempts_nonnegative;
  -- Inspect duplicate tokens before index creation, preserving every row.
  IF EXISTS (SELECT 1 FROM public.processing_jobs WHERE dispatch_token IS NOT NULL
             GROUP BY dispatch_token HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Duplicate dispatch tokens exist; review data before migration';
  END IF;
  IF pg_catalog.to_regclass('public.processing_jobs_dispatch_token_unique') IS NOT NULL THEN
    SELECT i.indisunique,i.indisvalid,i.indrelid,
      pg_catalog.pg_get_expr(i.indpred,i.indrelid) AS predicate,
      pg_catalog.pg_get_indexdef(i.indexrelid,1,true) AS col,
      i.indnatts,i.indnkeyatts INTO c
    FROM pg_catalog.pg_index i WHERE i.indexrelid='public.processing_jobs_dispatch_token_unique'::pg_catalog.regclass;
    IF NOT FOUND OR NOT c.indisunique OR NOT c.indisvalid
      OR c.indrelid <> 'public.processing_jobs'::pg_catalog.regclass
      OR c.col <> 'dispatch_token' OR c.indnatts<>1 OR c.indnkeyatts<>1
      OR pg_catalog.regexp_replace(coalesce(c.predicate,''),'[[:space:]()]','','g') <> 'dispatch_tokenISNOTNULL' THEN
      RAISE EXCEPTION 'Conflicting dispatch token index';
    END IF;
  ELSE
    CREATE UNIQUE INDEX processing_jobs_dispatch_token_unique
      ON public.processing_jobs(dispatch_token) WHERE dispatch_token IS NOT NULL;
  END IF;
END $checks$;


CREATE TABLE public.processing_artifacts (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  job_id uuid NOT NULL REFERENCES public.processing_jobs(id),
  file_id uuid NOT NULL REFERENCES public.files(id),
  dispatch_token uuid NOT NULL,
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
  kind text NOT NULL CHECK(kind='video'),
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


ALTER TABLE public.videos ADD COLUMN processing_job_id uuid REFERENCES public.processing_jobs(id), ADD COLUMN language text;
ALTER TABLE public.transcript_segments ADD COLUMN processing_job_id uuid REFERENCES public.processing_jobs(id), ADD COLUMN content_sha256 text;
ALTER TABLE public.video_frames ADD COLUMN processing_job_id uuid REFERENCES public.processing_jobs(id), ADD COLUMN thumbnail_path text, ADD COLUMN thumbnail_size_bytes bigint, ADD COLUMN thumbnail_sha256 text;
ALTER TABLE public.knowledge_chunks ADD COLUMN processing_job_id uuid REFERENCES public.processing_jobs(id), ADD COLUMN source_key text, ADD COLUMN content_sha256 text;
CREATE UNIQUE INDEX videos_processing_job_unique ON public.videos(processing_job_id) WHERE processing_job_id IS NOT NULL;
CREATE UNIQUE INDEX transcript_job_time_unique ON public.transcript_segments(processing_job_id,start_seconds,end_seconds) WHERE processing_job_id IS NOT NULL;
CREATE UNIQUE INDEX frames_job_path_unique ON public.video_frames(processing_job_id,storage_path) WHERE processing_job_id IS NOT NULL;
CREATE UNIQUE INDEX knowledge_job_source_unique ON public.knowledge_chunks(processing_job_id,source_key) WHERE processing_job_id IS NOT NULL;
CREATE INDEX processing_artifacts_job ON public.processing_artifacts(job_id,created_at);
CREATE INDEX processing_results_workspace ON public.processing_results(workspace_id,created_at);

CREATE OR REPLACE FUNCTION public.claim_approved_processing_job(
  p_job uuid,p_workspace uuid,p_actor uuid,p_worker_id text,p_lease_seconds integer DEFAULT 300
) RETURNS TABLE(
  job_id uuid,workspace_id uuid,outcome text,dispatch_token uuid,
  dispatch_attempts integer,file_id uuid,file_owner_id uuid,file_name text,
  file_storage_path text,file_size_bytes bigint,file_sha256 text,file_format text,
  lease_expires_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE j public.processing_jobs; f public.files; token uuid; ts timestamptz;
BEGIN
  IF p_job IS NULL OR p_workspace IS NULL OR p_actor IS NULL
     OR p_worker_id IS NULL OR pg_catalog.length(pg_catalog.btrim(p_worker_id)) NOT BETWEEN 1 AND 100
     OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 60 AND 900 THEN
    RAISE EXCEPTION 'Invalid dispatch parameters' USING ERRCODE='22023';
  END IF;
  -- Exact requested row only. A contending claim gets zero rows, not another job.
  SELECT * INTO j FROM public.processing_jobs q
    WHERE q.id=p_job AND q.workspace_id=p_workspace FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN; END IF;
  -- The initiating reviewer is NOT necessarily the file owner.
  PERFORM 1 FROM public.workspace_members m WHERE m.workspace_id=p_workspace
    AND m.user_id=p_actor AND m.role IN ('owner','reviewer') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Current reviewer access required' USING ERRCODE='42501'; END IF;
  ts:=pg_catalog.clock_timestamp();
  IF NOT (j.status='Approved' OR (j.status='Processing'
      AND j.lease_expires_at IS NOT NULL AND j.lease_expires_at<=ts)) THEN
    RETURN; -- Completed, Failed, Rejected, active Processing, etc. cannot be claimed.
  END IF;
  -- Terminalize exhausted expired jobs without raising (which would roll back).
  IF j.dispatch_attempts>=3 THEN
    UPDATE public.processing_jobs q SET status='Failed',stage='Dispatch attempts exhausted',
      progress=NULL,error='Maximum of 3 dispatch attempts reached',
      dispatch_error='Maximum of 3 dispatch attempts reached',dispatch_token=NULL,
      lease_expires_at=NULL WHERE q.id=j.id;
    RETURN QUERY SELECT j.id,p_workspace,'AttemptsExhausted'::text,NULL::uuid,
      j.dispatch_attempts,NULL::uuid,NULL::uuid,NULL::text,NULL::text,
      NULL::bigint,NULL::text,NULL::text,NULL::timestamptz;
    RETURN;
  END IF;
  SELECT * INTO f FROM public.files original WHERE original.id=j.file_id AND original.workspace_id=p_workspace
    AND original.user_id=j.user_id FOR SHARE;
  IF NOT FOUND OR f.status<>'Uploaded' OR f.size_bytes<=0 OR f.size_bytes>5368709120
     OR f.sha256 IS NULL OR f.sha256 !~ '^[0-9a-f]{64}$'
     OR f.format NOT IN ('MP4','MOV') THEN
    RAISE EXCEPTION 'Verified original required' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.workspace_members m WHERE m.workspace_id=p_workspace
    AND m.user_id=f.user_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'File owner membership required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.approval_requests a WHERE a.processing_job_id=j.id
    AND a.workspace_id=p_workspace AND a.file_id=f.id AND a.status='Approved' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Matching processing approval required' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM public.videos existing_video WHERE existing_video.file_id=f.id) THEN RAISE EXCEPTION 'A saved video already exists; reprocessing is disabled' USING ERRCODE='42501'; END IF;
  token:=pg_catalog.gen_random_uuid(); ts:=pg_catalog.clock_timestamp();
  UPDATE public.processing_jobs q SET status='Processing',stage='Dispatch claimed',progress=0,
    dispatch_token=token,dispatch_actor_id=p_actor,dispatch_worker_id=pg_catalog.btrim(p_worker_id),
    dispatch_started_at=ts,heartbeat_at=ts,lease_expires_at=ts+pg_catalog.make_interval(secs=>p_lease_seconds),
    dispatch_attempts=q.dispatch_attempts+1,dispatch_error=NULL,error=NULL WHERE q.id=j.id;
  RETURN QUERY SELECT j.id,p_workspace,'Claimed'::text,token,j.dispatch_attempts+1,
    f.id,f.user_id,f.name,f.storage_path,f.size_bytes,f.sha256,f.format,
    ts+pg_catalog.make_interval(secs=>p_lease_seconds);
END $fn$;

-- Mandatory transaction-local guard for every future ingestion/finalization RPC.
-- A standalone successful check is NOT permission for a later independent write.
CREATE OR REPLACE FUNCTION public.assert_processing_attempt(
  p_job uuid,p_workspace uuid,p_token uuid,p_worker_id text
) RETURNS public.processing_jobs LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '' AS $fn$
DECLARE j public.processing_jobs;
BEGIN
  SELECT * INTO j FROM public.processing_jobs q WHERE q.id=p_job AND q.workspace_id=p_workspace FOR UPDATE;
  IF NOT FOUND OR p_token IS NULL OR p_worker_id IS NULL OR j.status<>'Processing'
    OR j.dispatch_token IS DISTINCT FROM p_token
    OR j.dispatch_worker_id IS DISTINCT FROM pg_catalog.btrim(p_worker_id)
    OR j.lease_expires_at IS NULL OR j.lease_expires_at<=pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'Attempt expired, invalid or superseded' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.workspace_members m WHERE m.workspace_id=p_workspace
    AND m.user_id=j.dispatch_actor_id AND m.role IN ('owner','reviewer') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dispatch reviewer access revoked' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.files f WHERE f.id=j.file_id AND f.workspace_id=p_workspace
    AND f.user_id=j.user_id AND f.status='Uploaded' AND f.format IN ('MP4','MOV') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original no longer eligible' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.workspace_members m WHERE m.workspace_id=p_workspace AND m.user_id=j.user_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'File owner access revoked' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.approval_requests a WHERE a.processing_job_id=j.id
    AND a.file_id=j.file_id AND a.workspace_id=p_workspace AND a.status='Approved' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Processing approval required' USING ERRCODE='42501'; END IF;
  -- Authorization checks may have waited on locks; check wall clock again.
  IF j.lease_expires_at<=pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'Attempt expired during authorization' USING ERRCODE='42501';
  END IF;
  RETURN j;
END $fn$;

CREATE OR REPLACE FUNCTION public.heartbeat_processing_job(
  p_job uuid,p_workspace uuid,p_token uuid,p_worker_id text,p_lease_seconds integer DEFAULT 300
) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE j public.processing_jobs; ts timestamptz; expiry timestamptz;
BEGIN
  IF p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 60 AND 900 THEN
    RAISE EXCEPTION 'Invalid lease duration' USING ERRCODE='22023';
  END IF;
  j:=public.assert_processing_attempt(p_job,p_workspace,p_token,p_worker_id);
  ts:=pg_catalog.clock_timestamp();
  IF j.lease_expires_at<=ts THEN RAISE EXCEPTION 'Expired lease' USING ERRCODE='42501'; END IF;
  expiry:=ts+pg_catalog.make_interval(secs=>p_lease_seconds);
  UPDATE public.processing_jobs SET heartbeat_at=ts,lease_expires_at=expiry WHERE id=j.id;
  RETURN expiry;
END $fn$;

CREATE OR REPLACE FUNCTION public.fail_processing_attempt(
  p_job uuid,p_workspace uuid,p_token uuid,p_worker_id text,p_error_code text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE j public.processing_jobs; next_status text;
BEGIN
  -- Accept safe categories only; never persist arbitrary signed URLs or secrets.
  IF p_error_code IS NULL OR p_error_code NOT IN
    ('DownloadFailed','IntegrityFailed','ProcessorFailed','DeliveryUncertain','PersistenceFailed') THEN
    RAISE EXCEPTION 'Invalid failure category' USING ERRCODE='22023';
  END IF;
  j:=public.assert_processing_attempt(p_job,p_workspace,p_token,p_worker_id);
  next_status:=CASE WHEN j.dispatch_attempts>=3 THEN 'Failed' ELSE 'Approved' END;
  IF j.lease_expires_at<=pg_catalog.clock_timestamp() THEN RAISE EXCEPTION 'Expired lease' USING ERRCODE='42501'; END IF;
  UPDATE public.processing_jobs SET status=next_status,
    stage=CASE WHEN next_status='Failed' THEN 'Dispatch attempts exhausted' ELSE 'Retry requires dispatch' END,
    progress=NULL,error=p_error_code,dispatch_error=p_error_code,dispatch_token=NULL,
    lease_expires_at=NULL WHERE id=j.id;
  RETURN next_status;
END $fn$;

-- Trusted recovery can resolve one expired job even if nobody clicks retry.
-- No new execution is authorized: the next claim still checks a current reviewer.
CREATE OR REPLACE FUNCTION public.expire_processing_attempt(p_job uuid,p_workspace uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE j public.processing_jobs; next_status text;
BEGIN
  SELECT * INTO j FROM public.processing_jobs q WHERE q.id=p_job
    AND q.workspace_id=p_workspace FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN 'Unavailable'; END IF;
  IF j.status<>'Processing' OR j.lease_expires_at IS NULL
    OR j.lease_expires_at>pg_catalog.clock_timestamp() THEN RETURN 'NotExpired'; END IF;
  next_status:=CASE WHEN j.dispatch_attempts>=3 THEN 'Failed' ELSE 'Approved' END;
  UPDATE public.processing_jobs SET status=next_status,
    stage=CASE WHEN next_status='Failed' THEN 'Dispatch attempts exhausted' ELSE 'Lease expired; retry requires dispatch' END,
    progress=NULL,error='LeaseExpired',dispatch_error='LeaseExpired',
    dispatch_token=NULL,lease_expires_at=NULL WHERE id=j.id;
  RETURN next_status;
END $fn$;


CREATE OR REPLACE FUNCTION public.block_uninstalled_processing_ingestion()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fn$
BEGIN
  -- Intentionally no NULL-lineage/legacy-edit bypass: the current app has no
  -- unrelated INSERT/UPDATE writer on these four evidence tables. Audit and
  -- accounting are NOT targets of this trigger; their trusted writes survive.
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
  FOREACH t IN ARRAY ARRAY['videos','transcript_segments','video_frames','knowledge_chunks'] LOOP
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
  IF p_progress IS NULL OR p_progress NOT BETWEEN 0 AND 99 OR p_lease_seconds IS NULL OR p_stage IS NULL OR p_lease_seconds NOT BETWEEN 60 AND 900 OR p_stage NOT IN
    ('Downloading original','Original verified','Extracting audio','Transcribing audio','Extracting keyframes',
     'Uploading frame artifacts','Persisting results') THEN
    RAISE EXCEPTION 'Invalid progress event' USING ERRCODE='22023';
  END IF;
  j:=public.assert_processing_attempt(p_job,p_workspace,p_token,p_worker_id);
  expiry:=pg_catalog.clock_timestamp()+pg_catalog.make_interval(secs=>p_lease_seconds);
  UPDATE public.processing_jobs SET stage=p_stage,progress=GREATEST(COALESCE(progress,0),p_progress),
    heartbeat_at=pg_catalog.clock_timestamp(),lease_expires_at=expiry WHERE id=j.id AND workspace_id=p_workspace
      AND dispatch_token=p_token AND dispatch_worker_id=p_worker_id AND status='Processing'
      AND lease_expires_at IS NOT NULL AND lease_expires_at>pg_catalog.clock_timestamp();
  IF NOT FOUND THEN RAISE EXCEPTION 'Lease expired during progress' USING ERRCODE='42501'; END IF;
  RETURN expiry;
END $fn$;

CREATE OR REPLACE FUNCTION public.register_processing_artifact(
  p_job uuid,p_workspace uuid,p_token uuid,p_worker_id text,p_kind text,p_path text,p_size bigint,p_sha256 text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE j public.processing_jobs; artifact uuid; expected text;
BEGIN
  j:=public.assert_processing_attempt(p_job,p_workspace,p_token,p_worker_id);
  expected:=pg_catalog.format('%s/%s/%s/%s-%s.jpg',p_workspace,p_job,p_token,p_kind,p_sha256);
  IF p_kind IS NULL OR p_kind NOT IN ('frame','thumbnail') OR p_path IS DISTINCT FROM expected OR
     p_size IS NULL OR p_size<=0 OR p_size>2097152 OR p_sha256 IS NULL OR p_sha256!~'^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid attempt artifact' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.processing_artifacts(workspace_id,job_id,file_id,dispatch_token,kind,storage_path,size_bytes,sha256)
    VALUES(p_workspace,p_job,j.file_id,p_token,p_kind,p_path,p_size,p_sha256)
    ON CONFLICT(storage_path) DO NOTHING RETURNING id INTO artifact;
  IF artifact IS NULL THEN
    SELECT id INTO artifact FROM public.processing_artifacts WHERE storage_path=p_path AND job_id=p_job
      AND workspace_id=p_workspace AND file_id=j.file_id AND dispatch_token=p_token AND kind=p_kind AND size_bytes=p_size AND sha256=p_sha256;
    IF artifact IS NULL THEN RAISE EXCEPTION 'Conflicting artifact registration' USING ERRCODE='23505'; END IF;
  END IF;
  PERFORM public.assert_processing_attempt(p_job,p_workspace,p_token,p_worker_id);
  RETURN artifact;
END $fn$;


CREATE FUNCTION public.validate_video_demo_manifest(p jsonb,p_job uuid,p_workspace uuid,p_token uuid,p_worker text,p_format text,p_hash text)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $fn$
DECLARE k text; x jsonb; d double precision;
BEGIN
 IF p IS NULL OR pg_catalog.jsonb_typeof(p)<>'object' OR p_hash IS NULL OR p_hash!~'^[0-9a-f]{64}$' OR
    p->>'action' IS DISTINCT FROM 'complete' OR p->>'version' IS DISTINCT FROM '1' OR
    p->>'job_id' IS DISTINCT FROM p_job::text OR p->>'workspace_id' IS DISTINCT FROM p_workspace::text OR
    p->>'dispatch_token' IS DISTINCT FROM p_token::text OR p->>'worker_id' IS DISTINCT FROM p_worker OR
    p->>'kind' IS DISTINCT FROM 'video' OR p->>'format' IS DISTINCT FROM p_format OR p_format NOT IN ('MP4','MOV') OR
    pg_catalog.jsonb_typeof(p->'metadata') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid video manifest identity'; END IF;
 FOREACH k IN ARRAY ARRAY['speakers','speaker_turns','transcript_segments','frames','pages','slides'] LOOP
   IF pg_catalog.jsonb_typeof(p->k) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Required manifest array %',k; END IF;
 END LOOP;
 IF pg_catalog.octet_length(p::text)>8388608 OR pg_catalog.jsonb_array_length(p->'speakers')<>0 OR pg_catalog.jsonb_array_length(p->'speaker_turns')<>0 OR
    pg_catalog.jsonb_array_length(p->'pages')<>0 OR pg_catalog.jsonb_array_length(p->'slides')<>0 OR
    pg_catalog.jsonb_array_length(p->'transcript_segments') NOT BETWEEN 1 AND 20000 OR pg_catalog.jsonb_array_length(p->'frames') NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'Video-only demo requires speech and frames; documents and speakers are unsupported'; END IF;
 IF pg_catalog.jsonb_typeof(p->'duration_seconds') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Video duration required'; END IF;
 d:=(p->>'duration_seconds')::double precision;
 IF d<=0 OR d>604800 THEN RAISE EXCEPTION 'Invalid video duration'; END IF;
 IF pg_catalog.jsonb_typeof(p->'language') NOT IN ('string','null') OR NOT(p ? 'language') OR pg_catalog.length(p->>'language')>40 THEN RAISE EXCEPTION 'Invalid language'; END IF;
 FOR x IN SELECT value FROM pg_catalog.jsonb_array_elements(p->'transcript_segments') LOOP
   IF pg_catalog.jsonb_typeof(x->'start_seconds') IS DISTINCT FROM 'number' OR pg_catalog.jsonb_typeof(x->'end_seconds') IS DISTINCT FROM 'number' OR
      pg_catalog.jsonb_typeof(x->'content') IS DISTINCT FROM 'string' OR pg_catalog.jsonb_typeof(x->'content_sha256') IS DISTINCT FROM 'string' OR
      pg_catalog.jsonb_typeof(x->'speaker_key') IS DISTINCT FROM 'null' OR
      (x->>'start_seconds')::double precision<0 OR (x->>'end_seconds')::double precision<=(x->>'start_seconds')::double precision OR
      (x->>'end_seconds')::double precision>d+1 OR pg_catalog.length(x->>'content') NOT BETWEEN 1 AND 20000 OR
      x->>'content_sha256' IS DISTINCT FROM pg_catalog.encode(extensions.digest(pg_catalog.convert_to(x->>'content','UTF8'),'sha256'),'hex') THEN
      RAISE EXCEPTION 'Invalid transcript hash, speaker or timing'; END IF;
 END LOOP;
 FOR x IN SELECT value FROM pg_catalog.jsonb_array_elements(p->'frames') LOOP
   IF pg_catalog.jsonb_typeof(x->'timestamp_seconds') IS DISTINCT FROM 'number' OR (x->>'timestamp_seconds')::double precision NOT BETWEEN 0 AND d+1 THEN RAISE EXCEPTION 'Invalid frame timing'; END IF;
   FOREACH k IN ARRAY ARRAY['size_bytes','thumbnail_size_bytes'] LOOP
     IF pg_catalog.jsonb_typeof(x->k) IS DISTINCT FROM 'number' OR (x->>k)::numeric<>pg_catalog.trunc((x->>k)::numeric) OR (x->>k)::numeric NOT BETWEEN 1 AND 2097152 THEN RAISE EXCEPTION 'Invalid artifact size'; END IF;
   END LOOP;
   IF x->>'storage_path' IS DISTINCT FROM pg_catalog.format('%s/%s/%s/frame-%s.jpg',p_workspace,p_job,p_token,x->>'sha256') OR
      x->>'thumbnail_path' IS DISTINCT FROM pg_catalog.format('%s/%s/%s/thumbnail-%s.jpg',p_workspace,p_job,p_token,x->>'thumbnail_sha256') OR
      (x->>'sha256') IS NULL OR (x->>'sha256')!~'^[0-9a-f]{64}$' OR (x->>'thumbnail_sha256') IS NULL OR (x->>'thumbnail_sha256')!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid artifact attempt path/hash'; END IF;
 END LOOP;
END $fn$;
REVOKE ALL ON FUNCTION public.validate_video_demo_manifest(jsonb,uuid,uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validate_video_demo_manifest(jsonb,uuid,uuid,uuid,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_processing_attempt(
  p_job uuid,p_workspace uuid,p_token uuid,p_worker_id text,p_manifest jsonb,p_manifest_sha256 text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
  j public.processing_jobs; f public.files; v_video uuid;
  v_count integer; v_expected integer; v_generated bigint; v_kind text;
BEGIN
  -- Authorize replay readback too; a completed receipt is not public access.
  PERFORM 1 FROM public.workspace_members WHERE workspace_id=p_workspace
    AND user_id=(SELECT dispatch_actor_id FROM public.processing_jobs WHERE id=p_job AND workspace_id=p_workspace)
    AND role IN ('owner','reviewer') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Current reviewer access required' USING ERRCODE='42501'; END IF;
  SELECT * INTO j FROM public.processing_jobs WHERE id=p_job AND workspace_id=p_workspace FOR UPDATE;
  IF j.status='Completed' AND j.dispatch_token=p_token AND j.dispatch_worker_id=p_worker_id AND
    EXISTS(SELECT 1 FROM public.processing_results r WHERE r.job_id=p_job AND r.workspace_id=p_workspace
      AND r.file_id=j.file_id AND r.manifest_sha256=p_manifest_sha256) THEN
    PERFORM 1 FROM public.files original JOIN public.workspace_members m ON m.workspace_id=original.workspace_id AND m.user_id=original.user_id
      JOIN public.approval_requests a ON a.processing_job_id=j.id AND a.file_id=original.id AND a.workspace_id=p_workspace AND a.status='Approved'
      WHERE original.id=j.file_id AND original.user_id=j.user_id AND original.workspace_id=p_workspace AND original.status='Uploaded' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Original or approval no longer eligible' USING ERRCODE='42501'; END IF;
    RETURN 'Completed';
  END IF;
  j:=public.assert_processing_attempt(p_job,p_workspace,p_token,p_worker_id);
  SELECT * INTO f FROM public.files WHERE id=j.file_id AND workspace_id=p_workspace FOR SHARE;
  PERFORM public.validate_video_demo_manifest(p_manifest,p_job,p_workspace,p_token,p_worker_id,f.format,p_manifest_sha256);
  v_kind:='video';
  PERFORM pg_catalog.set_config('memora.verified_ingestion',p_job::text,true);
  IF EXISTS(SELECT 1 FROM public.videos WHERE file_id=j.file_id) OR
     EXISTS(SELECT 1 FROM public.processing_results WHERE job_id=p_job) THEN
    RAISE EXCEPTION 'Saved results already exist; no replacement permitted' USING ERRCODE='42501';
  END IF;
    INSERT INTO public.videos(workspace_id,file_id,processing_job_id,duration_seconds,language)
      VALUES(p_workspace,j.file_id,p_job,(p_manifest->>'duration_seconds')::double precision,p_manifest->>'language') RETURNING id INTO v_video;
    INSERT INTO public.transcript_segments(workspace_id,video_id,processing_job_id,speaker_id,start_seconds,end_seconds,content,content_sha256)
      SELECT p_workspace,v_video,p_job,NULL::uuid,x.start_seconds,x.end_seconds,x.content,x.content_sha256
      FROM pg_catalog.jsonb_to_recordset(p_manifest->'transcript_segments')
        AS x(start_seconds double precision,end_seconds double precision,content text,content_sha256 text,speaker_key text)
      WHERE x.end_seconds>x.start_seconds AND x.start_seconds>=0 AND x.end_seconds<=(p_manifest->>'duration_seconds')::double precision+1 AND x.speaker_key IS NULL AND pg_catalog.length(x.content) BETWEEN 1 AND 20000
        AND x.content_sha256=pg_catalog.encode(extensions.digest(pg_catalog.convert_to(x.content,'UTF8'),'sha256'),'hex');
    GET DIAGNOSTICS v_count=ROW_COUNT;
    IF v_count<>pg_catalog.jsonb_array_length(p_manifest->'transcript_segments') THEN RAISE EXCEPTION 'Invalid transcript content or timing'; END IF;

    INSERT INTO public.video_frames(workspace_id,video_id,processing_job_id,timestamp_seconds,storage_path,size_bytes,sha256,
      thumbnail_path,thumbnail_size_bytes,thumbnail_sha256)
      SELECT p_workspace,v_video,p_job,x.timestamp_seconds,x.storage_path,x.size_bytes,x.sha256,
        x.thumbnail_path,x.thumbnail_size_bytes,x.thumbnail_sha256
      FROM pg_catalog.jsonb_to_recordset(p_manifest->'frames') AS x(timestamp_seconds double precision,storage_path text,
        size_bytes bigint,sha256 text,thumbnail_path text,thumbnail_size_bytes bigint,thumbnail_sha256 text)
      JOIN public.processing_artifacts a ON a.job_id=p_job AND a.workspace_id=p_workspace AND a.file_id=j.file_id
        AND a.dispatch_token=p_token AND a.kind='frame' AND a.storage_path=x.storage_path
        AND a.storage_path=pg_catalog.format('%s/%s/%s/frame-%s.jpg',p_workspace,p_job,p_token,x.sha256)
        AND a.size_bytes=x.size_bytes AND a.sha256=x.sha256
      JOIN public.processing_artifacts t ON t.job_id=p_job AND t.workspace_id=p_workspace AND t.file_id=j.file_id
        AND t.dispatch_token=p_token AND t.kind='thumbnail' AND t.storage_path=x.thumbnail_path
        AND t.storage_path=pg_catalog.format('%s/%s/%s/thumbnail-%s.jpg',p_workspace,p_job,p_token,x.thumbnail_sha256)
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
  SELECT COALESCE(pg_catalog.sum(size_bytes),0) INTO v_generated FROM public.processing_artifacts
    WHERE job_id=p_job AND workspace_id=p_workspace AND file_id=j.file_id AND dispatch_token=p_token;
  INSERT INTO public.processing_results(job_id,workspace_id,file_id,kind,language,duration_seconds,metadata,manifest_sha256,completed_at)
    VALUES(p_job,p_workspace,j.file_id,v_kind,p_manifest->>'language',(p_manifest->>'duration_seconds')::double precision,
      p_manifest->'metadata',p_manifest_sha256,pg_catalog.clock_timestamp());
  INSERT INTO public.storage_analytics(workspace_id,file_id,generated_size_bytes,package_verified_at,reclaimed_size_bytes)
    VALUES(p_workspace,j.file_id,v_generated,pg_catalog.clock_timestamp(),0);
  UPDATE public.processing_jobs SET status='Completed',stage='Results verified',progress=100,error=NULL,
    dispatch_error=NULL,lease_expires_at=NULL
    WHERE id=p_job AND workspace_id=p_workspace AND dispatch_token=p_token
      AND dispatch_worker_id=p_worker_id AND status='Processing'
      AND lease_expires_at IS NOT NULL AND lease_expires_at>pg_catalog.clock_timestamp();
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN
    RAISE EXCEPTION 'Lease expired or attempt changed during finalization; all result writes rolled back' USING ERRCODE='42501';
  END IF;
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


REVOKE ALL ON FUNCTION public.claim_approved_processing_job(uuid,uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.assert_processing_attempt(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.heartbeat_processing_job(uuid,uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fail_processing_attempt(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.expire_processing_attempt(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.block_uninstalled_processing_ingestion() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.block_unverified_processing_completion() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_approved_processing_job(uuid,uuid,uuid,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.assert_processing_attempt(uuid,uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.heartbeat_processing_job(uuid,uuid,uuid,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_processing_attempt(uuid,uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_processing_attempt(uuid,uuid) TO service_role;

REVOKE ALL ON FUNCTION public.cancel_processing_attempt(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_processing_attempt(uuid,uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.progress_processing_attempt(uuid,uuid,uuid,text,text,integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.register_processing_artifact(uuid,uuid,uuid,text,text,text,bigint,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finalize_processing_attempt(uuid,uuid,uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.progress_processing_attempt(uuid,uuid,uuid,text,text,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_processing_artifact(uuid,uuid,uuid,text,text,text,bigint,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_processing_attempt(uuid,uuid,uuid,text,jsonb,text) TO service_role;

