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