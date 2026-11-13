GRANT INSERT ON TABLE public.processing_jobs TO authenticated;

ALTER POLICY jobs_insert ON public.processing_jobs
WITH CHECK (
  user_id = auth.uid()
  AND public.is_workspace_member(workspace_id)
  AND EXISTS (
    SELECT 1 FROM public.files f
    WHERE f.id = processing_jobs.file_id
      AND f.user_id = auth.uid()
      AND f.workspace_id = processing_jobs.workspace_id
      AND f.status = 'Uploaded'
  )
  AND status = 'Awaiting Review'
  AND progress IS NULL
);

CREATE UNIQUE INDEX processing_jobs_one_active_per_file
ON public.processing_jobs (file_id)
WHERE status NOT IN ('Completed', 'Failed', 'Cancelled', 'Rejected');

COMMENT ON INDEX public.processing_jobs_one_active_per_file IS
'One active request per file. Completed, Failed, Cancelled and Rejected are terminal; unknown statuses remain active conservatively.';