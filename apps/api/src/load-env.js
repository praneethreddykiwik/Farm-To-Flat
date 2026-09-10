// Loads apps/api/.env into process.env for local development. Imported first, before anything else
// reads env. No-op if the file is absent (production, where the host injects the variables). Node
// does NOT overwrite already-set variables, so shell exports and host-injected vars always win.
try {
  process.loadEnvFile();
} catch {
  // no .env file present — expected in production
}
