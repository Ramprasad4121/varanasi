// Waitlist form rules, shared by the screen (checks before sending) and the server
// (checks again, since anyone can call the API). No Node imports here.
export type Interest = "gold" | "chits" | "both";
export type Entry = { name: string; contact: string; contactType: "phone" | "email"; city: string; interest: Interest; lang: string; at: string };

/** Checks the form. Returns the clean entry or an error code the screen can show. */
export function validate(body: Record<string, unknown>): { entry?: Entry; error?: string } {
  const str = (k: string, max: number) => String(body[k] ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  if (str("website", 200)) return { error: "SPAM" }; // hidden field: people never fill it
  const name = str("name", 80);
  const city = str("city", 60);
  const rawContact = str("contact", 120);
  const interest = str("interest", 10) as Interest;
  if (name.length < 2) return { error: "WL_NAME" };
  let contact = "";
  let contactType: Entry["contactType"] = "phone";
  const digits = rawContact.replace(/[\s\-()+]/g, "");
  if (/^(91)?[6-9]\d{9}$/.test(digits)) contact = digits.slice(-10);
  else if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(rawContact)) {
    contact = rawContact.toLowerCase();
    contactType = "email";
  } else return { error: "WL_CONTACT" };
  if (city.length < 2) return { error: "WL_CITY" };
  if (!["gold", "chits", "both"].includes(interest)) return { error: "WL_INTEREST" };
  if (body.consent !== true) return { error: "WL_CONSENT" };
  const lang = body.lang === "te" ? "te" : "en";
  return { entry: { name, contact, contactType, city, interest, lang, at: new Date().toISOString() } };
}
