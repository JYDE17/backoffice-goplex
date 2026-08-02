import { config } from "dotenv";

// The Nitro node-server build never loads .env into process.env on its own
// (only vite dev does this at build time). getServerEnv() is called (its
// return value used) rather than relying on a side-effect-only import, so
// Rollup's tree-shaking (package.json has "sideEffects": false) can't drop it.
let loaded = false;

function ensureEnvLoaded() {
  if (!loaded) {
    config();
    loaded = true;
  }
}

export function getServerEnv(name: string): string {
  ensureEnvLoaded();
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// Optional variant - returns undefined instead of throwing when unset. For
// deployment toggles that have a safe default (e.g. COOKIE_SECURE), not for
// required secrets.
export function getServerEnvOptional(name: string): string | undefined {
  ensureEnvLoaded();
  return process.env[name] || undefined;
}

// True when the app is served over HTTPS (typically behind a reverse proxy
// terminating TLS, e.g. backoffice.goplex.brossard.ca). The proxy talks HTTP
// to the container, so this can't be auto-detected from the request - it's an
// explicit opt-in that adds the `Secure` attribute to session cookies. Left
// off for the plain-HTTP LAN deployment (POS 4 / http://<server-ip>:3000),
// where a Secure cookie would simply never be sent back.
export function isHttpsDeployment(): boolean {
  const raw = getServerEnvOptional("COOKIE_SECURE");
  return raw === "true" || raw === "1";
}
