"""
Repeats the layout checks on the published build at a desktop and a phone
viewport, with Chrome's own device emulation so the phone width is real.

The notebook only needs:

    BASE = "https://luke-shin-ai.github.io/walkproof/bench/"
    exec(open("/kaggle/working/layout_check.py").read())

Prints one LAYOUT line per page and writes a PNG for each.
"""

import json
import os
import subprocess
import time

BASE = globals().get("BASE", "https://luke-shin-ai.github.io/walkproof/bench/")
SITE = BASE.replace("bench/", "")


def display():
    if not os.environ.get("DISPLAY"):
        subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1600x1000x24"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(2)
    os.environ["DISPLAY"] = ":99"


def browser(width, height):
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options

    options = Options()
    options.binary_location = "/usr/bin/google-chrome"
    for flag in ["--no-sandbox", "--disable-dev-shm-usage", "--user-data-dir=/tmp/chrome-profile", f"--window-size={width},{height}"]:
        options.add_argument(flag)
    options.set_capability("goog:loggingPrefs", {"browser": "ALL"})
    driver = webdriver.Chrome(options=options)
    driver.set_window_size(width, height)
    return driver


def check(driver, url, tag, width, height, mobile, shot):
    driver.execute_cdp_cmd(
        "Emulation.setDeviceMetricsOverride",
        {"width": width, "height": height, "deviceScaleFactor": 1 if not mobile else 2, "mobile": mobile},
    )
    driver.get(url)
    time.sleep(6)
    report = driver.execute_script(
        """
        const d = document.documentElement;
        return {
          innerW: innerWidth, innerH: innerHeight,
          clientW: d.clientWidth, scrollW: d.scrollWidth,
          overflow: d.scrollWidth - d.clientWidth,
          title: document.title
        };
        """
    )
    errors = [entry for entry in driver.get_log("browser") if entry.get("level") == "SEVERE"]
    driver.save_screenshot(shot)
    report.update(
        {
            "tag": tag,
            "requested": [width, height],
            "mobile": mobile,
            "consoleSevere": len(errors),
            "console": [entry.get("message", "")[:180] for entry in errors][:8],
            "shot": shot,
        }
    )
    print("LAYOUT", json.dumps(report, ensure_ascii=False), flush=True)
    return report


def main():
    display()
    driver = browser(1440, 900)
    try:
        check(driver, SITE, "desktop-1440", 1440, 900, False, "/kaggle/working/walkproof-pages-1440.png")
        check(driver, SITE, "phone-390", 390, 844, True, "/kaggle/working/walkproof-pages-390.png")
        check(driver, BASE, "bench-desktop-1440", 1440, 900, False, "/kaggle/working/walkproof-bench-1440.png")
        check(driver, BASE, "bench-phone-390", 390, 844, True, "/kaggle/working/walkproof-bench-390.png")
        errors = [entry for entry in driver.get_log("browser") if entry.get("level") == "SEVERE"]
        print("TOTAL_SEVERE", len(errors), flush=True)
    finally:
        driver.quit()


main()
