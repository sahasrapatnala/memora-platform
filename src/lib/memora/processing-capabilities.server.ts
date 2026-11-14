import { videoDemoCapabilities } from "./processing-capabilities";

// Reasons are fixed, non-secret strings: they name which binding or request failed,
// never credential values, so the readiness screen can show the real runtime cause.
export async function inspectVideoDemoCapabilities(bearer: string | undefined) {
  const origin = process.env["SUPABASE_URL"];
  const publishable = process.env["SUPABASE_PUBLISHABLE_KEY"];
  const secret = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const missing = [
    ...(!origin ? ["SUPABASE_URL"] : []),
    ...(!publishable ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
    ...(!secret ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
  ];
  if (missing.length || !origin || !publishable || !secret) {
    return { schemaInstalled: false, permissionsVerified: false, reason: `Server process is missing managed Cloud binding: ${missing.join(", ")}` };
  }
  if (!bearer?.startsWith("Bearer ")) return { schemaInstalled: false, permissionsVerified: false, reason: "Signed-in session token was not received by the server" };
  let trusted: unknown;
  try {
    const response = await fetch(new URL("/rest/v1/", origin), {
      headers: { apikey: secret, ...(secret.startsWith("sb_") ? {} : { Authorization: `Bearer ${secret}` }), Accept: "application/openapi+json" },
      redirect: "error", signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return { schemaInstalled: false, permissionsVerified: false, reason: `Trusted schema metadata request returned HTTP ${response.status}` };
    trusted = await response.json();
  } catch {
    return { schemaInstalled: false, permissionsVerified: false, reason: "Trusted schema metadata request could not reach the backend" };
  }
  const reads = await Promise.all(["processing_artifacts", "processing_results"].map(async (table) => {
    try {
      const response = await fetch(new URL(`/rest/v1/${table}?select=workspace_id&limit=0`, origin), {
        headers: { apikey: publishable, Authorization: bearer }, redirect: "error", signal: AbortSignal.timeout(10000),
      });
      return response.ok ? null : `${table} member read returned HTTP ${response.status}`;
    } catch {
      return `${table} member read could not reach the backend`;
    }
  }));
  const readFailures = reads.filter((r): r is string => !!r);
  // Managed Cloud restricts OpenAPI to secret keys and returns trusted methods,
  // even with a member bearer. It cannot certify client write ACLs at runtime.
  const capabilities = videoDemoCapabilities(trusted as Parameters<typeof videoDemoCapabilities>[0], {});
  const reason = !capabilities.schemaInstalled ? "Installed schema metadata does not include every video-only object" : readFailures.length ? readFailures.join("; ") : undefined;
  return { schemaInstalled: capabilities.schemaInstalled, permissionsVerified: false, readAccessVerified: readFailures.length === 0, ...(reason ? { reason } : {}) };
}
