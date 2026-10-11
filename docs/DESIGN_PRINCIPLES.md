# Varanasi Design Principles

Status: v1, Oct 11, 2026. DRI: Designer role. Applies to every screen, message and receipt in the people app.
Built from Apple's Human Interface Guidelines (accessibility: https://developer.apple.com/design/human-interface-guidelines/accessibility), WCAG 2.2 AA, Google's Core Web Vitals (https://web.dev/articles/vitals) and what we know about our users: first time smartphone users in rural Telangana and Andhra, and salaried savers.

## Who we design for

- **Lakshmi, 46, Mahabubnagar district.** Shared Android phone, 2 GB RAM, often on 2G or patchy 4G. Reads Telugu slowly, little English. Saves in a village chit and buys gold at festivals. Fear: being cheated or pressing the wrong button.
- **Ravi, 29, Hyderabad, software engineer.** Fast phone, reads English, wants proof not promises. Fear: a shady app holding his money.
If Lakshmi can do it alone and Ravi trusts it, the design is right.

## 1. Trust is the product

- Show, do not claim. "Bank holds 120.450 g, app issued 120.450 g, fully backed" beats "100% safe".
- Every money action ends with a receipt: what, how much, to whom, when (IST), reference number.
- Say "Demo, test money" wherever money appears until real money is allowed. Never hide it in small print.
- Name the real things: bank branch, certificate number, foreman name, fee in rupees.
- Never use dark patterns: no fake urgency, no pre-ticked boxes, no hidden fees, no "Are you sure you want to miss out?".
- Before a hard to undo action (send gold, take out gold, place a bid), confirm once with the amount written in words in the chosen language. (HIG: confirm actions that are difficult to recover from.)

## 2. Clarity over cleverness

- One screen, one job, one primary button.
- Plain words. Never wallet, gas, token, blockchain, crypto, mint, stake, NFT. Say "your gold", "fee", "receipt".
- Rupees as Rs with Indian grouping (Rs 1,25,000). Grams with three decimals (12.450 g). Dates as 11 Oct 2026, times in IST.
- Errors say what happened and what to do: "Payment not sent. Your internet stopped. Try again." Never a code alone.
- Status never by color only: icon + word + color (HIG: convey information with more than color).

## 3. Telugu first

- Write every screen in Telugu first, then English. The Telugu must read like a person from the region speaking, not a translation.
- Native speaker review before any real person sees it. Track reviewed strings.
- Telugu text needs about 20 to 30% more space and taller line height; never truncate Telugu; test both languages at 360 px.
- `html lang` follows the chosen language so screen readers pronounce correctly.
- Plan for voice: every important screen should be explainable in one short Telugu voice note (later: a "listen" button).

## 4. Built for low end Android and slow networks

- Design for a 360 x 640 screen, 2 GB RAM, Slow 3G. Test with 4x CPU throttle.
- Budgets: LCP 2.5 s or less, INP 200 ms or less, CLS 0.1 or less; first visit under 500 KB including fonts.
- Fonts: subset Noto Sans Telugu to the glyphs and weights we use, woff2, `font-display: swap`.
- No heavy images; SVG icons, not emoji (emoji render as boxes on some phones).
- Every tap gives feedback within 100 ms.

## 5. Offline tolerant

- The app opens without network and shows the last known balance with "as of" time.
- Actions taken offline are never silently lost: either queued with a clear "will send when online" state, or refused with a plain message. Never both unclear.
- Retries are safe: paying twice is impossible (the server dry run already blocks it); the UI must say so.
- Receipts are readable offline.

## 6. Accessible to everyone

- Text 19 px base or larger; works at 200% text size with no clipped text and no sideways scroll.
- Contrast 4.5:1 for text, 3:1 for large text and control borders.
- Touch targets 48 x 48 dp or larger with 8 dp spacing (HIG minimum 44 x 44 pt).
- Every icon button has a label in the current language. TalkBack pass on every new screen.
- No timed messages for anything about money; the person dismisses them.
- Simple gestures only: taps. No swipe-only actions.

## 7. Calm, respectful, local

- Calm colors, generous spacing, one accent color for the primary action. Red only for real problems (late, not backed).
- Respect the festival and harvest calendar in reminders; no reminders at night.
- Celebrate small wins quietly ("Paid for October. Thank you.").
- Respect shared phones: no sensitive data on the lock screen or in notifications; easy sign out.

## Review checklist (Designer signs before G4)

- [ ] One job per screen, one primary button
- [ ] Both languages, 360 px screenshots, no truncation
- [ ] No crypto words; numbers and dates formatted as above
- [ ] Receipts and confirmations for every money action
- [ ] Contrast, target size, labels, 200% text checked
- [ ] Offline state designed
- [ ] Friction log done in Telugu on a throttled phone
