"""Reads a configured local build in the headless shell.

Run: npm run build, then python3 scripts/read-configured-build.py [dist] [out]

It serves the folder it is given (dist by default, made with the Firebase values
so the page takes the firebase/ai path), opens it at 1440 and at 390 by 844,
runs the sample walkthrough and prints what the header and each record say about
AI Logic and App Check, plus the console errors. The screenshots it writes are
proof for a submission, not part of the product.
"""

import http.server
import os
import socketserver
import sys
import threading
from functools import partial

from playwright.sync_api import sync_playwright

SHELL = os.path.expanduser("~/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell")
ROOT = sys.argv[1] if len(sys.argv) > 1 else "dist"
OUT = sys.argv[2] if len(sys.argv) > 2 else "configured-build-shots"
PORT = 8111


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def serve():
    handler = partial(Quiet, directory=ROOT)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd


def main():
    httpd = serve()
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=SHELL, args=["--no-sandbox"])
        page = browser.new_page(device_scale_factor=1)
        errors = []
        page.on("console", lambda message: errors.append(f"{message.type}: {message.text}") if message.type in ("error", "warning") else None)
        page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))
        page.set_viewport_size({"width": 1440, "height": 900})
        page.goto(f"http://127.0.0.1:{PORT}/", wait_until="networkidle")
        page.wait_for_timeout(2000)

        badges = page.evaluate("() => [...document.querySelectorAll('.badge')].map((b) => b.textContent.trim() + ' :: ' + (b.getAttribute('title') || ''))")
        print("BADGES")
        for badge in badges:
            print("  ", badge)
        print("FOOTER:", page.evaluate("() => document.querySelector('.foot')?.innerText"))
        print("STATUS:", page.evaluate("() => document.querySelector('.status')?.innerText"))

        page.click("#run-demo")
        for _ in range(80):
            page.wait_for_timeout(500)
            if page.evaluate("() => document.querySelectorAll('.result').length") >= 10:
                break
        page.wait_for_timeout(1500)

        print("RESULTS:", page.evaluate("() => document.querySelectorAll('.result').length"))
        details = page.evaluate(
            """() => [...document.querySelectorAll('.result')].map((r) => ({
                 verdict: r.querySelector('.pill')?.textContent,
                 source: r.querySelector('.src')?.textContent,
                 details: [...r.querySelectorAll('.details li')].map((li) => li.textContent),
               }))"""
        )
        for entry in details:
            print("RECORD", entry["verdict"], "|", entry["source"])
            for line in entry["details"]:
                print("     ", line)
        print("STATUS AFTER:", page.evaluate("() => document.querySelector('.status')?.innerText"))

        page.screenshot(path=os.path.join(OUT, "configured-1440.png"))
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(600)
        page.screenshot(path=os.path.join(OUT, "configured-390.png"))
        print("CONSOLE")
        for line in errors[:40]:
            print("  ", line)
        browser.close()
    httpd.shutdown()


main()
