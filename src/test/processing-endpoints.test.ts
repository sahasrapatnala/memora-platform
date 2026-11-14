import { describe, expect, it } from "vitest";
import { validProcessingEndpoint } from "@/lib/memora/processing-endpoints";

describe("processing endpoint policy", () => {
  it("requires HTTPS for remote services", () => {
    expect(validProcessingEndpoint("https://worker.example.test")).toBe(true);
    expect(validProcessingEndpoint("http://worker.example.test")).toBe(false);
  });
  it("allows HTTP only for loopback development", () => {
    expect(validProcessingEndpoint("http://127.0.0.1:8000")).toBe(true);
    expect(validProcessingEndpoint("http://localhost:8080/callback")).toBe(true);
    expect(validProcessingEndpoint("http://0.0.0.0:8000")).toBe(false);
  });
  it("rejects malformed addresses", () => {
    expect(validProcessingEndpoint("not a URL")).toBe(false);
  });
});
