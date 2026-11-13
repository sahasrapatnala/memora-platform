# Processing approval and dispatch foundation

## Implemented workflow

Upload & Process now displays Processing review for existing jobs. Current workspace owners and reviewers can enter a required reason and approve or reject an Awaiting Review job. Role visibility is only a UI convenience: the database operation independently verifies the authenticated user and current membership.

Transitions are explicitly authorized additions: `Awaiting Review → Approved` or `Awaiting Review → Rejected`. Approved remains active under the existing duplicate-prevention index. Rejected permits a new request. Progress remains NULL; approval does not mean execution.

`decideProcessing` uses the existing authenticated server-function mechanism and user-scoped client to call `decide_processing_job`. The narrowly privileged database function checks auth.uid(), locks reviewer membership and the job, revalidates original ownership, Uploaded status and requester's membership, and writes job state and decision atomically. No service-role client is used in application code. No broad UPDATE policy or new table privilege was added.

Each job has at most one decision. Same-decision retries return the original audit ID without rewriting the reason. Opposite decisions are rejected. Unknown or non-review statuses cannot receive a first decision. No Python execution path was added, so retries cannot execute a job.

## Decision traceability and retention isolation

The approved minimal schema addition links `approval_requests.processing_job_id` to `processing_jobs.id`, with a unique partial index. Existing user_id records the reviewer; existing reason, status and created_at record the decision. The storage verification trigger and both savings views exclude job-linked processing approvals from retention authorization. Existing retention records retain their null job link and unchanged meaning. Original file records, bytes, buckets, storage policies and authentication are unchanged.

## Dispatch boundary

`ProcessingDispatchCandidate` and `dispatchCandidate` define a non-executing job/file/workspace/decision contract requiring matching Approved state and audit. They expose no credentials or signed download URL and are not an execution claim or endpoint.

Connecting FastAPI still requires deployment with private credentials, configured Cloud origin and scratch capacity; a durable atomic dispatch claim/idempotency key; revalidation of the current job, original and processing audit; a short-lived source descriptor issued server-side; protected result/event ingestion; timeout and retry handling. Do not wire the existing source-download helper directly to automatic execution. Video models and output ingestion remain unconfigured. Python files were not modified.

## Exact changed files

- `drizzle/migrations/0008_processing_review_decisions.sql`: exact applied SQL, job link/index, retention guard and authenticated-only decision RPC.
- `drizzle/migrations/meta/0008_snapshot.json`, `drizzle/migrations/meta/_journal.json`: generated migration metadata.
- `src/integrations/supabase/types.ts`: tool-regenerated types.
- `src/lib/memora/api.functions.ts`: authenticated decision operation.
- `src/lib/memora/processing-review.ts`: validation, decision call and non-executing dispatch contract.
- `src/components/memora/processing-review.tsx`: review controls and decision history.
- `src/components/memora/workspaces.tsx`: review integration and retention isolation.
- `src/components/memora/dashboard.tsx`, `src/lib/memora/integrity.ts`: retention isolation.
- `src/test/processing-review.test.ts`, `src/test/memora-rules.test.ts`: decision and retention tests.
- `AGENTS.md`, `roadmap.md`, `processing-approval-report.md`: architecture and verification documentation.

## Verification and limits

30 tests passed across processing review, processing request and accuracy tests. Latest preview build: OK.

Live database inspection confirmed the decision function and authenticated EXECUTE permission; anonymous EXECUTE is denied. Tests cover role eligibility, unauthenticated rejection, safe authorization errors, valid approval payload, rejection reason, repeated-decision results, invalid decisions/statuses and matching approval requirement. They use mocked database responses, not a live decision transaction.

The current authenticated preview account has no workspace or Uploaded original. Browser verification remained signed in after refresh but could not create or review a real job. Live approval/rejection, concurrent decision transactions and decision persistence remain Not Verified; no account or original was substituted.

To verify: sign in as an actual owner/reviewer of a workspace containing an Awaiting Review job; enter a reason and approve. Refresh: state must remain Approved with one linked audit. Repeating approval must return the same audit; rejection afterward must fail. Repeat on another real job for rejection. A member/nonmember, mismatched workspace or non-review job must be denied. Confirm progress stays NULL and no Python request is sent.