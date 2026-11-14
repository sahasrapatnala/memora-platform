# MEMORA dispatch v3 — final SQL and coordinated rollout approval

## Approval scope and present status

Nothing applied or deployed. Only review SQL/documents and the task list changed. The running TypeScript dispatcher, Python worker, generated database types, migration journal, RLS and storage remain unchanged. This plan describes future work, not completed integration.

The final SQL is `dispatch-v3.sql`. All five proposed SECURITY DEFINER functions use `SET search_path = ''`; public relations/composite types and calls are qualified. Built-ins and catalog lookups are explicitly `pg_catalog`-qualified. COALESCE and CASE are SQL constructs. PostgreSQL implicitly searches its system catalog for built-in types/operators even with an empty path; all application relations remain explicitly qualified, preventing temporary/public relation shadowing.

All seven existing application SECURITY DEFINER functions also receive empty search paths via ALTER FUNCTION, preserving their bodies, signatures, ACLs and owners. Live body inspection confirmed public tables and auth.uid() are already qualified. Their existing unqualified built-ins resolve through implicit pg_catalog. The auth/storage schemas and their managed functions/triggers are not altered; only existing public functions are hardened.

## Actual live-schema verification — 2026-11-14

Performed read-only catalog queries against the connected database, not only offline parsing:

- PostgreSQL 17.11; `pg_catalog.gen_random_uuid()` exists.
- Checked all 24 required base columns for claim/authorization: zero missing or incompatible columns.
- Confirmed all eleven guard-target tables exist with RLS enabled and inspected their columns, parent foreign keys and current policies.
- No dispatch columns or claim/heartbeat/attempt functions exist. The dispatch CHECK/index and temporary guards are absent.
- Two jobs are Approved. Both match Uploaded originals, approved processing audits, valid registered size/hash and file-owner workspace membership. One current owner/reviewer membership exists. No current Processing jobs require recovery/backfill.
- Existing triggers are file-registration audit and storage verification. No current extraction writer was found in application server functions or Python; output readers exist, but Python only returns local counts/elements.
- Original and generated buckets remain private at 5 GiB and 50 MiB per object, respectively; no storage writes or signed URLs were requested.
- Migration inspection again found the original `0009` unlisted; applied/journal history ends at `0008`.

**Meaning:** the draft matches the inspected live schema and current eligible jobs. This is read-only compatibility verification, NOT execution, function compilation on that database, double-application testing or concurrency verification. Those require an approved isolated migration test. Conditions may change; the SQL repeats compatibility checks and fails closed.

## Temporary guard inventory and impact

All extraction guards are BEFORE INSERT OR UPDATE, per row, including trusted/admin writes. They do not block SELECT or DELETE, do not rewrite existing rows, and are NOT a complete erasure authorization policy.

| Guard target | Temporarily blocked writes / future operations |
|---|---|
| videos | Create/update recording duration and result parent |
| video_speakers | Persist/correct anonymous speaker labels |
| transcript_segments | Persist/correct timestamped transcript text |
| speaker_turns | Persist/update diarization intervals |
| video_frames | Register/update actual captured-frame objects and hashes |
| slide_intervals | Persist/update frame-to-slide intervals |
| documents | Create/update extracted document parent |
| document_pages | Persist/update PDF page text, hashes and preview references |
| document_slides | Persist/update PPTX slide text, hashes and previews |
| knowledge_chunks | Index/update extracted source-linked content |
| processing_jobs completion guard | Reject new Completed inserts/transitions; allow existing Completed records to stay Completed |

**Current operations not blocked:** TUS original uploads; registerOriginal and upload audit; requestProcessing with Awaiting Review; decideProcessing to Approved/Rejected; selected claims, heartbeat/failure/expiry; current profile/workspace operations; original playback, filename filtering, inventory exports, transcript/search readers and all existing SELECT paths. The current non-persisting Python call encounters no result-table write—but must be disabled during rollout because it bypasses the new claim path and gives misleading success messages. Owner deletion is unchanged by this SQL; active-processing deletion coordination must be added before enabling workers.

**What is not guaranteed:** arbitrary external producers unknown to this repository could be blocked. A service-role client can still write unguarded tables such as storage_analytics or private Storage; these guards do not turn a privileged credential into a restricted capability. Do not share it with Python. No current processor output records exist, but before rollout confirm no independently deployed producer is active.

## Coordinated rollout — execution disabled until the final gate

### 0. Prepare and review the complete release

Obtain approval for this SQL and the subsequent exact verified-ingestion SQL before enabling execution. Implement/test both batches in an isolated database with the same schema first. Prepare an application-owned dispatch feature gate, disabled by default, that rejects dispatch before claiming or signing a source. Stage that gate before database deployment; the current dispatcher has no such gate and cannot be assumed safe during rollout. Uploads/reviews/readers remain available.

### 1. Dispatch SQL deployment

Preserve applied migration history unchanged. Archive the unlisted original `0009` outside the migration directory after explicit approval; submit the approved v3 SQL through the migration tool as the single recorded next migration. Do not hand-edit the journal or run the obsolete queue-claim file. Read back function signatures, search paths, EXECUTE ACLs, constraints/indexes/guards and history. Use a short database lock timeout/maintenance window appropriate to workload; ordinary nonconcurrent DDL can briefly block reads/writes while locks are held.

### 2. Type regeneration and TypeScript integration

The migration tool regenerates database types; call get_types only if that step fails. Compile against actual regenerated types, never casts/fabricated columns. Update `api.functions.ts` and `processing-dispatch.server.ts`: validate session and reviewer using the authenticated client, derive actor from context.userId, dynamically import admin only after authorization, and call the exact selected-job RPC. Handle zero rows, Claimed and AttemptsExhausted distinctly. Keep credentials, file paths and signed URLs server-side. Integrate bounded progress callbacks, failure/recovery runner and durable job readback. Remove the whole-response buffering and ProcessedLocally-as-success assumption. Extend supported formats intentionally. Keep dispatch disabled.

### 3. Python worker integration

Configure PROCESSING_API_URL and shared PROCESSING_API_KEY securely; configure callback origin, PROCESSING_CLOUD_ORIGIN, FFmpeg/models and dedicated scratch capacity. No service-role key on Python. Implement durable attempt identity/idempotency, heartbeat callbacks during genuine work, bounded outputs, cancellable stages, errors, retained extraction artifacts pending upload acknowledgement and cleanup. Improve long-video frame coverage. PDFs/PPTX produce page/slide hashes and explicit empty/image-only states. A stale or expired attempt stops sending results and cannot renew its lease. Keep new worker execution disabled pending ingestion.

### 4. Verified transcript/frame/document ingestion

Submit a separate fully reviewed additive migration for attempt-bound staging, idempotency, validated parent relationships and atomic finalization. Define exact bounded manifest limits and chunk/batch limits first. Every trusted ingestion transaction locks/revalidates job/workspace/token/worker/lease and current reviewer/approval; verify lease again at finalization. Parent IDs are resolved server-side from the original, never accepted unchecked from Python. Persist actual language/duration, segments, speakers, frames, pages/slides, knowledge source references and measured package bytes. Finalize Completed only when required object hashes/bytes and all expected output records match a verified manifest; retries reuse deterministic attempt identifiers.

Private uploads go through authenticated, narrowly authorized server endpoints to attempt-scoped staging paths. Validate before accepting bytes and after verification; an upload finishing after expiry is orphan staging, never adopted as current results. Reconcile/clean only authorized attempt staging. PostgreSQL cannot atomically cancel an external Storage write; do not promise otherwise. Fresh tokens fence database publication and prevent stale staged objects from becoming a completed package.

### 5. Replace guards atomically — never simply disable them

The ingestion migration must create validated RPCs AND replace all ten guard triggers plus the completion guard in ONE transaction. Keep trigger names and use CREATE OR REPLACE TRIGGER or replace their functions atomically with the appropriate validating behavior. Do not leave a window of unrestricted writes.

Replacement guards must enforce server-controlled attempt provenance, parent-workspace equality and current fencing/lease validation for every supported result table. A caller-set session variable or knowledge of a dispatch token is not authorization by itself. Ordinary clients must continue to have no output-write policies; RPC EXECUTE remains restricted to trusted server execution. Unsupported outputs (for example speaker_turns/slide_intervals before their manifest support is implemented) retain their fail-closed guard. Preserve storage_verification and file-registration audit unchanged.

The release check enumerates all eleven named guards and proves each either has its verified replacement or deliberately remains blocking for an unsupported output. Test both successful persistence and rejection of raw/expired/cross-workspace writes. If the ingestion migration fails, its transaction rolls back and the blocking guards remain. Leave dispatch disabled until corrected; MEMORA stays usable for uploads/review/reads, not processing completion. This is an explicit rollout gate, not a promise that unwritten ingestion SQL already works.

### 6. End-to-end and security acceptance, then enable

In isolation: apply v3 twice; introduce schema conflicts and verify total rollback; test simultaneous selected claims, reviewer revocation, workspace mismatch, heartbeat expiry, old tokens, three-attempt exhaustion, recovery, raw write rejection and verified ingestion. Test original deletion coordination and orphan cleanup.

With real authorized fixtures: short MP4/MOV, PDF and PPTX → review → claim → extraction → private frame/preview upload → verified transcript/page/slide/chunk persistence → Completed → refresh/read/search/source timestamps. Inject download, parser, disk, timeout, callback and finalization failures. Test a second account and cross-workspace denial. Recheck measured bytes and original SHA-256 without altering originals. Test actual large recordings separately. Only after these pass enable dispatch, then monitor failures and recovery. A passing unit/mock test is not the demonstration.

## Compatibility and rollback guarantees

Current Uploaded originals are untouched; current Approved jobs start with attempt count zero and remain eligible without reapproval while matching audits/current permissions remain valid. Existing records remain readable under unchanged RLS. No statement writes to files, approval_requests or storage.objects/buckets; hardening changes function settings, not original bytes or approval data. Function bodies perform job transitions only when explicitly called later; the migration never calls them.

All included statements are transaction-compatible PostgreSQL DDL: ordinary ALTER, nonconcurrent CREATE INDEX, CREATE OR REPLACE FUNCTION/TRIGGER, DO, REVOKE/GRANT, COMMENT and RESTRICT function removal. There is no CONCURRENTLY, VACUUM, external call or explicit commit. The migration tool must wrap the entire submission in one transaction. Invalid data/type checks, conflicting objects, missing tables, incompatible function return contracts or RESTRICT dependencies cause an exception and roll back the whole SQL submission, including earlier added columns/ALTER FUNCTION settings. Trigger bodies/functions also require isolated runtime tests: parsing alone cannot prove them. Type generation and app/worker deployment occur outside the database transaction and therefore require separate release gates.

## Remaining approval blockers

This package is ready for SQL/rollout review, not production processing activation. Exact ingestion SQL, replacement guards, staged dispatcher/worker, secure deployment configuration and isolated runtime/E2E tests remain to be completed and approved. Do not deploy dispatch SQL alone and turn on processing.