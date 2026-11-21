// Sentry tunnel: the browser SDK posts its events here (instrumentation-client.ts) and this
// forwards them to Sentry, without the request's cookies. It only accepts events for our own
// DSN. The auth middleware skips this path.
export { POST } from "@sentry/nextjs/tunnel";
