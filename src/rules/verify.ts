import { DEFECT_TYPE_VALUES, SEVERITY_VALUES, VERDICT_VALUES } from "../ai/schema";
import { judge } from "./judge";
import type { CloudAnswer, DefectType, Finding, InspectionItem, RulePack, Severity, Verdict } from "../types";

export interface Verification {
  accepted: boolean;
  reasons: string[];
  answer: CloudAnswer | null;
  /** The verdict the rule pack reaches from the cloud's own finding. */
  verdictFromRules: Verdict | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkShape(value: unknown, item: InspectionItem, pack: RulePack): string[] {
  const problems: string[] = [];
  if (!isRecord(value)) return ["the answer is not an object"];

  if (typeof value.targetPresent !== "boolean") problems.push("targetPresent is missing or not a boolean");
  if (typeof value.targetName !== "string" || value.targetName.trim() === "") problems.push("targetName is missing");
  if (typeof value.defectType !== "string" || !DEFECT_TYPE_VALUES.includes(value.defectType as DefectType)) {
    problems.push("defectType is not one of the pack's defect types");
  }
  if (typeof value.severity !== "string" || !SEVERITY_VALUES.includes(value.severity as Severity)) {
    problems.push("severity is not one of none, low, medium, high");
  }
  if (typeof value.obscured !== "boolean") problems.push("obscured is missing or not a boolean");
  if (typeof value.note !== "string") problems.push("note is missing");
  if (typeof value.clauseId !== "string" || value.clauseId.trim() === "") {
    problems.push("clauseId is missing");
  } else if (!pack.clauses.some((clause) => clause.id === value.clauseId)) {
    problems.push(`cited clause ${value.clauseId} is not in the rule pack`);
  } else if (!item.clauses.includes(value.clauseId)) {
    problems.push(`cited clause ${value.clauseId} does not apply to this item`);
  }
  if (typeof value.remedy !== "string" || value.remedy.trim().length < 4) {
    problems.push("remedy is missing or too short to act on");
  }
  if (typeof value.suggestedVerdict !== "string" || !VERDICT_VALUES.includes(value.suggestedVerdict as Verdict)) {
    problems.push("suggestedVerdict is missing or not a verdict");
  }
  return problems;
}

/**
 * G3: the device checks a cloud answer before it can change a record.
 *
 * 1. Every required field is present and of the right type.
 * 2. The cited clause exists in the pack and is one this item may cite.
 * 3. The answer does not contradict the on-device finding about presence.
 * 4. The rule pack, run on the cloud's own finding, agrees with the verdict the
 *    cloud suggested. A model may supply evidence; it may not overrule the pack.
 * 5. A non-unknown on-device verdict is never replaced by a different one.
 *
 * A failed check is not an error state to hide: the record is marked
 * `rejected_unsupported` and goes to a person.
 */
export function verifyCloudAnswer(
  raw: unknown,
  item: InspectionItem,
  pack: RulePack,
  deviceVerdict: Verdict,
  deviceFinding: Finding | null,
  now = new Date(),
): Verification {
  const shape = checkShape(raw, item, pack);
  if (shape.length || !isRecord(raw)) {
    return { accepted: false, reasons: shape.length ? shape : ["the answer is not an object"], answer: null, verdictFromRules: null };
  }

  const answer: CloudAnswer = {
    targetPresent: raw.targetPresent as boolean,
    targetName: String(raw.targetName),
    defectType: raw.defectType as DefectType,
    severity: raw.severity as Severity,
    obscured: raw.obscured as boolean,
    note: String(raw.note),
    clauseId: String(raw.clauseId),
    remedy: String(raw.remedy),
    suggestedVerdict: raw.suggestedVerdict as Verdict,
  };

  const reasons: string[] = [];

  if (deviceFinding && answer.targetPresent !== deviceFinding.targetPresent) {
    reasons.push("the answer contradicts the on-device finding about whether the item was present");
  }

  const rejudged = judge(item, answer, now);
  if (rejudged.verdict !== "unknown" && answer.suggestedVerdict !== rejudged.verdict) {
    reasons.push(
      `the answer suggests ${answer.suggestedVerdict} but the rule pack reaches ${rejudged.verdict} from the same finding`,
    );
  }
  if (deviceVerdict !== "unknown" && rejudged.verdict !== deviceVerdict) {
    reasons.push(`the answer would change a settled on-device verdict from ${deviceVerdict} to ${rejudged.verdict}`);
  }

  if (reasons.length) {
    return { accepted: false, reasons, answer, verdictFromRules: rejudged.verdict };
  }
  return { accepted: true, reasons: [], answer, verdictFromRules: rejudged.verdict };
}
