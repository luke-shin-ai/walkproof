"""
Runs the forty item measurement inside a free Kaggle CPU session.

The notebook only needs two values before this file runs:

    BASE = "https://luke-shin-ai.github.io/walkproof/bench/"
    CFG  = "<base64url json of the web app config>"

Everything else (Chrome, Xvfb, Selenium, the walk through the page, the result
dump) happens here. The page is the published build, so what is measured is the
same code a reviewer opens.

What it does
  1. installs Chrome and Selenium into the session
  2. starts Xvfb and Chrome with a profile under /tmp, which is the volume Chrome
     reads for its 22 GB requirement
  3. opens the live page at 1440 and at 390, records console errors, horizontal
     overflow and a screenshot of each
  4. opens the bench page with the config in the URL fragment and clicks Run
  5. waits for the arms, then prints metrics and a gzipped base64 dump of the
     whole result

The session costs nothing. Stop it when the dump has been read.
"""

import base64
import gzip
import json
import os
import subprocess
import sys
import time

BASE = globals().get("BASE", "https://luke-shin-ai.github.io/walkproof/bench/")
CFG = globals().get("CFG", "")
MODEL = globals().get("MODEL", "gemini-3.5-flash-lite")
CLOUD_ONLY = int(globals().get("CLOUD_ONLY", 10))
GAP_MS = int(globals().get("GAP_MS", 2500))
RUN_TIMEOUT = int(globals().get("RUN_TIMEOUT", 3600))

SITE = BASE.replace("bench/", "")


def sh(cmd, timeout=1800):
    print(f"$ {cmd}", flush=True)
    done = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
    if done.stdout.strip():
        print(done.stdout[-4000:], flush=True)
    if done.returncode != 0:
        print(done.stderr[-4000:], flush=True)
        raise RuntimeError(f"command failed: {cmd}")
    return done.stdout


def install():
    if not os.path.exists("/usr/bin/google-chrome"):
        sh("apt-get -qq update")
        sh(
            "apt-get -qq install -y wget xvfb fonts-liberation libasound2t64 "
            "libatk1.0-0t64 libatk-bridge2.0-0t64 libxcomposite1 libxtst6 libgbm1"
        )
        sh("wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -O /tmp/chrome.deb")
        sh("apt-get -qq install -y /tmp/chrome.deb")
    print(sh("google-chrome --version"), flush=True)
    try:
        import selenium  # noqa: F401
    except ImportError:
        sh(f"{sys.executable} -m pip -q install selenium")
    print("hardware:", os.cpu_count(), "cores", flush=True)
    print(sh("free -g | head -2"), flush=True)
    print(sh("df -h /tmp | tail -1"), flush=True)


def start_display():
    subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1600x1000x24"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)
    os.environ["DISPLAY"] = ":99"


def new_driver(width, height):
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options

    options = Options()
    options.binary_location = "/usr/bin/google-chrome"
    for flag in [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--user-data-dir=/tmp/chrome-profile",
        f"--window-size={width},{height}",
    ]:
        options.add_argument(flag)
    options.set_capability("goog:loggingPrefs", {"browser": "ALL"})
    browser = webdriver.Chrome(options=options)
    browser.set_window_size(width, height)
    return browser


def layout_report(browser, url, tag, shot_path):
    browser.get(url)
    time.sleep(6)
    report = browser.execute_script(
        """
        const d = document.documentElement;
        return {
          innerW: innerWidth, innerH: innerHeight,
          clientW: d.clientWidth, scrollW: d.scrollWidth,
          overflow: d.scrollWidth - d.clientWidth,
          title: document.title,
          text: document.body.innerText.slice(0, 200)
        };
        """
    )
    errors = [entry for entry in browser.get_log("browser") if entry.get("level") == "SEVERE"]
    browser.save_screenshot(shot_path)
    report.update({"tag": tag, "consoleSevere": len(errors), "console": [e.get("message", "")[:200] for e in errors][:10]})
    print("LAYOUT", json.dumps(report, ensure_ascii=False), flush=True)
    return report


def bench_url():
    params = f"?arms=none&model={MODEL}&cloudOnly={CLOUD_ONLY}&gap={GAP_MS}"
    return f"{BASE}{params}#config={CFG}"


def run_arms(browser, device, hybrid, cloud, count):
    """Sets the arm checkboxes, then a real click, which is what lets the page create the model."""
    browser.get(bench_url())
    time.sleep(5)
    browser.execute_script(
        """
        const args = arguments[0];
        for (const [id, on] of [['opt-device', args.device], ['opt-hybrid', args.hybrid], ['opt-cloud', args.cloud]]) {
          const el = document.getElementById(id);
          if (el) el.checked = on;
        }
        const count = document.getElementById('opt-count');
        if (count) count.value = String(args.count);
        const model = document.getElementById('opt-model');
        if (model) model.value = args.model;
        """,
        {"device": device, "hybrid": hybrid, "cloud": cloud, "count": count, "model": MODEL},
    )
    browser.find_element("id", "run").click()
    started = time.time()
    last = ""
    while time.time() - started < RUN_TIMEOUT:
        status = browser.execute_script("return window.__BENCH__ ? window.__BENCH__.status : 'none'")
        progress = browser.execute_script("return window.__BENCH__ ? window.__BENCH__.progress : ''")
        has_res = browser.execute_script("return window.__BENCH__ ? Boolean(window.__BENCH__.results) : false")
        label = f"{status} {progress}"
        if label != last:
            print(f"[{int(time.time() - started)}s] {label}", flush=True)
            last = label
        if status == "error":
            raise RuntimeError(f"the page stopped: {label}")
        if status == "done" and has_res:
            break
        time.sleep(10)
    result = browser.execute_script("return window.__BENCH__.results")
    if not result:
        raise RuntimeError(f"no results, last status {last}")
    return result


def main():
    install()
    start_display()

    layout = {}
    browser = new_driver(1440, 900)
    try:
        layout["desktop"] = layout_report(browser, SITE, "desktop", "/kaggle/working/walkproof-pages-1440.png")
        layout["mobile"] = layout_report(browser, SITE, "mobile", "/kaggle/working/walkproof-pages-390.png")
        layout["bench_desktop"] = layout_report(browser, BASE, "bench-desktop", "/kaggle/working/walkproof-bench-1440.png")
        layout["bench_mobile"] = layout_report(browser, BASE, "bench-mobile", "/kaggle/working/walkproof-bench-390.png")

        browser.set_window_size(1440, 900)

        cloud = run_arms(browser, device=False, hybrid=False, cloud=True, count=CLOUD_ONLY)
        print(f"cloud only arm: {cloud['arms'][0]['cloudCalls']} calls, {cloud['arms'][0]['cloudErrors']} errors", flush=True)
        local = run_arms(browser, device=True, hybrid=True, cloud=False, count=CLOUD_ONLY)

        results = {
            "generatedAt": local.get("generatedAt"),
            "cloudModel": MODEL,
            "environment": local.get("environment"),
            "host": "Kaggle Notebooks free CPU session, Chrome on Linux under Xvfb",
            "layout": layout,
            "arms": local.get("arms", []) + cloud.get("arms", []),
            "items": {**local.get("items", {}), **cloud.get("items", {})},
        }

        with open("/kaggle/working/walkproof-bench-result.json", "w") as handle:
            json.dump(results, handle, indent=1)

        print("METRICS_BEGIN", flush=True)
        for arm in results.get("arms", []):
            print(json.dumps(arm, ensure_ascii=False), flush=True)
        print("METRICS_END", flush=True)

        blob = base64.b64encode(gzip.compress(json.dumps(results, ensure_ascii=False).encode())).decode()
        print(f"RESULT_LEN {len(blob)}", flush=True)
        for index in range(0, len(blob), 2500):
            print("B64:" + blob[index : index + 2500], flush=True)
        print("B64_END", flush=True)
    finally:
        try:
            browser.quit()
        except Exception:
            pass


if __name__ == "__main__":
    main()
