import { videoDemoCapabilities } from "./processing-capabilities";

export async function inspectVideoDemoCapabilities(bearer: string | undefined) {
  const origin = process.env["SUPABASE_URL"];
  const publishable = process.env["SUPABASE_PUBLISHABLE_KEY"];
  const secret = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!origin || !publishable || !secret || !bearer?.startsWith("Bearer ")) return { schemaInstalled: false, permissionsVerified: false };
  try {
    const read = async (key: string, authorization: string) => {
      const response = await fetch(new URL("/rest/v1/", origin), {
        headers: { apikey: key, ...(key.startsWith("sb_") && authorization === `Bearer ${key}` ? {} : { Authorization: authorization }), Accept: "application/openapi+json" },
        redirect: "error", signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("Capability inspection unavailable");
      return response.json();
    };
    const trusted = await read(secret, `Bearer ${secret}`);
    const reads = await Promise.all(["processing_artifacts", "processing_results"].map(async (table) => {
      const response = await fetch(new URL(`/rest/v1/${table}?select=workspace_id&limit=0`, origin), {
        headers: { apikey: publishable, Authorization: bearer }, redirect: "error", signal: AbortSignal.timeout(10000),
      });
      return response.ok;
    }));
    // Managed Cloud restricts OpenAPI to secret keys and returns trusted methods,
    // even with a member bearer. It cannot certify client write ACLs at runtime.
    const capabilities = videoDemoCapabilities(trusted, {});
    return { schemaInstalled: capabilities.schemaInstalled, permissionsVerified: false, readAccessVerified: reads.every(Boolean) };
  } catch {
    return { schemaInstalled: false, permissionsVerified: false };
  }
}