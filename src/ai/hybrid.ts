import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, type GenerativeModel, type SchemaRequest } from "firebase/ai";
import { initFirebase } from "../config/firebase";
import { buildClassifyPrompt, buildStructurePrompt, CLOUD_ANSWER_SCHEMA, FINDING_SCHEMA, parseFinding } from "./schema";
import type { Finding, InspectionItem } from "../types";

/** The stronger cloud model, used only for items the device could not decide. */
export const CLOUD_MODEL = "gemini-4-hydrogen";
/** Used once if the stronger model is not available to this project. */
export const CLOUD_FALLBACK_MODEL = "gemini-3.5-flash-lite";

const TEXT_INPUTS: { type: "text"; languages: string[] }[] = [{ type: "text", languages: ["en"] }];
const TEXT_OUTPUTS: { type: "text"; languages: string[] }[] = [{ type: "text", languages: ["en"] }];

/**
 * The on-device path. It structures the inspector's line into the shared
 * finding schema. Photo judgement was measured on 2026-11-23 and did not hold
 * up, so the photo stays on the device as evidence and the note carries the
 * meaning (docs/vision-gate.md).
 */
export function buildDeviceModel(): GenerativeModel {
  const ai = getAI(initFirebase(), { backend: new GoogleAIBackend() });
  return getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: {
      createOptions: { expectedInputs: TEXT_INPUTS, expectedOutputs: TEXT_OUTPUTS },
      promptOptions: { responseConstraint: FINDING_SCHEMA },
    },
  });
}

/** The cloud path is closed by construction: only the typed summary is passed in. */
export function buildCloudModel(model = CLOUD_MODEL): GenerativeModel {
  const ai = getAI(initFirebase(), { backend: new GoogleAIBackend() });
  return getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: CLOUD_ANSWER_SCHEMA as unknown as SchemaRequest,
      },
    },
  });
}

export async function deviceAvailability(): Promise<string> {
  const api = (globalThis as { LanguageModel?: { availability?: (options?: unknown) => Promise<string> } }).LanguageModel;
  if (!api || typeof api.availability !== "function") return "not exposed";
  try {
    return await api.availability({ expectedInputs: TEXT_INPUTS, expectedOutputs: TEXT_OUTPUTS });
  } catch (error) {
    return `error ${(error as Error).name}`;
  }
}

export async function warmDeviceModel(onProgress?: (value: number) => void): Promise<void> {
  await buildDeviceModel().initializeDeviceModel(onProgress);
}

export interface DeviceStructureResult {
  finding: Finding | null;
  raw: string;
  latencyMs: number;
  error: string | null;
}

/** Chrome's own on-device model, reached without a Firebase project. */
interface BrowserLanguageSession {
  prompt: (input: string, options?: { responseConstraint?: unknown }) => Promise<string>;
  destroy?: () => void;
}

interface BrowserLanguageApi {
  availability?: (options?: unknown) => Promise<string>;
  create?: (options?: Record<string, unknown>) => Promise<BrowserLanguageSession>;
}

function browserLanguageApi(): BrowserLanguageApi | null {
  const api = (globalThis as { LanguageModel?: BrowserLanguageApi }).LanguageModel;
  return api && typeof api.create === "function" ? api : null;
}

/** True when this browser can structure notes without any Firebase project. */
export function hasBrowserDeviceModel(): boolean {
  return browserLanguageApi() !== null;
}

async function createBrowserSession(onProgress?: (value: number) => void): Promise<BrowserLanguageSession> {
  const api = browserLanguageApi();
  if (!api?.create) throw new Error("this browser has no built-in model");
  const options: Record<string, unknown> = { expectedInputs: TEXT_INPUTS, expectedOutputs: TEXT_OUTPUTS };
  if (onProgress) {
    options.monitor = (monitor: { addEventListener: (event: string, handler: (event: { loaded: number }) => void) => void }) => {
      monitor.addEventListener("downloadprogress", (event) => onProgress(event.loaded ?? 0));
    };
  }
  return api.create(options);
}

/**
 * The same on-device job through the browser's Prompt API.
 *
 * `firebase/ai` reaches Gemini Nano through a Firebase project, so a public
 * build with no values cannot use it. Chrome also exposes the same model as
 * `LanguageModel`, which needs no project, no key and no network once it is
 * on the machine. A reviewer who opens the published page on a browser that
 * has the model therefore gets the device path, exactly as a configured build
 * would; a browser without it falls back to the rule parser.
 */
export async function warmBrowserDeviceModel(onProgress?: (value: number) => void): Promise<void> {
  const session = await createBrowserSession(onProgress);
  session.destroy?.();
}

export async function structureWithBrowserDevice(item: InspectionItem, note: string): Promise<DeviceStructureResult> {
  const started = performance.now();
  let session: BrowserLanguageSession | null = null;
  try {
    session = await createBrowserSession();
    const prompt = buildStructurePrompt(item, note);
    let raw: string;
    try {
      raw = await withTimeout(session.prompt(prompt, { responseConstraint: FINDING_SCHEMA }), 60_000, "the on-device model");
    } catch (error) {
      const message = `${(error as Error).name}: ${(error as Error).message}`;
      /* An older build of the API does not take a response constraint. */
      if (!/constraint|schema|typeerror|notsupported|not supported|invalid/i.test(message)) throw error;
      raw = await withTimeout(session.prompt(prompt), 60_000, "the on-device model");
    }
    const parsed = parseFinding(raw);
    return {
      finding: parsed.finding,
      raw,
      latencyMs: Math.round(performance.now() - started),
      error: parsed.finding ? null : parsed.problems.map((problem) => `${problem.field}: ${problem.problem}`).join(", "),
    };
  } catch (error) {
    return {
      finding: null,
      raw: "",
      latencyMs: Math.round(performance.now() - started),
      error: `${(error as Error).name}: ${(error as Error).message}`,
    };
  } finally {
    session?.destroy?.();
  }
}

export async function structureWithDevice(item: InspectionItem, note: string): Promise<DeviceStructureResult> {
  const started = performance.now();
  try {
    const result = await withTimeout(
      buildDeviceModel().generateContent(buildStructurePrompt(item, note)),
      60_000,
      "the on-device model",
    );
    const raw = result.response.text();
    const parsed = parseFinding(raw);
    return {
      finding: parsed.finding,
      raw,
      latencyMs: Math.round(performance.now() - started),
      error: parsed.finding ? null : parsed.problems.map((problem) => `${problem.field}: ${problem.problem}`).join(", "),
    };
  } catch (error) {
    return {
      finding: null,
      raw: "",
      latencyMs: Math.round(performance.now() - started),
      error: `${(error as Error).name}: ${(error as Error).message}`,
    };
  }
}

export interface CloudClassifyResult {
  raw: string;
  latencyMs: number;
  error: string | null;
  model: string;
  modelFallback: boolean;
  source: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} did not answer within ${ms} ms`)), ms);
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

function looksLikeMissingModel(message: string): boolean {
  return /not found|404|not supported|unsupported|invalid model|unknown model/i.test(message);
}

export async function classifyWithCloud(item: InspectionItem, payload: object, model = CLOUD_MODEL): Promise<CloudClassifyResult> {
  const prompt = buildClassifyPrompt(item, item.clauses, JSON.stringify(payload));
  const started = performance.now();
  try {
    const result = await withTimeout(buildCloudModel(model).generateContent(prompt), 30_000, "the cloud model");
    return {
      raw: result.response.text(),
      latencyMs: Math.round(performance.now() - started),
      error: null,
      model,
      modelFallback: false,
      source: String(result.response.inferenceSource ?? "unknown"),
    };
  } catch (error) {
    const message = `${(error as Error).name}: ${(error as Error).message}`;
    if (!looksLikeMissingModel(message)) {
      return {
        raw: "",
        latencyMs: Math.round(performance.now() - started),
        error: message,
        model,
        modelFallback: false,
        source: "unknown",
      };
    }
  }

  const fallbackStarted = performance.now();
  try {
    const result = await withTimeout(
      buildCloudModel(CLOUD_FALLBACK_MODEL).generateContent(prompt),
      30_000,
      "the fallback cloud model",
    );
    return {
      raw: result.response.text(),
      latencyMs: Math.round(performance.now() - fallbackStarted),
      error: null,
      model: CLOUD_FALLBACK_MODEL,
      modelFallback: true,
      source: String(result.response.inferenceSource ?? "unknown"),
    };
  } catch (error) {
    return {
      raw: "",
      latencyMs: Math.round(performance.now() - fallbackStarted),
      error: `${(error as Error).name}: ${(error as Error).message}`,
      model: CLOUD_FALLBACK_MODEL,
      modelFallback: true,
      source: "unknown",
    };
  }
}
