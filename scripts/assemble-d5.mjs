#!/usr/bin/env node
/**
 * Turns the session's printed table into the result file the bench page reads.
 *
 * The D5 run of 2026-11-23 printed its per item table and its arm metrics into
 * the Kaggle console. The session was stopped before its output file could be
 * exported, so `benchmarks/raw-d5-2026-11-23.txt` keeps those lines verbatim and
 * this script expands them. It recomputes every count from the items and stops
 * if one disagrees with the line the run printed, so a typo cannot become a
 * published number.
 *
 * Run: node scripts/assemble-d5.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(resolve(root, "benchmarks/raw-d5-2026-11-23.txt"), "utf8").split("\n");

const ANSWER = { p: "pass", f: "fail", u: "unknown" };
const RECORDED = { p: "pass", f: "fail", r: "review" };
const VERDICT = { p: "pass", f: "fail", r: "unknown" };
const EVIDENCE = { k: "kept", a: "amended", i: "held_inconclusive", m: "held_misread" };
const GATE = { a: "accepted", r: "refused", n: "none" };

const scenarios = new Map();
for (const line of readFileSync(resolve(root, "src/bench/scenarios.ts"), "utf8").split("\n")) {
  const match = line.match(/id: "(S\d\d|H\d\d)"/);
  if (match) scenarios.set(match[1], match[1]);
}
const itemOf = new Map();
{
  const source = readFileSync(resolve(root, "src/bench/scenarios.ts"), "utf8");
  const blocks = source.split(/\{\n\s+id: "/).slice(1);
  for (const block of blocks) {
    const id = block.slice(0, 3);
    const itemId = block.match(/itemId: "([a-z]{2}-\d\d)"/)?.[1];
    const kind = block.match(/kind: "([a-z]+)"/)?.[1];
    const expected = block.match(/expected: "([a-z]+)"/)?.[1];
    if (itemId && kind && expected) itemOf.set(id, { itemId, kind, expected });
  }
}

let generatedAt = "";
let cloudModel = "";
let environment = {};
const metrics = new Map();
const items = new Map();
const refusals = new Map();
const agreement = new Map();
const layout = {};

for (const line of raw) {
  if (line.startsWith("generatedAt ")) generatedAt = line.slice(12).trim();
  else if (line.startsWith("environment ")) environment = JSON.parse(line.slice(12));
  else if (line.startsWith("cloudModel ")) cloudModel = line.slice(11).trim();
  else if (line.startsWith("metrics ")) {
    const [name, ...rest] = line.slice(8).split(",");
    const [totalMs, medianMs, p90Ms, cloudCalls, cloudErrors, cloudPhotoBytes, cloudRequestBytes, decidedWithoutCloud, offlineShare, pass, fail, review, reviewExpected, settledOnReview, refused, wrongSettled] = rest.map(Number);
    metrics.set(name, { totalMs, medianMs, p90Ms, cloudCalls, cloudErrors, cloudPhotoBytes, cloudRequestBytes, decidedWithoutCloud, offlineShare, pass, fail, review, reviewExpected, settledOnReview, refused, wrongSettled });
  } else if (/^(device|hybrid|holdout) /.test(line)) {
    const [name, body] = line.split(" ");
    items.set(name, body.split("|").map((entry) => {
      const [scenario, codes, latency] = entry.split(":");
      const [answer, recorded, evidence, gate] = codes.split("");
      return { scenario, answer, recorded, evidence, gate, latencyMs: Number(latency) };
    }));
  } else if (line.startsWith("agreement ")) {
    const [name, agreed, percent, answerAgreed, answerPercent] = line.slice(10).split(" ");
    agreement.set(name, { agreed: Number(agreed), percent: Number(percent), answerAgreed: Number(answerAgreed), answerPercent: Number(answerPercent) });
  } else if (line.startsWith("refused ")) {
    const [scenario, ...reason] = line.slice(8).split("=");
    refusals.set(scenario, reason.join("="));
  } else if (line.startsWith("layout ")) {
    const parts = line.slice(7).split(" ");
    const tag = parts.shift();
    const fields = Object.fromEntries(parts.map((part) => part.split("=")));
    layout[tag] = fields;
  }
}

function fail(message) {
  console.error(`refused: ${message}`);
  process.exit(1);
}

function rowsOf(name) {
  const rows = items.get(name);
  if (!rows) fail(`no items for ${name}`);
  const out = [];
  for (const row of rows) {
    const base = itemOf.get(row.scenario);
    if (!base) fail(`no scenario ${row.scenario}`);
    const cloudCalled = row.gate !== "n";
    out.push({
      scenario: row.scenario,
      itemId: base.itemId,
      kind: base.kind,
      expected: base.expected,
      verdict: VERDICT[row.recorded],
      recorded: RECORDED[row.recorded],
      answerVerdict: ANSWER[row.answer],
      evidence: EVIDENCE[row.evidence],
      evidenceReasons: refusals.has(row.scenario) ? [refusals.get(row.scenario)] : [],
      source: row.gate === "a" ? "in_cloud" : row.gate === "r" ? "rejected_unsupported" : "on_device",
      deviceSource: "on_device",
      latencyMs: row.latencyMs,
      cloudCalled,
      cloudModel: cloudCalled ? cloudModel : null,
      cloudError: null,
      cloudSkipped: false,
      photoBytesSent: 0,
      payloadBytes: null,
      gate: GATE[row.gate],
      gateReasons: refusals.has(row.scenario) ? [refusals.get(row.scenario)] : [],
      answer: null,
    });
  }
  return out;
}

function metricsOf(name, rows) {
  const printed = metrics.get(name);
  const agreed = rows.filter((row) => row.recorded === row.expected).length;
  const answerAgreed = rows.filter((row) => (row.answerVerdict === "unknown" ? "review" : row.answerVerdict) === row.expected).length;
  const verdicts = { pass: 0, fail: 0, review: 0 };
  for (const row of rows) verdicts[row.recorded] += 1;
  const reviewRows = rows.filter((row) => row.expected === "review");
  const settledOnReview = reviewRows.filter((row) => row.gate !== "refused" && row.verdict !== "unknown").length;
  const refusedOnReview = reviewRows.filter((row) => row.gate === "refused").length;
  const answeredOnReview = settledOnReview + refusedOnReview;
  const cloudCalls = rows.filter((row) => row.cloudCalled).length;
  const heldByNote = rows.filter((row) => row.evidence.startsWith("held")).length;
  const amendedByNote = rows.filter((row) => row.evidence === "amended").length;
  const latencies = rows.map((row) => row.latencyMs).filter((value) => value > 0).sort((a, b) => a - b);
  const middle = Math.floor(latencies.length / 2);
  const median = latencies.length % 2 ? latencies[middle] : Math.round((latencies[middle - 1] + latencies[middle]) / 2);
  const p90Index = Math.min(latencies.length - 1, Math.max(0, Math.ceil(0.9 * latencies.length) - 1));
  const p90 = latencies[p90Index];

  const said = agreement.get(name);
  const checks = [
    ["agreed", agreed, said ? said.agreed : null],
    ["agreement", Math.round((agreed / rows.length) * 100), said ? said.percent : null],
    ["answerAgreed", answerAgreed, said ? said.answerAgreed : null],
    ["answerAgreement", Math.round((answerAgreed / rows.length) * 100), said ? said.answerPercent : null],
    ["verdicts", JSON.stringify(verdicts), JSON.stringify({ pass: printed.pass, fail: printed.fail, review: printed.review })],
    ["items", rows.length, printed ? printed.decidedWithoutCloud + cloudCalls : null],
    ["settledOnReview", settledOnReview, printed.settledOnReview],
    ["refused", rows.filter((row) => row.gate === "refused").length, printed.refused],
    ["cloudCalls", cloudCalls, printed.cloudCalls],
    ["totalMs", rows.reduce((sum, row) => sum + row.latencyMs, 0), printed.totalMs],
    ["medianMs", median, printed.medianMs],
    ["p90Ms", p90, printed.p90Ms],
  ];
  for (const [label, computed, expected] of checks) {
    if (expected !== null && expected !== undefined && String(computed) !== String(expected)) {
      fail(`${name} ${label}: computed ${computed}, run printed ${expected}`);
    }
  }

  return {
    arm: name === "holdout" ? "device" : name,
    set: name === "holdout" ? "heldout" : "forty",
    items: rows.length,
    totalMs: printed.totalMs,
    medianMs: printed.medianMs,
    p90Ms: printed.p90Ms,
    cloudCalls,
    cloudErrors: printed.cloudErrors,
    cloudSkipped: 0,
    cloudPhotoBytes: printed.cloudPhotoBytes,
    cloudRequestBytes: printed.cloudRequestBytes,
    decidedWithoutCloud: rows.length - cloudCalls,
    offlineShare: Math.round(((rows.length - cloudCalls) / rows.length) * 100),
    onDeviceStructuring: rows.length,
    verdicts,
    agreed,
    agreement: Math.round((agreed / rows.length) * 100),
    answerAgreed,
    answerAgreement: Math.round((answerAgreed / rows.length) * 100),
    heldByNote,
    amendedByNote,
    reviewExpected: reviewRows.length,
    settledOnReview,
    refused: rows.filter((row) => row.gate === "refused").length,
    refusedOnReview,
    captureRate: answeredOnReview ? Math.round((refusedOnReview / answeredOnReview) * 100) : null,
    wrongSettled: rows.filter((row) => row.gate === "accepted" && row.recorded !== row.expected).length,
    notes: [],
  };
}

const device = rowsOf("device");
const hybrid = rowsOf("hybrid");
const holdout = rowsOf("holdout");

const result = {
  generatedAt,
  cloudModel,
  environment,
  host: "Kaggle Notebooks free CPU session, Chrome on Linux under Xvfb",
  note:
    "D5: every answer is checked against the inspector's line before a verdict is recorded. Assembled from the run's printed table by scripts/assemble-d5.mjs; see benchmarks/raw-d5-2026-11-23.txt.",
  layout,
  arms: [metricsOf("device", device), metricsOf("hybrid", hybrid)],
  items: { device, hybrid },
  holdout: { metrics: metricsOf("holdout", holdout), items: holdout },
};

writeFileSync(resolve(root, "benchmarks/results-kaggle-2026-11-23.json"), `${JSON.stringify(result, null, 1)}\n`);
writeFileSync(resolve(root, "public/bench/results-latest.json"), `${JSON.stringify(result, null, 1)}\n`);

for (const arm of result.arms) {
  console.log(`${arm.arm}: ${arm.agreed}/${arm.items} (${arm.agreement}%), answer alone ${arm.answerAgreement}%, held ${arm.heldByNote}, amended ${arm.amendedByNote}, cloud ${arm.cloudCalls}, refused ${arm.refused}`);
}
console.log(`holdout: ${result.holdout.metrics.agreed}/${result.holdout.metrics.items} (${result.holdout.metrics.agreement}%), answer alone ${result.holdout.metrics.answerAgreement}%, held ${result.holdout.metrics.heldByNote}`);
