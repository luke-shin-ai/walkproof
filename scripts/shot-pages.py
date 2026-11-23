"""Renders the published pages at the viewports the brief asks about.

Uses the headless shell already on this machine, so the picture is the live
GitHub Pages build and not a local copy. Writes PNGs into evidence/.
"""

import os
import sys

from playwright.sync_api import sync_playwright

SHELL = os.path.expanduser("~/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell")
SITE = "https://luke-shin-ai.github.io/walkproof/"
BENCH = "https://luke-shin-ai.github.io/walkproof/bench/"
OUT = sys.argv[1] if len(sys.argv) > 1 else "/workspace/hackathons/buildhybridai-2026/evidence"


def measure(page, url, width, height, tag, run_demo=False):
    page.set_viewport_size({"width": width, "height": height})
    page.goto(url, wait_until="networkidle")
    page.wait_for_timeout(1500)
    if run_demo:
        page.click("#run-demo")
        for _ in range(40):
            page.wait_for_timeout(500)
            if page.evaluate("document.querySelectorAll('.result').length") >= 10:
                break
        page.wait_for_timeout(1200)
    report = page.evaluate(
        """() => {
          const d = document.documentElement;
          const label = [...document.querySelectorAll('.count dt')].map((dt) => {
            const r = document.createRange();
            r.selectNodeContents(dt);
            const t = r.getBoundingClientRect();
            return { text: dt.textContent, textW: Math.round(t.width * 10) / 10, boxW: Math.round(dt.getBoundingClientRect().width * 10) / 10, lines: dt.getClientRects().length };
          });
          return {
            innerW: innerWidth, innerH: innerHeight,
            clientW: d.clientWidth, scrollW: d.scrollWidth,
            overflow: d.scrollWidth - d.clientWidth,
            title: document.title,
            labels: label,
            summary: [...document.querySelectorAll('.count dd')].map((dd) => dd.textContent)
          };
        }"""
    )
    shot = os.path.join(OUT, f"walkproof-pages-{tag}.png")
    page.screenshot(path=shot, full_page=False)
    print(f"{tag}: width={report['clientW']} overflow={report['overflow']} labels={report['labels']} counts={report['summary']} shot={shot}", flush=True)
    return report


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=SHELL, args=["--no-sandbox"])
        page = browser.new_page(device_scale_factor=1)
        measure(page, SITE, 1440, 900, "d5-1440", run_demo=True)
        measure(page, SITE, 390, 844, "d5-390")
        measure(page, BENCH, 1440, 900, "bench-d5-1440")
        measure(page, BENCH, 390, 844, "bench-d5-390")
        browser.close()


main()
