# MEMORA pre-deployment review package

**Decision: NOT READY TO ENABLE PROCESSING. Review only.**

Prepared 14 November 2026 from saved commit `e98087b` (continuation), following `1346be0` (MVP). Praneetha owns this existing application. No application functionality changed, no migration applied, no worker deployed, no gate enabled, no production data modified. Repository connection and branch unchanged. This is a source-and-evidence package, not a claim of production acceptance.

## Package map and exact source

The archive contains this review, complete unchanged copies under `source/`, raw fresh test output under `evidence/`, and `SHA256SUMS.txt` for every packaged file. Paths below are original repository paths; prepend `source/` inside the archive. Existing continuation report appears verbatim in Appendix A and as `source/docs/continuation-processing-report.md`.

- **Current dispatch, lease renewal and retry SQL:** `docs/sql-review/dispatch-v3.sql` (complete). Functions: `claim_approved_processing_job`, `assert_processing_attempt`, `heartbeat_processing_job`, `fail_processing_attempt`, `expire_processing_attempt`. There are **no separate current lease/retry migration files**; these controls belong to v3. Do not execute extracted functions independently.
- **Current ingestion/progress/cancellation SQL:** `docs/sql-review/processing-ingestion-v4.sql` (complete). Functions: `progress_processing_attempt`, `register_processing_artifact`, `finalize_processing_attempt`, `cancel_processing_attempt`.
- **Historical context only:** `drizzle/migrations/0000…0008*.sql`, journal, and unlisted `0009_secure_processing_dispatch.sql`. The latter is superseded, NOT an additional deployment step. Current history inspection reports it unlisted; preserve and reconcile manually, not replay blindly.
- **Complete dispatcher:** `src/lib/memora/processing-dispatch.server.ts`; authenticated entry `dispatchProcessing` in `src/lib/memora/api.functions.ts:39–56`; eligibility `processing-review.ts`; endpoint rules `processing-endpoints.ts`.
- **Complete ingestion:** `src/lib/memora/processing-callbacks.server.ts`; strict schemas `processing-contract.ts`; HTTP endpoints `src/routes/api/public/processing.ts` and `processing-artifact.ts`; cancellation `processing-cancel.functions.ts`. Client bearer/CSRF wiring in `src/start.ts`.
- **Worker:** complete `processing-service/main.py`, `attempt_heartbeat.py`, `callbacks.py`, `cloud_download.py`, `video_processing.py`, `document_processing.py`, synchronization helpers, requirements, README and test sources.
- **Knowledge and readback:** complete `src/lib/memora/knowledge.functions.ts`, `knowledge-search.ts`, `knowledge-source.ts`; `src/components/memora/workspace-data.tsx`; `workspaces.tsx` (SourceBrief, VideoDetail, DocumentDetail); leaf route sources and review controls included.
- Existing `mvp-implementation-report.md` and rollout notes included as historical context. Counts/claims in older reports do not supersede the current evidence below.

Generated credential clients/types, environment files, repository metadata, dependencies and build output are intentionally excluded. This is a review archive, not a separately recreated runnable application. Generated clients remain in the existing application; names, not credential values, are documented.

## Exact execution order and dependencies — future approved rollout only

1. Resolve the release blockers below; approve a corrected v3/v4 pair against the current database, including function ACLs, result-history uniqueness changes and finalization fencing. Saved drafts are reproduced unchanged, **not certified executable acceptance**.
2. Reconcile the unlisted `0009_secure_processing_dispatch.sql` with recorded history (currently 0000–0008). Never run historical 0009 followed by an arbitrary mix of v2/v3 functions. V3 removes the two obsolete signatures with RESTRICT and rejects unknown overloads.
3. Stage the approved **dispatch v3 first** as the next recorded migration. Requires existing tables, RLS, reviewer decision function and the seven existing definer signatures listed in v3: `audit_file_registration`, `create_user_profile`, `create_workspace`, `decide_processing_job`, `is_workspace_member`, `register_verified_original`, `set_original_deletion`. Adds selected-job claim, lease fields and fail-closed output guards. Keep gate off.
4. Stage approved **ingestion v4 second**, as a distinct transaction after v3. Requires v3 functions/columns, `extensions.digest` (pgcrypto), existing output tables and storage analytics/activity schema. Adds two new RLS tables with grants, output lineage, receipt verification and guard-body replacement. Keep gate off.
5. Regenerate managed database types after the approved pair. Replace future-RPC `as unknown as SupabaseClient` and future-column adapters with generated types; confirm compiled callback/dispatcher behavior. No regeneration was performed now because live schema is unchanged.
6. Review/deploy the existing app server and independent Python worker with approved configuration, model availability, disk and secure connectivity. Check hosted server configuration as well as build-time browser configuration. Health alone is not model readiness.
7. Run separately approved isolated acceptance. Existing gate blocks dispatch unless exactly `true`; it must be enabled **only in the approved isolated acceptance environment** to test the path. Do not enable the production gate to perform an unreviewed experiment. Worker deployment/migration approval is not blanket permission to process originals.
8. Prove real speech MP4, PDF, PPTX, private readback, refresh, navigation, grounded AI, two-account isolation, stale-worker and retry/concurrency cases. Then seek approval for production enablement. V5 retention and v6 offboarding are separate future reviews, not dependencies for these three capabilities.

Each migration submission must be transactional with stop-on-error. Tool-managed transactions need no BEGIN/COMMIT pasted into the SQL. A failed v4 rolls back v4 but **does not roll back previously committed v3**; v3 guards remain closed. Transactional DDL is not a tested rollback exercise. Restoring earlier deployed code with gates disabled is safer than destructive down-migrations; never roll back by deleting original/storage data. V4 is currently **not fully rerunnable** (unguarded CREATE TABLE/POLICY); repeated application must be refused or reconciled, not called idempotent. Existing nullable output lineage preserves historical rows; removal of the two named file uniqueness constraints needs dependency review.

## Temporary guards and exact replacement controls

| Guard | Installed by v3 | Operation blocked | V4 replacement |
|---|---|---|---|
| `memora_ingestion_not_installed` / `block_uninstalled_processing_ingestion()` | BEFORE INSERT OR UPDATE, each row, on videos, video_speakers, transcript_segments, speaker_turns, video_frames, slide_intervals, documents, document_pages, document_slides, knowledge_chunks | Every new/updated processor output, even trusted manual imports/corrections or legacy output writers; reads and DELETE are not covered | Same trigger name retained; function body requires nonnull NEW.processing_job_id equal to transaction-local `memora.verified_ingestion` |
| `memora_completion_not_installed` / `block_unverified_processing_completion()` | BEFORE INSERT OR UPDATE on processing_jobs | New Completed transitions; existing Completed updates, requests, review and claims unaffected | Same trigger name retained; new Completed requires transaction-local setting equal to NEW.id |

V4 sets the transaction-local setting inside `finalize_processing_attempt` **after** locked attempt authorization. It persists outputs, knowledge chunks, receipts/result record, measured analytics and activity, then marks Completed in the same transaction. Original upload/verified registration, processing request, approval/rejection and normal reads are not these guards' targets. No guard is removed; bodies are replaced transactionally. DELETE in finalization is restricted by processing_job_id to generated results, not original files or historical other-job rows.

Controls intended to make this secure: shared-bearer authentication before callback work; strict bounded schemas; selected job/workspace; trusted-only RPC ACLs; server-derived reviewer identity; current reviewer/file-owner membership; Uploaded original and matching approval; locked current token/worker/unexpired lease; content SHA-256 checks; frame receipt joins; client read-only output RLS; private attempt-prefixed storage.

**Important limitations:** a custom transaction-local setting is not intrinsically unforgeable to trusted database clients able to execute SQL/set_config. The guard depends on the trusted-only RPC boundary and absence of a public settings/write RPC. It does not fence storage itself. Guard existence checks in v4 do not validate existing trigger function/type/enabled state like v3 does. SQL-level late-finalization expiry and artifact-prefix checks require strengthening/review (below); do not label the replacement proven secure solely from these drafts.

## Exact configuration NAMES (never values)

| Runtime | Required names | Purpose / actual read |
|---|---|---|
| App browser/build | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Generated Cloud browser client; build-time injection. Neither is a worker secret. |
| App server | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Generated authenticated Cloud middleware; must also exist hosted, not just locally. |
| App server privileged client | `SUPABASE_SERVICE_ROLE_KEY` | Platform-managed, server-only; users cannot retrieve it on Lovable Cloud. Never copy to worker/browser. |
| App dispatcher | `PROCESSING_API_URL`, `PROCESSING_API_KEY`, `PROCESSING_CALLBACK_URL` | Worker base origin (dispatcher uses `/process`); private shared bearer; full application `/api/public/processing` URL. |
| App dispatcher gate | `MEMORA_PROCESSING_ENABLED` | Exactly `true` permits dispatch; absent here. Keep production off. |
| AI server SDK | `LOVABLE_API_KEY` | Existing Gateway SDK authentication; platform/secret provisioning, not source. |
| Worker | `PROCESSING_API_KEY`, `PROCESSING_CLOUD_ORIGIN`, `PROCESSING_CALLBACK_ORIGIN`, `PROCESSING_SCRATCH_DIR` | Same shared bearer; exact HTTPS private source origin; exact callback application origin; dedicated writable disk. |

Optional: `LOVABLE_AI_GATEWAY_URL` (SDK override, existing default used), `HF_TOKEN` (README future authorized model access, **not read by current worker**). `MEMORA_RETENTION_ENABLED` is a separate retention gate, not necessary for processing and must remain off. No additional configurable transcription model name exists: current code hardcodes `small`, CPU/int8, four CPU threads, one worker. `PROCESSING_CALLBACK_ORIGIN` is read by the **Python worker**, not the TypeScript dispatcher; application authorization uses the bearer and fenced payload, not that origin variable. `PROCESSING_CLOUD_ORIGIN` belongs to Python's signed-source allowlist. No secret values, private URLs, Cloud project identifiers or credentials are packaged.

## Python deployment requirements and remaining wiring

Run on an independent Python host, not in the application server runtime. Provide FFmpeg on PATH, supported Python/native dependency wheels, writable scratch/model-cache storage, HTTPS worker `/process`, network access to private expiring Cloud source, application callbacks and Whisper model download/cache. Current requirements use minimum-version ranges, plus pinned `av==18.1.0`; `pyannote.audio` is listed but diarization is not implemented. The tested temporary dependency inventory is included, not a validated production lockfile; full requirements install/model inference on the target host remains unverified.

`main.py` reserves its `threading.Lock` before 202; busy `/process` rejects 503. Reservation is **per Python process**, so initially use one uvicorn worker process and one replica. Scaling requires shared admission/disk review; the lock is not a cross-process queue. Use a durable always-running host whose request/background-task lifecycle permits long extraction, not a service that terminates background tasks after 202. Crashes rely on lease recovery, not a durable worker queue.

Download: 1 MiB chunks, original byte count and SHA-256 verified, strict source origin/no redirects. Scratch admission requires twice original size + 1 GiB: **11 GiB free** for a 5 GiB source; reserve OS, model, logs and other-process overhead separately. `/health` says models_loaded=false unconditionally and exposes scratch availability; it does not prove Whisper can load. Source signed URL lifetime from dispatcher is 900 seconds; actual 1.14 GB and worst-case download latency must be tested. No download resume implemented in worker (browser TUS resume is distinct).

Heartbeat sends attempt-bound progress every 30 seconds while extraction is silent, renewing a 300-second lease, with nondecreasing progress and fail-closed subsequent heartbeat updates. Native computation may continue until it returns; failed renewal does not immediately kill all native work. Artifact callback receipts verify local hash/size before manifest delivery. Manifest UTF-8 <=8 MiB, JPEG <=2 MiB, <=60 selected frames. No service-role credential sent to worker. OpenCV produces real JPEGs, not generated stand-ins. PDF blank pages remain OCR-required; PPTX extracts text/title/table/notes, not rendered slide images. DOCX is one logical extraction page.

## Test evidence: classification, not inflated claims

Fresh on this review: `bunx vitest run` **94 passed, 14 suites**; worker command `/tmp/memora-continuation-tests/bin/python -m unittest -v test_attempt test_callbacks test_cloud_download test_documents test_heartbeat test_keyframes test_rules test_service` **24 passed, no skips in output**. Raw output and exact test index included. Test labels and file names are evidence locators, not claims that mocked IO was live.

| Requirement | Evidence | What it does NOT prove |
|---|---|---|
| Stale tokens | Zod manifest rejects frame path outside payload attempt (`src/test/processing-contract.test.ts`); v3 `assert_processing_attempt` compares stored token/worker | No database stale-token callback, receipt or finalize denial actually executed |
| Lease expiry | Pure UI eligibility uses fixed expired/future timestamps (`src/test/processing-review.test.ts:12`); heartbeat rejection uses stub throwing `expired` (`test_heartbeat.py:20`) | No real Cloud expiry or expiry-during-ingestion test |
| Retry cap / terminal Failed | V3 SQL has maximum three claims, failure/expiry recovery and fresh tokens | No executable SQL lifecycle test proves 3rd/4th claim, terminalization or atomic rollback |
| Concurrent processing | `test_service.py:59` holds real in-process lock, patches auth/admission/execution and verifies 503/no background execution | No simultaneous network clients, multi-process admission or competing database claims |
| Concurrent requests | `processing-request.test.ts` mocks unique-index conflict and winner readback; historical actual concurrent review request reported in roadmap | A prior Awaiting Review request is not a dispatched concurrent processing claim; historical live receipt not freshly reproduced |
| Worker integration | `test_attempt.py:12` patches download, extraction, uploads, progress, manifest callbacks; FastAPI 202 test patches actual background execution | No real worker HTTP → Cloud artifact → result persistence |
| Bounded original retrieval | `test_cloud_download.py` patches requests and verifies streaming/hash/disk rules | No new multi-GB Cloud download in this review |
| Grounded search/summary | Pure excerpt/query/citation rules in `knowledge-search.test.ts`; existing AI server implementation included | No persisted workspace RLS retrieval, citation navigation or authenticated AI workflow |

**Real local extraction (not mocked extraction, still synthetic fixtures):**
- `test_keyframes.py:13`: FFmpeg-generated 2-second 320x180 H.264 MP4; real OpenCV/Pillow/perceptual-hash extraction; duration/timestamps, <=60 frames, JPEG magic bytes for frames and thumbnails asserted. **No speech, no Faster-Whisper invocation, no Cloud IO.**
- `test_documents.py:23`: genuine PyMuPDF extraction from locally generated two-page PDF; text, numbering, repeatable hashes, blank-page/OCR marker asserted.
- `test_documents.py:42` and `:12`: genuine python-pptx extraction from locally generated slides with text, notes and empty slide; numbering/title/notes/content hashes and null empty notes asserted. These do not exercise uploaded user documents or persistence.

**Historical actual-service evidence, not rerun or independently expanded here:** Appendix A records real AI Gateway streaming over explicitly labelled test evidence, with nonempty answer and [1] citation; this is not authenticated MEMORA or real workspace evidence. Roadmap reports actual ~210 MiB private retrieval and real review-request persistence; the 1.14 GB worker retrieval remains untested. Historical SQL parsing (36 v3 / 53 v4 statements) and disposable expression checks are not full migration execution; parser was unavailable in system Python this review and was not installed. No external media/API scripts were run; `test_video.py` and `test_api_local.py` require external fixtures and cannot be counted as passing speech/service acceptance.

**Actual live checks now:** read-only Cloud counts/policies/schema and migration-history inspection. Two Approved jobs; zero videos, transcripts, frames, documents, pages, slides or knowledge chunks; no selected v3 claim, finalizer, processing_results or processing_artifacts installed. Both relevant buckets private (originals 5 GiB, generated-assets 50 MiB per-object limit). No real live processing acceptance evidence exists for any of the three capabilities. Preview's latest compilation log: build OK; no app code edits this review.

## Requested persistence / workspace-isolation confirmations

| Item | Status | Evidence |
|---|---|---|
| Transcript after refresh | **Not Verified** | No persisted rows; draft ingestion writes transcript_segments; workspace provider rereads Cloud |
| Frames/private artifacts after refresh | **Not Verified** | No persisted frames or receipts; private signed-read implementation exists |
| PDF pages after refresh | **Not Verified** | No live pages; local extraction only |
| PPTX slides after refresh | **Not Verified** | No live slides; local extraction only |
| Summaries after refresh | **Not implemented durably** | `SourceBrief` uses React useState; askMemora returns generated answer with no INSERT; v4 never stores AI summaries. Refresh loses the brief and requires regeneration |
| Timestamp/page/slide navigation on populated persisted output | **Not Verified** | Video seek/onLoadedMetadata, page/slide anchor handling and citations exist, not exercised against real results; same-mounted video timestamp changes remain a limitation |
| Workspace isolation controls | **Implemented, read-only configuration checked** | All nine checked core tables have RLS; authenticated output SELECT policies call membership function using auth.uid(); server functions explicitly require membership; generated assets first path component workspace-scoped |
| Actual cross-account/cross-workspace denial | **Not Verified** | No second-account acceptance performed; privileged callback writes rely on trusted RPC authorization rather than user RLS |

Private originals additionally allow owner-path reads; a revoked workspace member who owns their original may still read that original by owner policy. This is existing policy, not a new workspace leak claim; determine intended owner access separately. Browser preferences are not role authority. Privileged SQL functions are intentionally service-only, so isolation must be tested at callback/RPC boundary as well as client RLS.

## Remaining blockers, in priority order

1. **Lease can expire during long SQL finalization.** V3 asserts wall-clock lease at entry/after authorization; v4 finalizer may insert thousands of rows then mark Completed without a fresh lease check immediately before completion. Holding row lock prevents renewal during that transaction. Registration/progress RPCs likewise rely on the assertion before subsequent statements. Current comments promising expired workers cannot finish are stronger than executed evidence. Require explicit late-lease rejection/rollback and acceptance tests before approval. This review does not modify the draft.
2. **Database artifact receipt boundary needs defense-in-depth.** TypeScript manifest checks attempt-prefixed paths; v4 frame joins check job/kind/path/hash/size but do not independently require current-token prefix or workspace/file equality. Receipts lack a dispatch_token column; prior-attempt receipts share job_id. Current trusted callback catches path mismatch, but full SQL guard guarantee is not self-contained. Review independently fenced finalization plus direct trusted-RPC negative tests.
3. **Migration lifecycle/replay compatibility unproven.** Unlisted old 0009; v4 unguarded table/policy creation and index name-only guards; base-schema check is partial. Finalizer replaces named uniqueness constraints and history readback currently picks `.at(-1)` on unordered video/document queries, not deterministically latest. Approve current-schema compatibility/transaction rollback, required grant/extension/function ownership and resulting result selection before execution. No full live-schema migration run performed.
4. **Target worker/config/model deployment unverified.** No reviewed deployed endpoint, real shared-auth callback delivery, model inference, target requirements install, long-running admission, origin configuration or capacity proof. Existing source descriptor signature and worker extension inference must match real MP4/PDF/PPTX.
5. **No end-to-end persisted acceptance.** Real speech transcription never exercised by current passing suite. Upload/review/dispatch/extraction/artifacts/transaction/refresh/search/citations/timestamp navigation and second-account denials remain unverified. SQL token freshness/expired callbacks/third-attempt failure, concurrent claims, cancellation and rollback cases require isolated database/service tests.
6. **Durable summaries missing and retrieval bounded.** Summaries and answers are transient. Search is keyword/substrings, not embeddings; answer query scans at most 500 chunks before distributed excerpt choice, search at most 100 results; workspace readback may encounter server pagination/default limits (transcripts not explicitly paginated). Do not claim whole-source summaries or exhaustive long-recording search.
7. **Artifact/time/transport recovery limitations.** Storage writes cannot be atomic with SQL; expired upload can orphan generated staging objects; cleanup not implemented. Callback body bounds trust Content-Length before buffering (actual length checked afterward), so oversized false declarations need bounded streaming/hosting-limit review. No automated expire RPC caller/scheduler; manual selected retry exists. No callback/manifest automatic retry; uncertain delivery fences/fails safely and relies on reviewed retry flow. 900-second source URLs and large-file retrieval, native-work cancellation, silent-video/audio-track failure need actual acceptance.
8. **Citations are requested, not independently validated against answer text.** The model is instructed to cite only supplied evidence and returns source citations, but no parser verifies every emitted [n] references a supplied item or every assertion is supported. Historical smoke call is not a corpus-wide answer-quality guarantee.

## Next required action

Review this archive's **unchanged actual v3/v4 SQL and code** and authorize targeted corrections/isolated acceptance setup, not production execution. Resolve fencing/schema blockers first; then approve migration pair, generated types and worker deployment together. Production processing remains disabled until real MP4/PDF/PPTX persistence, refresh and isolation acceptance pass. No paid-service upgrade requested or performed.

## Appendix A — full saved continuation report (verbatim)

```markdown
# MEMORA focused continuation — 14 November 2026

Continued the saved implementation; no redesign, Cloud changes, migrations applied, deploys, original modifications or processing requests. Repository connection and branch were not changed. Praneetha's ownership/preservation requirement was saved.

## Capability status and evidence

| Capability | Actual saved implementation | Tested this pass | Still unverified / blocked |
|---|---|---|---|
| Video | Direct TUS uploads and verified registration already existed; reviewer-selected fenced dispatch, Faster-Whisper segments, OpenCV frames/thumbnails, private callbacks, draft atomic persistence and timestamp links exist | Real OpenCV JPEG/thumbnail extraction from a clearly synthetic local 2-second MP4; worker admission, lease and receipt rule tests | Real speech transcription, deployment, migrated persistence, private artifact readback, populated timestamp navigation and refresh; actual 1.14 GB worker retrieval |
| Documents | PyMuPDF pages, python-pptx slides/notes, source hashes, draft page/slide + knowledge persistence and navigation exist | Real locally generated PDF and PPTX extraction, stable hashes, empty-page preservation; empty-notes mismatch corrected | Upload → approved dispatch → database persistence → search/navigation/refresh; OCR unavailable |
| Knowledge | Membership-scoped unified keyword retrieval, citations, source briefs and evidence-grounded answers exist | 94 app regressions; real existing Gateway SDK streaming call using labeled test evidence returned a nonempty cited answer consistent with evidence | Real persisted workspace retrieval, populated citation navigation, answer quality across actual sources, durable summaries and embeddings |

Most application rules and worker lifecycle tests use mocks; they do not prove real Cloud ingestion. The local keyframe/PDF/PPTX tests run genuine extraction but use synthetic fixtures, not Ericsson originals. The AI smoke test exercised the same model, streaming endpoint, reasoning settings and 900-token cap, but was not an authenticated application workflow or real workspace evidence. No fixture was added to workspace data.

## Connections repaired

1. Worker reserves its single processing slot before returning 202; a busy worker returns 503 without accepting background work.
2. Continuous 30-second, attempt-bound heartbeat renews leases during model loading or extraction with no emitted events. Progress never regresses. Failed renewal blocks subsequent delivery; synchronous native computation may finish before control returns, but rejected workers cannot finalize.
3. Application now allows selected-job retry only for a Processing job with a known expired lease and matching approval. SQL claim still authoritatively checks current role, locking, fencing and three-attempt policy. No scheduler or automatic retry added.
4. Claimed-job signing/network/HTTP failures now attempt fenced failure recording. Ambiguous delivery is not replayed; if failure recording also fails, expired-lease recovery remains available.
5. Draft v4 corrected invalid schema-qualified COALESCE/GREATEST and transcript recordset ordinality. Empty PPTX notes normalize to null so Python and database hashes agree; individual title/content/notes limits align with callback schema.
6. Worker encodes manifest as UTF-8 and rejects >8 MiB before delivery instead of submitting partial output.
7. Source briefs request explicit summary mode and distributed source excerpts, avoiding the previous requirement that sources literally contain instruction words such as “summarize”. Ordinary answers still require matching evidence.
8. Existing AI client/model retained; Responses now stream with low reasoning, encrypted reasoning inclusion and the existing 900-token cap. Existing SDK forbids store configuration; stateless Gateway forces false. Safe gateway errors/refusals/incomplete output are surfaced, without substitute answers.

## Exact files changed

- `AGENTS.md`, `roadmap.md`, `docs/continuation-processing-report.md`
- `docs/sql-review/processing-ingestion-v4.sql` — **review-only, not applied**
- `processing-service/attempt_heartbeat.py`, `main.py`, `callbacks.py`, `document_processing.py`
- `processing-service/test_heartbeat.py`, `test_keyframes.py`, `test_callbacks.py`, `test_documents.py`, `test_service.py`
- `src/lib/memora/processing-dispatch.server.ts`, `processing-review.ts`, `knowledge-search.ts`, `knowledge.functions.ts`
- `src/components/memora/processing-review.tsx`, `workspace-data.tsx`, `workspaces.tsx`
- `src/test/processing-review.test.ts`, `knowledge-search.test.ts`

## Tests / checks

- Original baseline reproduced: **91 application tests**.
- Final application suite: **94 passed across 14 suites** (`bunx vitest run`).
- Python targeted suite: **24 passed**, using an isolated temporary environment. Command: `python -m unittest test_attempt test_callbacks test_cloud_download test_documents test_heartbeat test_keyframes test_rules test_service` from `processing-service`.
- Broad Python discovery also attempted: the two opt-in video/API scripts fail without their external MP4 fixtures; they are not included in the 24 passing tests. No real-video model or running-worker API acceptance is claimed.
- PostgreSQL parser: dispatch v3 **36 statements**, corrected ingestion v4 **53 statements**. Corrected progress and typed transcript ordinality expressions executed successfully in a disposable local PostgreSQL instance. Full migrations/function execution against the live schema remain unverified; no Cloud SQL executed.
- Real AI streaming smoke test: nonempty answer, evidence citation [1], consistent retained-original decision. No provider substitution or model change.
- App compilation checked through preview logs; no manual production build/typecheck. No live authenticated end-to-end processing test because execution is intentionally disabled.

## Next required action / blockers

1. Review and approve **dispatch v3 + corrected ingestion v4 together**, including unique-per-file constraint removal, result-history integrity, temporary-guard replacement, current live schema compatibility, permissions and stale-worker rejection. Parsing and local expression tests are not migration acceptance.
2. Stage the approved pair in an isolated acceptance environment; regenerate managed database types after approved application. Future RPC/lease adapters remain isolated until then.
3. Review/deploy independent worker with HTTPS endpoints, private shared authentication, fixed callback/Cloud origins, model availability and scratch capacity. No paid upgrade or deployment was made.
4. With separately approved test execution, test actual speech MP4, PDF and PPTX through upload/review/dispatch/results/private readback/refresh/search/citations, plus cross-workspace and expired-worker denial. Keep normal processing gate disabled until acceptance passes.
5. Test actual 1.14 GB retrieval separately; do not extrapolate from the tiny fixture. Silent-video handling, scanned-PDF OCR, semantic retrieval, durable AI summaries, generated orphan cleanup, long-source pagination and same-mounted-video timestamp changes remain limitations requiring targeted follow-up.

`MEMORA_PROCESSING_ENABLED` is absent in this environment and still fails closed unless exactly `true`; it was not changed. Retention remains untouched. Existing Uploaded/Approved records were not written or processed.
```
