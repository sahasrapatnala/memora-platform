export async function requireWorkerReady(origin: string, key: string) {
  try {
    const response = await fetch(new URL("/ready", origin), {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Worker unavailable");
    const state: unknown = await response.json();
    if (typeof state !== "object" || state === null || !("ready" in state) || state.ready !== true ||
        !("service" in state) || state.service !== "memora-processor") throw new Error("Worker not ready");
  } catch {
    throw new Error("The local processor is not ready. Run its authenticated readiness check before starting processing; no job was claimed.");
  }
}