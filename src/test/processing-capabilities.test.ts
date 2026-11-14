import { describe, expect, it } from "vitest";
import { videoDemoCapabilities } from "@/lib/memora/processing-capabilities";
const functions = ["claim_approved_processing_job", "assert_processing_attempt", "heartbeat_processing_job", "progress_processing_attempt", "register_processing_artifact", "finalize_processing_attempt", "fail_processing_attempt", "expire_processing_attempt", "cancel_processing_attempt", "validate_video_demo_manifest"];
function fixture() {
  const trusted = { paths: Object.fromEntries([...functions.map((name) => [`/rpc/${name}`, { post: {} }]), ...["processing_artifacts", "processing_results"].map((table) => [`/${table}`, { get: {}, post: {} }])]), definitions: Object.fromEntries([["processing_jobs", { properties: Object.fromEntries(["dispatch_token", "dispatch_started_at", "dispatch_attempts", "dispatch_error", "dispatch_worker_id", "heartbeat_at", "lease_expires_at", "dispatch_actor_id"].map((c) => [c, {}])) }], ...["videos", "transcript_segments", "video_frames", "knowledge_chunks"].map((t) => [t, { properties: { processing_job_id: {} } }])]) };
  const member = { paths: { "/processing_artifacts": { get: {} }, "/processing_results": { get: {} } } };
  return { trusted, member };
}
describe("video-only capability inspection", () => {
  it("recognizes video-only RPCs without full document ingestion", () => { const { trusted, member } = fixture(); expect(videoDemoCapabilities(trusted, member)).toEqual({ schemaInstalled: true, permissionsVerified: true }); });
  it("fails closed on missing lease columns", () => { const { trusted, member } = fixture(); delete trusted.definitions.processing_jobs.properties.dispatch_token; expect(videoDemoCapabilities(trusted, member).schemaInstalled).toBe(false); });
  it("rejects client mutation capabilities", () => { const { trusted, member } = fixture(); expect(videoDemoCapabilities(trusted, { paths: { ...member.paths, "/processing_results": { get: {}, post: {} } } }).permissionsVerified).toBe(false); });
  it("rejects missing trusted persistence API", () => { const { trusted, member } = fixture(); delete trusted.paths["/rpc/finalize_processing_attempt"]; expect(videoDemoCapabilities(trusted, member).schemaInstalled).toBe(false); });
});