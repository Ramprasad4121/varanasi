// Rupees with Indian grouping (Rs 1,49,400.00) and grams with 3 decimals.
export function rupees(paise: string | bigint | number, withPaise = true): string {
  const p = BigInt(typeof paise === "number" ? Math.round(paise) : paise);
  const neg = p < 0n;
  const abs = neg ? -p : p;
  const r = abs / 100n;
  const ps = abs % 100n;
  const d = r.toString();
  const head = d.slice(-3);
  let rest = d.slice(0, -3);
  const groups: string[] = [];
  while (rest.length > 0) {
    groups.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  const body = groups.length ? groups.join(",") + "," + head : head;
  const tail = withPaise && ps !== 0n ? "." + ps.toString().padStart(2, "0") : "";
  return (neg ? "-" : "") + "₹" + body + tail;
}

export function grams(milli: number): string {
  return (milli / 1000).toLocaleString("en-IN", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + "\u00a0g";
}

export function when(unix: number, lang: "en" | "te"): string {
  return new Date(unix * 1000).toLocaleString(lang === "te" ? "te-IN" : "en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function day(unix: number, lang: "en" | "te"): string {
  return new Date(unix * 1000).toLocaleDateString(lang === "te" ? "te-IN" : "en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "long",
  });
}

/** Short, readable reference number from a record hash. */
export function refNo(hash: string): string {
  const h = hash.replace(/^0x/, "").toUpperCase();
  return `VR-${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8, 12)}`;
}
