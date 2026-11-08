// Secrets (wrangler secret put / .dev.vars) are not in wrangler.jsonc, so typegen can't see them.
interface CloudflareEnv {
  /** Firebase service account JSON (one line). Used for admin password resets. */
  FIREBASE_SERVICE_ACCOUNT?: string;
  /** Local dev only: act as this admin without Cloudflare Access. */
  DEV_ADMIN_EMAIL?: string;
}
