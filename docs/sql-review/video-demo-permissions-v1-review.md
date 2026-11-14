# MEMORA two-table permission correction — review only

No live permissions changed. Processing and retention remain disabled.

## Live findings (14 November 2026)

Both `public.processing_artifacts` and `public.processing_results` are owned by postgres, with RLS enabled (not FORCE RLS). Their exact ACL is:
```text
{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
```
`arwdDxtm` means INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN. No grant options are present. `aclexplode` and `has_table_privilege` confirmed all eight capabilities for anon/authenticated/service_role on both tables.

- PUBLIC has **zero** table ACL entries on either table.
- No column-level ACLs exist; no independent column-write grants need revocation.
- Recursive pg_auth_members traversal found no parent roles reachable from anon, authenticated or service_role. Their effective privileges come directly from table ACLs, not role inheritance. Both client roles have INHERIT but are neither superusers nor BYPASSRLS; service_role has BYPASSRLS.
- The source is **postgres's public-schema default TABLE privileges**, which grant ALL to anon/authenticated/service_role. The managed migration created these tables as postgres; PostgreSQL copied those creator defaults into their ACLs. Explicit `GRANT SELECT TO authenticated` does not subtract default writes. The same default grant exists for the platform administration role, but it is not the owner/creator grantor of these tables.
- No PUBLIC grant or inherited parent-role grant contributes additional access. No default privileges, role memberships or managed schema settings need changing for this targeted fix.

Inspection used `pg_class.relacl`, lateral `aclexplode`, `pg_attribute.attacl`, `pg_roles`, recursive `pg_auth_members` with `pg_has_role(USAGE/SET)`, `pg_default_acl`, `has_table_privilege` and `pg_policies`, exclusively through read-only Cloud queries.

## Exact proposed SQL

Complete managed-transaction candidate: `docs/sql-review/video-demo-permissions-v1.sql`.
```sql
-- REVIEW ONLY: requires separate approval before managed transactional application.
-- Remove all non-SELECT capabilities inherited at table creation from defaults.
-- PUBLIC has no ACL entries and neither client role inherits another role.
-- Existing SELECT, RLS, policies, owners, service_role and defaults stay unchanged.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
ON TABLE public.processing_artifacts, public.processing_results
FROM anon, authenticated;
```

One REVOKE, two tables, two roles. No GRANT is needed: authenticated SELECT and every service_role privilege already exist and remain unchanged. Anonymous SELECT is intentionally left untouched for smallest scope; anonymous has no SELECT RLS policy and sees zero rows. PUBLIC is omitted because it has no grants. No CASCADE, row operations, functions, policies, indexes, role-membership changes, default-privilege changes or modifications to the approved video migration.

Include TRUNCATE because RLS does **not** protect it. Include REFERENCES/TRIGGER/MAINTAIN because these are unnecessary client capabilities; removing just INSERT/UPDATE/DELETE leaves a materially broader privilege surface. This is the smallest single-statement correction restoring client-read-only tables.

## RLS and trusted write boundaries

Each table has exactly one policy: authenticated SELECT `workspace_read` using `public.is_workspace_member(workspace_id)` (catalog display omits public). There are no client INSERT/UPDATE/DELETE policies. Those policies, table owners and RLS flags are unchanged by REVOKE.

Current ordinary client row mutations are already blocked by RLS, but broad TRUNCATE is an unacceptable capability for a client database role; never rely on REST method availability as its security boundary.

Trusted application writes remain `processing-callbacks.server.ts`: authenticated worker callback → service-role `register_processing_artifact` / `finalize_processing_attempt`. The RPCs keep selected workspace/job authorization, reviewer/approval checks, private artifact lineage, token fencing, leases and completion rollback. The worker never receives a database credential. Neither trusted write path relies on anon/authenticated table writes.

## Fresh test evidence

Actual disposable local PostgreSQL, not Cloud writes:
```text
python3 scripts/test-video-demo-sql.py --local-port 55439 --permission-correction --worker-evidence /tmp/memora-demo/video-verified/local-evidence.json
```

**25 reported test groups passed.** The opt-in correction test reproduces creator-default ALL grants before new tables are created, applies the exact candidate in a local transaction, and checks:
- A deliberately failed correction transaction restores original permissions; repeated correction is harmless.
- All seven revoked capabilities are effectively false for both client roles on both tables; SELECT stays true; all eight service_role capabilities remain true.
- Owners, RLS flags and policy definitions are byte-identical before/after.
- Actual authenticated and anonymous INSERT, UPDATE, DELETE and TRUNCATE statements fail with permission denied on both tables, including an authenticated workspace member.
- Member SELECT returns persisted output; nonmember and anonymous SELECT return zero.
- Actual service-role artifact registration and finalization RPCs still persist receipts/results.
- Stale attempts, expiry-during-finalization rollback, approval/reviewer enforcement, bounded failures/retries, concurrency, cancellation and result preservation regressions pass.

Earlier genuine local Whisper/OpenCV output was accepted again by SQL. Receipt registration is local; no new inference or hosted worker-to-Cloud transport tested. This is executable database evidence, not mocked database calls or a live two-account application test. Raw output is delivered separately.

## Approval and remaining scope

Recommendation: approve this exact one-statement correction for both tables, then apply only this file through the managed migration tool in one transaction and verify effective grants/RLS read-only. No need to reapply video-demo-v1, v3/v4 or historical 0009. Keep both execution gates off. Do not change platform-wide defaults: future tables should receive explicit reviewed revocations when created.

No application/UI, uploads, existing rows, saved results, GitHub connection or live permissions changed in this review. Before any future application, repeat the effective-grant check and stop if new PUBLIC, column or inherited-role privileges appear; the statement addresses the currently verified direct client grants only. If application fails, transactional ACL changes roll back; do not restore broad grants after successful application without separate review.