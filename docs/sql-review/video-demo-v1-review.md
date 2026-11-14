# MEMORA video-only migration approval package

**Review only. Not applied. Processing remains disabled.**
Complete standalone SQL: `docs/sql-review/video-demo-v1.sql`. Tests: `scripts/test-video-demo-sql.py` and `src/test/video-demo-compatibility.test.ts`. No changes to running application, worker, design, uploads, repository connection or generated types.

## Scope and compatibility
This is an alternative to full v3/v4, NOT a step before/after them. It enables only the existing MP4/MOV speech + keyframe contract after separate application/enablement approval. Documents, diarization, multiple successful versions per original and durable AI summaries are excluded. Existing saved video results are never overwritten/deleted. One-video-per-file uniqueness remains.
Dispatcher and callback operation names, parameter names and return shapes are preserved. Worker sends empty speakers/turns, actual hashed transcript segments, frame/thumbnail receipts and attempt identity; SQL accepts this. Worker stage names, 300-second renewal, failure categories and private attempt-prefixed paths match. No service-role credential is required on the user's PC; generated application server clients remain the privileged boundary.

## Every object changed
### Existing tables: additive columns
- processing_jobs: dispatch_token uuid, dispatch_started_at timestamptz, dispatch_attempts integer NOT NULL DEFAULT 0, dispatch_error text, dispatch_worker_id text, heartbeat_at timestamptz, lease_expires_at timestamptz, dispatch_actor_id uuid.
- videos: processing_job_id uuid FK processing_jobs, language text.
- transcript_segments: processing_job_id uuid FK processing_jobs, content_sha256 text.
- video_frames: processing_job_id uuid FK processing_jobs, thumbnail_path text, thumbnail_size_bytes bigint, thumbnail_sha256 text.
- knowledge_chunks: processing_job_id uuid FK processing_jobs, source_key text, content_sha256 text.
Existing result columns default NULL; existing records preserved. Attempt count default is additive metadata, not a data-repair operation.

### New tables
- processing_artifacts: id UUID primary key, workspace_id/job_id/file_id foreign keys, dispatch_token, kind(frame/thumbnail), unique storage_path, size_bytes(1..2097152), SHA-256, created_at.
- processing_results: job_id primary key/FK, workspace_id/file_id FKs, kind(video only), language, duration_seconds, metadata, manifest_sha256, completed_at, created_at.
Both have RLS enabled and authenticated SELECT policy workspace_read using is_workspace_member(workspace_id). Both explicitly grant authenticated SELECT and service_role ALL. No anonymous or authenticated writes granted. Primary keys, foreign keys, unique path and check constraints are created by their table definitions.

### Constraints and indexes
processing_jobs_dispatch_attempts_nonnegative check; processing_jobs_dispatch_token_unique partial unique index. New videos_processing_job_unique, transcript_job_time_unique, frames_job_path_unique, knowledge_job_source_unique partial unique indexes; processing_artifacts_job and processing_results_workspace read indexes. Existing videos_file_id_key, documents_file_id_key and processing_jobs_one_active_per_file retained unchanged. Four new output lineage foreign keys use NO ACTION; no cascaded deletion introduced.

### Functions
New functions (full signatures in SQL): claim_approved_processing_job, assert_processing_attempt, heartbeat_processing_job, fail_processing_attempt, expire_processing_attempt, progress_processing_attempt, register_processing_artifact, finalize_processing_attempt, cancel_processing_attempt, validate_video_demo_manifest, block_uninstalled_processing_ingestion, block_unverified_processing_completion.
All new functions use empty search_path and qualified application relations. All execution is revoked from PUBLIC/anon/authenticated. Only the ten non-trigger functions grant EXECUTE to service_role. The two trigger functions have no explicit caller grant. SECURITY DEFINER is limited to claim/assert/heartbeat/failure/expiry/progress/artifact/finalization/cancellation; validator and trigger functions run with invoker semantics.
Existing is_workspace_member(uuid) and decide_processing_job(uuid,uuid,text,text) change only search_path to empty; bodies, owners, signatures and ACLs preserved. No changes to registration/deletion/auth profile functions.

### Triggers
memora_ingestion_not_installed BEFORE INSERT OR UPDATE on videos, transcript_segments, video_frames and knowledge_chunks; memora_completion_not_installed BEFORE INSERT OR UPDATE on processing_jobs. No live draft guards currently exist; this installs verified controls directly in one transaction. No existing guards removed. Completion context is transaction-local and set only after locked attempt authorization. Direct trusted SQL can set session settings: the guard is defense in depth, not authority against a database administrator.

### Existing permission changes
Revoke INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER from authenticated/anon on videos, transcript_segments, video_frames, knowledge_chunks, storage_analytics and activity_logs. SELECT and existing RLS policies retained. Existing service_role privileges retained. This resolves actual broad live table grants without adding write policies. Document/speaker tables, processing_jobs request grants, approvals, files, storage buckets/policies, roles and membership tables are unchanged.
No existing table/function/index/constraint is dropped. No migration-time DML touches existing rows. Runtime finalization only inserts new results/knowledge/analytics/audit records, and updates the selected job. Failure/recovery/cancellation update only the selected job. Originals and prior outputs are never deleted.

## Actual tests
- 104 application tests passed in 17 suites. Two new compatibility tests verify RPC signatures/return fields and current Python video payload acceptance by application schemas. These are code/unit tests, not live dispatch.
- 30 Python regressions passed; most download/callback/model lifecycle tests use mocked IO.
- Actual PostgreSQL 17.11 disposable DB: reconstructed migrations 0000–0008 with broad output grants reproduced from the live inspection. Historical unlisted 0009 not executed. Final SQL passed 19 reported groups: migration failure rollback; normal migration; replay refusal; approval/current reviewer/video enforcement; heartbeat renewal/nonregression; active duplicate claim denial; stale/cross-workspace attempts; stale finalization/failure; stale/cross-workspace receipts; lease expiry DURING delayed finalization rolling back all six output/accounting tables; fresh-token recovery; idempotent successful completion; separate-connection member readback/nonmember denial/client write denial; existing result preservation; two-connection concurrency/SKIP LOCKED; cancellation; three failures to terminal Failed; three expired attempts to exhaustion; reviewer revocation.
- Earlier genuine local Whisper/OpenCV output (12.133-second public speech + synthetic test-pattern MP4, one real segment, 59 actual JPEGs/thumbnails) was fed through current SQL and persisted in the disposable DB. Actual artifact hashes/lengths were used. Receipt registration was simulated locally; Cloud storage transport and original retrieval were NOT tested. This proves manifest compatibility, not full local-worker-to-Cloud acceptance.
- Initial local tests uncovered PL/pgSQL column/alias ambiguities and a test variable collision; corrected and the full final suite reran successfully. No Cloud writes.
Raw output is included in the package evidence folder. No production processing, browser refresh with live results, actual hosted callback authentication, second hosted account or storage readback is claimed.

## Exact future application procedure — separate approval required
1. Review this complete SQL and object/permission list. Reinspect live schema/history before application; preserve unlisted historical 0009. Confirm no other processing migration/guard/attempt columns have appeared. Stop on unexpected states.
2. Keep MEMORA_PROCESSING_ENABLED and MEMORA_RETENTION_ENABLED absent/false. Do not run v3/v4 before/after this alternative. Apply ONLY video-demo-v1.sql, byte-for-byte, through Lovable's managed migration tool as one transaction after explicit approval. Do not add BEGIN/COMMIT; the tool manages transaction boundaries. No direct production psql or manual partial function installation.
3. Regenerate managed database types after successful application, then rerun application compatibility tests. No regeneration now: the live schema has not changed.
4. Verify the existing request/approval/read flows and grants still behave correctly. Run controlled acceptance separately approved for a small real uploaded MP4, with current reviewer identity, revoked/nonmember denial, expiry and persistence/private readback.
5. Configure PROCESSING_API_URL (authenticated temporary worker HTTPS origin), PROCESSING_API_KEY (private shared credential), PROCESSING_CALLBACK_URL (reachable application /api/public/processing). Worker: PROCESSING_API_KEY, PROCESSING_CLOUD_ORIGIN, PROCESSING_CALLBACK_ORIGIN, PROCESSING_SCRATCH_DIR. Startup/tunnel PowerShell commands are in docs/hackathon-demo.md. Warm authenticated /ready before claiming. Do not put platform-managed database credentials on the PC.
6. Enable processing only after separate controlled-demo approval. Select an Approved short MP4; verify stages, transcript, timestamp seek and genuine private frames. Refresh/reopen to prove Cloud persistence. Disable after demo. Retention gate stays off. Because preview and published app share this Cloud database, application here is not an isolated production-free change.

## Disposable local reproduction (never Cloud)
Use a dedicated local PostgreSQL 17 cluster with a local superuser named lovable, not managed PG environment credentials. The script requires an explicit loopback port, creates a random database, applies synthetic baseline/fixtures, and drops ONLY that random database in finally. Never run on a tunnel/proxy to a managed database.
```powershell
python scripts/test-video-demo-sql.py --local-port 55439
bunx vitest run src/test/video-demo-compatibility.test.ts
Set-Location processing-service
python -m unittest test_attempt test_callbacks test_cloud_download test_documents test_heartbeat test_keyframes test_rules test_service test_demo_extract
```
Optional genuine local extractor evidence: add --worker-evidence pointing to demo_extract.py's local-evidence.json. This uses previously extracted content, not rerun inference/Cloud transport.

## Rollback and limitations
A failure within the single migration transaction rolls back schema/ACL/function changes; this was deliberately tested with a late division-by-zero. Failure DURING finalization rolls back result, transcript, frame, knowledge, completion and analytics writes; receipts uploaded earlier persist. A completed replay is readback, not permission for an expired attempt to write new data.
After successful migration, safest operational rollback is disable the processing gate, stop the tunnel/worker, and retain additive columns, tables and read-only outputs. No automatic destructive down migration supplied. Removing objects later could lose receipts/lineage/results or invalidate managed history, and restoring broad grants unnecessarily weakens defense in depth. Any such rollback needs a separate reviewed migration and exact ACL inventory.
Storage upload and DB insertion are not atomic: rejected/expired uploads can leave unused private generated bytes. Cleanup is not implemented. One process, no orchestration; crashes rely on fenced manual retry. Finite short source URLs and local tunnel stability remain operational limits. A zero-speech video fails this speech demo. Duplicate segment timestamps or duplicate frame storage paths fail unique constraints rather than discard evidence. Durable source summaries need their separate reviewed change; Ask over extracted knowledge exists, but live AI/refresh/isolation acceptance remains untested. Later full v3/v4 adoption requires explicit forward reconciliation, not replay.

## Final three safety checks — 14 November 2026

**Recommendation: retain the existing trigger and permission logic. No executable SQL correction is required for current application workflows.** SQL comments now record the inspected boundary; no guard exception, new write privilege or authorization-body replacement was added. Application code and design remain unchanged. Apply nothing until separate approval.

### 1. Ingestion triggers and all existing write paths

The four context triggers cover only videos, transcript_segments, video_frames and knowledge_chunks. They do not cover activity_logs or storage_analytics. Repository-wide write tracing plus read-only inspection of live public function bodies found no currently installed unrelated INSERT/UPDATE workflow on those four evidence tables.

| Operation | Exact application / database write path | Compatibility |
|---|---|---|
| Video ingestion | `src/lib/memora/processing-callbacks.server.ts:38–67` authenticates worker and invokes trusted `finalize_processing_attempt`; SQL validates the locked attempt, sets transaction-local context, inserts four evidence tables, analytics and activity | Context is supplied by the finalizer; executable disposable PostgreSQL tests pass |
| Private frame upload | `processing-callbacks.server.ts:73–104` verifies bytes, calls assert RPC, uploads private generated bytes, calls register RPC | Does not directly insert video_frames; finalization does that |
| Successful original upload audit | `api.functions.ts:81–114` verifies membership/path/bytes then service-role `register_verified_original`; files AFTER INSERT trigger calls SECURITY DEFINER `audit_file_registration`, inserting activity_logs | Audit table has no context trigger; definer ownership and service privileges remain |
| Failed upload audit | `api.functions.ts:117–126` checks membership then service-role activity_logs INSERT | Service-role grants preserved; no context trigger |
| Owner-confirmed original deletion audit | `api.functions.ts:129–146` calls trusted `set_original_deletion`, removes original storage, calls Deleted state; definer inserts activity_logs | No output-table mutation; SQL audit compatibility tested, not real storage deletion |
| Request / approval / rejection | `api.functions.ts:31–64`, `processing-request.ts:38`, `processing-review.ts:23` write processing_jobs / approval_requests via existing authorized paths | Six-table revocation does not target these tables; approval/rejection executed successfully in local PostgreSQL |
| Cancellation | `processing-cancel.functions.ts:15` invokes trusted cancel RPC, which updates job and inserts activity_logs | Neither operation needs the four-table context |
| Search / transcript / frame viewers | `knowledge.functions.ts:35–60`, `source-records.tsx:14–36`, `workspace-data.tsx:77–101` read evidence | SELECT and membership RLS retained |
| Source summaries | `knowledge.functions.ts:98` invokes future `save_source_summary` in `source-summaries-v7.sql:27–54` | Writes source_summaries, not knowledge_chunks; separate unapplied dependency |
| Duplicate / retention / offboarding | `duplicates.functions.ts:48`, `retention.functions.ts:17,51–63`, `offboarding.functions.ts:11,16–73`; review-only v5/v6 RPCs write activity_logs and retention storage_analytics | Future, not currently installed; use service-role/definer writes, not direct evidence updates. Video-only SQL does not install these workflows |

Live public-function body search for the six table names returned only `audit_file_registration()` and `set_original_deletion(uuid,uuid,text)` as existing writers. Live trigger inspection found files audit and storage verification; no currently installed context-ingestion triggers. `validate_storage_verification()` remains a separate reclaimed-storage approval validator, unchanged.

**Intentional limitation:** manual imports, metadata edits, transcript corrections or legacy NULL-lineage updates on the four evidence tables will be blocked, even for service_role. No such application feature exists in current code. Do not add a NULL-lineage or service-role bypass: it would permit unverified outputs. If a genuine external writer is later identified, review a narrow authorized RPC for that operation separately. External administrator scripts/services outside this repository were not inventoried; this conclusion does not certify them.

### 2. Actual live search-path definitions

Read-only query used (not inferred from saved migrations):
```sql
SELECT p.oid::regprocedure::text AS signature,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND p.proname IN ('is_workspace_member','decide_processing_job')
ORDER BY p.proname;
```

Actual `is_workspace_member(uuid)` body:
```sql
SELECT EXISTS(SELECT 1 FROM public.workspace_members
              WHERE workspace_id=w AND user_id=auth.uid())
```
Actual `decide_processing_job(uuid,uuid,text,text)` body:
```sql
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
END
```

Both currently use `SET search_path TO 'public'`, SECURITY DEFINER, owner postgres. Membership is SQL/STABLE; decision is PL/pgSQL. Every **application table/type/function** is qualified (`public.*`, `auth.uid()`). Not literally every function is qualified: `length` and `trim` are PostgreSQL built-ins; `trim` is parsed as built-in btrim. Implicit pg_catalog resolution remains available with empty search_path. No unqualified application object depends on public in these bodies.

Existing EXECUTE ACLs: membership postgres/anon/authenticated/service_role; decisions postgres/authenticated/service_role. ALTER search_path preserves owners, bodies and ACLs. Expanded local tests compare prosrc/proowner/proacl byte-for-byte before/after, then execute membership, RLS reads, approve/reject, required reasons, duplicate decision reuse and nonmember denial under authenticated identities. All pass. No live approval operation was invoked or mutated for this check.

### 3. Actual live permission compatibility

Read-only `has_table_privilege` inspection confirmed anon, authenticated and service_role currently have SELECT/INSERT/UPDATE/DELETE on all six tables. All six have RLS enabled and exactly one policy: authenticated SELECT `workspace_read`, expression `is_workspace_member(workspace_id)`; no client INSERT/UPDATE/DELETE policies. Broad grants therefore do not authorize ordinary client writes today.

Revoking six write-related privileges from anon/authenticated removes unused capability, not an existing working client write path. Authenticated SELECT and its membership policy remain; anonymous has no SELECT policy. Service-role privileges and SECURITY DEFINER ownership remain. There is no current authenticated-client INSERT/UPDATE/UPSERT/DELETE call to any of these six tables in application source. The exact current and future trusted write paths are listed above. No permission restoration or new client write policy is needed.

### Fresh tests and boundaries

- **23 reported PostgreSQL groups passed** using a dedicated disposable loopback database, reconstructed 0000–0008, with live-shaped broad grants for **both** anon and authenticated. Added checks cover exact six-table privileges, unchanged function bodies/owners/ACLs, empty-path membership/approval workflows, existing registration/failure/deletion audit DB paths, all four trigger INSERT/UPDATE refusals and client-forged-context refusal. Existing stale tokens, lease expiry during finalization/rollback, failure retries, three-attempt exhaustion, concurrency/SKIP LOCKED, cancellation, reviewer revocation, workspace isolation and result preservation reran.
- **104 application tests passed across 17 suites**, including existing dispatcher/worker schema compatibility. Unit/mock tests, not live Cloud processing.
- Earlier genuine local Whisper/OpenCV output was accepted and persisted again in disposable PostgreSQL. Artifact receipts were registered locally; no new inference, private Cloud transport, hosted refresh or live end-to-end processing was tested.
- Raw outputs: delivered `MEMORA-video-final-safety-sql-tests.txt` and `MEMORA-video-final-safety-app-tests.txt`.
- Updated source: `docs/sql-review/video-demo-v1.sql` (comments only), this Markdown review, `scripts/test-video-demo-sql.py`, `roadmap.md`. No executable SQL logic changed.

Remaining approval boundaries are unchanged: live migration application; managed type regeneration; configured authenticated local worker/tunnel; separately approved real-upload-to-Cloud-result acceptance and private refresh/readback. Processing and retention switches were not changed. No live DDL, permissions, rows, uploads, results, design or repository connection were changed. Future application procedure and rollback guidance above still apply; SQL remains the standalone alternative to v3/v4.
