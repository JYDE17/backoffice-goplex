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
