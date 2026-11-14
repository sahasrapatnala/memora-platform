-- REVIEW ONLY. Apply after corrected dispatch v3 and ingestion v4; never during this task.
-- Single-install migration: explicit refusal on repeat/partial schema, transactional DDL.
DO $$ BEGIN
 IF pg_catalog.to_regclass('public.source_summaries') IS NOT NULL THEN RAISE EXCEPTION 'Summaries already or partially installed; reconcile migration history'; END IF;
 IF pg_catalog.to_regclass('public.processing_results') IS NULL OR pg_catalog.to_regprocedure('public.finalize_processing_attempt(uuid,uuid,uuid,text,jsonb,text)') IS NULL THEN RAISE EXCEPTION 'Verified ingestion v4 prerequisite required'; END IF;
END $$;
CREATE TABLE public.source_summaries (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
 file_id uuid NOT NULL REFERENCES public.files(id),
 requested_by uuid NOT NULL,
 answer text NOT NULL,
 evidence_chunk_ids uuid[] NOT NULL,
 citations jsonb NOT NULL,
 model text NOT NULL,
 metadata jsonb NOT NULL,
 request_key text NOT NULL,
 evidence_fingerprint text NOT NULL,
 generated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 UNIQUE(workspace_id,file_id,request_key)
);
GRANT SELECT ON public.source_summaries TO authenticated;
GRANT ALL ON public.source_summaries TO service_role;
ALTER TABLE public.source_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_read ON public.source_summaries FOR SELECT TO authenticated USING(public.is_workspace_member(workspace_id));
CREATE INDEX source_summaries_latest ON public.source_summaries(workspace_id,file_id,generated_at DESC,id DESC);
CREATE FUNCTION public.save_source_summary(p_workspace uuid,p_file uuid,p_actor uuid,p_answer text,p_evidence uuid[],p_citations jsonb,p_model text,p_metadata jsonb,p_key text,p_fingerprint text)
RETURNS public.source_summaries LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result public.source_summaries; actor uuid:=p_actor;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.workspace_members WHERE workspace_id=p_workspace AND user_id=actor FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Workspace access required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.files WHERE id=p_file AND workspace_id=p_workspace AND status='Uploaded' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Source access required' USING ERRCODE='42501'; END IF;
 IF p_answer IS NULL OR pg_catalog.length(p_answer) NOT BETWEEN 1 AND 20000 OR p_model IS DISTINCT FROM 'openai/gpt-6-astra'
  OR p_key IS NULL OR p_key!~'^[0-9a-f]{64}$' OR p_fingerprint IS NULL OR p_fingerprint!~'^[0-9a-f]{64}$'
  OR p_evidence IS NULL OR pg_catalog.cardinality(p_evidence) NOT BETWEEN 1 AND 8
  OR pg_catalog.jsonb_typeof(p_citations) IS DISTINCT FROM 'array' OR pg_catalog.jsonb_array_length(p_citations)<>pg_catalog.cardinality(p_evidence)
  OR pg_catalog.jsonb_typeof(p_metadata) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid generated summary'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.unnest(p_evidence) AS e(id) WHERE NOT EXISTS(
  SELECT 1 FROM public.knowledge_chunks k WHERE k.id=e.id AND k.workspace_id=p_workspace AND k.file_id=p_file)) THEN
  RAISE EXCEPTION 'Summary evidence is outside source/workspace' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_citations) WITH ORDINALITY AS c(value,ord)
  WHERE c.value->>'chunkId' IS DISTINCT FROM p_evidence[c.ord]::text OR c.value->>'fileId' IS DISTINCT FROM p_file::text) THEN
  RAISE EXCEPTION 'Citation evidence mismatch' USING ERRCODE='42501'; END IF;
 INSERT INTO public.source_summaries(workspace_id,file_id,requested_by,answer,evidence_chunk_ids,citations,model,metadata,request_key,evidence_fingerprint)
 VALUES(p_workspace,p_file,actor,p_answer,p_evidence,p_citations,p_model,p_metadata,p_key,p_fingerprint)
 ON CONFLICT(workspace_id,file_id,request_key) DO NOTHING RETURNING * INTO result;
 IF result.id IS NULL THEN SELECT * INTO result FROM public.source_summaries WHERE workspace_id=p_workspace AND file_id=p_file AND request_key=p_key; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.save_source_summary(uuid,uuid,uuid,text,uuid[],jsonb,text,jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_source_summary(uuid,uuid,uuid,text,uuid[],jsonb,text,jsonb,text,text) TO service_role;
-- No output/source ingestion guard removed. Summary content never enters knowledge_chunks.
