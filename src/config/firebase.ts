import { initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

function env(key: string): string {
  return (import.meta.env[key] as string | undefined) ?? "";
}

function fromEnv(): FirebaseWebConfig {
  return {
    apiKey: env("VITE_FIREBASE_API_KEY"),
    authDomain: env("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: env("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: env("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: env("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: env("VITE_FIREBASE_APP_ID"),
  };
}

function decodeBase64Url(value: string): string {
  const normalised = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised + "===".slice((normalised.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isComplete(value: Partial<FirebaseWebConfig> | null): value is FirebaseWebConfig {
  return Boolean(value && value.apiKey && value.projectId && value.appId);
}

/**
 * A public demo build carries no Firebase values in the repository. It takes the
 * web app config from the URL fragment (`#config=<base64url json>`) or from a
 * page that sets `window.__WALKPROOF_CONFIG__`, keeps it in memory, and never
 * stores it. A build made with VITE_FIREBASE_* values uses those instead.
 */
function fromRuntime(): FirebaseWebConfig | null {
  const injected = (globalThis as { __WALKPROOF_CONFIG__?: Partial<FirebaseWebConfig> }).__WALKPROOF_CONFIG__;
  if (isComplete(injected ?? null)) return injected as FirebaseWebConfig;
  if (typeof location === "undefined") return null;
  try {
    const hash = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
    const encoded = new URLSearchParams(hash).get("config");
    if (!encoded) return null;
    const parsed = JSON.parse(decodeBase64Url(encoded)) as Partial<FirebaseWebConfig>;
    return isComplete(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function firebaseConfig(): FirebaseWebConfig {
  return fromRuntime() ?? fromEnv();
}

export function hasFirebaseConfig(): boolean {
  const config = firebaseConfig();
  return Boolean(config.apiKey && config.projectId && config.appId);
}

let cachedApp: FirebaseApp | null = null;

export function initFirebase(): FirebaseApp {
  if (cachedApp) return cachedApp;
  const app = initializeApp(firebaseConfig());
  try {
    const debugToken = env("VITE_APPCHECK_DEBUG_TOKEN");
    if (debugToken) {
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
    }
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(env("VITE_RECAPTCHA_SITE_KEY") || "walkproof-local-dev"),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    console.warn("App Check setup skipped", error);
  }
  cachedApp = app;
  return app;
}
