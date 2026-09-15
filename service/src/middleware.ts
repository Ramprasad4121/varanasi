/**
 * @author Ramprasad
 * @module middleware — production HTTP middleware: request ids, access logs,
 * security headers (helmet), gzip (compression), free-route rate limiting.
 *
 * Env deps: none (pure; limits passed in as arguments).
 */
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Attach (or propagate) a request id on req + res. Must run first. */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.get(REQUEST_ID_HEADER);
  const id =
    typeof incoming === 'string' && incoming.length >= 1 && incoming.length <= 128
      ? incoming
      : randomUUID();
  (req as Request & { requestId?: string }).requestId = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}

/** Minimal structured access log (no bodies, no secrets, no query values). */
export function accessLog(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const id = (req as Request & { requestId?: string }).requestId ?? '-';
    console.log(
      `[http] ${req.method} ${req.path} -> ${res.statusCode} ${ms}ms id=${id}`,
    );
  });
  next();
}

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

/** In-memory fixed-window limiter. Returns 429 + Retry-After when exceeded. */
export function rateLimit(opts: RateLimitOptions) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return function limiter(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    let entry = hits.get(ip);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + opts.windowMs };
      hits.set(ip, entry);
    }
    entry.count += 1;
    if (hits.size > 5000) {
      for (const [k, v] of hits) {
        if (now >= v.resetAt) hits.delete(k);
      }
    }
    if (entry.count > opts.limit) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ error: `rate limited: ${opts.limit} req/min/IP`, retryAfter });
      return;
    }
    next();
  };
}
