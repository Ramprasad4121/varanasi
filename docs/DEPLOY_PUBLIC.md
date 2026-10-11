# Deploying the public demo

The public demo is the people app (`app/`) with a test ledger that lives in the
visitor's browser. No chain, no keys, no real money. It is the default build: a host
that builds `app/` with no settings gets this mode.

## Host settings

- Root directory: `app`
- Build: `npm ci && npx next build` (Node 22)
- Start: `npx next start` (Vercel detects Next.js and needs no start command)
- Do NOT set `NEXT_PUBLIC_VARANASI_MODE=local` on a host. Leave it empty or `public`.

## Env vars to set on the host

| Name | Needed for | Notes |
| --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` | waitlist storage | or `KV_REST_API_URL` and `KV_REST_API_TOKEN` (Vercel's Upstash integration sets these). Without one pair the waitlist does not persist. |
| `WAITLIST_UNSUB_SECRET` | signed unsubscribe links in weekly updates | 16+ random characters, server only. Without it no unsubscribe link is offered. |
| `WAITLIST_ADMIN_TOKEN` | `GET /api/waitlist` (team export) | 16+ characters. Without it the export answers 404. |
| `ERROR_WEBHOOK_URL` | optional error reports | any JSON POST endpoint. Nothing is sent when empty. |

What happens without Redis:
- On Vercel: signups answer `WAITLIST_NOT_CONFIGURED` (503). Nothing is pretended saved.
- On another host: signups go to a local file (`runtime/waitlist.jsonl`), which is lost
  on every redeploy or restart. Treat it as not persisted.

## Safety checks built in

- Chain routes (`/api/demo`, `/api/signin`, `/api/prepare`, `/api/relay`, `/api/state`)
  answer 404 unless the build is `local`, the host is not Vercel, and the request came
  to localhost (or `ALLOW_DEMO_ROUTES=1`, used only by docker compose).
- Every screen shows "PUBLIC DEMO · test money in your browser".
- The waitlist rate limit (10 joins per 10 minutes per address) is per server instance.
  Good enough for a demo; move it to Redis before a large launch.

## Check before merging

```
scripts/app-public.sh --check   # demo ledger test, waitlist test, browser walk-through + axe
```
