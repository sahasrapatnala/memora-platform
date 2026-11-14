/** Only public connection settings belong in the browser bundle. */
export function cloudPublicDefines(
  env: Record<string, string | undefined>,
  options: { strict?: boolean } = { strict: true },
) {
  const strict = options.strict !== false;
  const names = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"] as const;
  const missing = names.filter((name) => !env[name]?.trim());
  if (missing.length) {
    // Development/preview builds receive these from the platform's own env injection;
    // only a production (publish) build must fail rather than ship a blank screen.
    if (!strict) return {};
    throw new Error(`Missing public Lovable Cloud build settings: ${missing.join(", ")}. Refresh the managed Cloud binding before publishing.`);
  }
  const url = env['VITE_SUPABASE_URL']?.trim();
  const key = env['VITE_SUPABASE_PUBLISHABLE_KEY']?.trim();
  if (!url || !key) throw new Error("Public Lovable Cloud build settings are unavailable.");
  if (!URL.canParse(url)) throw new Error("The public Lovable Cloud address must be a valid URL.");
  const parsed = new URL(url);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && (strict || !loopback)) {
    throw new Error("The public Lovable Cloud address must be a valid HTTPS URL.");
  }
  if (key.startsWith("sb_secret_")) {
    throw new Error("A private credential cannot be used as a public Cloud build setting.");
  }
  return {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(url),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(key),
  };
}
