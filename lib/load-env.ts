/**
 * Forces values in `.env.local` to take priority over any env vars that are
 * already present in `process.env` when the server process starts.
 *
 * Why this exists:
 * Next.js loads `.env.local` via `@next/env`, but that loader does NOT
 * override variables that are already set on `process.env`. In this workspace
 * the dev server is started with project-level Vercel env vars preloaded into
 * the process, which means anything you put in `.env.local` is silently
 * ignored. That made it impossible to point the app at a different Agora
 * project locally without editing the Vercel project settings.
 *
 * This module loads `.env.local` from the project root with `override: true`
 * so your local file is the source of truth during development. Import it at
 * the top of any server-only module that reads secrets from `process.env`.
 *
 * This is a no-op in production (`NODE_ENV === 'production'`) so deployments
 * continue to use platform-provided env vars as usual.
 */

import { config } from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

declare global {
  var __envLocalLoaded: boolean | undefined;
}

if (!globalThis.__envLocalLoaded && process.env.NODE_ENV !== 'production') {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    config({ path: envPath, override: true });
  }
  globalThis.__envLocalLoaded = true;
}

export {};
