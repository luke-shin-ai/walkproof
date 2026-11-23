import type { DefectType, Finding, InspectionItem, Severity, Verdict } from "../types";
import { judge, type Judgement } from "./judge";
import { matchedWords, severityFor, structureNote, OBSCURED_WORDS } from "./structure";

/**
 * What the inspector's line says on its own, before any model reads it.
 *
 * The line is the evidence a person wrote down. The rules below use it to check
 * a model answer in the same way a reviewer would: not by trusting a second
 * opinion, but by asking whether the line can carry the claim at all.
 */
export interface NoteEvidence {
  /** Phrases with which the line says the observation was limited. */
  marks: string[];
  /** True when the line says the item is not there. */
  absence: boolean;
  /** The defect the same words name, read without a model. */
  defectType: DefectType;
  /** The severity those words support for that defect. */
  severity: Severity;
}

export function noteEvidence(item: InspectionItem, note: string): NoteEvidence {
  const text = note.trim().toLowerCase();
  const reading = structureNote(item, note);
  const defectType: DefectType = reading?.defectType ?? "none";
  return {
    marks: matchedWords(text, OBSCURED_WORDS),
    absence: Boolean(reading && !reading.targetPresent),
    defectType,
    severity: severityFor(text, defectType),
  };
}

/** Why the device did not settle an item, when it did not. */
export type HoldCause = "none" | "inconclusive" | "misread";

export type EvidenceAction = "kept" | "amended" | "held";

export interface EvidenceDecision {
  /** The finding the device will judge and record. */
  finding: Finding | null;
  action: EvidenceAction;
  hold: HoldCause;
  reasons: string[];
}

function nameOf(defect: DefectType): string {
  return defect.replace(/_/g, " ");
}

/**
 * D5: the cross check between the line and the answer.
 *
 * The on-device model is good at reading a decisive line and poor at noticing
 * that a line is not decisive. Measured on 2026-11-23, it settled twelve of the
 * twenty items a person had left open and claimed items were absent that the
 * line says are there. So the device checks three things before a verdict is
 * recorded:
 *
 * 1. A defect with severity none is not an answer the pack can judge. If the
 *    line names the same defect, its words set the severity; otherwise the item
 *    goes to a person.
 * 2. Absence is the strongest claim in the schema, so the line has to say it. An
 *    answer that says the item is not there, on a line that does not, cannot
 *    fail the item. If the line names a defect the device can record, that
 *    defect is kept and the absence claim is dropped; if it does not, a person
 *    has to look.
 * 3. A line that says the observer could not tell is not a determination. The
 *    answer is kept for the record, but the item is left open. A bigger model
 *    reading the same line cannot see more than the person did, so this item is
 *    not sent to the cloud either.
 *
 * None of these rules invents a defect: they can only narrow what may be
 * recorded, and the same note always gives the same answer.
 */
export function crossCheckNote(item: InspectionItem, note: string, finding: Finding | null): EvidenceDecision {
  if (!finding) return { finding: null, action: "kept", hold: "none", reasons: [] };

  const evidence = noteEvidence(item, note);
  const reasons: string[] = [];
  let action: EvidenceAction = "kept";
  let hold: HoldCause = "none";
  const next: Finding = { ...finding };

  /* When the line says the item is not there and the answer agrees, the record
     rests on that absence; a stray defect type on top of it changes nothing. */
  const restsOnAbsence = !next.targetPresent && evidence.absence;

  if (!restsOnAbsence && next.defectType !== "none" && next.severity === "none") {
    if (evidence.defectType === next.defectType && evidence.severity !== "none") {
      next.severity = evidence.severity;
      if (action === "kept") action = "amended";
      reasons.push(
        `the answer named a ${nameOf(next.defectType)} without a severity, so the device used the ${evidence.severity} severity the line supports`,
      );
    } else {
      hold = "misread";
      action = "held";
      reasons.push(
        `the answer named a ${nameOf(next.defectType)} with no severity and the line does not support it, so a person has to decide`,
      );
    }
  }

  if (!next.targetPresent && !evidence.absence) {
    if (evidence.defectType !== "none" && evidence.defectType === next.defectType) {
      next.targetPresent = true;
      if (action === "kept") action = "amended";
      reasons.push(
        `the answer said the item was not there, the line does not, and the line does name a ${nameOf(evidence.defectType)} the device can record`,
      );
    } else {
      hold = "misread";
      action = "held";
      reasons.push("the answer said the item was not there and the line does not say that, so a person has to look at the item");
    }
  }

  if (evidence.marks.length) {
    hold = "inconclusive";
    action = "held";
    reasons.push(
      `the line says the observation was not conclusive (${evidence.marks.join(", ")}), so the device keeps the answer and leaves the verdict to a person`,
    );
  }

  return { finding: next, action, hold, reasons };
}

export interface NoteDecision {
  /** The finding the device recorded, after the cross check. */
  finding: Finding | null;
  verdict: Verdict;
  judgement: Judgement;
  evidence: EvidenceDecision;
  /** The verdict the answer alone would have produced, before the cross check. */
  answerVerdict: Verdict;
  reasons: string[];
}

/**
 * The one place a note becomes a record on the device: the answer is checked
 * against the line, then the rule pack decides, then a held item stays open.
 * The bench device arm and the shipped pipeline both call this, so a measurement
 * cannot drift from the product.
 */
export function judgeNote(item: InspectionItem, note: string, finding: Finding | null, now = new Date()): NoteDecision {
  const answerVerdict = judge(item, finding, now).verdict;
  const evidence = crossCheckNote(item, note, finding);
  const judged = judge(item, evidence.finding, now);
  const held = evidence.hold !== "none" && judged.verdict !== "unknown";
  const verdict: Verdict = held ? "unknown" : judged.verdict;
  const reasons = [...evidence.reasons];
  if (held) {
    reasons.push(`the device would have recorded ${judged.verdict} from the answer alone and leaves the item to a person instead`);
  }
  return {
    finding: evidence.finding,
    verdict,
    judgement: {
      ...judged,
      verdict,
      fixBy: verdict === "fail" ? judged.fixBy : null,
      reasons: [...judged.reasons, ...reasons],
    },
    evidence,
    answerVerdict,
    reasons,
  };
}
