
-- MEMORA: secure processing dispatch and worker lease management.
-- One worker initially; safe to expand to multiple workers later.
-- Does not grant the worker direct database or Storage access.

ALTER TABLE public.processing_jobs
  ADD COLUMN IF NOT EXISTS dispatch_token uuid,
  ADD COLUMN IF NOT EXISTS dispatch_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispatch_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dispatch_error text,
  ADD COLUMN IF NOT EXISTS dispatch_worker_id text,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

ALTER TABLE public.processing_jobs
  ADD CONSTRAINT processing_jobs_dispatch_attempts_nonnegative
  CHECK (dispatch_attempts >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS processing_jobs_dispatch_token_unique
  ON public.processing_jobs (dispatch_token)
  WHERE dispatch_token IS NOT NULL;

-- Atomic claim:
-- 1. Select an approved job or an expired processing job.
-- 2. Lock it, skipping jobs another worker has locked.
-- 3. Issue a fresh fencing token.
-- 4. Extend its lease.
-- 5. Return only the metadata needed by the trusted server.

CREATE OR REPLACE FUNCTION public.claim_approved_processing_job(
  p_worker_id text,
  p_lease_seconds integer DEFAULT 300
)
RETURNS TABLE (
  job_id uuid,
  file_id uuid,
  workspace_id uuid,
  user_id uuid,
  dispatch_token uuid,
  dispatch_attempts integer,
  file_name text,
  file_storage_path text,
  file_size_bytes bigint,
  file_sha256 text,
  file_format text,
  lease_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job_id uuid;
  v_token uuid := gen_random_uuid();
BEGIN
  IF p_worker_id IS NULL
     OR length(trim(p_worker_id)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid worker identity';
  END IF;

  IF p_lease_seconds IS NULL
     OR p_lease_seconds NOT BETWEEN 60 AND 900 THEN
    RAISE EXCEPTION 'Lease must be between 60 and 900 seconds';
  END IF;

  SELECT pj.id
    INTO v_job_id
    FROM public.processing_jobs pj
    JOIN public.files f
      ON f.id = pj.file_id
     AND f.user_id = pj.user_id
     AND f.workspace_id = pj.workspace_id
   WHERE (
       pj.status = 'Approved'
       OR (
         pj.status = 'Processing'
         AND pj.lease_expires_at IS NOT NULL
         AND pj.lease_expires_at < now()
       )
     )
     AND f.status = 'Uploaded'
     AND f.sha256 IS NOT NULL
     AND f.sha256 ~ '^[0-9a-f]{64}$'
     AND f.size_bytes > 0
     AND f.size_bytes <= 5368709120
     AND EXISTS (
       SELECT 1
         FROM public.approval_requests a
        WHERE a.processing_job_id = pj.id
          AND a.file_id = pj.file_id
          AND a.workspace_id = pj.workspace_id
          AND a.status = 'Approved'
     )
     AND EXISTS (
       SELECT 1
         FROM public.workspace_members wm
        WHERE wm.workspace_id = pj.workspace_id
          AND wm.user_id = pj.user_id
     )
   ORDER BY
     CASE WHEN pj.status = 'Approved' THEN 0 ELSE 1 END,
     pj.created_at
   FOR UPDATE OF pj SKIP LOCKED
   LIMIT 1;

  IF v_job_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.processing_jobs pj
     SET status = 'Processing',
         stage = 'Processing',
         progress = 0,
         dispatch_token = v_token,
         dispatch_worker_id = trim(p_worker_id),
         dispatch_started_at = now(),
         heartbeat_at = now(),
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         dispatch_attempts = pj.dispatch_attempts + 1,
         dispatch_error = NULL,
         error = NULL
    FROM public.files f
   WHERE pj.id = v_job_id
     AND f.id = pj.file_id
  RETURNING
    pj.id,
    pj.file_id,
    pj.workspace_id,
    pj.user_id,
    pj.dispatch_token,
    pj.dispatch_attempts,
    f.name,
    f.storage_path,
    f.size_bytes,
    f.sha256,
    f.format,
    pj.lease_expires_at;
END;
$$;

-- Heartbeat:
-- A worker can renew only its own current, unexpired lease.
-- A recovered job has a new token, so an old worker is fenced out.

CREATE OR REPLACE FUNCTION public.heartbeat_processing_job(
  p_job uuid,
  p_token uuid,
  p_worker_id text,
  p_lease_seconds integer DEFAULT 300
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expiry timestamptz;
BEGIN
  IF p_lease_seconds IS NULL
     OR p_lease_seconds NOT BETWEEN 60 AND 900 THEN
    RAISE EXCEPTION 'Invalid lease duration';
  END IF;

  UPDATE public.processing_jobs
     SET heartbeat_at = now(),
         lease_expires_at = now() + make_interval(secs => p_lease_seconds)
   WHERE id = p_job
     AND status = 'Processing'
     AND dispatch_token = p_token
     AND dispatch_worker_id = p_worker_id
     AND lease_expires_at > now()
  RETURNING lease_expires_at INTO v_expiry;

  IF v_expiry IS NULL THEN
    RAISE EXCEPTION 'Worker lease is invalid, expired, or superseded';
  END IF;

  RETURN v_expiry;
END;
$$;

-- These functions are callable only through the trusted server admin client.
REVOKE ALL ON FUNCTION
  public.claim_approved_processing_job(text, integer)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
  public.heartbeat_processing_job(uuid, uuid, text, integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.claim_approved_processing_job(text, integer)
  TO service_role;

GRANT EXECUTE ON FUNCTION
  public.heartbeat_processing_job(uuid, uuid, text, integer)
  TO service_role;

COMMENT ON FUNCTION
  public.claim_approved_processing_job(text, integer)
IS 'Atomically claims an approved job or recovers an expired lease with a new fencing token.';

COMMENT ON FUNCTION
  public.heartbeat_processing_job(uuid, uuid, text, integer)
IS 'Renews only the current worker lease; stale or expired worker tokens are rejected.';
