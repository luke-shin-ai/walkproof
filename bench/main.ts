import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, type SchemaRequest } from "firebase/ai";
import { classifyWithCloud, CLOUD_MODEL, deviceAvailability, structureWithDevice, warmDeviceModel } from "../src/ai/hybrid";
import { CLOUD_ANSWER_SCHEMA } from "../src/ai/schema";
import { hasFirebaseConfig, initFirebase } from "../src/config/firebase";
import { DEFAULT_PACK } from "../src/rules/pack";
import { buildClassifyPrompt } from "../src/ai/schema";
import type { InspectionItem } from "../src/types";
import {
  runCloudOnlyArm,
  runDeviceArm,
  runHybridArm,
  type ArmMetrics,
  type ArmResult,
  type BenchDeps,
  type BenchPhoto,
  type CloudPhotoResult,
} from "../src/bench/harness";
import { BENCH_SCENARIOS, HELDOUT_SCENARIOS, OPEN_SCENARIOS } from "../src/bench/scenarios";

import extinguisher from "../fixtures/extinguisher.jpg";
import exitSign from "../fixtures/exit-sign.jpg";
import panel from "../fixtures/panel.jpg";
import crack from "../fixtures/crack.jpg";
import blockedExit from "../fixtures/blocked-exit.jpg";
import hoseReel from "../fixtures/hose-reel.jpg";
import smokeDetector from "../fixtures/smoke-detector.jpg";
import fireDoor from "../fixtures/fire-door.jpg";
import sprinkler from "../fixtures/sprinkler.jpg";
import extinguisherCart from "../fixtures/extinguisher-cart.jpg";

const PHOTO_URLS: Record<string, string> = {
  "extinguisher.jpg": extinguisher,
  "exit-sign.jpg": exitSign,
  "panel.jpg": panel,
  "crack.jpg": crack,
  "blocked-exit.jpg": blockedExit,
  "hose-reel.jpg": hoseReel,
  "smoke-detector.jpg": smokeDetector,
  "fire-door.jpg": fireDoor,
  "sprinkler.jpg": sprinkler,
  "extinguisher-cart.jpg": extinguisherCart,
};

interface Options {
  device: boolean;
  hybrid: boolean;
  cloud: boolean;
  model: string;
  cloudOnly: number;
  gapMs: number;
  /** `heldout` walks the ten notes kept apart from the forty; `open` walks the ten written for the cloud path. */
  set: "main" | "heldout" | "open";
}

function readOptions(): Options {
  const params = new URLSearchParams(location.search);
  const arms = (params.get("arms") ?? "device,hybrid,cloud").split(",").map((entry) => entry.trim());
  return {
    device: arms.includes("device"),
    hybrid: arms.includes("hybrid"),
    cloud: arms.includes("cloud"),
    model: params.get("model") ?? CLOUD_MODEL,
    cloudOnly: Math.max(1, Math.min(40, Number(params.get("cloudOnly") ?? 10))),
    gapMs: Math.max(0, Number(params.get("gap") ?? 2000)),
    set: params.get("set") === "heldout" ? "heldout" : params.get("set") === "open" ? "open" : "main",
  };
}

const photoCache = new Map<string, BenchPhoto>();

async function loadPhoto(name: string): Promise<BenchPhoto> {
  const cached = photoCache.get(name);
  if (cached) return cached;
  const url = PHOTO_URLS[name];
  if (!url) throw new Error(`no fixture ${name}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`could not load ${name}`);
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const photo: BenchPhoto = {
    name,
    bytes: bytes.byteLength,
    mime: "image/jpeg",
    dataUrl: bytesToBase64(bytes),
  };
  photoCache.set(name, photo);
  return photo;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function timeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} did not answer in ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** The naive baseline: every item, its photo and its note go to the cloud. */
async function classifyWithPhoto(item: InspectionItem, note: string, photo: BenchPhoto, modelName: string): Promise<CloudPhotoResult> {
  const ai = getAI(initFirebase(), { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: CLOUD_ANSWER_SCHEMA as unknown as SchemaRequest,
      },
    },
  });
  const summary = JSON.stringify({
    itemId: item.id,
    item: item.label,
    zone: item.zone,
    note,
    allowedClauseIds: item.clauses,
    photo: "attached",
  });
  const prompt = buildClassifyPrompt(item, item.clauses, summary);
  const started = performance.now();
  try {
    const result = await timeout(
      model.generateContent([{ inlineData: { mimeType: photo.mime, data: photo.dataUrl } }, prompt]),
      45_000,
      "the cloud model",
    );
    return {
      raw: result.response.text(),
      latencyMs: Math.round(performance.now() - started),
      error: null,
      model: modelName,
      photoBytes: photo.bytes,
      requestBytes: photo.dataUrl.length + new TextEncoder().encode(prompt).length,
    };
  } catch (error) {
    return {
      raw: "",
      latencyMs: Math.round(performance.now() - started),
      error: `${(error as Error).name}: ${(error as Error).message}`,
      model: modelName,
      photoBytes: photo.bytes,
      requestBytes: 0,
    };
  }
}

const statusEl = document.querySelector<HTMLParagraphElement>("#status");
const probeEl = document.querySelector<HTMLDivElement>("#probe");
const liveEl = document.querySelector<HTMLElement>("#live");
const runButton = document.querySelector<HTMLButtonElement>("#run");

function say(text: string): void {
  if (statusEl) statusEl.textContent = text;
}

interface BenchState {
  running: boolean;
  status: string;
  progress: string;
  startedAt: string | null;
  finishedAt: string | null;
  environment: Record<string, unknown>;
  results: Record<string, unknown> | null;
}

const state: BenchState = {
  running: false,
  status: "idle",
  progress: "",
  startedAt: null,
  finishedAt: null,
  environment: {},
  results: null,
};

async function environment(): Promise<Record<string, unknown>> {
  const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: { brands?: { brand: string; version: string }[] } };
  let adapter = "none";
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    adapter = gpu && (await gpu.requestAdapter()) ? "present" : "none";
  } catch {
    adapter = "error";
  }
  return {
    userAgent: navigator.userAgent,
    cores: navigator.hardwareConcurrency ?? null,
    deviceMemoryGB: nav.deviceMemory ?? null,
    webgpu: adapter,
    deviceAvailability: await deviceAvailability(),
    languageModel: typeof (globalThis as { LanguageModel?: unknown }).LanguageModel,
    capturedAt: new Date().toISOString(),
  };
}

function metricRow(label: string, value: string): string {
  return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`;
}

function checkText(evidence: string | undefined): string {
  if (evidence === "amended") return "amended";
  if (evidence === "held_inconclusive") return "held: line unclear";
  if (evidence === "held_misread") return "held: answer unsupported";
  return "kept";
}

function armCard(metrics: ArmMetrics, items: ArmResult["items"]): string {
  const rows = items
    .map(
      (entry) => `<tr class="${entry.recorded === entry.expected ? "ok" : "off"}">
        <td>${entry.scenario}</td>
        <td>${entry.itemId}</td>
        <td>${entry.kind}</td>
        <td>${entry.expected}</td>
        <td>${entry.answerVerdict ?? entry.recorded}</td>
        <td>${entry.recorded}</td>
        <td>${checkText(entry.evidence)}</td>
        <td>${entry.deviceSource}</td>
        <td>${entry.gate}</td>
        <td class="num">${entry.latencyMs}</td>
        <td class="num">${entry.photoBytesSent}</td>
      </tr>`,
    )
    .join("");
  return `<article class="card arm">
    <h2>${metrics.arm === "device" ? "On-device path" : metrics.arm === "hybrid" ? "WalkProof hybrid" : "Cloud only baseline"}</h2>
    <div class="metrics">
      ${metricRow("items", String(metrics.items))}
      ${metricRow("total", `${(metrics.totalMs / 1000).toFixed(1)} s`)}
      ${metricRow("median", `${metrics.medianMs} ms`)}
      ${metricRow("p90", `${metrics.p90Ms} ms`)}
      ${metricRow("cloud calls", String(metrics.cloudCalls))}
      ${metricRow("cloud errors", String(metrics.cloudErrors))}
      ${metricRow("cloud skipped", String(metrics.cloudSkipped))}
      ${metricRow("photo bytes to cloud", String(metrics.cloudPhotoBytes))}
      ${metricRow("request bytes to cloud", String(metrics.cloudRequestBytes))}
      ${metricRow("settled without cloud", `${metrics.offlineShare}%`)}
      ${metricRow("agreement", `${metrics.agreement}%`)}
      ${metricRow("agreement of the raw answer", `${metrics.answerAgreement}%`)}
      ${metricRow("held by the line", String(metrics.heldByNote))}
      ${metricRow("amended from the line", String(metrics.amendedByNote))}
      ${metricRow("refusals", `${metrics.refused} of ${metrics.cloudCalls}`)}
      ${metricRow("settled by the cloud", `${metrics.settledByCloudCorrect ?? 0} right / ${metrics.settledByCloud ?? 0} settled`)}
      ${metricRow("review items", `${metrics.refusedOnReview} refused / ${metrics.settledOnReview} settled`)}
      ${metricRow("capture rate", metrics.captureRate === null ? "n/a" : `${metrics.captureRate}%`)}
    </div>
    ${metrics.notes.length ? `<ul class="notes">${metrics.notes.map((note) => `<li>${note}</li>`).join("")}</ul>` : ""}
    <div class="scroll">
      <table>
        <thead><tr><th>id</th><th>item</th><th>kind</th><th>expected</th><th>answer</th><th>recorded</th><th>note check</th><th>structuring</th><th>gate</th><th>ms</th><th>photo B</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </article>`;
}

function renderResults(results: { arms: ArmMetrics[]; items: Record<string, ArmResult["items"]>; environment: Record<string, unknown>; cloudModel?: string }): void {
  if (!liveEl) return;
  const env = results.environment;
  liveEl.innerHTML = `
    <section class="card">
      <h2>Run</h2>
      <p class="small">${String(env.userAgent ?? "")} / cores ${String(env.cores ?? "?")} / memory ${String(env.deviceMemoryGB ?? "?")} GB / WebGPU ${String(env.webgpu ?? "?")} / device model ${String(env.deviceAvailability ?? "?")}</p>
      <p class="small">cloud model ${String(results.cloudModel ?? "?")}</p>
    </section>
    ${results.arms.map((metrics) => armCard(metrics, results.items[metrics.arm] ?? [])).join("")}`;
}

async function run(options: Options): Promise<void> {
  if (state.running) return;
  state.running = true;
  state.status = "running";
  state.startedAt = new Date().toISOString();
  state.results = null;
  if (runButton) runButton.disabled = true;
  if (liveEl) liveEl.innerHTML = "";

  try {
    if (!hasFirebaseConfig()) throw new Error("no Firebase config in the URL fragment or the build");

    /* Started before any await, so the click that got here is still the user
       gesture the on-device model needs for its first session. */
    const wantsDevice = options.device || options.hybrid;
    let warm: Promise<void> | null = null;
    if (wantsDevice) {
      say("Preparing the on-device model. The first run downloads it.");
      warm = warmDeviceModel((progress) => {
        say(`Preparing the on-device model: ${Math.round((progress ?? 0) * 100)}%`);
      });
      warm.catch(() => undefined);
    }

    const env = await environment();
    state.environment = env;
    if (probeEl) {
      probeEl.textContent = `cores ${String(env.cores)} / memory ${String(env.deviceMemoryGB)} GB / WebGPU ${String(env.webgpu)} / LanguageModel ${String(env.languageModel)} / availability ${String(env.deviceAvailability)}`;
    }

    let deviceReady = false;
    if (warm) {
      try {
        await warm;
        deviceReady = true;
      } catch (error) {
        say(`The on-device model could not be prepared (${(error as Error).message}). The rule parser takes its place.`);
      }
    }

    const deps: BenchDeps = {
      pack: DEFAULT_PACK,
      now: new Date(),
      loadPhoto,
      structureOnDevice: deviceReady ? structureWithDevice : undefined,
      classify: (item, payload) => classifyWithCloud(item, payload, options.model),
      classifyWithPhoto: (item, note, photo) => classifyWithPhoto(item, note, photo, options.model),
      gapMs: options.gapMs,
      cloudOnlyCount: options.cloudOnly,
      onProgress: (text) => {
        state.progress = text;
        say(`Running: ${text}`);
      },
    };

    const arms: ArmMetrics[] = [];
    const items: Record<string, ArmResult["items"]> = {};

    const walk = options.set === "heldout" ? HELDOUT_SCENARIOS : options.set === "open" ? OPEN_SCENARIOS : BENCH_SCENARIOS;

    if (options.device) {
      const result = await runDeviceArm(deps, walk);
      arms.push(result.metrics);
      items.device = result.items;
      renderResults({ arms, items, environment: env, cloudModel: options.model });
    }
    if (options.hybrid) {
      const result = await runHybridArm(deps, walk);
      arms.push(result.metrics);
      items.hybrid = result.items;
      renderResults({ arms, items, environment: env, cloudModel: options.model });
    }
    if (options.cloud) {
      const result = await runCloudOnlyArm(deps, BENCH_SCENARIOS.slice(0, options.cloudOnly));
      arms.push(result.metrics);
      items.cloud = result.items;
      renderResults({ arms, items, environment: env, cloudModel: options.model });
    }

    state.results = {
      generatedAt: new Date().toISOString(),
      cloudModel: options.model,
      environment: env,
      arms,
      items,
    };
    state.status = "done";
    state.finishedAt = new Date().toISOString();
    say("Done. The numbers above are this browser's run.");
  } catch (error) {
    state.status = "error";
    say(`The run stopped: ${(error as Error).message}`);
  } finally {
    state.running = false;
    if (runButton) runButton.disabled = false;
  }
}

runButton?.addEventListener("click", () => {
  const options: Options = {
    device: (document.querySelector<HTMLInputElement>("#opt-device")?.checked ?? true),
    hybrid: (document.querySelector<HTMLInputElement>("#opt-hybrid")?.checked ?? true),
    cloud: (document.querySelector<HTMLInputElement>("#opt-cloud")?.checked ?? true),
    model: document.querySelector<HTMLInputElement>("#opt-model")?.value || CLOUD_MODEL,
    cloudOnly: Number(document.querySelector<HTMLInputElement>("#opt-count")?.value ?? 10),
    gapMs: 2000,
    set: readOptions().set,
  };
  void run(options);
});

/* ------------------------------------------------------- automation surface */

interface BenchBridge {
  ready: boolean;
  status: string;
  progress: string;
  environment: Record<string, unknown>;
  results: Record<string, unknown> | null;
  run: (options?: Partial<Options>) => Promise<void>;
}

const bridge: BenchBridge = {
  ready: true,
  get status() {
    return state.status;
  },
  get progress() {
    return state.progress;
  },
  get environment() {
    return state.environment;
  },
  get results() {
    return state.results;
  },
  run: (options) =>
    run({
      device: options?.device ?? true,
      hybrid: options?.hybrid ?? true,
      cloud: options?.cloud ?? true,
      model: options?.model ?? readOptions().model,
      cloudOnly: options?.cloudOnly ?? readOptions().cloudOnly,
      gapMs: options?.gapMs ?? readOptions().gapMs,
      set: options?.set ?? readOptions().set,
    }),
};
(globalThis as { __BENCH__?: BenchBridge }).__BENCH__ = bridge;

/* ------------------------------------------------------------- recorded run */

async function loadRecorded(): Promise<void> {
  const target = document.querySelector<HTMLDivElement>("#recorded");
  const note = document.querySelector<HTMLParagraphElement>("#recorded-note");
  if (!target || !note) return;
  try {
    const response = await fetch("results-latest.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as {
      arms?: ArmMetrics[];
      items?: Record<string, ArmResult["items"]>;
      environment?: Record<string, unknown>;
      cloudModel?: string;
    };
    if (!data.arms || !data.items) throw new Error("no arms in the file");
    note.textContent = `Recorded ${String(data.environment?.capturedAt ?? "")} with ${String(data.cloudModel ?? "")}.`;
    target.innerHTML = `<section class="card"><h2>Run</h2><p class="small">${String(data.environment?.userAgent ?? "")} / cores ${String(data.environment?.cores ?? "?")} / memory ${String(data.environment?.deviceMemoryGB ?? "?")} GB / WebGPU ${String(data.environment?.webgpu ?? "?")} / device model ${String(data.environment?.deviceAvailability ?? "?")}</p></section>
      ${(data.arms ?? []).map((metrics) => armCard(metrics, data.items?.[metrics.arm] ?? [])).join("")}`;
  } catch (error) {
    note.textContent = `No recorded run beside this page yet (${(error as Error).message}).`;
  }
}

void loadRecorded();
if (probeEl) probeEl.textContent = hasFirebaseConfig() ? "Firebase config found." : "No Firebase config in this URL. The recorded run below still works.";
