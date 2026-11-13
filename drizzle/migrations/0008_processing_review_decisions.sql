ALTER TABLE public.approval_requests ADD COLUMN processing_job_id uuid REFERENCES public.processing_jobs(id);
CREATE UNIQUE INDEX approvals_one_processing_decision ON public.approval_requests(processing_job_id) WHERE processing_job_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_storage_verification()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF NEW.reclaimed_size_bytes > 0 AND (NEW.retention_verified_at IS NULL OR NEW.approval_id IS NULL OR NOT EXISTS (
 SELECT 1 FROM public.approval_requests a WHERE a.id=NEW.approval_id AND a.workspace_id=NEW.workspace_id AND a.file_id=NEW.file_id AND a.status='Approved' AND a.processing_job_id IS NULL
 )) THEN RAISE EXCEPTION 'Reclaimed storage requires verified authorized retention approval'; END IF;
 RETURN NEW;
END $$;

CREATE FUNCTION public.decide_processing_job(p_job uuid,p_workspace uuid,p_decision text,p_reason text)
RETURNS TABLE(job_id uuid,job_status text,decision_id uuid,reused boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j public.processing_jobs; f public.files; a public.approval_requests; actor uuid := auth.uid();
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 IF p_decision IS NULL OR p_decision NOT IN ('Approved','Rejected') OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid decision'; END IF;
 PERFORM 1 FROM public.workspace_members WHERE workspace_id=p_workspace AND user_id=actor AND role IN ('owner','reviewer') FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reviewer access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO j FROM public.processing_jobs WHERE id=p_job AND workspace_id=p_workspace FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Job access required' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.approval_requests WHERE processing_job_id=j.id;
 IF FOUND THEN
  IF a.status <> p_decision THEN RAISE EXCEPTION 'This job already has a different decision'; END IF;
  RETURN QUERY SELECT j.id,j.status,a.id,true; RETURN;
 END IF;
 IF j.status <> 'Awaiting Review' THEN RAISE EXCEPTION 'Only Awaiting Review jobs can be decided'; END IF;
 SELECT * INTO f FROM public.files WHERE id=j.file_id AND workspace_id=j.workspace_id AND user_id=j.user_id FOR SHARE;
 IF NOT FOUND OR f.status <> 'Uploaded' OR NOT public.is_workspace_member(j.workspace_id) OR NOT EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id=j.workspace_id AND user_id=j.user_id) THEN RAISE EXCEPTION 'Original is no longer eligible'; END IF;
 INSERT INTO public.approval_requests(user_id,file_id,workspace_id,processing_job_id,reason,status)
 VALUES(actor,j.file_id,j.workspace_id,j.id,trim(p_reason),p_decision) RETURNING * INTO a;
 UPDATE public.processing_jobs SET status=p_decision,stage=CASE WHEN p_decision='Approved' THEN 'Approved; dispatch not connected' ELSE 'Rejected' END,progress=NULL,error=CASE WHEN p_decision='Rejected' THEN trim(p_reason) ELSE NULL END WHERE id=j.id;
 RETURN QUERY SELECT j.id,p_decision,a.id,false;
END $$;
REVOKE ALL ON FUNCTION public.decide_processing_job(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.decide_processing_job(uuid,uuid,text,text) TO authenticated;
COMMENT ON FUNCTION public.decide_processing_job(uuid,uuid,text,text) IS 'Narrow atomic reviewer decision boundary; checks auth.uid and current owner/reviewer membership, locks job, records one immutable processing decision, never dispatches.';