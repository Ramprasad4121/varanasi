# Phone-size screenshots of the main screens (needs: pip install playwright==1.48.0;
# python3 -m playwright install chromium). Run while scripts/app-demo.sh is serving.
#   APP=http://127.0.0.1:3100 OUT=docs/screens python3 app/scripts/screenshots.py
import os
from playwright.sync_api import sync_playwright

APP = os.environ.get("APP", "http://127.0.0.1:3100")
OUT = os.environ.get("OUT", "screens")
os.makedirs(OUT, exist_ok=True)


def shot(page, name, full=True):
    page.wait_for_timeout(700)
    page.screenshot(path=os.path.join(OUT, name + ".png"), full_page=full)
    print("saved", name)


with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.goto(APP + "/")
    page.wait_for_selector("text=Sign in with your phone")
    shot(page, "01-sign-in-en", False)
    page.click("text=Use demo account (Ravi)")
    page.wait_for_selector("text=My gold")
    shot(page, "02-home-en")

    def go(h, wait):
        page.evaluate(f"window.location.hash = '{h}'")
        page.wait_for_selector(wait)

    go("gold", "text=How to put gold in")
    shot(page, "03-gold-en")
    go("gold/deposit", "text=Demo bank counter")
    shot(page, "04-deposit-steps-en")
    go("gold/proof", "text=Fully backed")
    shot(page, "05-proof-en")
    go("gold/redeem", "text=Ask the bank")
    shot(page, "06-take-gold-out-en")
    go("chits", "text=Groups that invited you")
    shot(page, "07-chits-join-en")
    chit = page.evaluate("fetch('/api/state?addr=' + JSON.parse(localStorage.getItem('vr.session')).address).then(r => r.json()).then(j => j.chits[0].address)")
    go("chit/" + chit, "text=Who won and why")
    shot(page, "08-chit-en")
    page.click("button.btn.green")
    page.wait_for_selector("text=No charges for you", timeout=20000)
    shot(page, "09-receipt-pay-en", False)
    page.click("text=Done")
    page.click("button.lang")
    page.wait_for_timeout(500)
    shot(page, "10-chit-te")
    go("home", "text=నా బంగారం")
    shot(page, "11-home-te")
    go("gold/deposit", "text=డెమో బ్యాంకు కౌంటర్")
    shot(page, "12-deposit-steps-te")
    b.close()
