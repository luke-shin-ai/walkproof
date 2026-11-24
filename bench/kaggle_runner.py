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
# The ten notes that are not part of the forty, walked on the device after them.
HOLDOUT = int(globals().get("HOLDOUT", 1))
# all: layout, forty item arms, held out arm. heldout: only the ten notes, for a
# quick check that the on-device model answers in this session.
MODE = globals().get("MODE", "all")
# How long a single item may stay on the same progress line before the run gives up.
STALL_S = int(globals().get("STALL_S", 420))
# A suffix for the files this session writes, so two sessions do not overwrite each other.
TAG = globals().get("TAG", "")
# 1: run the forty item arms a second time in the same session, so the spread of
# one arm against itself is measured and not guessed.
REPEAT = int(globals().get("REPEAT", 0))
# 1: walk the ten notes written for the cloud path through both arms. They are
# the notes the narrowed cloud rule exists for, so this is the set that shows
# what an accepted cloud finding adds to a verdict. Keep CLOUD_ONLY at 0 when
# this is on: the ten calls and the forty item arms share one daily meter.
OPEN_SET = int(globals().get("OPEN", 1))

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


def layout_report(browser, url, tag, shot_path, width, height):
    # The window has to be this size before the page is read, or the phone
    # reading is desktop numbers under a phone name.
    browser.set_window_size(width, height)
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


def bench_url(set_name="main"):
    params = f"?arms=none&model={MODEL}&cloudOnly={CLOUD_ONLY}&gap={GAP_MS}&set={set_name}"
    return f"{BASE}{params}#config={CFG}"


def wait_for_bridge(browser, timeout=40):
    """The page loads as a module, so the run button does nothing until it is up."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if browser.execute_script("return Boolean(window.__BENCH__ && window.__BENCH__.ready)"):
            return True
        time.sleep(1)
    return False


def run_arms(browser, device, hybrid, cloud, count, set_name="main"):
    """Sets the arm checkboxes, then a real click, which is what lets the page create the model."""
    browser.get(bench_url(set_name))
    if not wait_for_bridge(browser):
        raise RuntimeError("the bench page never reported ready")
    probe = browser.execute_script("const el = document.getElementById('probe'); return el ? el.textContent : ''")
    print(f"probe {set_name}: {probe}", flush=True)
    if "No Firebase config" in str(probe):
        raise RuntimeError("the page did not accept the config fragment")
    time.sleep(2)
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


def run_watched(browser, device, hybrid, cloud, count, set_name="main"):
    """run_arms, but a page that stops reporting is reported instead of waited on."""
    import threading

    box = {}

    def work():
        try:
            box["result"] = run_arms(browser, device, hybrid, cloud, count, set_name)
        except Exception as error:  # noqa: BLE001
            box["error"] = error

    thread = threading.Thread(target=work, daemon=True)
    thread.start()
    thread.join(timeout=RUN_TIMEOUT)
    if thread.is_alive():
        print("STALLED: the page stopped reporting and the run was abandoned", flush=True)
        raise RuntimeError("stalled")
    if "error" in box:
        raise box["error"]
    return box["result"]


def main():
    install()
    start_display()

    if MODE == "heldout":
        browser = new_driver(1440, 900)
        try:
            held = run_arms(browser, device=True, hybrid=False, cloud=False, count=1, set_name="heldout")
            metrics = dict(held["arms"][0])
            results = {
                "generatedAt": held.get("generatedAt"),
                "cloudModel": MODEL,
                "environment": held.get("environment"),
                "host": "Kaggle Notebooks free CPU session, Chrome on Linux under Xvfb",
                "layout": {},
                "arms": [],
                "items": {},
                "holdout": {"metrics": metrics, "items": held["items"]["device"]},
            }
            with open("/kaggle/working/walkproof-holdout.json", "w") as handle:
                json.dump(results, handle, indent=1)
            print("HOLDOUT", json.dumps(metrics, ensure_ascii=False), flush=True)
            for row in results["holdout"]["items"]:
                print(
                    "ITEM "
                    + json.dumps(
                        {
                            "arm": "holdout",
                            "id": row.get("scenario"),
                            "expected": row.get("expected"),
                            "answer": row.get("answerVerdict"),
                            "recorded": row.get("recorded"),
                            "check": row.get("evidence"),
                            "ms": row.get("latencyMs"),
                        },
                        ensure_ascii=False,
                    ),
                    flush=True,
                )
        finally:
            try:
                browser.quit()
            except Exception:
                pass
        return

    layout = {}
    browser = new_driver(1440, 900)
    try:
        layout["desktop"] = layout_report(browser, SITE, "desktop", f"/kaggle/working/walkproof-pages-1440{TAG}.png", 1440, 900)
        layout["mobile"] = layout_report(browser, SITE, "mobile", f"/kaggle/working/walkproof-pages-390{TAG}.png", 390, 844)
        layout["bench_desktop"] = layout_report(browser, BASE, "bench-desktop", f"/kaggle/working/walkproof-bench-1440{TAG}.png", 1440, 900)
        layout["bench_mobile"] = layout_report(browser, BASE, "bench-mobile", f"/kaggle/working/walkproof-bench-390{TAG}.png", 390, 844)

        browser.set_window_size(1440, 900)

        local = run_arms(browser, device=True, hybrid=True, cloud=False, count=CLOUD_ONLY)
        print("forty item arms done", flush=True)

        arms = list(local.get("arms", []))
        items = dict(local.get("items", {}))

        if REPEAT:
            repeat = run_arms(browser, device=True, hybrid=True, cloud=False, count=CLOUD_ONLY)
            print("the same arms a second time", flush=True)
            for arm in repeat.get("arms", []):
                name = f"{arm['arm']}_rerun"
                arms.append({**arm, "arm": name})
                items[name] = repeat["items"][arm["arm"]]
            for arm_name in ("device", "hybrid"):
                first = {row["scenario"]: row for row in local.get("items", {}).get(arm_name, [])}
                second = {row["scenario"]: row for row in repeat.get("items", {}).get(arm_name, [])}
                differ = [
                    scenario
                    for scenario, row in first.items()
                    if scenario in second and second[scenario].get("recorded") != row.get("recorded")
                ]
                print(f"VARIATION {arm_name} {len(differ)} of {len(first)} {sorted(differ)}", flush=True)

        open_set = None
        if OPEN_SET:
            # The forty item arms and this set would share one meter of 20 calls,
            # and a spent meter measures the meter rather than the product. The
            # meter is cleared here so this set starts from a full day.
            browser.execute_script("try { localStorage.removeItem('walkproof.cloudBudget.v1'); } catch (e) {}")
            opened = run_arms(browser, device=True, hybrid=True, cloud=False, count=CLOUD_ONLY, set_name="open")
            print("cloud path arms done", flush=True)
            open_set = {
                "metrics": {arm["arm"]: arm for arm in opened.get("arms", [])},
                "items": dict(opened.get("items", {})),
                "agreed": {arm["arm"]: f"{arm['agreed']} of {arm['items']}" for arm in opened.get("arms", [])},
            }

        heldout = None
        if HOLDOUT:
            heldout = run_arms(browser, device=True, hybrid=False, cloud=False, count=CLOUD_ONLY, set_name="heldout")
            print(f"held out arm: {heldout['arms'][0]['agreed']} of {heldout['arms'][0]['items']}", flush=True)

        cloud = None
        if CLOUD_ONLY > 0:
            cloud = run_arms(browser, device=False, hybrid=False, cloud=True, count=CLOUD_ONLY)
            print(f"cloud only arm: {cloud['arms'][0]['cloudCalls']} calls, {cloud['arms'][0]['cloudErrors']} errors", flush=True)

        results = {
            "generatedAt": local.get("generatedAt"),
            "cloudModel": MODEL,
            "environment": local.get("environment"),
            "host": "Kaggle Notebooks free CPU session, Chrome on Linux under Xvfb",
            "layout": layout,
            "arms": arms + (cloud.get("arms", []) if cloud else []),
            "items": {**items, **(cloud.get("items", {}) if cloud else {})},
        }
        if heldout:
            results["holdout"] = {"metrics": heldout["arms"][0], "items": heldout["items"]["device"]}
        if open_set:
            results["open"] = open_set

        print("ITEMS_BEGIN", flush=True)
        for arm_name, rows in results.get("items", {}).items():
            for row in rows:
                print(
                    "ITEM "
                    + json.dumps(
                        {
                            "arm": arm_name,
                            "id": row.get("scenario"),
                            "expected": row.get("expected"),
                            "answer": row.get("answerVerdict"),
                            "recorded": row.get("recorded"),
                            "check": row.get("evidence"),
                            "gate": row.get("gate"),
                            "ms": row.get("latencyMs"),
                        },
                        ensure_ascii=False,
                    ),
                    flush=True,
                )
        for arm_name, rows in (results.get("open") or {}).get("items", {}).items():
            for row in rows:
                print(
                    "ITEM "
                    + json.dumps(
                        {
                            "arm": f"open-{arm_name}",
                            "id": row.get("scenario"),
                            "expected": row.get("expected"),
                            "answer": row.get("answerVerdict"),
                            "recorded": row.get("recorded"),
                            "check": row.get("evidence"),
                            "gate": row.get("gate"),
                            "cloud": row.get("cloudCalled"),
                            "ms": row.get("latencyMs"),
                        },
                        ensure_ascii=False,
                    ),
                    flush=True,
                )
        for row in (results.get("holdout") or {}).get("items", []):
            print(
                "ITEM "
                + json.dumps(
                    {
                        "arm": "holdout",
                        "id": row.get("scenario"),
                        "expected": row.get("expected"),
                        "answer": row.get("answerVerdict"),
                        "recorded": row.get("recorded"),
                        "check": row.get("evidence"),
                        "ms": row.get("latencyMs"),
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )
        print("ITEMS_END", flush=True)

        with open(f"/kaggle/working/walkproof-bench-result{TAG}.json", "w") as handle:
            json.dump(results, handle, indent=1)

        print("METRICS_BEGIN", flush=True)
        for arm in results.get("arms", []):
            print(json.dumps(arm, ensure_ascii=False), flush=True)
        if results.get("holdout"):
            print(json.dumps({**results["holdout"]["metrics"], "arm": "holdout"}, ensure_ascii=False), flush=True)
        for arm_name, arm in (results.get("open") or {}).get("metrics", {}).items():
            print(json.dumps({**arm, "arm": f"open-{arm_name}"}, ensure_ascii=False), flush=True)
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
