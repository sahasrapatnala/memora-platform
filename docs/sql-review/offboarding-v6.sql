-- MEMORA offboarding inventory v6: REVIEW ONLY. Not applied.
-- Execution order: v3 dispatch, v4 ingestion, v5 duplicates/retention, then v6.
-- Uses shared duplicate analysis; no automatic deletion or separate comparison engine.

ALTER TABLE public.offboarding_cases ADD COLUMN IF NOT EXISTS summary jsonb;
CREATE TABLE public.offboarding_case_files (
  case_id uuid NOT NULL REFERENCES public.offboarding_cases(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES public.files(id),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY(case_id,file_id)
);
GRANT SELECT ON public.offboarding_case_files TO authenticated;
GRANT ALL ON public.offboarding_case_files TO service_role;
ALTER TABLE public.offboarding_case_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_read ON public.offboarding_case_files FOR SELECT TO authenticated
  USING(public.is_workspace_member(workspace_id));
CREATE INDEX IF NOT EXISTS offboarding_case_files_workspace ON public.offboarding_case_files(workspace_id,file_id);

CREATE OR REPLACE FUNCTION public.create_offboarding_case(p_workspace uuid,p_actor uuid,p_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE created uuid;
BEGIN
  IF p_name IS NULL OR pg_catalog.length(pg_catalog.btrim(p_name)) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Invalid case name'; END IF;
  PERFORM 1 FROM public.workspace_members WHERE workspace_id=p_workspace AND user_id=p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workspace access required' USING ERRCODE='42501'; END IF;
  INSERT INTO public.offboarding_cases(workspace_id,name,status) VALUES(p_workspace,pg_catalog.btrim(p_name),'Inventory') RETURNING id INTO created;
  INSERT INTO public.activity_logs(workspace_id,user_id,action) VALUES(p_workspace,p_actor,'Offboarding case created');
  RETURN created;
END $fn$;

CREATE OR REPLACE FUNCTION public.set_offboarding_case_files(p_case uuid,p_actor uuid,p_file_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE c public.offboarding_cases;
BEGIN
  IF p_file_ids IS NULL OR pg_catalog.cardinality(p_file_ids)>1000 THEN RAISE EXCEPTION 'Invalid inventory size'; END IF;
  SELECT * INTO c FROM public.offboarding_cases WHERE id=p_case FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=c.workspace_id AND user_id=p_actor) THEN
    RAISE EXCEPTION 'Case access required' USING ERRCODE='42501';
  END IF;
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.unnest(p_file_ids) AS id)<>
     (SELECT pg_catalog.count(*) FROM public.files f JOIN pg_catalog.unnest(p_file_ids) AS id ON id=f.id WHERE f.workspace_id=c.workspace_id AND f.status='Uploaded') THEN
    RAISE EXCEPTION 'Every inventory file must be an uploaded original in this workspace';
  END IF;
  DELETE FROM public.offboarding_case_files WHERE case_id=p_case;
  INSERT INTO public.offboarding_case_files(case_id,file_id,workspace_id)
    SELECT p_case,id,c.workspace_id FROM pg_catalog.unnest(p_file_ids) AS id ON CONFLICT DO NOTHING;
  UPDATE public.offboarding_cases SET status='Ready for analysis',summary=NULL WHERE id=p_case;
  RETURN pg_catalog.cardinality(p_file_ids);
END $fn$;

CREATE OR REPLACE FUNCTION public.complete_offboarding_analysis(p_case uuid,p_actor uuid,p_summary jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE c public.offboarding_cases;
BEGIN
  SELECT * INTO c FROM public.offboarding_cases WHERE id=p_case FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=c.workspace_id AND user_id=p_actor) THEN
    RAISE EXCEPTION 'Case access required' USING ERRCODE='42501';
  END IF;
  IF p_summary IS NULL OR p_summary->>'deletionAuthorized' IS DISTINCT FROM 'false' OR
    (p_summary->>'selectedFiles')::integer IS DISTINCT FROM (SELECT pg_catalog.count(*) FROM public.offboarding_case_files WHERE case_id=p_case) THEN
    RAISE EXCEPTION 'Offboarding summary does not match its inventory';
  END IF;
  UPDATE public.offboarding_cases SET status='Analyzed',summary=p_summary WHERE id=p_case;
  INSERT INTO public.activity_logs(workspace_id,user_id,action) VALUES(c.workspace_id,p_actor,'Offboarding duplicate analysis completed');
END $fn$;

REVOKE ALL ON FUNCTION public.create_offboarding_case(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.set_offboarding_case_files(uuid,uuid,uuid[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.complete_offboarding_analysis(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_offboarding_case(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_offboarding_case_files(uuid,uuid,uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_offboarding_analysis(uuid,uuid,jsonb) TO service_role;
