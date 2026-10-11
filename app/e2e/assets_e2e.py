"""Browser walk-through of the new asset screens on a phone sized screen (360 x 780).

Silver: save 100 g at the demo bank counter, see grams + rupees + proof line, receipt,
Telugu. Pledge: pick an item, bank pledges it, receipt card, a refused oversized loan,
borrow, pay back. Bank asset desk: approved buyer bids, an unapproved buyer is refused,
settling is refused while the borrower can still pay, the clock moves, the auction
settles. Fails on any browser console error. Optional axe scan (AXE_JS) per screen.

Env: APP (default http://127.0.0.1:3200), SHOTS (folder for screenshots), AXE_JS.
Test money only. Needs: pip install playwright==1.48.0 && python3 -m playwright install chromium
"""
import os
import re
import sys

from playwright.sync_api import expect, sync_playwright

APP = os.environ.get("APP", "http://127.0.0.1:3200").rstrip("/")
SHOTS = os.environ.get("SHOTS", "")
AXE_JS = os.environ.get("AXE_JS", "")
PHONE = {"width": 360, "height": 780}

passes, failures = 0, 0
console_errors = []


def ok(cond, msg):
    global passes, failures
    print(("PASS  " if cond else "FAIL  ") + msg, flush=True)
    if cond:
        passes += 1
    else:
        failures += 1


def shot(page, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        page.add_style_tag(content=".nav{position:static!important}")
        page.screenshot(path=os.path.join(SHOTS, f"{name}.png"), full_page=True)
        page.evaluate("() => document.querySelectorAll('style').forEach(s => { if (s.textContent.includes('.nav{position:static')) s.remove(); })")


def axe(page, name):
    if not AXE_JS:
        return
    page.add_script_tag(path=AXE_JS)
    res = page.evaluate(
        "async () => { const r = await axe.run(document, { runOnly: ['wcag2a','wcag2aa','best-practice'] });"
        " return r.violations.map(v => ({id: v.id, impact: v.impact})); }"
    )
    bad = [v for v in res if v["impact"] in ("serious", "critical")]
    ok(not bad, f"axe {name}: {len(res)} issue(s), serious/critical: {', '.join(v['id'] for v in bad) or 'none'}")


def tap(page, name, exact=False):
    try:
        page.get_by_role("button", name=name, exact=exact).first.click(timeout=20000)
    except Exception as e:
        raise RuntimeError(f"could not tap '{name}' on {page.url}: {str(e).splitlines()[0]}") from None


def toast(page):
    return page.locator(".toast[role=alert]")


def close_toast(page):
    page.get_by_role("button", name="Close").first.click()


def done(page):
    btn = page.get_by_role("button", name="Done")
    btn.wait_for(timeout=20000)
    btn.click()


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport=PHONE, device_scale_factor=2, is_mobile=True, has_touch=True, locale="en-IN")
        page = ctx.new_page()
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(str(e)))

        page.goto(APP + "/")
        page.evaluate("() => { localStorage.clear(); localStorage.setItem('vr.lang', JSON.stringify('en')); }")
        page.reload()
        tap(page, "Try the demo")
        tap(page, "Use demo account (Ravi)")
        expect(page.get_by_text("Next payment")).to_be_visible(timeout=20000)

        # ---- silver
        page.goto(APP + "/#gold")
        tap(page, "Silver", exact=True)
        expect(page.get_by_role("heading", name="Silver", exact=True)).to_be_visible()
        expect(page.get_by_test_id("silver-grams")).to_have_text(re.compile(r"^0\.000"))
        tap(page, "Bank adds 100 g silver (demo)")
        done(page)
        expect(page.get_by_test_id("silver-grams")).to_have_text(re.compile(r"^100\.000"))
        expect(page.get_by_text("Fully backed").first).to_be_visible()
        ok(True, "silver: 100 g saved at the demo bank counter, shown in grams and rupees, fully backed")
        shot(page, "a1-silver-en")
        axe(page, "silver")
        page.get_by_role("button", name="తెలుగులో చూడండి").click()
        expect(page.get_by_role("heading", name="వెండి", exact=True)).to_be_visible()
        shot(page, "a2-silver-te")
        page.get_by_role("button", name="Show in English").click()
        ok(True, "silver: Telugu and back")

        # ---- pledge an item
        page.goto(APP + "/#gold")
        tap(page, "Pledge an item")
        page.get_by_text("Car", exact=True).click()
        shot(page, "a3-pledge-pick-en")
        axe(page, "pledge-pick")
        tap(page, "Bank checks and pledges it (demo)")
        done(page)
        rc = page.get_by_test_id("pledge-receipt")
        expect(rc).to_contain_text("Car")
        expect(rc).to_contain_text("₹6,00,000")
        expect(rc).to_contain_text("₹4,20,000")
        expect(page.get_by_text("₹2,52,000").first).to_be_visible()
        ok(True, "pledge: receipt shows bank value Rs 6 lakh, Rs 4.2 lakh counts, borrow up to Rs 2.52 lakh")
        shot(page, "a4-pledge-receipt-en")
        axe(page, "pledge-receipt")
        page.get_by_label("Amount in rupees").fill("300000")
        tap(page, "Borrow against it")
        expect(toast(page)).to_contain_text("more than the bank lends")
        close_toast(page)
        ok(True, "pledge: a loan above the limit is refused in plain words")
        page.get_by_label("Amount in rupees").fill("100000")
        tap(page, "Borrow against it")
        done(page)
        expect(page.get_by_text("Loan running")).to_be_visible()
        shot(page, "a5-pledge-loan-en")
        tap(page, "Pay back")
        done(page)
        expect(page.get_by_text("Your receipt is free again")).to_be_visible()
        ok(True, "pledge: borrow Rs 1 lakh and pay it back, receipt free again")

        # ---- bank asset desk
        page.goto(APP + "/#home")
        tap(page, "Bank asset desk")
        expect(page.get_by_test_id("desk-status")).to_have_text("On auction")
        tap(page, re.compile(r"^Mock Bank 2 bids"))
        expect(page.get_by_test_id("desk-high")).to_contain_text("Mock Bank 2")
        tap(page, "Unapproved buyer tries to bid")
        expect(toast(page)).to_contain_text("Only approved banks and dealers")
        close_toast(page)
        ok(True, "desk: approved buyer bids, unapproved buyer refused")
        shot(page, "a6-desk-en")
        axe(page, "desk")
        tap(page, re.compile(r"^Approved Dealer A bids"))
        tap(page, "Move the clock 36 days (demo)")
        expect(page.get_by_role("button", name="Borrower pays dues and takes it back")).to_have_count(0)
        tap(page, "Settle auction")
        expect(page.get_by_test_id("desk-status")).to_have_text("Sold")
        expect(page.get_by_test_id("desk-high")).to_contain_text("Approved Dealer A")
        expect(page.get_by_test_id("desk-surplus")).to_contain_text("₹93,000")
        ok(True, "desk: borrower window closes, auction settles to the highest approved bid")
        shot(page, "a7-desk-sold-en")

        # ---- borrower redeems on a fresh listing
        tap(page, "List another repossessed item (demo)")
        tap(page, re.compile(r"bids"))
        tap(page, "Borrower pays dues and takes it back")
        expect(page.get_by_test_id("desk-status")).to_have_text(re.compile("Borrower paid dues"))
        ok(True, "desk: borrower pays dues inside the window and gets the item back")

        page.goto(APP + "/#pledge")
        text = page.inner_text("body").lower()
        bad = [w for w in ["wallet", "gas fee", "token", "blockchain", "crypto", "nft"] if w in text]
        ok(not bad, f"pledge screen has no crypto words ({', '.join(bad) or 'none'})")

        real = [e for e in console_errors if "favicon" not in e]
        ok(not real, f"no browser console errors ({len(real)})" + ("" if not real else ": " + "; ".join(real[:3])))
        browser.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        ok(False, f"asset walk-through stopped: {str(e).splitlines()[0][:300]}")
    print(f"\n{passes} passed, {failures} failed")
    sys.exit(1 if failures else 0)
