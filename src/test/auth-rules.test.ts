import { describe, expect, it } from "vitest";
import { authErrorMessage, isLocalAuthHost, passwordRecoveryRedirect } from "@/lib/memora/auth-rules";

describe("local and hosted authentication boundaries", () => {
  it("returns password recovery to the requesting local origin without fixing a port", () => {
    expect(passwordRecoveryRedirect("http://127.0.0.1:5173")).toBe("http://127.0.0.1:5173/reset-password");
    expect(passwordRecoveryRedirect("http://localhost:8080")).toBe("http://localhost:8080/reset-password");
  });
  it("keeps hosted password recovery on the requesting hosted origin", () => {
    expect(passwordRecoveryRedirect("https://memora-platform.lovable.app")).toBe("https://memora-platform.lovable.app/reset-password");
  });
  it("prevents managed OAuth requests on local development hosts", () => {
    for (const host of ["localhost", "app.localhost", "127.0.0.1", "127.0.0.2", "[::1]", "::1"]) expect(isLocalAuthHost(host)).toBe(true);
  });
  it("preserves hosted preview and published social sign-in", () => {
    for (const host of ["id-preview--d5ac1397-48e2-46f9-9c3a-3155cf81dc50.lovable.app", "memora-platform.lovable.app", "memora.example.com"]) expect(isLocalAuthHost(host)).toBe(false);
  });
  it("does not mistake a domain containing localhost for a local host", () => {
    expect(isLocalAuthHost("localhost.example.com")).toBe(false);
  });
  it("never exposes unknown backend error details", () => {
    expect(authErrorMessage({ message: "private service detail" })).not.toContain("private service detail");
  });
});