import { extractJsonObject } from "../ai/schema";
import type { KeyValueStore } from "../budget";
import { processItem, shortError, type CloudStepResult, type DeviceStepResult } from "../pipeline";
import { judgeNote } from "../rules/evidence";
import { DEFAULT_PACK } from "../rules/pack";
import { redactForCloud, structureNote } from "../rules/structure";
import { verifyCloudAnswer } from "../rules/verify";
import type { CloudAnswer, Finding, InspectionItem, RulePack, Verdict } from "../types";
import { BENCH_SCENARIOS, type BenchExpected, type BenchScenario } from "./scenarios";

export interface BenchPhoto {
  name: string;
  bytes: number;
  mime: string;
  dataUrl: string;
}

export interface CloudPhotoResult {
  raw: string;
  latencyMs: number;
  error: string | null;
  model: string;
  /** Bytes of the photo as it sat on the device, and bytes actually put on the wire. */
  photoBytes: number;
  requestBytes: number;
}

export interface BenchDeps {
  pack: RulePack;
  now: Date;
  loadPhoto: (name: string) => Promise<BenchPhoto>;
  structureOnDevice?: (item: InspectionItem, note: string) => Promise<DeviceStepResult>;
  classify?: (item: InspectionItem, payload: object) => Promise<CloudStepResult>;
  classifyWithPhoto?: (item: InspectionItem, note: string, photo: BenchPhoto) => Promise<CloudPhotoResult>;
  /** Pause between two cloud calls, so the free tier is not hit back to back. */
  gapMs: number;
  /** How many items the cloud only baseline walks, because a free key cannot carry forty calls. */
  cloudOnlyCount: number;
  onProgress?: (text: string) => void;
}

export type BenchArm = "device" | "hybrid" | "cloud";

export interface ItemResult {
  scenario: string;
  itemId: string;
  kind: BenchScenario["kind"];
  expected: BenchExpected;
  verdict: Verdict;
  recorded: BenchExpected;
  /** The verdict the model answer alone would have produced, before the cross check. */
  answerVerdict: Verdict;
  /** What the device did with the answer: kept it, amended it, or held the item open. */
  evidence: "kept" | "amended" | "held_inconclusive" | "held_misread";
  evidenceReasons: string[];
  source: string;
  deviceSource: string;
  latencyMs: number;
  cloudCalled: boolean;
  cloudModel: string | null;
  cloudError: string | null;
  cloudSkipped: boolean;
  photoBytesSent: number;
  payloadBytes: number;
  gate: "accepted" | "refused" | "none";
  gateReasons: string[];
  answer: string | null;
  /** True when the accepted answer let the rule pack settle pass or fail. */
  settledByCloud: boolean;
}

export interface ArmMetrics {
  arm: BenchArm;
  items: number;
  totalMs: number;
  medianMs: number;
  p90Ms: number;
  cloudCalls: number;
  cloudErrors: number;
  cloudSkipped: number;
  cloudPhotoBytes: number;
  cloudRequestBytes: number;
  decidedWithoutCloud: number;
  offlineShare: number;
  onDeviceStructuring: number;
  verdicts: { pass: number; fail: number; review: number };
  agreed: number;
  agreement: number;
  /** Agreement when the model answer is taken as it came back, with no cross check. */
  answerAgreed: number;
  answerAgreement: number;
  heldByNote: number;
  amendedByNote: number;
  reviewExpected: number;
  settledOnReview: number;
  refused: number;
  refusedOnReview: number;
  captureRate: number | null;
  wrongSettled: number;
  /** Items an accepted cloud answer let the rule pack settle. */
  settledByCloud: number;
  /** Of those, how many agree with the human key. */
  settledByCloudCorrect: number;
  notes: string[];
}

export interface ArmResult {
  metrics: ArmMetrics;
  items: ItemResult[];
}

export function recordedOf(verdict: Verdict): BenchExpected {
  return verdict === "unknown" ? "review" : verdict;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export function percentile(values: number[], share: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(share * sorted.length) - 1));
  return sorted[index];
}

export function inMemoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

export function isQuotaError(message: string): boolean {
  return /quota|RESOURCE_EXHAUSTED|429|rate limit|too many requests|exhausted/i.test(message);
}

/**
 * A spent day is different from a short per minute limit: the first one will not
 * clear during this walk, so the rest of the queue is left for tomorrow instead
 * of spending more calls on it.
 */
export function isDailyQuota(message: string): boolean {
  return /per day|per-day|daily|requests per day/i.test(message);
}

/** A finding the rule pack can judge, from the device model, else from the built-in parser. */
function deviceFinding(item: InspectionItem, note: string, result?: DeviceStepResult): { finding: Finding | null; source: string; latencyMs: number } {
  if (result?.finding) return { finding: result.finding, source: "on_device", latencyMs: result.latencyMs };
  const local = structureNote(item, note);
  if (local) return { finding: local, source: "local_rules", latencyMs: Math.max(1, result?.latencyMs ?? 0) };
  return { finding: null, source: "none", latencyMs: result?.latencyMs ?? 0 };
}

function metricsOf(arm: BenchArm, items: ItemResult[], notes: string[]): ArmMetrics {
  const latencies = items.map((entry) => entry.latencyMs).filter((value) => value > 0);
  const verdicts = { pass: 0, fail: 0, review: 0 };
  for (const entry of items) verdicts[entry.recorded] += 1;

  const reviewItems = items.filter((entry) => entry.expected === "review");
  const settledOnReview = reviewItems.filter((entry) => (entry.gate === "accepted" || entry.gate === "none") && entry.verdict !== "unknown").length;
  const refusedOnReview = reviewItems.filter((entry) => entry.gate === "refused").length;
  const answeredOnReview = settledOnReview + refusedOnReview;

  const cloudCalls = items.filter((entry) => entry.cloudCalled && !entry.cloudSkipped).length;
  const agreed = items.filter((entry) => entry.recorded === entry.expected).length;
  const answerAgreed = items.filter((entry) => recordedOf(entry.answerVerdict) === entry.expected).length;

  return {
    arm,
    items: items.length,
    totalMs: items.reduce((sum, entry) => sum + entry.latencyMs, 0),
    medianMs: median(latencies),
    p90Ms: percentile(latencies, 0.9),
    cloudCalls,
    cloudErrors: items.filter((entry) => Boolean(entry.cloudError) && !entry.cloudSkipped).length,
    cloudSkipped: items.filter((entry) => entry.cloudSkipped).length,
    cloudPhotoBytes: items.reduce((sum, entry) => sum + entry.photoBytesSent, 0),
    cloudRequestBytes: items.reduce((sum, entry) => sum + entry.payloadBytes, 0),
    decidedWithoutCloud: items.filter((entry) => !entry.cloudCalled || entry.cloudSkipped).length,
    offlineShare: items.length ? Math.round((items.filter((entry) => !entry.cloudCalled || entry.cloudSkipped).length / items.length) * 100) : 0,
    onDeviceStructuring: items.filter((entry) => entry.deviceSource === "on_device").length,
    verdicts,
    agreed,
    agreement: items.length ? Math.round((agreed / items.length) * 100) : 0,
    answerAgreed,
    answerAgreement: items.length ? Math.round((answerAgreed / items.length) * 100) : 0,
    heldByNote: items.filter((entry) => entry.evidence.startsWith("held")).length,
    amendedByNote: items.filter((entry) => entry.evidence === "amended").length,
    reviewExpected: reviewItems.length,
    settledOnReview,
    refused: items.filter((entry) => entry.gate === "refused").length,
    refusedOnReview,
    captureRate: answeredOnReview ? Math.round((refusedOnReview / answeredOnReview) * 100) : null,
    wrongSettled: items.filter((entry) => entry.gate === "accepted" && entry.recorded !== entry.expected).length,
    settledByCloud: items.filter((entry) => entry.settledByCloud).length,
    settledByCloudCorrect: items.filter((entry) => entry.settledByCloud && entry.recorded === entry.expected).length,
    notes,
  };
}

/** Arm 1: the device alone. On-device model first, built-in parser when the model cannot answer. */
export async function runDeviceArm(deps: BenchDeps, scenarios = BENCH_SCENARIOS): Promise<ArmResult> {
  const items: ItemResult[] = [];
  const photos = new Map<string, BenchPhoto>();
  for (const scenario of scenarios) {
    const item = deps.pack.items.find((entry) => entry.id === scenario.itemId);
    if (!item) throw new Error(`no checklist item ${scenario.itemId}`);
    if (!photos.has(scenario.photo)) photos.set(scenario.photo, await deps.loadPhoto(scenario.photo));
    deps.onProgress?.(`device ${scenario.id} ${item.label}`);
    const started = performance.now();
    let deviceResult: DeviceStepResult | undefined;
    if (deps.structureOnDevice) deviceResult = await deps.structureOnDevice(item, scenario.note);
    const { finding, source } = deviceFinding(item, scenario.note, deviceResult);
    const decision = judgeNote(item, scenario.note, finding, deps.now);
    items.push({
      scenario: scenario.id,
      itemId: scenario.itemId,
      kind: scenario.kind,
      expected: scenario.expected,
      verdict: decision.verdict,
      recorded: recordedOf(decision.verdict),
      answerVerdict: decision.answerVerdict,
      evidence: decision.evidence.hold === "none" ? (decision.evidence.action === "amended" ? "amended" : "kept") : decision.evidence.hold === "inconclusive" ? "held_inconclusive" : "held_misread",
      evidenceReasons: decision.reasons,
      source: "on_device",
      deviceSource: source,
      latencyMs: Math.round(performance.now() - started),
      cloudCalled: false,
      cloudModel: null,
      cloudError: null,
      cloudSkipped: false,
      photoBytesSent: 0,
      payloadBytes: 0,
      gate: "none",
      gateReasons: [],
      answer: finding ? `${finding.targetPresent ? "present" : "absent"} / ${finding.defectType} / ${finding.severity}${finding.obscured ? " / obscured" : ""}` : null,
      settledByCloud: false,
    });
  }
  return { metrics: metricsOf("device", items, []), items };
}

interface CloudCallState {
  streak: number;
  skipped: number;
  stop: boolean;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Arm 2: WalkProof as shipped. The pipeline decides what reaches the cloud. */
export async function runHybridArm(deps: BenchDeps, scenarios = BENCH_SCENARIOS): Promise<ArmResult> {
  const items: ItemResult[] = [];
  const photos = new Map<string, BenchPhoto>();
  const budget = inMemoryStore();
  const today = deps.now.toISOString().slice(0, 10);
  const state: CloudCallState = { streak: 0, skipped: 0, stop: false };
  let calls = 0;
  const notes: string[] = [];

  for (const scenario of scenarios) {
    const item = deps.pack.items.find((entry) => entry.id === scenario.itemId);
    if (!item) throw new Error(`no checklist item ${scenario.itemId}`);
    if (!photos.has(scenario.photo)) photos.set(scenario.photo, await deps.loadPhoto(scenario.photo));
    const photo = photos.get(scenario.photo) as BenchPhoto;
    deps.onProgress?.(`hybrid ${scenario.id} ${item.label}`);

    let cloudCalled = false;
    let cloudError: string | null = null;
    let cloudSkipped = false;
    let cloudModel: string | null = null;
    const classify = deps.classify
      ? async (target: InspectionItem, payload: object): Promise<CloudStepResult> => {
          if (state.stop) {
            state.skipped += 1;
            cloudSkipped = true;
            return {
              raw: "",
              latencyMs: 0,
              error: "skipped: the free daily cloud quota was already spent on this key",
              model: "none",
              modelFallback: false,
              source: "skipped",
            };
          }
          cloudCalled = true;
          /* Spaced out, so a per minute limit is not hit by a burst. */
          if (calls > 0) await pause(deps.gapMs);
          calls += 1;
          const result = await deps.classify!(target, payload);
          cloudModel = result.model;
          if (result.error && isDailyQuota(result.error)) {
            state.stop = true;
            notes.push(`the free daily cloud quota ran out: ${shortError(result.error)}`);
          } else if (result.error && isQuotaError(result.error)) {
            state.streak += 1;
            if (state.streak >= 3) {
              state.stop = true;
              notes.push(`cloud stopped after ${state.streak} rate limit answers: ${shortError(result.error)}`);
            }
          } else {
            state.streak = 0;
          }
          if (result.error) cloudError = result.error;
          return result;
        }
      : undefined;

    const observation = await processItem(
      {
        item,
        note: scenario.note,
        photoName: scenario.photo,
        photoBytes: photo.bytes,
        photoDataUrl: null,
        pack: deps.pack,
      },
      {
        structureOnDevice: deps.structureOnDevice,
        classify: deps.classify ? classify : undefined,
        online: true,
        budgetStore: budget,
        today,
        now: deps.now,
      },
    );

    const check = observation.noteCheck ?? { action: "kept" as const, hold: "none" as const, answerVerdict: observation.verdict, reasons: [] };
    items.push({
      scenario: scenario.id,
      itemId: scenario.itemId,
      kind: scenario.kind,
      expected: scenario.expected,
      verdict: observation.verdict,
      recorded: recordedOf(observation.verdict),
      answerVerdict: check.answerVerdict,
      evidence: check.hold === "none" ? (check.action === "amended" ? "amended" : "kept") : check.hold === "inconclusive" ? "held_inconclusive" : "held_misread",
      evidenceReasons: check.reasons,
      source: observation.source,
      deviceSource: observation.deviceSource,
      latencyMs: observation.latencyMs,
      cloudCalled,
      cloudModel,
      cloudError,
      cloudSkipped,
      photoBytesSent: 0,
      payloadBytes: observation.cloud?.payloadBytes ?? 0,
      gate: observation.cloud ? (observation.cloud.accepted ? "accepted" : "refused") : "none",
      gateReasons: observation.cloud?.reasons ?? [],
      answer: observation.cloud?.answer ? `${observation.cloud.answer.defectType} / ${observation.cloud.answer.severity} / ${observation.cloud.answer.suggestedVerdict} / ${observation.cloud.answer.clauseId}` : null,
      settledByCloud: observation.cloud?.settled ?? false,
    });
  }

  const metrics = metricsOf("hybrid", items, notes);
  metrics.cloudPhotoBytes = 0;
  return { metrics, items };
}

/**
 * Arm 3: the baseline a team builds first. Every item goes to the cloud, photo
 * attached and note verbatim, and the same verification gate runs on the answer.
 */
export async function runCloudOnlyArm(deps: BenchDeps, scenarios = BENCH_SCENARIOS.slice(0, 10)): Promise<ArmResult> {
  const items: ItemResult[] = [];
  const notes: string[] = [];
  let streak = 0;
  let stopped = false;

  for (const scenario of scenarios) {
    const item = deps.pack.items.find((entry) => entry.id === scenario.itemId);
    if (!item) throw new Error(`no checklist item ${scenario.itemId}`);
    deps.onProgress?.(`cloud ${scenario.id} ${item.label}`);
    const photo = await deps.loadPhoto(scenario.photo);
    const started = performance.now();

    if (stopped || !deps.classifyWithPhoto) {
      items.push({
        scenario: scenario.id,
        itemId: scenario.itemId,
        kind: scenario.kind,
        expected: scenario.expected,
        verdict: "unknown",
        recorded: "review",
        answerVerdict: "unknown",
        evidence: "kept",
        evidenceReasons: [],
        source: "skipped",
        deviceSource: "none",
        latencyMs: Math.round(performance.now() - started),
        cloudCalled: false,
        cloudModel: null,
        cloudError: stopped ? "skipped: the free daily cloud quota was already spent on this key" : "no cloud function",
        cloudSkipped: true,
        photoBytesSent: 0,
        payloadBytes: 0,
        gate: "none",
        gateReasons: [],
        answer: null,
        settledByCloud: false,
      });
      continue;
    }

    if (items.length) await pause(deps.gapMs);
    const payload = { itemId: item.id, item: item.label, zone: item.zone, note: redactForCloud(scenario.note, item), noteVerbatim: scenario.note, allowedClauseIds: item.clauses, photo: "attached" };
    const result = await deps.classifyWithPhoto(item, scenario.note, photo);
    const latencyMs = result.error ? result.latencyMs : Math.round(performance.now() - started);

    let gate: ItemResult["gate"] = "none";
    let gateReasons: string[] = [];
    let verdict: Verdict = "unknown";
    let answerText: string | null = null;
    let cloudError: string | null = result.error;
    void payload;

    if (result.error) {
      if (isDailyQuota(result.error)) {
        stopped = true;
        notes.push(`the free daily cloud quota ran out: ${shortError(result.error)}`);
      } else if (isQuotaError(result.error)) {
        streak += 1;
        if (streak >= 3) {
          stopped = true;
          notes.push(`cloud stopped after ${streak} rate limit answers: ${shortError(result.error)}`);
        }
      } else {
        streak = 0;
      }
    } else {
      streak = 0;
      const extracted = extractJsonObject(result.raw);
      const verification = verifyCloudAnswer(extracted.value, item, deps.pack, "unknown", null, deps.now, scenario.note);
      gate = verification.accepted ? "accepted" : "refused";
      gateReasons = extracted.problem ? [extracted.problem, ...verification.reasons] : verification.reasons;
      const answer: CloudAnswer | null = verification.answer;
      answerText = answer ? `${answer.defectType} / ${answer.severity} / ${answer.suggestedVerdict} / ${answer.clauseId}` : null;
      verdict = verification.accepted ? (verification.verdictFromRules ?? answer?.suggestedVerdict ?? "unknown") : "unknown";
      cloudError = null;
    }

    items.push({
      scenario: scenario.id,
      itemId: scenario.itemId,
      kind: scenario.kind,
      expected: scenario.expected,
      verdict,
      recorded: recordedOf(verdict),
      answerVerdict: verdict,
      evidence: "kept",
      evidenceReasons: [],
      source: gate === "refused" ? "rejected_unsupported" : gate === "accepted" ? "in_cloud" : "unknown",
      deviceSource: "none",
      latencyMs,
      cloudCalled: !result.error,
      cloudModel: result.model,
      cloudError,
      cloudSkipped: false,
      photoBytesSent: result.error ? 0 : result.photoBytes,
      payloadBytes: result.error ? 0 : result.requestBytes,
      gate,
      gateReasons,
      answer: answerText,
      settledByCloud: gate === "accepted" && verdict !== "unknown",
    });
  }

  return { metrics: metricsOf("cloud", items, notes), items };
}

export const DEFAULT_DEMO_PACK = DEFAULT_PACK;
