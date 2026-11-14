-- MEMORA duplicate analysis and retention review v5: REVIEW ONLY. Not applied.
-- Execution order: dispatch v3, ingestion v4, then this migration.
-- Existing reviewed duplicate groups, originals, approvals and storage remain untouched.

ALTER TABLE public.duplicate_groups ADD COLUMN IF NOT EXISTS group_key text,
  ADD COLUMN IF NOT EXISTS retained_file_id uuid REFERENCES public.files(id),
  ADD COLUMN IF NOT EXISTS potential_savings_bytes bigint,
  ADD COLUMN IF NOT EXISTS evidence jsonb;
ALTER TABLE public.duplicate_matches ADD COLUMN IF NOT EXISTS evidence jsonb;
ALTER TABLE public.optimization_recommendations ADD COLUMN IF NOT EXISTS retained_file_id uuid REFERENCES public.files(id),
  ADD COLUMN IF NOT EXISTS potential_savings_bytes bigint,
  ADD COLUMN IF NOT EXISTS evidence jsonb,
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.duplicate_groups(id);
CREATE UNIQUE INDEX IF NOT EXISTS duplicate_groups_workspace_key ON public.duplicate_groups(workspace_id,group_key) WHERE group_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS duplicate_matches_file ON public.duplicate_matches(file_id,group_id);
CREATE INDEX IF NOT EXISTS optimization_recommendations_group ON public.optimization_recommendations(group_id,status);

CREATE OR REPLACE FUNCTION public.replace_duplicate_analysis(
  p_workspace uuid,p_actor uuid,p_groups jsonb
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE g jsonb; inserted_group uuid; match_count integer; total integer:=0;
  hash_count integer; id_count integer; expected_savings bigint;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=p_workspace AND user_id=p_actor AND role IN ('owner','reviewer')) THEN
    RAISE EXCEPTION 'Current reviewer access required' USING ERRCODE='42501';
  END IF;
  IF p_groups IS NULL OR pg_catalog.jsonb_typeof(p_groups)<>'array' OR pg_catalog.jsonb_array_length(p_groups)>1000 THEN
    RAISE EXCEPTION 'Invalid bounded duplicate analysis' USING ERRCODE='22023';
  END IF;
  DELETE FROM public.duplicate_matches WHERE group_id IN
    (SELECT id FROM public.duplicate_groups WHERE workspace_id=p_workspace AND status='Awaiting Review');
  DELETE FROM public.duplicate_groups WHERE workspace_id=p_workspace AND status='Awaiting Review';
  DELETE FROM public.optimization_recommendations WHERE workspace_id=p_workspace AND status='Awaiting Review';
  FOR g IN SELECT value FROM pg_catalog.jsonb_array_elements(p_groups) LOOP
    IF g->>'group_key' IS NULL OR g->>'method' NOT IN ('exact-file-sha256','exact-content-sha256','near-text-jaccard')
      OR g->>'status'<>'Awaiting Review' OR pg_catalog.jsonb_typeof(g->'matches')<>'array'
      OR pg_catalog.jsonb_array_length(g->'matches')<2 OR pg_catalog.jsonb_array_length(g->'matches')>100 THEN
      RAISE EXCEPTION 'Invalid duplicate group' USING ERRCODE='22023';
    END IF;
    IF EXISTS(SELECT 1 FROM public.duplicate_groups WHERE workspace_id=p_workspace AND group_key=g->>'group_key') THEN CONTINUE; END IF;
    IF (g->>'method'='exact-file-sha256' AND (g->>'retained_file_id') IS NULL)
      OR (g->>'method'<>'exact-file-sha256' AND ((g->>'potential_savings_bytes')::bigint IS DISTINCT FROM 0::bigint OR g->>'retained_file_id' IS NOT NULL)) THEN
      RAISE EXCEPTION 'Unsafe duplicate savings or retained-copy assignment' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.duplicate_groups(workspace_id,method,status,group_key,retained_file_id,potential_savings_bytes,evidence)
      VALUES(p_workspace,g->>'method','Awaiting Review',g->>'group_key',(g->>'retained_file_id')::uuid,
        (g->>'potential_savings_bytes')::bigint,g->'evidence') RETURNING id INTO inserted_group;
    INSERT INTO public.duplicate_matches(workspace_id,group_id,file_id,similarity,evidence)
      SELECT p_workspace,inserted_group,f.id,x.similarity,x.evidence FROM pg_catalog.jsonb_to_recordset(g->'matches')
        AS x(file_id uuid,similarity double precision,evidence jsonb)
        JOIN public.files f ON f.id=x.file_id AND f.workspace_id=p_workspace AND f.status='Uploaded'
      WHERE x.similarity BETWEEN 0 AND 1;
    GET DIAGNOSTICS match_count=ROW_COUNT;
    IF match_count<>pg_catalog.jsonb_array_length(g->'matches') THEN RAISE EXCEPTION 'Invalid duplicate match source'; END IF;
    IF g->>'method'='exact-file-sha256' THEN
      SELECT pg_catalog.count(DISTINCT f.sha256),pg_catalog.count(DISTINCT f.id),
        pg_catalog.coalesce(pg_catalog.sum(f.size_bytes) FILTER(WHERE f.id<>(g->>'retained_file_id')::uuid),0)
        INTO hash_count,id_count,expected_savings
        FROM public.files f JOIN public.duplicate_matches m ON m.file_id=f.id WHERE m.group_id=inserted_group;
      IF hash_count<>1 OR id_count<>match_count THEN RAISE EXCEPTION 'Exact file group hash mismatch'; END IF;
      IF expected_savings IS DISTINCT FROM (g->>'potential_savings_bytes')::bigint THEN
        RAISE EXCEPTION 'Exact duplicate savings do not match measured redundant bytes';
      END IF;
      IF NOT EXISTS(SELECT 1 FROM public.files WHERE id=(g->>'retained_file_id')::uuid AND workspace_id=p_workspace AND status='Uploaded') THEN
        RAISE EXCEPTION 'Retained original is unavailable';
      END IF;
      INSERT INTO public.optimization_recommendations(workspace_id,file_id,reason,status,retained_file_id,potential_savings_bytes,evidence,group_id)
        SELECT p_workspace,f.id,'Exact SHA-256 duplicate; reviewer approval and owner confirmation required','Awaiting Review',
          (g->>'retained_file_id')::uuid,f.size_bytes,g->'evidence',inserted_group
        FROM public.files f JOIN public.duplicate_matches m ON m.file_id=f.id
        WHERE m.group_id=inserted_group AND f.id<>(g->>'retained_file_id')::uuid;
    END IF;
    total:=total+1;
  END LOOP;
  INSERT INTO public.activity_logs(workspace_id,user_id,action) VALUES(p_workspace,p_actor,'Duplicate analysis completed');
  RETURN total;
END $fn$;

CREATE OR REPLACE FUNCTION public.review_retention_recommendation(
  p_recommendation uuid,p_actor uuid,p_decision text,p_reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE r public.optimization_recommendations; original public.files; retained public.files; approval uuid;
BEGIN
  IF p_decision NOT IN ('Approved','Rejected') OR p_reason IS NULL OR pg_catalog.length(pg_catalog.btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'A valid decision and reason are required' USING ERRCODE='22023';
  END IF;
  SELECT * INTO r FROM public.optimization_recommendations WHERE id=p_recommendation FOR UPDATE;
  IF NOT FOUND OR r.status<>'Awaiting Review' OR r.retained_file_id IS NULL OR r.group_id IS NULL THEN
    RAISE EXCEPTION 'Current retention recommendation required' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.workspace_members WHERE workspace_id=r.workspace_id AND user_id=p_actor AND role IN ('owner','reviewer') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Current reviewer access required' USING ERRCODE='42501'; END IF;
  SELECT * INTO original FROM public.files WHERE id=r.file_id AND workspace_id=r.workspace_id AND status='Uploaded' FOR SHARE;
  SELECT * INTO retained FROM public.files WHERE id=r.retained_file_id AND workspace_id=r.workspace_id AND status='Uploaded' FOR SHARE;
  IF original.id IS NULL OR retained.id IS NULL OR original.id=retained.id OR original.sha256 IS NULL OR original.sha256 IS DISTINCT FROM retained.sha256 THEN
    RAISE EXCEPTION 'Verified exact retained copy required' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM public.processing_jobs WHERE file_id=original.id AND status NOT IN ('Completed','Failed','Cancelled','Rejected')) THEN
    RAISE EXCEPTION 'Active processing must finish before retention approval' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.approval_requests(workspace_id,user_id,file_id,reason,status,processing_job_id)
    VALUES(r.workspace_id,p_actor,original.id,pg_catalog.btrim(p_reason),p_decision,NULL) RETURNING id INTO approval;
  UPDATE public.optimization_recommendations SET status=p_decision WHERE id=r.id;
  INSERT INTO public.activity_logs(workspace_id,user_id,file_id,file_name,action)
    VALUES(r.workspace_id,p_actor,original.id,original.name,'Retention recommendation '||p_decision);
  RETURN approval;
END $fn$;

CREATE OR REPLACE FUNCTION public.begin_retention_deletion(
  p_recommendation uuid,p_approval uuid,p_actor uuid
) RETURNS TABLE(storage_path text,size_bytes bigint,sha256 text) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE r public.optimization_recommendations; original public.files; retained public.files;
BEGIN
  SELECT * INTO r FROM public.optimization_recommendations WHERE id=p_recommendation AND status='Approved' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Approved retention recommendation required' USING ERRCODE='42501'; END IF;
  SELECT * INTO original FROM public.files WHERE id=r.file_id AND workspace_id=r.workspace_id AND user_id=p_actor FOR UPDATE;
  SELECT * INTO retained FROM public.files WHERE id=r.retained_file_id AND workspace_id=r.workspace_id AND status='Uploaded' FOR SHARE;
  IF original.id IS NULL OR retained.id IS NULL OR original.status NOT IN ('Uploaded','Deleting')
    OR original.sha256 IS NULL OR original.sha256 IS DISTINCT FROM retained.sha256 THEN
    RAISE EXCEPTION 'Owner and exact retained copy required' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.approval_requests a WHERE a.id=p_approval AND a.workspace_id=r.workspace_id
    AND a.file_id=original.id AND a.status='Approved' AND a.processing_job_id IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Matching retention approval required' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM public.processing_jobs WHERE file_id=original.id AND status NOT IN ('Completed','Failed','Cancelled','Rejected')) THEN
    RAISE EXCEPTION 'Active processing prevents deletion' USING ERRCODE='42501';
  END IF;
  IF original.status='Uploaded' THEN PERFORM public.set_original_deletion(p_actor,original.id,'Deleting'); END IF;
  RETURN QUERY SELECT original.storage_path,original.size_bytes,original.sha256;
END $fn$;

CREATE OR REPLACE FUNCTION public.complete_retention_deletion(
  p_recommendation uuid,p_approval uuid,p_actor uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE r public.optimization_recommendations; original public.files; retained public.files;
BEGIN
  SELECT * INTO r FROM public.optimization_recommendations WHERE id=p_recommendation AND status='Approved' FOR UPDATE;
  SELECT * INTO original FROM public.files WHERE id=r.file_id AND workspace_id=r.workspace_id AND user_id=p_actor FOR UPDATE;
  SELECT * INTO retained FROM public.files WHERE id=r.retained_file_id AND workspace_id=r.workspace_id AND status='Uploaded' FOR SHARE;
  IF r.id IS NULL OR original.id IS NULL OR retained.id IS NULL OR original.status NOT IN ('Deleting','Deleted')
    OR original.sha256 IS NULL OR original.sha256 IS DISTINCT FROM retained.sha256 OR NOT EXISTS(
      SELECT 1 FROM public.approval_requests a WHERE a.id=p_approval AND a.workspace_id=r.workspace_id
        AND a.file_id=original.id AND a.status='Approved' AND a.processing_job_id IS NULL) THEN
    RAISE EXCEPTION 'Verified retention finalization prerequisites missing' USING ERRCODE='42501';
  END IF;
  IF original.status='Deleted' AND r.status='Approved' THEN RETURN; END IF;
  PERFORM public.set_original_deletion(p_actor,original.id,'Deleted');
  INSERT INTO public.storage_analytics(workspace_id,file_id,generated_size_bytes,reclaimed_size_bytes,retention_verified_at,approval_id)
    VALUES(r.workspace_id,original.id,0,original.size_bytes,pg_catalog.clock_timestamp(),p_approval);
  UPDATE public.optimization_recommendations SET status='Deleted' WHERE id=r.id;
END $fn$;

REVOKE ALL ON FUNCTION public.begin_retention_deletion(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.complete_retention_deletion(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_retention_deletion(uuid,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_retention_deletion(uuid,uuid,uuid) TO service_role;

REVOKE ALL ON FUNCTION public.replace_duplicate_analysis(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.review_retention_recommendation(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.replace_duplicate_analysis(uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_retention_recommendation(uuid,uuid,text,text) TO service_role;
COMMENT ON FUNCTION public.review_retention_recommendation(uuid,uuid,text,text)
IS 'Reviewer-only exact-duplicate retention decision; processing approval is separate and no deletion is performed.';
