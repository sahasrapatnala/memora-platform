export function validProcessingEndpoint(value: string) {
  try {
    const url = new URL(value);
    const loopback = ["127.0.0.1", "localhost"].includes(url.hostname);
    return url.protocol === "https:" || (url.protocol === "http:" && loopback);
  } catch {
    return false;
  }
}
