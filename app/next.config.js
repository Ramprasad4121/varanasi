/** @type {import('next').NextConfig} */
// NEXT_PUBLIC_VARANASI_MODE=public builds the hosted demo (test ledger in the browser,
// no chain). Locally it builds into .next-public so it never overwrites the local
// chain build in .next. On Vercel it uses the normal .next.
const isPublic = process.env.NEXT_PUBLIC_VARANASI_MODE === "public";
module.exports = {
  reactStrictMode: true,
  distDir: isPublic && !process.env.VERCEL ? ".next-public" : ".next",
  poweredByHeader: false,
};
