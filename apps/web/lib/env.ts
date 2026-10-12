import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get googleClientId() {
    return required("GOOGLE_CLIENT_ID");
  },
  get googleClientSecret() {
    return required("GOOGLE_CLIENT_SECRET");
  },
  get appUrl() {
    return required("APP_URL");
  },
  /** Public HTTPS base URL Google can reach for push notifications. Falls back to APP_URL. */
  get webhookBaseUrl() {
    return process.env.GOOGLE_WEBHOOK_BASE_URL || this.appUrl;
  },
  get tokenEncryptionKey() {
    return required("TOKEN_ENCRYPTION_KEY");
  },
  get stateSecret() {
    return required("OAUTH_STATE_SECRET");
  },
  get cronSecret() {
    return required("CRON_SECRET");
  },
  get allowedEmail() {
    return required("ALLOWED_EMAIL").toLowerCase();
  },
};
