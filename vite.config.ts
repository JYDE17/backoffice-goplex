// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { execSync } from "node:child_process";

// A short, human-friendly build number (total commit count, not the hash)
// baked into the client bundle at build time so staff can confirm which
// version is actually deployed (shown on /parametres as "Version 1234").
// Falls back to "dev" when .git isn't available in the build environment.
function gitVersion(): string {
  try {
    return execSync("git rev-list --count HEAD").toString().trim();
  } catch {
    return "dev";
  }
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    define: {
      __GIT_VERSION__: JSON.stringify(gitVersion()),
    },
  },
});
