-- MEMORA dispatch v2: REVIEW ONLY. Not registered or applied.
-- Apply only through Lovable's migration tool after approval, as one transaction.
-- No originals, storage objects, RLS policies or approval records are changed.
-- Policy: at most THREE claims per job; 60..900 second renewable leases.
-- Completion is deliberately disabled until separately reviewed ingestion exists.

DO $preflight$
DECLARE r record; t regtype;
BEGIN
  IF to_regclass('public.processing_jobs') IS NULL THEN
    RAISE EXCEPTION 'Existing processing_jobs table required';
  END IF;
  FOR r IN SELECT * FROM (VALUES
    ('dispatch_token','uuid'),('dispatch_started_at','timestamptz'),
    ('dispatch_attempts','integer'),('dispatch_error','text'),
    ('dispatch_worker_id','text'),('heartbeat_at','timestamptz'),
    ('lease_expires_at','timestamptz'),('dispatch_actor_id','uuid')
  ) AS x(col,typ) LOOP
    SELECT a.atttypid::regtype INTO t FROM pg_attribute a
      WHERE a.attrelid='public.processing_jobs'::regclass
        AND a.attname=r.col AND NOT a.attisdropped;
    IF FOUND AND t <> r.typ::regtype THEN
      RAISE EXCEPTION 'Conflicting processing_jobs column %; manual reconciliation required',r.col;
    END IF;
  END LOOP;
END $preflight$;

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
  SELECT pg_get_constraintdef(oid) INTO d FROM pg_constraint
    WHERE conrelid='public.processing_jobs'::regclass
      AND conname='processing_jobs_dispatch_attempts_nonnegative';
  IF FOUND THEN
    IF regexp_replace(d,'[[:space:]()]','','g') <> 'CHECKdispatch_attempts>=0' THEN
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
  IF to_regclass('public.processing_jobs_dispatch_token_unique') IS NOT NULL THEN
    SELECT i.indisunique,i.indisvalid,i.indrelid,
      pg_get_expr(i.indpred,i.indrelid) AS predicate,
      pg_get_indexdef(i.indexrelid,1,true) AS col,
      i.indnatts,i.indnkeyatts INTO c
    FROM pg_index i WHERE i.indexrelid='public.processing_jobs_dispatch_token_unique'::regclass;
    IF NOT FOUND OR NOT c.indisunique OR NOT c.indisvalid
      OR c.indrelid <> 'public.processing_jobs'::regclass
      OR c.col <> 'dispatch_token' OR c.indnatts<>1 OR c.indnkeyatts<>1
      OR regexp_replace(coalesce(c.predicate,''),'[[:space:]()]','','g') <> 'dispatch_tokenISNOTNULL' THEN
      RAISE EXCEPTION 'Conflicting dispatch token index';
    END IF;
  ELSE
    CREATE UNIQUE INDEX processing_jobs_dispatch_token_unique
      ON public.processing_jobs(dispatch_token) WHERE dispatch_token IS NOT NULL;
  END IF;
END $checks$;

-- Remove exactly the obsolete queue-claim API. RESTRICT: dependencies abort,
-- never CASCADE. Unexpected overloads require manual review, not silent removal.
DO $apis$
DECLARE p record;
BEGIN
  FOR p IN SELECT oid,oid::regprocedure::text AS signature FROM pg_proc
    WHERE pronamespace='public'::regnamespace
      AND proname='claim_approved_processing_job' LOOP
    IF p.oid <> coalesce(to_regprocedure('public.claim_approved_processing_job(text,integer)'),0::oid)
       AND p.oid <> coalesce(to_regprocedure('public.claim_approved_processing_job(uuid,uuid,uuid,text,integer)'),0::oid) THEN
      RAISE EXCEPTION 'Unexpected claim overload: %',p.signature;
    END IF;
  END LOOP;
  FOR p IN SELECT oid,oid::regprocedure::text AS signature FROM pg_proc
    WHERE pronamespace='public'::regnamespace AND proname='heartbeat_processing_job' LOOP
    IF p.oid <> coalesce(to_regprocedure('public.heartbeat_processing_job(uuid,uuid,text,integer)'),0::oid)
       AND p.oid <> coalesce(to_regprocedure('public.heartbeat_processing_job(uuid,uuid,uuid,text,integer)'),0::oid) THEN
      RAISE EXCEPTION 'Unexpected heartbeat overload: %',p.signature;
    END IF;
  END LOOP;
END $apis$;
DROP FUNCTION IF EXISTS public.claim_approved_processing_job(text,integer) RESTRICT;
-- The heartbeat receives workspace explicitly; no ambiguous old API remains.
DROP FUNCTION IF EXISTS public.heartbeat_processing_job(uuid,uuid,text,integer) RESTRICT;

CREATE OR REPLACE FUNCTION public.claim_approved_processing_job(
  p_job uuid,p_workspace uuid,p_actor uuid,p_worker_id text,p_lease_seconds integer DEFAULT 300
) RETURNS TABLE(
  job_id uuid,workspace_id uuid,outcome text,dispatch_token uuid,
  dispatch_attempts integer,file_id uuid,file_owner_id uuid,file_name text,
  file_storage_path text,file_size_bytes bigint,file_sha256 text,file_format text,
  lease_expires_at timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE j public.processing_jobs; f public.files; token uuid; ts timestamptz;
BEGIN
  IF p_job IS NULL OR p_workspace IS NULL OR p_actor IS NULL
     OR p_worker_id IS NULL OR length(trim(p_worker_id)) NOT BETWEEN 1 AND 100
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
  ts:=clock_timestamp();
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
  SELECT * INTO f FROM public.files WHERE id=j.file_id AND workspace_id=p_workspace
    AND user_id=j.user_id FOR SHARE;
  IF NOT FOUND OR f.status<>'Uploaded' OR f.size_bytes<=0 OR f.size_bytes>5368709120
     OR f.sha256 IS NULL OR f.sha256 !~ '^[0-9a-f]{64}$'
     OR f.format NOT IN ('MP4','MOV','PDF','PPTX','DOCX') THEN
    RAISE EXCEPTION 'Verified original required' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.workspace_members m WHERE m.workspace_id=p_workspace
    AND m.user_id=f.user_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'File owner membership required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.approval_requests a WHERE a.processing_job_id=j.id
    AND a.workspace_id=p_workspace AND a.file_id=f.id AND a.status='Approved' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Matching processing approval required' USING ERRCODE='42501'; END IF;
  token:=gen_random_uuid(); ts:=clock_timestamp();
  UPDATE public.processing_jobs q SET status='Processing',stage='Dispatch claimed',progress=0,
    dispatch_token=token,dispatch_actor_id=p_actor,dispatch_worker_id=trim(p_worker_id),
    dispatch_started_at=ts,heartbeat_at=ts,lease_expires_at=ts+make_interval(secs=>p_lease_seconds),
    dispatch_attempts=q.dispatch_attempts+1,dispatch_error=NULL,error=NULL WHERE q.id=j.id;
  RETURN QUERY SELECT j.id,p_workspace,'Claimed'::text,token,j.dispatch_attempts+1,
    f.id,f.user_id,f.name,f.storage_path,f.size_bytes,f.sha256,f.format,
    ts+make_interval(secs=>p_lease_seconds);
END $fn$;

-- Mandatory transaction-local guard for every future ingestion/finalization RPC.
-- A standalone successful check is NOT permission for a later independent write.
CREATE OR REPLACE FUNCTION public.assert_processing_attempt(
  p_job uuid,p_workspace uuid,p_token uuid,p_worker_id text
) RETURNS public.processing_jobs LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $fn$
DECLARE j public.processing_jobs;
BEGIN
  SELECT * INTO j FROM public.processing_jobs q WHERE q.id=p_job AND q.workspace_id=p_workspace FOR UPDATE;
  IF NOT FOUND OR p_token IS NULL OR p_worker_id IS NULL OR j.status<>'Processing'
    OR j.dispatch_token IS DISTINCT FROM p_token
    OR j.dispatch_worker_id IS DISTINCT FROM trim(p_worker_id)
    OR j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'Attempt expired, invalid or superseded' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.workspace_members m WHERE m.workspace_id=p_workspace
    AND m.user_id=j.dispatch_actor_id AND m.role IN ('owner','reviewer') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dispatch reviewer access revoked' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.files f WHERE f.id=j.file_id AND f.workspace_id=p_workspace
    AND f.user_id=j.user_id AND f.status='Uploaded' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original no longer eligible' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.workspace_members m WHERE m.workspace_id=p_workspace AND m.user_id=j.user_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'File owner access revoked' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.approval_requests a WHERE a.processing_job_id=j.id
    AND a.file_id=j.file_id AND a.workspace_id=p_workspace AND a.status='Approved' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Processing approval required' USING ERRCODE='42501'; END IF;
  -- Authorization checks may have waited on locks; check wall clock again.
  IF j.lease_expires_at<=clock_timestamp() THEN
    RAISE EXCEPTION 'Attempt expired during authorization' USING ERRCODE='42501';
  END IF;
  RETURN j;
END $fn$;

CREATE OR REPLACE FUNCTION public.heartbeat_processing_job(
  p_job uuid,p_workspace uuid,p_token uuid,p_worker_id text,p_lease_seconds integer DEFAULT 300
) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE j public.processing_jobs; ts timestamptz; expiry timestamptz;
BEGIN
  IF p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 60 AND 900 THEN
    RAISE EXCEPTION 'Invalid lease duration' USING ERRCODE='22023';
  END IF;
  j:=public.assert_processing_attempt(p_job,p_workspace,p_token,p_worker_id);
  ts:=clock_timestamp();
  IF j.lease_expires_at<=ts THEN RAISE EXCEPTION 'Expired lease' USING ERRCODE='42501'; END IF;
  expiry:=ts+make_interval(secs=>p_lease_seconds);
  UPDATE public.processing_jobs SET heartbeat_at=ts,lease_expires_at=expiry WHERE id=j.id;
  RETURN expiry;
END $fn$;

CREATE OR REPLACE FUNCTION public.fail_processing_attempt(
  p_job uuid,p_workspace uuid,p_token uuid,p_worker_id text,p_error_code text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE j public.processing_jobs; next_status text;
BEGIN
  -- Accept safe categories only; never persist arbitrary signed URLs or secrets.
  IF p_error_code IS NULL OR p_error_code NOT IN
    ('DownloadFailed','IntegrityFailed','ProcessorFailed','DeliveryUncertain','PersistenceFailed') THEN
    RAISE EXCEPTION 'Invalid failure category' USING ERRCODE='22023';
  END IF;
  j:=public.assert_processing_attempt(p_job,p_workspace,p_token,p_worker_id);
  next_status:=CASE WHEN j.dispatch_attempts>=3 THEN 'Failed' ELSE 'Approved' END;
  IF j.lease_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Expired lease' USING ERRCODE='42501'; END IF;
  UPDATE public.processing_jobs SET status=next_status,
    stage=CASE WHEN next_status='Failed' THEN 'Dispatch attempts exhausted' ELSE 'Retry requires dispatch' END,
    progress=NULL,error=p_error_code,dispatch_error=p_error_code,dispatch_token=NULL,
    lease_expires_at=NULL WHERE id=j.id;
  RETURN next_status;
END $fn$;

-- Trusted recovery can resolve one expired job even if nobody clicks retry.
-- No new execution is authorized: the next claim still checks a current reviewer.
CREATE OR REPLACE FUNCTION public.expire_processing_attempt(p_job uuid,p_workspace uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE j public.processing_jobs; next_status text;
BEGIN
  SELECT * INTO j FROM public.processing_jobs q WHERE q.id=p_job
    AND q.workspace_id=p_workspace FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN 'Unavailable'; END IF;
  IF j.status<>'Processing' OR j.lease_expires_at IS NULL
    OR j.lease_expires_at>clock_timestamp() THEN RETURN 'NotExpired'; END IF;
  next_status:=CASE WHEN j.dispatch_attempts>=3 THEN 'Failed' ELSE 'Approved' END;
  UPDATE public.processing_jobs SET status=next_status,
    stage=CASE WHEN next_status='Failed' THEN 'Dispatch attempts exhausted' ELSE 'Lease expired; retry requires dispatch' END,
    progress=NULL,error='LeaseExpired',dispatch_error='LeaseExpired',
    dispatch_token=NULL,lease_expires_at=NULL WHERE id=j.id;
  RETURN next_status;
END $fn$;

-- Fails closed during the dispatch-only rollout. No result writes or Completed
-- transitions are enabled before an atomic, verified ingestion RPC is reviewed.
-- This avoids claiming that a separate lease-check HTTP request fences storage.
CREATE OR REPLACE FUNCTION public.block_uninstalled_processing_ingestion()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $fn$
BEGIN
  RAISE EXCEPTION 'Verified fenced ingestion is not installed; result write rejected' USING ERRCODE='42501';
END $fn$;
CREATE OR REPLACE FUNCTION public.block_unverified_processing_completion()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $fn$
BEGIN
  IF NEW.status='Completed' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'Completed') THEN
    RAISE EXCEPTION 'Verified fenced finalization is not installed' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $fn$;
DO $guards$
DECLARE t text; existing record;
BEGIN
  FOREACH t IN ARRAY ARRAY['videos','video_speakers','transcript_segments','speaker_turns',
    'video_frames','slide_intervals','documents','document_pages','document_slides','knowledge_chunks'] LOOP
    SELECT tgfoid,tgtype,tgenabled INTO existing FROM pg_trigger
      WHERE tgrelid=format('public.%I',t)::regclass AND tgname='memora_ingestion_not_installed' AND NOT tgisinternal;
    IF FOUND THEN
      IF existing.tgfoid<>'public.block_uninstalled_processing_ingestion()'::regprocedure
        OR existing.tgtype<>23 OR existing.tgenabled NOT IN ('O','A') THEN
        RAISE EXCEPTION 'Conflicting ingestion guard on %',t;
      END IF;
    ELSE
      EXECUTE format('CREATE TRIGGER memora_ingestion_not_installed BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.block_uninstalled_processing_ingestion()',t);
    END IF;
  END LOOP;
  SELECT tgfoid,tgtype,tgenabled INTO existing FROM pg_trigger
    WHERE tgrelid='public.processing_jobs'::regclass AND tgname='memora_completion_not_installed' AND NOT tgisinternal;
  IF FOUND THEN
    IF existing.tgfoid<>'public.block_unverified_processing_completion()'::regprocedure
      OR existing.tgtype<>23 OR existing.tgenabled NOT IN ('O','A') THEN
      RAISE EXCEPTION 'Conflicting completion guard';
    END IF;
  ELSE
    CREATE TRIGGER memora_completion_not_installed BEFORE INSERT OR UPDATE ON public.processing_jobs
      FOR EACH ROW EXECUTE FUNCTION public.block_unverified_processing_completion();
  END IF;
END $guards$;

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

COMMENT ON FUNCTION public.claim_approved_processing_job(uuid,uuid,uuid,text,integer)
IS 'Selected-job claim. Server-derived actor, current reviewer role, matching approval, 3 claims maximum, fresh fencing token.';
COMMENT ON FUNCTION public.assert_processing_attempt(uuid,uuid,uuid,text)
IS 'Lock and revalidate current unexpired attempt inside each ingestion transaction; never a standalone write authorization.';
