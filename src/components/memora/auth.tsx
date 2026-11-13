import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shell } from "./shell";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { Link, useNavigate } from "@tanstack/react-router";
import "@lovable.dev/cloud-auth-js/styles.css";
import { useWorkspace } from "./workspace-data";
import { useQueryClient } from "@tanstack/react-query";
import { authErrorMessage, isLocalAuthHost, passwordRecoveryRedirect } from "@/lib/memora/auth-rules";
export function Auth({ recovery = false }: { recovery?: boolean }) {
  const [mode, setMode] = useState<"signin" | "signup" | "reset" | "password">(recovery ? "password" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [localAuth, setLocalAuth] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [recoveryReady, setRecoveryReady] = useState(false);
  const { user: account } = useWorkspace();
  const user = account?.email ?? null;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  useEffect(() => {
    setLocalAuth(isLocalAuthHost(window.location.hostname));
    if (!recovery) return;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    let active = true;
    if (hash.get("type") !== "recovery" || hash.has("error")) {
      setRequestError("Open a fresh password reset link from your email before choosing a new password.");
      return;
    }
    // getUser waits for the client's URL-session initialization and validates with Cloud.
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error || !data.user) {
        setRequestError("This reset link is invalid or expired. Request a new password reset email.");
        return;
      }
      setRecoveryReady(true);
    }).catch(() => {
      if (active) setRequestError("Cannot validate this reset link. Check your connection and request a new link.");
    });
    return () => { active = false; };
  }, [recovery]);
  async function submit() {
    if (busy) return;
    setRequestError("");
    setBusy(true);
    try {
      if (mode === "password") {
        if (!recoveryReady) throw new Error("Recovery session is not ready");
        const r = await supabase.auth.updateUser({ password });
        if (r.error) throw r.error;
        toast.success("Password updated");
        void navigate({ to: "/", replace: true });
      } else if (mode === "reset") {
        const r = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: passwordRecoveryRedirect(window.location.origin),
        });
        if (r.error) throw r.error;
        toast.success("Check your email for a password reset link");
      } else if (mode === "signup") {
        const r = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { display_name: displayName.trim() } },
        });
        if (r.error) throw r.error;
        toast.success(
          r.data.session ? "Account created" : "Check your email to confirm your account",
        );
      } else {
        const r = await supabase.auth.signInWithPassword({ email, password });
        if (r.error) throw r.error;
        toast.success("Signed in securely");
        void navigate({ to: "/", replace: true });
      }
    } catch (error) {
      const message = authErrorMessage(error);
      setRequestError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }
  async function social(provider: "google" | "lovable") {
    if (busy) return;
    if (isLocalAuthHost(window.location.hostname)) {
      setRequestError("Google and Lovable sign-in require hosted MEMORA. Use email and password locally.");
      return;
    }
    setRequestError("");
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin,
      });
      if (result.error) toast.error("Sign-in could not be completed");
    } catch {
      toast.error("Sign-in could not be completed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Shell title="Account">
      <div className="auth-card">
        <h2>
          {user && mode !== "password"
            ? "Your MEMORA account"
            : mode === "signup"
              ? "Create your account"
              : mode === "reset"
                ? "Reset your password"
                : mode === "password"
                  ? "Choose a new password"
                  : "Welcome to MEMORA"}
        </h2>
        {user && mode !== "password" ? (
          <>
            <p>{user}</p>
            <div className="action-row">
              <Button asChild>
                <Link to="/">Open workspace</Link>
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await queryClient.cancelQueries();
                    queryClient.clear();
                    const result = await supabase.auth.signOut();
                    if (result.error) throw result.error;
                    void navigate({ to: "/auth", replace: true });
                  } catch {
                    toast.error("Could not sign out. Please try again.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Sign out
              </Button>
            </div>
          </>
        ) : (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {mode === "signup" && (
                <Input aria-label="Display name" placeholder="Display name" maxLength={100} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              )}
              {mode !== "password" && (
                <Input
                  type="email"
                  autoComplete="email"
                  aria-label="Email address"
                  placeholder="Work email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              )}
              {mode !== "reset" && (
                <Input
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  aria-label="Password"
                  placeholder="Password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}
              {requestError && <p role="alert">{requestError}</p>}
              {mode === "reset" && localAuth && <p>For the email to return here, add this app’s address under Cloud Auth settings → Advanced → Redirect URLs using 127.0.0.1 and your current port. Unlisted addresses return to hosted MEMORA instead.</p>}
              <Button disabled={busy || (mode === "password" && !recoveryReady)} type="submit">
                {busy
                  ? "Please wait…"
                  : mode === "signup"
                    ? "Create account"
                    : mode === "reset"
                      ? "Send reset link"
                      : mode === "password"
                        ? "Update password"
                        : "Sign in"}
              </Button>
            </form>
            {(mode === "signin" || mode === "signup") && (
              <>
                <Button
                  variant="outline"
                  className="social-button"
                  disabled={busy || localAuth}
                  onClick={() => social("google")}
                >
                  <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
                    />
                  </svg>
                  Continue with Google
                </Button>
                <Button
                  className="lovable-auth-button social-button"
                  disabled={busy || localAuth}
                  onClick={() => social("lovable")}
                >
                  Continue with Lovable
                </Button>
                {localAuth && <p>Google and Lovable sign-in are available on hosted MEMORA only. Use email and password here; if you used Google before, choose Forgot password to set a password for the same account.</p>}
              </>
            )}
            {!recovery && <div className="action-row">
              <Button
                variant="link"
                size="sm"
                onClick={() => { setRequestError(""); setMode(mode === "signup" ? "signin" : "signup"); }}
              >
                {mode === "signup" ? "Already have an account?" : "Create an account"}
              </Button>
              <Button
                variant="link"
                size="sm"
                onClick={() => { setRequestError(""); setMode(mode === "reset" ? "signin" : "reset"); }}
              >
                {mode === "reset" ? "Back to sign in" : "Forgot password?"}
              </Button>
            </div>}
          </>
        )}
      </div>
    </Shell>
  );
}
