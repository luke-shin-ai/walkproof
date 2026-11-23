import { extractJsonObject } from "./ai/schema";
import { trySpend, type KeyValueStore } from "./budget";
import { judgeNote } from "./rules/evidence";
import { addDays } from "./rules/judge";
import { buildCloudPayload, structureNote } from "./rules/structure";
import { verifyCloudAnswer } from "./rules/verify";
import type {
  CloudCheck,
  DeviceStructuring,
  Finding,
  InferenceSource,
  InspectionItem,
  Observation,
  RulePack,
  Verdict,
} from "./types";

export interface DeviceStepResult {
  finding: Finding | null;
  latencyMs: number;
  error: string | null;
}

export interface CloudStepResult {
  raw: string;
  latencyMs: number;
  error: string | null;
  model: string;
  modelFallback: boolean;
  source: string;
}

export type Stage = "structure" | "judge" | "cloud" | "verify" | "done";

export interface PipelineDeps {
  /** Present only when the on-device model exists and was prepared. */
  structureOnDevice?: (item: InspectionItem, note: string) => Promise<DeviceStepResult>;
  /** Present only when Firebase is configured and the device is online. */
  classify?: (item: InspectionItem, payload: object) => Promise<CloudStepResult>;
  online: boolean;
  budgetStore: KeyValueStore | null;
  today: string;
  now?: Date;
  makeId?: () => string;
  /** Told at each step, so the screen can say what the device is doing. */
  onStage?: (stage: Stage) => void;
}

export interface PipelineInput {
  item: InspectionItem;
  note: string;
  photoName: string;
  photoBytes: number;
  photoDataUrl: string | null;
  pack: RulePack;
  createdAt?: string;
}

/** The field screen shows a readable reason; the raw error stays in the record. */
export function shortError(message: string): string {
  if (/deadline|did not answer|timeout|timed out/i.test(message)) return "the cloud did not answer in time";
  if (/quota|429|rate limit|too many requests|exhausted/i.test(message)) return "the cloud rate limit was reached";
  if (/permission|403|api key|not authorized/i.test(message)) return "the project refused the request";
  if (/network|fetch|offline|unavailable/i.test(message)) return "the network request failed";
  const trimmed = message.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  return trimmed.slice(0, 140) || "the cloud call failed";
}

function newId(itemId: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${itemId}-${random}`;
}

/**
 * One item through the hybrid boundary:
 *
 *   note -> on-device model (or the local rules) -> deterministic verdict
 *   unknown only -> budgeted cloud call with a typed summary
 *   cloud answer -> on-device verification -> record or rejected_unsupported
 *
 * The photo never leaves the device and is never passed to a model.
 */
export async function processItem(input: PipelineInput, deps: PipelineDeps): Promise<Observation> {
  const now = deps.now ?? new Date();
  const item = input.item;
  const reasons: string[] = [];

  let deviceLatencyMs = 0;
  let deviceSource: DeviceStructuring = "none";
  let finding: Finding | null = null;

  deps.onStage?.("structure");

  if (input.note.trim() && deps.structureOnDevice) {
    const result = await deps.structureOnDevice(item, input.note);
    deviceLatencyMs = result.latencyMs;
    if (result.finding) {
      finding = result.finding;
      deviceSource = "on_device";
    } else if (result.error) {
      reasons.push(`the on-device model did not answer (${result.error}), so the rule parser read the note`);
    }
  }

  if (!finding) {
    const localStarted = performance.now();
    const local = structureNote(item, input.note);
    if (local) {
      finding = local;
      deviceSource = "local_rules";
      deviceLatencyMs += Math.max(1, Math.round(performance.now() - localStarted));
    }
  }

  if (!finding) {
    reasons.push("no note to structure: take the photo again or write one line");
  }

  deps.onStage?.("judge");
  const decision = judgeNote(item, input.note, finding, now);
  finding = decision.finding;
  const judgement = decision.judgement;
  let verdict: Verdict = decision.verdict;
  let source: InferenceSource = "on_device";
  let clauseIds = judgement.clauseIds;
  let latencyMs = deviceLatencyMs;
  const collected: string[] = [...decision.reasons, ...judgement.reasons, ...reasons];

  let cloud: CloudCheck | null = null;

  if (verdict === "unknown" && finding && deps.classify) {
    if (!deps.online) {
      collected.push("offline: the item waits for a cloud check when the device has signal");
    } else {
      const payload = buildCloudPayload(item, finding, input.pack);
      const spend = trySpend(deps.budgetStore, deps.today, input.pack.cloudDailyBudget);
      if (!spend.ok) {
        collected.push(
          `cloud budget for today is used up (${spend.state.spent} of ${spend.state.limit}), the item waits in the queue`,
        );
      } else {
        const parsedPayload = JSON.parse(payload.json) as object;
        deps.onStage?.("cloud");
        const result = await deps.classify(item, parsedPayload);
        deps.onStage?.("verify");
        latencyMs += result.latencyMs;

        if (result.error) {
          cloud = {
            model: result.model,
            modelFallback: result.modelFallback,
            payload: payload.json,
            payloadBytes: payload.bytes,
            accepted: false,
            reasons: [shortError(result.error)],
            answer: null,
            latencyMs: result.latencyMs,
            error: result.error,
            budgetUsed: spend.state.spent,
            budgetLimit: spend.state.limit,
          };
          collected.push(`cloud check failed: ${shortError(result.error)}`);
        } else {
          const extracted = extractJsonObject(result.raw);
          const verification = verifyCloudAnswer(extracted.value, item, input.pack, verdict, finding, now, input.note);
          cloud = {
            model: result.model,
            modelFallback: result.modelFallback,
            payload: payload.json,
            payloadBytes: payload.bytes,
            accepted: verification.accepted,
            reasons: extracted.problem ? [extracted.problem, ...verification.reasons] : verification.reasons,
            answer: verification.answer,
            latencyMs: result.latencyMs,
            error: null,
            budgetUsed: spend.state.spent,
            budgetLimit: spend.state.limit,
          };

          if (verification.accepted && verification.answer) {
            verdict = verification.verdictFromRules ?? verdict;
            source = "in_cloud";
            clauseIds = verification.answer.clauseId ? [verification.answer.clauseId] : clauseIds;
            collected.push(`cloud answer accepted: ${verification.answer.remedy}`);
          } else {
            source = "rejected_unsupported";
            collected.push("cloud answer rejected, a person has to look at this item");
            for (const reason of cloud.reasons) collected.push(`rejected: ${reason}`);
          }
        }
      }
    }
  }

  const reviewRequired = verdict === "unknown" || source === "rejected_unsupported";
  deps.onStage?.("done");

  return {
    id: deps.makeId ? deps.makeId() : newId(item.id),
    itemId: item.id,
    label: item.label,
    noteCheck: {
      action: decision.evidence.action,
      hold: decision.evidence.hold,
      answerVerdict: decision.answerVerdict,
      reasons: decision.reasons,
    },
    zone: item.zone,
    photoName: input.photoName,
    photoBytes: input.photoBytes,
    photoDataUrl: input.photoDataUrl,
    note: input.note.trim(),
    finding,
    verdict,
    reasons: collected,
    source,
    deviceSource,
    latencyMs,
    deviceLatencyMs,
    cloud,
    clauseIds,
    fixBy: verdict === "fail" ? (judgement.fixBy ?? addDays(now, item.fixDays)) : null,
    reviewRequired,
    createdAt: input.createdAt ?? now.toISOString(),
    packVersion: input.pack.version,
  };
}
