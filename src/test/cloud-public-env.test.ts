import { describe, expect, it } from "vitest";
import { cloudPublicDefines } from "../../config/cloud-public-env";

const publicSettings = {
  VITE_SUPABASE_URL: "https://cloud.example.com",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
};

describe("Cloud browser build configuration", () => {
  it("explicitly injects both public settings and no server secrets", () => {
    expect(cloudPublicDefines({ ...publicSettings, SUPABASE_SERVICE_ROLE_KEY: "private-test-value" })).toEqual({
      "import.meta.env.VITE_SUPABASE_URL": '"https://cloud.example.com"',
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": '"sb_publishable_test"',
    });
  });
  it("rejects a missing browser URL even when a server URL exists", () => {
    expect(() => cloudPublicDefines({ VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test", SUPABASE_URL: "https://internal.example.com" })).toThrow("VITE_SUPABASE_URL");
  });
  it("rejects a missing public key before creating a broken deployment", () => {
    expect(() => cloudPublicDefines({ VITE_SUPABASE_URL: publicSettings.VITE_SUPABASE_URL })).toThrow("VITE_SUPABASE_PUBLISHABLE_KEY");
  });
  it("rejects private keys in browser settings", () => {
    expect(() => cloudPublicDefines({ ...publicSettings, VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_test" })).toThrow("private credential");
  });
  it("rejects a non-HTTPS public address", () => {
    expect(() => cloudPublicDefines({ ...publicSettings, VITE_SUPABASE_URL: "http://cloud.example.com" })).toThrow("HTTPS");
  });
});