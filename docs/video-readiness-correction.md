# Video-only readiness correction

## Exact stale-message cause
`src/lib/memora/processing-dispatch.server.ts` threw the migration message whenever MEMORA_PROCESSING_ENABLED was not exactly true. It never inspected schema or migration history. Separately, `dispatch-readiness.ts` returned a hardcoded missing-v3/v4 blocker regardless of database state. `processing-review.tsx` did not call getDispatchReadiness at all and displayed Start for Approved/expired jobs based only on role/status.

## Changes
- `processing-capabilities.ts`: recognizes eight attempt columns, four lineage columns, two result/receipt tables and ten existing video RPCs. No document schema/full v3/v4 dependency.
- `processing-capabilities.server.ts`: GET-only trusted schema inspection plus authenticated workspace-scoped zero-row reads; no processing RPC invocation or writes. Safe Boolean results only; no credentials or raw schema sent to browser.
- `api.functions.ts`: existing authenticated/reviewer/job/original/approval checks preserved; exposes separate installed/read/gate/configuration states through getDispatchReadiness.
- `dispatch-readiness.ts`: conditional capability blockers replace hardcoded absent migrations; documents remain unsupported by the video demo; Start stays disabled with execution gate off or unverified permissions/configuration.
- `processing-review.tsx`: reviewer-only readiness display now says Video-only database installed and Workspace read access verified; Start remains disabled. Approval no longer falsely promises immediate execution.
- `processing-dispatch.server.ts`: gate refusal states separate demo approval is needed, not that migrations are missing; additionally refuses non-video formats. Existing worker prewarm, approval, selected-job claim, fencing/leases/failure handling unchanged.
- Added capability/updated readiness tests, architecture note and roadmap.

## Evidence and limitation
111 application tests passed in 18 suites. Signed-in Playwright on /upload with the actual two Approved originals confirmed two installed/read-access statuses and disabled Start buttons; screenshot inspected. No dispatch, worker readiness request, cancellation, upload or database write occurred. Live read-only ACL inspection confirms both tables retain authenticated SELECT, deny authenticated/anonymous INSERT and retain trusted INSERT.

Managed Cloud OpenAPI requires a secret key and exposes trusted methods even if a member bearer is attached. It cannot reliably certify client write privileges. Therefore runtime readiness does not label that metadata as verified client permissions: the independent live ACL inspection verifies the correction; the UI explicitly distinguishes that from installed schema and member reads. A future approved execution-readiness check must retain this distinction; no unsafe mutation probe or new SQL helper was added.

MEMORA_PROCESSING_ENABLED and MEMORA_RETENTION_ENABLED were not enabled. No migrations reapplied, permissions changed, originals/results modified or design redesigned. Connecting/configuring the local worker and controlled execution remain separate approval steps.