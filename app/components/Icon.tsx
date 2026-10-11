// Simple line icons drawn in SVG, so every phone shows the same picture (emoji look
// different, or are missing, on many low end Android phones). Decorative only:
// the text next to each icon is the label.
const PATHS: Record<string, string> = {
  home: "M3 11.5 12 4l9 7.5M5.5 10v9.5h5v-6h3v6h5V10",
  gold: "M4 15.5h16l-2.5-5h-11L4 15.5Zm3.5-5L9 7h6l1.5 3.5M3 19h18",
  chits: "M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.5 0a2.5 2.5 0 1 0 0-5M3 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5m1-5c2.4.2 4.2 1.9 4.8 5",
  receipts: "M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4v-17ZM9 8h6M9 11.5h6M9 15h4",
  bank: "M3 9.5 12 4l9 5.5M5 10v7.5M9.5 10v7.5M14.5 10v7.5M19 10v7.5M3 20h18",
  send: "M4 12 20 4l-5 16-3.5-6.5L4 12Zm7.5 1.5L20 4",
  out: "M12 3.5v11m0 0-4-4m4 4 4-4M5 15.5v3.5h14v-3.5",
  loan: "M3 12.5 7 8.5l4 2.5 3-3 3 2 4-2M5 16.5h14M8 19.5h8",
  check: "M12 3.5 19.5 6v5.5c0 4.4-3.1 7.7-7.5 9-4.4-1.3-7.5-4.6-7.5-9V6L12 3.5Zm-3.5 8.5 2.5 2.5 4.5-5",
};

export function Icon({ name, size = 28 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name] || PATHS.gold} />
    </svg>
  );
}
