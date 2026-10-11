// Lets plain Node (22.18+, which strips TypeScript types by itself) run the app's
// TypeScript modules in unit checks: resolves extensionless relative imports and the
// "@/..." path alias to .ts / .tsx files. Usage: node --import ./scripts/ts-hook.mjs x.mjs
import { register } from "node:module";
import { pathToFileURL } from "node:url";

if (!globalThis.__varanasiTsHook) {
  globalThis.__varanasiTsHook = true;
  register("./ts-hook.mjs", import.meta.url);
}

const APP_ROOT = new URL("../", import.meta.url);

export async function resolve(specifier, context, next) {
  let spec = specifier;
  if (spec.startsWith("@/")) spec = new URL(spec.slice(2), APP_ROOT).href;
  const relative = spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("file:");
  if (relative && !/\.(m?js|ts|tsx|json)$/.test(spec)) {
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      try {
        return await next(spec + ext, context);
      } catch {
        /* try the next one */
      }
    }
  }
  return next(spec, context);
}
void pathToFileURL;
