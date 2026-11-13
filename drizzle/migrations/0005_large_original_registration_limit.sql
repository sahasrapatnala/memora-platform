CREATE OR REPLACE FUNCTION public.register_verified_original(p_user uuid, p_workspace uuid, p_path text, p_name text, p_format text, p_size bigint, p_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE f uuid;
BEGIN
IF NOT EXISTS(SELECT 1 FROM public.workspace_members WHERE workspace_id=p_workspace AND user_id=p_user) THEN RAISE EXCEPTION 'Workspace access required'; END IF;
IF p_path NOT LIKE p_user::text || '/%' OR p_size<=0 OR p_size>2147483648 OR p_hash !~ '^[0-9a-f]{64}$' OR p_format NOT IN ('MP4','MOV','PDF','PPTX','DOCX') THEN RAISE EXCEPTION 'Invalid original'; END IF;
INSERT INTO public.files(user_id,workspace_id,name,format,size_bytes,storage_path,sha256,status) VALUES(p_user,p_workspace,p_name,p_format,p_size,p_path,p_hash,'Uploaded') ON CONFLICT(storage_path) DO NOTHING RETURNING id INTO f;
IF f IS NULL THEN SELECT id INTO f FROM public.files WHERE storage_path=p_path AND user_id=p_user AND workspace_id=p_workspace AND sha256=p_hash AND size_bytes=p_size; END IF;
IF f IS NULL THEN RAISE EXCEPTION 'Conflicting registration'; END IF;
RETURN f;
END $function$;
REVOKE ALL ON FUNCTION public.register_verified_original(uuid,uuid,text,text,text,bigint,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_verified_original(uuid,uuid,text,text,text,bigint,text) TO service_role;