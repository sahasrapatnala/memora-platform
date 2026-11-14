type Schema = { paths?: Record<string, Record<string, unknown>>; definitions?: Record<string, { properties?: Record<string, unknown> }> };
const tables = ["processing_artifacts", "processing_results"];
const functions = ["claim_approved_processing_job", "assert_processing_attempt", "heartbeat_processing_job", "progress_processing_attempt", "register_processing_artifact", "finalize_processing_attempt", "fail_processing_attempt", "expire_processing_attempt", "cancel_processing_attempt", "validate_video_demo_manifest"];

/** Read-only API capability evidence, not a substitute for SQL fencing or RLS. */
export function videoDemoCapabilities(trusted: Schema, member: Schema) {
  const columns = trusted.definitions?.["processing_jobs"]?.properties ?? {};
  const required = ["dispatch_token", "dispatch_started_at", "dispatch_attempts", "dispatch_error", "dispatch_worker_id", "heartbeat_at", "lease_expires_at", "dispatch_actor_id"];
  const schemaInstalled = required.every((column) => column in columns)
    && tables.every((table) => !!trusted.paths?.[`/${table}`]?.["get"])
    && functions.every((name) => !!trusted.paths?.[`/rpc/${name}`]?.["post"])
    && ["videos", "transcript_segments", "video_frames", "knowledge_chunks"].every((table) => "processing_job_id" in (trusted.definitions?.[table]?.properties ?? {}));
  const memberReadOnly = tables.every((table) => {
    const path = member.paths?.[`/${table}`];
    return !!path?.["get"] && !path["post"] && !path["patch"] && !path["delete"];
  }) && functions.every((name) => !member.paths?.[`/rpc/${name}`]?.["post"]);
  const trustedWrites = tables.every((table) => !!trusted.paths?.[`/${table}`]?.["post"]);
  return { schemaInstalled, permissionsVerified: memberReadOnly && trustedWrites };
}