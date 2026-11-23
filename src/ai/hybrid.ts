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
