/** The managed OAuth broker is not served by a local development server. */
export function isLocalAuthHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "[::1]" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

export function authErrorMessage(error: unknown): string {
  const detail = error && typeof error === "object" ? error : {};
  const code = "code" in detail ? String(detail.code) : "";
  const message = "message" in detail ? String(detail.message) : "";
  if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) {
    return "Email or password is incorrect. If you originally used Google, your account may not have a password. Use Forgot password to set one for the same account.";
  }
  if (code === "email_not_confirmed" || /email not confirmed/i.test(message)) return "Confirm your email before signing in.";
  if (code === "weak_password" || /weak|easy to guess|password.*least/i.test(message)) return "Choose a stronger password of at least 8 characters that is not commonly used.";
  if (code === "user_already_exists") return "An account already exists for this email. Sign in or use Forgot password.";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit") return "Too many requests. Wait before trying again.";
  if (/fetch|network|load failed/i.test(message)) return "Cannot reach account sign-in. Check your internet connection and local environment configuration.";
  if (code === "signup_disabled") return "New account registration is currently disabled. Existing accounts can still sign in.";
  return "Could not complete this request. Check your details and try again.";
}