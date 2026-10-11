// One click opt out of the weekly update: /api/waitlist/unsubscribe?c=<contact key>&t=<token>.
// The token is an HMAC of the contact key (WAITLIST_UNSUB_SECRET), so a link only works
// for the person it was sent to. GET shows a plain confirmation page (English + Telugu).
import { checkUnsubscribe, unsubscribe } from "@/lib/waitlist";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const page = (ok: boolean, status: number) =>
  new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Varanasi</title></head>` +
      `<body style="font-family:system-ui,sans-serif;max-width:480px;margin:40px auto;padding:0 16px;font-size:19px;line-height:1.5;color:#1d1d1f">` +
      (ok
        ? `<h1>Done</h1><p>You will not get the weekly update any more. You stay on the waitlist.</p><p lang="te">అయిపోయింది. ఇక వారపు సమాచారం రాదు. మీరు వెయిట్‌లిస్ట్‌లోనే ఉంటారు.</p>`
        : `<h1>This link does not work</h1><p>Please use the link from your latest update.</p><p lang="te">ఈ లింక్ పనిచేయడం లేదు. మీ తాజా సమాచారంలోని లింక్ వాడండి.</p>`) +
      `</body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }
  );

async function handle(req: Request) {
  const u = new URL(req.url);
  const key = u.searchParams.get("c") || "";
  const token = u.searchParams.get("t") || "";
  if (!checkUnsubscribe(key, token)) return page(false, 400);
  try {
    await unsubscribe(key);
    return page(true, 200);
  } catch {
    return page(false, 503);
  }
}

export const GET = handle;
export const POST = handle; // RFC 8058 one click unsubscribe from mail apps
