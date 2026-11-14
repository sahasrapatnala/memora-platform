# MEMORA dispatch v2 — SQL review and TypeScript integration

## Status

Review draft only. No SQL has been executed, no migration has been registered, and the running dispatcher is unchanged.

Live inspection on 2026-11-14 found no claim/heartbeat functions or dispatch columns. Migration history inspection found `0009_secure_processing_dispatch.sql` unlisted; the journal ends at `0008`. The existing unlisted file is preserved pending approval.

## Exact contract

`claim_approved_processing_job(p_job uuid, p_workspace uuid, p_actor uuid, p_worker_id text, p_lease_seconds integer default 300)` is the sole proposed claim API.

- `p_actor` comes exclusively from the validated session's `context.userId`, never browser input or the file owner.
- `p_worker_id` is server-selected, stable for the attempt and never chosen by the browser.
- A claimed response includes `outcome = Claimed`, a fresh token, the incremented attempt number and lease expiry. Sensitive original metadata remains server-side.
- Zero rows means unavailable, contended, ineligible or already active/terminal; it never means a different job was claimed.
- `outcome = AttemptsExhausted` means the selected job was transitioned to terminal `Failed`; it contains no source descriptor or token. Do not throw inside that SQL branch: throwing would undo the failure transition.
- At most three claims per job, including the first attempt. Expired third attempts become `Failed` on recovery or another selected claim. No fourth claim is issued.
- A new processing request after terminal failure is a separate job and must pass processing approval again. The three-attempt policy is per job, not a lifetime limit per original.
- Leases default to 300 seconds, allow 60–900 seconds, and can be renewed only while unexpired. A healthy worker can run longer through genuine heartbeats; this is not a total-runtime limit.

## Integration with existing TypeScript

The current `dispatchProcessing` in `src/lib/memora/api.functions.ts` already authenticates the caller and passes `context.userId` to `dispatchApprovedVideo`. Preserve that boundary and user-scoped reviewer check. Inside the authorized server helper, dynamically load the generated admin client and use it only for the trusted claim/attempt operations.

After applying the approved migration and regenerating database types, the claim call will be:

```typescript
const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
const claimResult = await supabaseAdmin.rpc("claim_approved_processing_job", {
  p_job: input.jobId,
  p_workspace: input.workspaceId,
  p_actor: input.userId, // validated session; not request data
  p_worker_id: workerId, // server-selected
  p_lease_seconds: 300,
});
if (claimResult.error) throw new Error("Dispatch authorization failed");
const claim = claimResult.data?.[0];
if (!claim) return { jobId: input.jobId, status: "Unavailable", dispatched: false };
if (claim.outcome === "AttemptsExhausted") {
  return { jobId: input.jobId, status: "Failed", dispatched: false };
}
// Only Claimed may authorize a server-to-server original descriptor.
```

Check HTTPS processor configuration and durable ingestion readiness BEFORE claiming. The existing `dispatchCandidate` only accepts Approved jobs, so it cannot remain the gate for expired Processing recovery; selected-claim SQL becomes the authoritative transition gate. The existing user-scoped reads remain useful for access/error handling, not as a substitute for the RPC's locked checks.

Send job/workspace/token/worker identity to the authenticated Python worker. Proxy heartbeats through an authenticated trusted endpoint; do not give Python service-role credentials. Parse measured progress incrementally, not with the current whole-response `response.text()`. Persist progress under the same attempt guard. A valid local summary or `ProcessedLocally` must never mark Completed or display durable success.

Use `fail_processing_attempt` only when a current attempt is confirmed stopped or safely cancelled. For uncertain delivery, stop renewal and wait for lease expiry; do not authorize overlapping execution merely because an HTTP call timed out. A trusted recovery runner calls `expire_processing_attempt` with the selected job/workspace; it clears the old token and returns Approved for attempts below three or Failed at exhaustion. No runner is installed by this review draft.

## Stale-worker and persistence guarantees

`assert_processing_attempt` locks the exact job and checks workspace, Processing state, token, worker, lease, initiating reviewer, file-owner membership and matching approval. It uses `clock_timestamp()` after lock waits; an expired lease cannot be renewed or report failure using the current attempt API. Every future ingestion/finalization RPC must call it inside the SAME transaction as its writes and recheck expiry immediately before finalization.

This dispatch-only SQL intentionally blocks INSERT/UPDATE on extraction-output tables and new Completed transitions until the verified ingestion design is separately reviewed. Existing rows remain unchanged and readable. This is a deliberate temporary restriction on trusted result producers, not a new ingestion implementation; do not apply it to an environment already using another producer without reviewing that integration.

**Private Storage is not fenced by a PostgreSQL job lock.** The draft does not claim otherwise. Keep processor storage credentials absent and do not issue upload capabilities until the next ingestion batch is reviewed. That design must authenticate callbacks, reject expired attempts before accepting bytes, isolate staged objects under job/token prefixes, reject stale registration/finalization, verify byte counts/hashes, and clean orphan staging. An upload started while a lease was valid may finish later; its object must never be adopted as current results after expiry. SQL alone cannot atomically cancel an external Storage operation.

No completion RPC is enabled in this batch because no bounded, verified result manifest or ingestion pathway currently exists. Therefore requirement 7 is fail-closed for database outputs and completion in this proposed rollout, not a verified production end-to-end storage guarantee.

## Idempotency and migration reconciliation

The draft checks column types, historical attempts, unfenced active jobs and duplicate tokens before constraints/indexes. Same-name constraint/index/trigger conflicts abort rather than silently succeed. Existing compatible objects are reused. Unexpected claim or heartbeat overloads abort. Only the explicitly obsolete queue claim and heartbeat signatures are removed, with RESTRICT, never CASCADE.

After approval: preserve prior applied history byte-for-byte; retire the unlisted original `0009` into review/archive documentation so it cannot later be applied accidentally; submit this exact approved SQL through the migration tool, which records the next journal entry and regenerates types. Do not hand-edit the journal. Change the TypeScript dispatcher to the new signature in the same coordinated rollout, and verify live columns, signatures, ACLs and migration history afterward.

Compatibility inspection is fail-closed: a different return type/input argument name on an already-existing v2 function can make CREATE OR REPLACE fail; that requires explicit reconciliation, not another ambiguous overload.

## Verification performed and pending

Offline PostgreSQL syntax parsing passed: 28 statements and 11 PL/pgSQL blocks/functions. This is NOT database execution or behavioral validation.

After approval, test in an isolated database: apply twice; conflicting column/constraint/index rejection; specific-job/workspace selection; ordinary-member denial; reviewer revocation; concurrent same-job claims; active/expired lease boundaries; three-claim exhaustion; heartbeat expiry; stale token after recovery; old overload absence; blocked result writes and completion; unchanged existing approvals, originals and policies. Before enabling processing, also test authenticated bounded ingestion, storage staging cleanup, measured persistence and refresh readback with real files.