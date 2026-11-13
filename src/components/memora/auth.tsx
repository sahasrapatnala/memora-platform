import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shell } from "./shell";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import "@lovable.dev/cloud-auth-js/styles.css";
export function Auth() {
  const [mode, setMode] = useState<"signin" | "signup" | "reset" | "password">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [user, setUser] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user?.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user.email ?? null);
      if (event === "PASSWORD_RECOVERY") setMode("password");
    });
    return () => data.subscription.unsubscribe();
  }, []);
  async function submit() {
    setBusy(true);
    try {
      if (mode === "password") {
        const r = await supabase.auth.updateUser({ password });
        if (r.error) throw r.error;
        toast.success("Password updated");
        setMode("signin");
      } else if (mode === "reset") {
        const r = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + "/auth",
        });
        if (r.error) throw r.error;
        toast.success("Check your email for a password reset link");
      } else if (mode === "signup") {
        const r = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/auth" },
        });
        if (r.error) throw r.error;
        toast.success(
          r.data.session ? "Account created" : "Check your email to confirm your account",
        );
      } else {
        const r = await supabase.auth.signInWithPassword({ email, password });
        if (r.error) throw r.error;
        setUser(r.data.user.email ?? "Signed in");
        toast.success("Signed in securely");
      }
    } catch {
      toast.error("Could not complete this request. Check your details and try again.");
    } finally {
      setBusy(false);
    }
  }
  async function social(provider: "google" | "lovable") {
    const result = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: window.location.origin + "/auth",
    });
    if (result.error) toast.error("Sign-in could not be completed");
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
                <Link to="/upload">Upload files</Link>
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  await supabase.auth.signOut();
                  setUser(null);
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
              {mode !== "password" && (
                <Input
                  type="email"
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
                  aria-label="Password"
                  placeholder="Password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              )}
              <Button disabled={busy} type="submit">
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
                  onClick={() => social("lovable")}
                >
                  Continue with Lovable
                </Button>
              </>
            )}
            <div className="action-row">
              <Button
                variant="link"
                size="sm"
                onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              >
                {mode === "signup" ? "Already have an account?" : "Create an account"}
              </Button>
              <Button
                variant="link"
                size="sm"
                onClick={() => setMode(mode === "reset" ? "signin" : "reset")}
              >
                {mode === "reset" ? "Back to sign in" : "Forgot password?"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
