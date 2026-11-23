import { initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  type GenerativeModel,
} from "firebase/ai";
import { buildPrompt, FINDING_SCHEMA } from "./schema";
import type { Finding, InferenceSource, Severity } from "../types";

export type WalkMode = "on_device_only" | "prefer_on_device" | "in_cloud_only";

const MODE_MAP: Record<WalkMode, InferenceMode> = {
  on_device_only: InferenceMode.ONLY_ON_DEVICE,
  prefer_on_device: InferenceMode.PREFER_ON_DEVICE,
  in_cloud_only: InferenceMode.ONLY_IN_CLOUD,
};

const CLOUD_MODEL = "gemini-3.5-flash-lite";

function env(key: string): string {
  return (import.meta.env[key] as string | undefined) ?? "";
}

export function firebaseConfig() {
  return {
    apiKey: env("VITE_FIREBASE_API_KEY"),
    authDomain: env("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: env("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: env("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: env("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: env("VITE_FIREBASE_APP_ID"),
  };
}

export function hasFirebaseConfig(): boolean {
  const config = firebaseConfig();
  return Boolean(config.apiKey && config.projectId && config.appId);
}

let cachedApp: FirebaseApp | null = null;

export function initFirebase(): FirebaseApp {
  if (cachedApp) return cachedApp;
  const app = initializeApp(firebaseConfig());
  const debugToken = env("VITE_APPCHECK_DEBUG_TOKEN");
  const siteKey = env("VITE_RECAPTCHA_SITE_KEY");
  try {
    if (debugToken) {
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
    }
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    console.warn("App Check setup skipped", error);
  }
  cachedApp = app;
  return app;
}

export function buildModel(mode: WalkMode): GenerativeModel {
  const app = initFirebase();
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  return getGenerativeModel(ai, {
    mode: MODE_MAP[mode],
    onDeviceParams: {
      createOptions: {
        expectedInputs: [{ type: "image" }, { type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
      },
      promptOptions: { responseConstraint: FINDING_SCHEMA },
    },
    inCloudParams: {
      model: CLOUD_MODEL,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: FINDING_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  });
}

export async function warmDeviceModel(model: GenerativeModel, onProgress?: (value: number) => void): Promise<void> {
  await model.initializeDeviceModel(onProgress);
}

export type DeviceAvailability = "available" | "downloadable" | "downloading" | "unavailable" | "not_exposed" | string;

export async function deviceAvailability(): Promise<DeviceAvailability> {
  const api = (globalThis as { LanguageModel?: { availability?: (options?: unknown) => Promise<string> } }).LanguageModel;
  if (!api || typeof api.availability !== "function") return "not_exposed";
  try {
    return await api.availability({
      expectedInputs: [{ type: "image" }, { type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }],
    });
  } catch (error) {
    return `error:${(error as Error).name}`;
  }
}

function coerceFinding(raw: string): Finding | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<Finding>;
    const severity = (parsed.severity ?? "none") as Severity;
    return {
      targetPresent: Boolean(parsed.targetPresent),
      targetName: String(parsed.targetName ?? ""),
      defectType: String(parsed.defectType ?? "none"),
      severity,
      obscured: Boolean(parsed.obscured),
      note: String(parsed.note ?? ""),
    };
  } catch {
    return null;
  }
}

export interface InferenceOutcome {
  finding: Finding | null;
  raw: string;
  source: InferenceSource;
  latencyMs: number;
  error: string | null;
}

export async function inspectPhoto(
  model: GenerativeModel,
  photo: { base64: string; mimeType: string },
  itemLabel: string,
  expects: string,
  note: string,
): Promise<InferenceOutcome> {
  const prompt = buildPrompt(itemLabel, expects, note);
  const started = performance.now();
  try {
    const result = await model.generateContent([
      { type: "inlineData", inlineData: { mimeType: photo.mimeType, data: photo.base64 } },
      { type: "text", text: prompt },
    ]);
    const latencyMs = Math.round(performance.now() - started);
    const source = (result.response.inferenceSource ?? "unknown") as InferenceSource;
    const raw = result.response.text();
    return { finding: coerceFinding(raw), raw, source, latencyMs, error: null };
  } catch (error) {
    return {
      finding: null,
      raw: "",
      source: "unknown",
      latencyMs: Math.round(performance.now() - started),
      error: `${(error as Error).name}: ${(error as Error).message}`,
    };
  }
}
