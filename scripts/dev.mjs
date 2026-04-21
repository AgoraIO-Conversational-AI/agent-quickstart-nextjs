/**
 * Dev entrypoint that guarantees `.env.local` wins over any env vars already
 * present on `process.env` when the dev server starts.
 *
 * Why:
 * Next.js uses `@next/env`, which does NOT override vars that are already set
 * on the process. In workspaces where the shell preloads project-level env
 * vars (e.g. Vercel's dev sandbox sourcing `/vercel/share/.env.project`),
 * `.env.local` is silently ignored — including for `NEXT_PUBLIC_*` values
 * that get inlined into the browser bundle.
 *
 * This wrapper dotenv-overrides `.env.local` at the very top of the process,
 * then execs `next dev` so both server routes and client inlining see the
 * local values.
 *
 * Production (vercel build / start) is untouched — this only runs for
 * `pnpm dev`.
 */

import { config } from 'dotenv';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const envFile = path.join(root, '.env.local');

if (fs.existsSync(envFile)) {
  config({ path: envFile, override: true });
  console.log(`[dev] Loaded ${path.relative(root, envFile)} (override: true)`);
} else {
  console.log(`[dev] No .env.local found at ${envFile} — skipping override`);
}

const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const args = ['dev', '--webpack', ...process.argv.slice(2)];

const child = spawn(process.execPath, [nextBin, ...args], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
