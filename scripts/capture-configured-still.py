"""Takes the 2x screenshots a submission uses from a configured build.

Run: npm run build, then python3 scripts/capture-configured-still.py [dist] [out]

It serves the folder it is given (dist by default, built with the Firebase
values), fills the inspector name, runs the sample walkthrough and writes
app_top.png (1440 by 900 css at 2x, page at the top), the card of the record
whose source is the cloud, and the whole page at 1x. Every value on those
screens is produced by the app in that run: the cloud counter and the byte
count come from the call the walkthrough actually made. If the run ends without
a cloud record, it tries again, up to four runs, and keeps the first that has
one.
"""

import http.server
import os
import shutil
import socketserver
import sys
import threading
from functools import partial

from PIL import Image
from playwright.sync_api import sync_playwright

SHELL = os.path.expanduser("~/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell")
ROOT = sys.argv[1] if len(sys.argv) > 1 else "dist"
OUT = sys.argv[2] if len(sys.argv) > 2 else "configured-still"
PORT = 8133
TRIES = 4


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve():
    handler = partial(Quiet, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main():
    httpd = serve()
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=SHELL, args=["--no-sandbox"])
        for attempt in range(1, TRIES + 1):
            tmp = os.path.join(OUT, f"attempt{attempt}")
            os.makedirs(tmp, exist_ok=True)
            page = browser.new_page(device_scale_factor=2)
            page.set_viewport_size({"width": 1440, "height": 900})
            errors = []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.goto(f"http://127.0.0.1:{PORT}/", wait_until="networkidle")
            page.wait_for_timeout(2500)
            page.fill("#inspector", "R. Alvarez")
            page.click("#run-demo")
            for _ in range(90):
                page.wait_for_timeout(500)
                if page.evaluate("() => document.querySelectorAll('.result').length") >= 10:
                    break
            page.wait_for_timeout(3000)

            print(f"--- run {attempt}")
            print("BADGES:", page.evaluate("() => [...document.querySelectorAll('.badge')].map((b) => b.textContent.trim())"))
            print("FACTS:", page.evaluate("() => [...document.querySelectorAll('.facts li')].map((li) => li.innerText.replace(/\\n/g, ' '))"))
            print("CONSOLE ERRORS:", errors[:5])
            index = page.evaluate("""() => [...document.querySelectorAll('.item')]
                .findIndex((c) => /cloud/i.test(c.querySelector('.src')?.textContent || ''))""")
            print("CLOUD RECORD:", index)

            page.evaluate("() => window.scrollTo(0, 0)")
            page.wait_for_timeout(400)
            page.screenshot(path=os.path.join(tmp, "app_top.png"))
            if index >= 0:
                card = page.locator(".item").nth(index)
                card.scroll_into_view_if_needed()
                page.wait_for_timeout(500)
                card.screenshot(path=os.path.join(tmp, "cloud_item.png"))
            page.set_viewport_size({"width": 1440, "height": 2400})
            page.evaluate("() => window.scrollTo(0, 0)")
            page.wait_for_timeout(600)
            page.screenshot(path=os.path.join(tmp, "page_full@2x.png"))
            page.close()

            if index >= 0 or attempt == TRIES:
                for name in ("app_top.png", "cloud_item.png", "page_full@2x.png"):
                    src = os.path.join(tmp, name)
                    if os.path.exists(src):
                        shutil.copy(src, os.path.join(OUT, name))
                full = os.path.join(OUT, "page_full@2x.png")
                if os.path.exists(full):
                    image = Image.open(full)
                    image.resize((image.size[0] // 2, image.size[1] // 2), Image.LANCZOS).save(os.path.join(OUT, "page_full.png"))
                print("kept run", attempt)
                break
        browser.close()
    httpd.shutdown()


main()
