/**
 * Server-side env helpers that prefer `.env.local` over `process.env`.
 *
 * Why this exists:
 * The v0 / Vercel dev sandbox writes the project's Vercel env vars to
 * `/vercel/share/.env.project` and Next.js re-sources that file on every
 * recompile via `@next/env`, which means a one-shot `dotenv.config({
 * override: true })` at server start is silently undone on the next HMR pass.
 *
 * To make `.env.local` actually win in development, we parse it from disk
 * on demand and look up the requested key there before falling back to
 * `process.env`. The parsed file is cached and invalidated by mtime, so
 * edits to `.env.local` are picked up without restarting the server.
 *
 * In production this becomes a thin pass-through to `process.env` since
 * `.env.local` is not deployed.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'dotenv';

const envFile = path.resolve(process.cwd(), '.env.local');

let cache: { mtimeMs: number; values: Record<string, string> } | null = null;

function readLocal(): Record<string, string> {
  if (process.env.NODE_ENV === 'production') return {};
  try {
    const stat = fs.statSync(envFile);
    if (cache && cache.mtimeMs === stat.mtimeMs) return cache.values;
    const raw = fs.readFileSync(envFile, 'utf8');
    const values = parse(raw);
    cache = { mtimeMs: stat.mtimeMs, values };
    return values;
  } catch {
    return {};
  }
}

/**
 * Read an env var, preferring `.env.local` (when present) over
 * `process.env`. Returns `undefined` if neither has a value.
 */
export function getEnv(key: string): string | undefined {
  const local = readLocal()[key];
  if (local !== undefined && local !== '') return local;
  return process.env[key];
}

/**
 * Like {@link getEnv} but throws if the value is missing or empty.
 */
export function requireEnv(key: string): string {
  const v = getEnv(key);
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}
