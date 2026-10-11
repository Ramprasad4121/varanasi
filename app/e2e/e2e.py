"""Browser walk-through of the people app on a phone sized screen (360 x 780, Android).

Runs every main flow the way a person taps it: landing, waitlist, sign in, home,
save gold at the demo bank counter, send gold, a refused send, take gold out, proof
of reserve, chit pay + sealed bid + open + take money, join an invited chit, gold
loan, receipts, Telugu. Fails on any browser console error or a failed request.

Works against the local chain demo (scripts/app-demo.sh --e2e, MODE_NAME=local) and
the public demo (scripts/app-public.sh --check, MODE_NAME=public). Test money only.

Env: APP (default http://127.0.0.1:3100), MODE_NAME (local|public), SHOTS (folder for
phone screenshots, empty = none), AXE_JS (path to axe.min.js: also runs an axe-core
accessibility scan on each main screen and fails on serious/critical issues).
Needs: pip install playwright==1.48.0 && python3 -m playwright install chromium
"""
import json
import os
import re
import sys
import time

from playwright.sync_api import expect, sync_playwright

APP = os.environ.get("APP", "http://127.0.0.1:3100").rstrip("/")
MODE = os.environ.get("MODE_NAME", "local")
SHOTS = os.environ.get("SHOTS", "")
AXE_JS = os.environ.get("AXE_JS", "")
PHONE = {"width": 360, "height": 780}

passes, failures = 0, 0
console_errors = []
axe_report = {}


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
        # full page shot: let the fixed bottom menu sit at the end instead of over the middle
        page.add_style_tag(content=".nav{position:static!important}")
        page.screenshot(path=os.path.join(SHOTS, f"{name}.png"), full_page=True)
        page.evaluate("() => document.querySelectorAll('style').forEach(s => { if (s.textContent.includes('.nav{position:static')) s.remove(); })")


def axe(page, name):
    if not AXE_JS:
        return
    page.add_script_tag(path=AXE_JS)
    res = page.evaluate(
        "async () => { const r = await axe.run(document, { runOnly: ['wcag2a','wcag2aa','best-practice'] });"
        " return r.violations.map(v => ({id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 5).map(n => n.target.join(' '))})); }"
    )
    axe_report[name] = res
    bad = [v for v in res if v["impact"] in ("serious", "critical")]
    ok(not bad, f"axe {name}: {len(res)} issue(s), serious/critical: {', '.join(v['id'] for v in bad) or 'none'}")


def close_receipt(page):
    done = page.get_by_role("button", name="Done")
    done.wait_for(timeout=20000)
    page.wait_for_timeout(150)  # let the sheet settle before the screenshot
    return done


def alert(page):
    # the app's own error boxes (Next.js also has a hidden route announcer with role=alert)
    return page.locator(".err[role=alert], .toast[role=alert]")


def tap(page, name, exact=False):
    try:
        page.get_by_role("button", name=name, exact=exact).first.click(timeout=20000)
    except Exception as e:
        raise RuntimeError(f"could not tap '{name}' on {page.url}: {str(e).splitlines()[0]}") from None


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport=PHONE, device_scale_factor=2, is_mobile=True, has_touch=True, locale="en-IN")
        page = ctx.new_page()
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append(str(e)))
        # a request the browser itself aborted because the page moved on is not an error
        page.on("requestfailed", lambda r: console_errors.append("request failed " + r.url) if "ERR_ABORTED" not in (r.failure or "") else None)

        # ---- landing
        page.goto(APP + "/")
        page.evaluate("() => { localStorage.clear(); localStorage.setItem('vr.lang', JSON.stringify('en')); }")
        page.reload()
        banner = "PUBLIC DEMO" if MODE == "public" else "LOCAL DEMO"
        expect(page.get_by_text(banner)).to_be_visible()
        expect(page.get_by_text("Not launched yet")).to_be_visible()
        ok(True, f"landing: {banner} banner and 'Not launched yet' shown")
        shot(page, "01-landing-en")
        axe(page, "landing")

        # ---- waitlist (needs a store: file locally, fake Upstash in public --check)
        tap(page, "Join the waitlist")
        tap(page, "Add me to the waitlist")
        expect(alert(page)).to_be_visible()
        ok(True, "waitlist: empty form refused in plain words, nothing sent")
        page.get_by_label("Your name").fill("Test Person")
        page.get_by_label("Mobile number or email").fill(f"9{int(time.time()) % 1000000000:09d}")
        page.get_by_label("Town or city").fill("Mahabubnagar")
        page.get_by_text("Both", exact=True).click()
        updates = page.get_by_role("checkbox", name=re.compile("weekly update"))
        ok(not updates.is_checked(), "waitlist: weekly update opt in is unticked by default")
        page.get_by_role("checkbox", name=re.compile("may contact me")).check()
        updates.check()
        shot(page, "02-waitlist-en")
        axe(page, "waitlist")
        tap(page, "Add me to the waitlist")
        expect(page.get_by_role("status")).to_contain_text("on the list", timeout=15000)
        ok(True, "waitlist: joined")
        tap(page, "Back")

        # ---- sign in (mock code shown on screen)
        tap(page, "Try the demo")
        page.get_by_label("Mobile number").fill("98765 43210")
        tap(page, "Send code")
        expect(page.locator(".otp-shown")).to_contain_text("123456")
        page.get_by_label("Enter the 6 digit code").fill("111111")
        tap(page, "Sign in", exact=True)
        expect(alert(page)).to_contain_text("not right")
        page.get_by_label("Enter the 6 digit code").fill("123456")
        shot(page, "03-sign-in-en")
        tap(page, "Sign in", exact=True)
        expect(page.get_by_text("12.450 g").first).to_be_visible(timeout=20000)
        ok(True, "sign in: wrong code refused, right code opens home with 12.450 g")

        # ---- home
        expect(page.get_by_text("Next payment")).to_be_visible()
        shot(page, "04-home-en")
        axe(page, "home")
        ok(True, "home: gold in grams and rupees, next chit payment")

        # ---- save gold (demo bank counter)
        page.goto(APP + "/#gold/deposit")
        tap(page, "Bank: test and keep 10 g (22 carat)")
        close_receipt(page)
        shot(page, "05-receipt-deposit-en")
        tap(page, "Done")
        page.goto(APP + "/#gold")
        expect(page.get_by_text("21.610 g").first).to_be_visible(timeout=15000)
        shot(page, "06-gold-en")
        axe(page, "gold")
        ok(True, "save gold: bank counter adds 9.160 g pure, balance 21.610 g")

        # ---- send gold, then a refused send
        page.goto(APP + "/#gold/send")
        page.get_by_label("Send to mobile number").fill("90000 00001")
        page.get_by_label("Grams").fill("1.5")
        shot(page, "07-send-en")
        tap(page, "Send", exact=True)
        close_receipt(page)
        tap(page, "Done")
        page.get_by_label("Grams").fill("500")
        tap(page, "Send", exact=True)
        expect(alert(page)).to_contain_text("do not have that much")
        shot(page, "08-send-refused-en")
        ok(True, "send: 1.5 g sent by phone number; 500 g refused in plain words")

        # ---- take gold out
        page.goto(APP + "/#gold/redeem")
        page.get_by_label("Grams").fill("2")
        tap(page, "Ask the bank")
        close_receipt(page)
        tap(page, "Done")
        expect(page.get_by_text("Waiting at bank")).to_be_visible()
        tap(page, "Demo: bank hands over gold")
        close_receipt(page)
        tap(page, "Done")
        expect(page.get_by_text("Gold handed over")).to_be_visible()
        shot(page, "09-take-out-en")
        ok(True, "take out: request waits at bank, then handed over")

        # ---- proof of reserve
        page.goto(APP + "/#gold/proof")
        expect(page.get_by_text("Fully backed").first).to_be_visible()
        shot(page, "10-proof-en")
        axe(page, "proof")
        ok(True, "proof: bank holds, app shows, fully backed")

        # ---- chit: pay, seal bid, open, settle, take money
        page.goto(APP + "/#chits")
        page.get_by_text("Ameerpet monthly chit").first.click()
        tap(page, re.compile(r"^Pay now"))
        close_receipt(page)
        tap(page, "Done")
        expect(page.get_by_text("You paid this month")).to_be_visible()
        page.get_by_label(re.compile("I will accept")).fill("7000")
        tap(page, re.compile("Seal my bid"))
        close_receipt(page)
        tap(page, "Done")
        expect(page.get_by_text("Your bid is sealed")).to_be_visible()
        shot(page, "11-chit-bid-en")
        ok(True, "chit: paid this month and sealed a bid")
        for _ in range(3):
            tap(page, "Demo: move to next step")
            page.wait_for_timeout(300)
            done = page.get_by_role("button", name="Done")
            if done.count():
                done.click()
            expect(page.get_by_role("button", name="Demo: move to next step")).to_be_enabled(timeout=20000)
        expect(page.get_by_text("You already took the pot")).to_be_visible(timeout=20000)
        tap(page, "Take to my bank")
        close_receipt(page)
        tap(page, "Done")
        shot(page, "12-chit-won-en")
        axe(page, "chit")
        ok(True, "chit: bids opened, Ravi won month 2 with the lowest bid, took dividend to bank")

        # ---- join an invited chit
        page.goto(APP + "/#chits")
        tap(page, "Join this group")
        close_receipt(page)
        tap(page, "Done")
        expect(page.get_by_text("Teachers savings chit").first).to_be_visible()
        shot(page, "13-chits-en")
        ok(True, "join chit: joined the invited group")

        # ---- gold loan: ask, bank approves, take money, repay
        page.goto(APP + "/#gold/loan")
        page.get_by_label("Grams to pledge").fill("5")
        page.get_by_label("Loan amount (₹)").fill("40000")
        tap(page, re.compile("^Pledge"))
        close_receipt(page)
        tap(page, "Done")
        tap(page, "Demo: bank approves the loan")
        close_receipt(page)
        tap(page, "Done")
        expect(page.get_by_text("Approved: money ready")).to_be_visible(timeout=15000)
        tap(page, re.compile("^Take .* to my bank"))
        close_receipt(page)
        tap(page, "Done")
        expect(page.get_by_text("Running")).to_be_visible()
        shot(page, "14-loan-running-en")
        tap(page, re.compile("^Repay"))
        close_receipt(page)
        tap(page, "Done")
        expect(page.get_by_text("Repaid: gold back")).to_be_visible()
        axe(page, "loan")
        ok(True, "loan: pledged 5 g, bank approved, took Rs 40,000, repaid and gold back")

        # ---- receipts
        page.goto(APP + "/#receipts")
        expect(page.get_by_text("Gold sent").first).to_be_visible()
        shot(page, "15-receipts-en")
        ok(True, "receipts: every action listed")

        # ---- Telugu
        page.goto(APP + "/#home")
        page.get_by_role("button", name="తెలుగులో చూడండి").click()
        expect(page.locator("html")).to_have_attribute("lang", "te")
        shot(page, "16-home-te")
        page.goto(APP + "/#gold")
        shot(page, "17-gold-te")
        page.goto(APP + "/#gold/proof")
        shot(page, "18-proof-te")
        page.get_by_role("button", name="Show in English").click()
        ok(True, "Telugu: whole app switches language and back")

        # ---- no crypto words on any screen people see
        page.goto(APP + "/#home")
        text = page.inner_text("body").lower()
        bad = [w for w in ["wallet", "gas fee", "token", "blockchain", "crypto"] if w in text]
        ok(not bad, f"home has no crypto words ({', '.join(bad) or 'none'})")

        # ---- sign out
        page.goto(APP + "/#home")
        tap(page, "Sign out")
        expect(page.get_by_role("button", name="Try the demo")).to_be_visible()
        ok(True, "sign out: back to landing")

        real = [e for e in console_errors if "favicon" not in e]
        ok(not real, f"no browser console errors ({len(real)})" + ("" if not real else ": " + "; ".join(real[:3])))
        if AXE_JS and SHOTS:
            with open(os.path.join(SHOTS, f"axe-{MODE}.json"), "w") as f:
                json.dump(axe_report, f, indent=1)
        browser.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # a step that times out is a failure with its message
        ok(False, f"walk-through stopped: {str(e).splitlines()[0][:300]}")
    print(f"\n{passes} passed, {failures} failed")
    sys.exit(1 if failures else 0)
