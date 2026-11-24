#!/usr/bin/env node
/**
 * Compares the numbers a reader can see against the result file the session
 * wrote. Four surfaces are covered: `benchmarks/results-kaggle-2026-11-25.json`,
 * `public/bench/results-latest.json`, the two README tables, and the live bench
 * page with the file it serves.
 *
 * Run: node scripts/check-surfaces.mjs [--offline]
 * `--offline` skips the two network checks and is what a plain commit uses.
 */
import { readFile } from "node:fs/promises";

const RESULT = new URL("../benchmarks/results-kaggle-2026-11-25.json", import.meta.url).pathname;
const PUBLIC = new URL("../public/bench/results-latest.json", import.meta.url).pathname;
const README = new URL("../README.md", import.meta.url).pathname;
const BENCH_README = new URL("../benchmarks/README.md", import.meta.url).pathname;
const LIVE_BENCH = "https://luke-shin-ai.github.io/walkproof/bench/";
const LIVE_RESULT = "https://luke-shin-ai.github.io/walkproof/bench/results-latest.json";

const offline = process.argv.includes("--offline");
const rows = [];
let failed = 0;

function check(name, ok, detail = "") {
  if (!ok) failed += 1;
  rows.push({ name, ok, detail });
}

const result = JSON.parse(await readFile(RESULT, "utf8"));
const publicFile = JSON.parse(await readFile(PUBLIC, "utf8"));
const readme = await readFile(README, "utf8");
const benchReadme = await readFile(BENCH_README, "utf8");

const arm = (name) => result.arms.find((entry) => entry.arm === name);
const open = (name) => result.open.metrics[name];
const pct = (agreed, items) => Math.round((agreed / items) * 100);
const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;
const num = (value) => value.toLocaleString("en-US");

function table(armMetrics, items) {
  const settled = armMetrics.settledByCloud
    ? `${armMetrics.settledByCloudCorrect} of ${armMetrics.settledByCloud}`
    : "n/a";
  return {
    agreed: armMetrics.agreed,
    items: `${armMetrics.items}`,
    agreement: `${armMetrics.agreed} (${pct(armMetrics.agreed, armMetrics.items)}%)`,
    answer: `${armMetrics.answerAgreed} (${pct(armMetrics.answerAgreed, armMetrics.items)}%)`,
    held: `${armMetrics.heldByNote}`,
    amended: `${armMetrics.amendedByNote}`,
    settledOnReview: `${armMetrics.settledOnReview} of ${armMetrics.reviewExpected}`,
    total: secs(armMetrics.totalMs),
    median: num(armMetrics.medianMs),
    p90: num(armMetrics.p90Ms),
    cloudCalls: `${armMetrics.cloudCalls}`,
    cloudErrors: `${armMetrics.cloudErrors}`,
    refused: armMetrics.cloudCalls ? `${armMetrics.refused}` : "n/a",
    settled,
    photoBytes: `${armMetrics.cloudPhotoBytes}`,
    requestBytes: num(armMetrics.cloudRequestBytes),
    ...items,
  };
}

const device = table(arm("device"));
const hybrid = table(arm("hybrid"));
const deviceRerun = table(arm("device_rerun"));
const hybridRerun = table(arm("hybrid_rerun"));
const holdout = table(result.holdout.metrics);
const openDevice = table(open("device"));
const openHybrid = table(open("hybrid"));

const served = [device, hybrid, holdout, openDevice, openHybrid];

function row(label, pick) {
  return `| ${label} | ${served.map((entry) => pick(entry)).join(" | ")} |`;
}

const readmeRows = {
  items: row("items", (entry) => entry.items),
  agreement: row("agreement with the human key", (entry) => entry.agreement),
  answer: row("agreement of the model answer alone", (entry) => entry.answer),
  held: row("items the line left open and the device held", (entry) => entry.held),
  amended: row("items the device amended from the line", (entry) => entry.amended),
  settledOnReview: row("review items that were settled anyway", (entry) => entry.settledOnReview),
  total: row("total time", (entry) => entry.total),
  median: row("median latency", (entry) => `${entry.median} ms`),
  cloudCalls: row("cloud calls", (entry) => entry.cloudCalls),
  refused: row("cloud answers the gate refused", (entry) => entry.refused),
  settled: row("items the cloud settled, and how many of those matched the key", (entry) => entry.settled),
  photoBytes: row("photo bytes to the cloud", (entry) => entry.photoBytes),
  requestBytes: row("request bytes to the cloud", (entry) => entry.requestBytes),
};

for (const [key, line] of Object.entries(readmeRows)) {
  check(`README table row: ${key}`, readme.includes(line), line);
}

const benchRows = {
  items: row("items", (entry) => entry.items),
  agreement: row("agreement with the human key", (entry) => entry.agreement),
  answer: row("agreement of the model answer alone", (entry) => entry.answer),
  held: row("held by the line", (entry) => entry.held),
  amended: row("amended from the line", (entry) => entry.amended),
  settledOnReview: row("review items settled anyway", (entry) => entry.settledOnReview),
  total: row("total", (entry) => entry.total),
  median: row("median", (entry) => `${entry.median} ms`),
  p90: row("p90", (entry) => `${entry.p90} ms`),
  cloudCalls: row("cloud calls", (entry) => entry.cloudCalls),
  cloudErrors: row("cloud errors", (entry) => entry.cloudErrors),
  refused: row("gate refusals", (entry) => entry.refused),
  settled: row("items settled by the cloud, and how many matched the key", (entry) => entry.settled),
  photoBytes: row("photo bytes to cloud", (entry) => entry.photoBytes),
  requestBytes: row("request bytes to cloud", (entry) => entry.requestBytes),
};

for (const [key, line] of Object.entries(benchRows)) {
  check(`benchmarks/README table row: ${key}`, benchReadme.includes(line), line);
}

const variation = {};
for (const [first, second] of [["device", "device_rerun"], ["hybrid", "hybrid_rerun"]]) {
  const head = result.items[first];
  const tail = result.items[second];
  const changed = head.filter((row) => {
    const other = tail.find((entry) => entry.scenario === row.scenario);
    return other && other.recorded !== row.recorded;
  });
  variation[first] = changed.length;
}
check(
  "README variation sentence: device 7 of 40",
  readme.includes(`recorded a different verdict on ${variation.device} of 40 items`) &&
    variation.device === 7,
  `measured ${variation.device}`,
);
check(
  "README variation sentence: hybrid 2 of 40",
  readme.includes(`and the hybrid on ${variation.hybrid} of 40`) && variation.hybrid === 2,
  `measured ${variation.hybrid}`,
);
check(
  "README second pass numbers",
  readme.includes(`${deviceRerun.agreed} of 40 on the device and ${hybridRerun.agreed} of 40 through the hybrid`),
  `${deviceRerun.agreed} and ${hybridRerun.agreed}`,
);

const calls =
  arm("hybrid").cloudCalls + arm("hybrid_rerun").cloudCalls + open("hybrid").cloudCalls;
const refusals =
  arm("hybrid").refused + arm("hybrid_rerun").refused + open("hybrid").refused;
const bytes =
  arm("hybrid").cloudRequestBytes + arm("hybrid_rerun").cloudRequestBytes + open("hybrid").cloudRequestBytes;
check(
  "README session line: 13 calls, 4 refusals, 6,282 bytes",
  readme.includes(`${calls} calls`) && readme.includes(`refused ${refusals} answers`) && readme.includes(`${num(bytes)} bytes`) && calls === 13 && refusals === 4 && bytes === 6282,
  `${calls} calls, ${refusals} refused, ${bytes} bytes`,
);
check(
  "model name is the measured model",
  result.cloudModel === "gemini-4-hydrogen" && readme.includes("`gemini-4-hydrogen`"),
  result.cloudModel,
);
check(
  "every cloud row names the measured model",
  [...result.items.hybrid, ...result.items.hybrid_rerun, ...result.open.items.hybrid]
    .filter((row) => row.cloudCalled)
    .every((row) => row.cloudModel === result.cloudModel),
);

check(
  "public/bench/results-latest.json is the D6 result file",
  JSON.stringify(publicFile) === JSON.stringify(result),
);

const benchHtml = await readFile(new URL("../bench/index.html", import.meta.url).pathname, "utf8");
check(
  "bench page model note names the measured model and date",
  benchHtml.includes("gemini-4-hydrogen on 2026-11-25"),
);

if (!offline) {
  try {
    const live = await (await fetch(LIVE_RESULT, { cache: "no-store" })).json();
    check(
      "live results-latest.json matches the result file",
      live.generatedAt === result.generatedAt && live.arms?.length === result.arms.length,
      `${String(live.generatedAt)} with ${String(live.arms?.length)} arms`,
    );
    const page = await (await fetch(LIVE_BENCH, { cache: "no-store" })).text();
    check("live bench page names the measured model", page.includes("gemini-4-hydrogen"));
    check("live bench page names the run date", page.includes("2026-11-25"));
  } catch (error) {
    check("live pages reachable", false, String(error));
  }
}

const width = Math.max(...rows.map((row) => row.name.length));
for (const row of rows) {
  console.log(`${row.ok ? "PASS" : "FAIL"}  ${row.name.padEnd(width)}  ${row.detail}`);
}
console.log(`\n${rows.length - failed} of ${rows.length} surface checks passed`);
process.exit(failed === 0 ? 0 : 1);
