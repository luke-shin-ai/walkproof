import { DEFECT_TYPE_VALUES, SEVERITY_VALUES, VERDICT_VALUES } from "../ai/schema";
import { crossCheckNote, noteEvidence } from "./evidence";
import { judge } from "./judge";
import type { CloudAnswer, DefectType, Finding, InspectionItem, RulePack, Severity, Verdict } from "../types";

export interface Verification {
  accepted: boolean;
  reasons: string[];
  answer: CloudAnswer | null;
  /**
   * The finding the rule pack judged. It is the cloud's own finding, narrowed
   * from the inspector's line where the line supports the change, so the record
   * carries the evidence the verdict was produced from.
   */
  finding: Finding | null;
  /** The verdict the rule pack reaches from that finding. */
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
 * G3: the device checks a cloud answer before it can change a record. Seven
 * checks, all of them reachable from the product path:
 *
 * 1. Every required field is present and of the right type.
 * 2. The cited clause exists in the pack.
 * 3. The cited clause is one this item may cite.
 * 4. The answer does not contradict the on-device finding about presence, when
 *    that finding is one the device still trusts.
 * 5. The rule pack, run on the cloud's own finding, agrees with the verdict the
 *    cloud suggested. A model may supply evidence; it may not overrule the pack.
 * 6. A line that says the observation was not conclusive cannot be settled by a
 *    model that reads the same line. An answer that turns a hedge into a verdict
 *    is refused.
 * 7. The line itself carries the answer. The same cross check the device applies
 *    to its own reading (`crossCheckNote`) is applied to the cloud's finding: an
 *    absence claim the line does not make, or a defect with no severity that the
 *    line does not name, is refused instead of recorded.
 *
 * A guard sits beside them: an answer may not replace a settled on-device
 * verdict. The app asks the cloud only about items it has not settled, so that
 * guard is reached by a caller or a test, not by the product path.
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
  note = "",
): Verification {
  const shape = checkShape(raw, item, pack);
  if (shape.length || !isRecord(raw)) {
    return {
      accepted: false,
      reasons: shape.length ? shape : ["the answer is not an object"],
      answer: null,
      finding: null,
      verdictFromRules: null,
    };
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

  if (note.trim()) {
    const evidence = noteEvidence(item, note);
    if (evidence.marks.length && rejudged.verdict !== "unknown") {
      reasons.push(
        `the answer settles the item at ${rejudged.verdict} while the line says the observation was not conclusive (${evidence.marks.join(", ")})`,
      );
    }

    /* The line has the last word on what the answer may claim. The device runs
       the same check on its own reading, so a cloud answer is held to it too. */
    const carried = crossCheckNote(item, note, answer);
    if (carried.hold === "misread") {
      reasons.push(...carried.reasons.map((reason) => `the line does not carry the answer: ${reason}`));
    }
  }

  if (reasons.length) {
    return { accepted: false, reasons, answer, finding: null, verdictFromRules: rejudged.verdict };
  }

  /* Where the line supports a change, the device narrows the answer before the
     pack judges it, exactly as it narrows its own reading. The narrowed finding
     is what the record carries, so the pack produces the verdict from evidence
     the line can carry. */
  const carried = note.trim() ? crossCheckNote(item, note, answer) : null;
  const finding: Finding = carried?.finding ?? answer;
  const judgement = judge(item, finding, now);
  const amended = carried && carried.action === "amended" ? carried.reasons : [];

  return {
    accepted: true,
    reasons: amended,
    answer,
    finding,
    verdictFromRules: judgement.verdict,
  };
}
