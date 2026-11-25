import { initializeApp, type FirebaseApp } from "firebase/app";
import { CustomProvider, initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

/**
 * Where the web app config came from. A build made with VITE_FIREBASE_* values
 * says `build`; the published page says `runtime` once it has read the config
 * fragment; neither says `none`.
 */
export type FirebaseConfigSource = "build" | "runtime" | "none";

export interface AppCheckStatus {
  /** `on` means App Check was initialised; it does not mean a token was fetched yet. */
  state: "on" | "off" | "failed" | "not started";
  detail: string;
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

function fragmentParams(): URLSearchParams | null {
  if (typeof location === "undefined") return null;
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : location.hash;
  return new URLSearchParams(hash);
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
  try {
    const encoded = fragmentParams()?.get("config");
    if (!encoded) return null;
    const parsed = JSON.parse(decodeBase64Url(encoded)) as Partial<FirebaseWebConfig>;
    return isComplete(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

let configSource: FirebaseConfigSource = "none";

export function firebaseConfig(): FirebaseWebConfig {
  const runtime = fromRuntime();
  if (runtime) {
    configSource = "runtime";
    return runtime;
  }
  const build = fromEnv();
  configSource = isComplete(build) ? "build" : "none";
  return build;
}

export function firebaseConfigSource(): FirebaseConfigSource {
  return configSource;
}

export function hasFirebaseConfig(): boolean {
  const config = firebaseConfig();
  return Boolean(config.apiKey && config.projectId && config.appId);
}

/**
 * App Check values. A build takes them from VITE_RECAPTCHA_SITE_KEY and
 * VITE_APPCHECK_DEBUG_TOKEN; a page that received its web config in the fragment
 * may carry the same two as `#sitekey=` and `#debugtoken=`, which is how a
 * reviewer runs a configured build without a repository holding either value.
 */
function appCheckValues(): { siteKey: string; debugToken: string } {
  let siteKey = env("VITE_RECAPTCHA_SITE_KEY");
  let debugToken = env("VITE_APPCHECK_DEBUG_TOKEN");
  try {
    const params = fragmentParams();
    siteKey = params?.get("sitekey") || siteKey;
    debugToken = params?.get("debugtoken") || debugToken;
  } catch {
    /* a fragment that cannot be read leaves the build values in place */
  }
  return { siteKey, debugToken };
}

let appCheck: AppCheckStatus = {
  state: "not started",
  detail: "App Check has not been initialised in this session.",
};

export function appCheckStatus(): AppCheckStatus {
  return appCheck;
}

let cachedApp: FirebaseApp | null = null;

/**
 * App Check is required by Firebase AI Logic, so its state is reported rather
 * than swallowed: the screen shows whether it started, and if not, why. There is
 * no placeholder site key.
 *
 * Three cases, in order:
 * - a reCAPTCHA Enterprise site key: the attesting provider the rules name.
 * - a debug token and no site key: App Check runs on the debug token, which the
 *   rules accept in a submission. The SDK exchanges that token itself, so the
 *   provider passed here is never asked for one; it says so if it ever is.
 * - neither: App Check stays off and the page says so. The cloud call then
 *   fails loudly if the project enforces App Check, instead of looking healthy.
 */
export function initFirebase(): FirebaseApp {
  if (cachedApp) return cachedApp;
  const app = initializeApp(firebaseConfig());
  const { siteKey, debugToken } = appCheckValues();

  if (!siteKey && !debugToken) {
    appCheck = {
      state: "off",
      detail:
        "No reCAPTCHA Enterprise site key and no debug token, so App Check was not started. Firebase AI Logic calls are made without it and the project refuses them if it enforces App Check.",
    };
    cachedApp = app;
    return app;
  }

  try {
    if (debugToken) {
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
    }
    const provider = siteKey
      ? new ReCaptchaEnterpriseProvider(siteKey)
      : new CustomProvider({
          getToken: async () => {
            throw new Error(
              "App Check is running on its debug token in this build; the custom provider is only here to satisfy the SDK.",
            );
          },
        });
    initializeAppCheck(app, { provider, isTokenAutoRefreshEnabled: true });
    appCheck = {
      state: "on",
      detail: siteKey
        ? debugToken
          ? "App Check started with ReCaptchaEnterpriseProvider and the debug token supplied for this session."
          : "App Check started with ReCaptchaEnterpriseProvider."
        : "App Check started in debug mode on the debug token supplied for this session, which the rules accept in a submission.",
    };
  } catch (error) {
    appCheck = {
      state: "failed",
      detail: `App Check could not start: ${(error as Error).message}`,
    };
  }
  cachedApp = app;
  return app;
}
