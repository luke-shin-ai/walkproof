import type { FirebaseApp } from "firebase/app";
import { fetchAndActivate, getRemoteConfig, getString } from "firebase/remote-config";
import { DEFAULT_PACK, resolvePack, type PackOrigin, type RulePack } from "../rules/pack";

/** Remote Config parameter that carries the checklist, clauses and budget. */
export const PACK_PARAM = "rule_pack";
export const PACK_CACHE_KEY = "walkproof.rulePackCache.v1";
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface CachedPack {
  text: string;
  savedAt: number;
}

export interface PackLoad {
  pack: RulePack;
  origin: PackOrigin;
  detail: string;
  remoteNote: string;
  fetchedAt: string;
}

function readCache(): CachedPack | null {
  try {
    const raw = localStorage.getItem(PACK_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedPack>;
    if (typeof parsed.text !== "string" || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > CACHE_MAX_AGE_MS) return null;
    return { text: parsed.text, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

function writeCache(pack: RulePack): void {
  try {
    localStorage.setItem(PACK_CACHE_KEY, JSON.stringify({ text: JSON.stringify(pack), savedAt: Date.now() }));
  } catch {
    // A full or blocked store only costs the cache, not the walkthrough.
  }
}

export function cachedPackText(): string | null {
  return readCache()?.text ?? null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`remote config did not answer in ${ms} ms`)), ms);
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

/**
 * Fetches and activates the rule pack, then falls back in order: remote, the
 * last valid pack kept on this device, the built-in pack. The walkthrough never
 * waits on the network to have a checklist.
 */
export async function loadRulePack(app: FirebaseApp | null, timeoutMs = 8000): Promise<PackLoad> {
  let remoteText: string | null = null;
  let remoteNote = "Firebase is not configured, so the built-in pack is used";

  if (app) {
    try {
      const remoteConfig = getRemoteConfig(app);
      remoteConfig.settings.minimumFetchIntervalMillis = 5 * 60 * 1000;
      await withTimeout(fetchAndActivate(remoteConfig), timeoutMs);
      const value = getString(remoteConfig, PACK_PARAM);
      remoteText = value && value.trim() ? value : null;
      remoteNote = remoteText ? "remote pack fetched and activated" : "the project has no published rule_pack value";
    } catch (error) {
      remoteNote = `remote fetch failed: ${(error as Error).message}`;
    }
  }

  const resolution = resolvePack({ remoteText, cachedText: cachedPackText() });
  if (resolution.origin === "remote") writeCache(resolution.pack);

  return {
    pack: resolution.pack,
    origin: resolution.origin,
    detail: resolution.detail,
    remoteNote,
    fetchedAt: new Date().toISOString(),
  };
}

export { DEFAULT_PACK };
