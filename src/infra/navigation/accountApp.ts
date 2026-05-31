export function accountAppUrl(): string {
  const configured = String(import.meta.env.VITE_ACCOUNT_APP_URL || "").replace(/\/$/, "");
  if (configured) return configured;
  if (import.meta.env.DEV) return "http://localhost:5174";

  const trustedBaseDomain = String(import.meta.env.VITE_TRUSTED_BASE_DOMAIN || "").replace(/^\.+|\.+$/g, "");
  return trustedBaseDomain ? `https://account.${trustedBaseDomain}` : window.location.origin;
}
