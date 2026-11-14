-- REVIEW ONLY: requires separate approval before managed transactional application.
-- Remove all non-SELECT capabilities inherited at table creation from defaults.
-- PUBLIC has no ACL entries and neither client role inherits another role.
-- Existing SELECT, RLS, policies, owners, service_role and defaults stay unchanged.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
ON TABLE public.processing_artifacts, public.processing_results
FROM anon, authenticated;