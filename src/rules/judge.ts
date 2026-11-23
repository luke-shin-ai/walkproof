import type { Finding, InspectionItem, Severity, Verdict } from "../types";

const SEVERITY_RANK: Record<Severity, number> = { none: 0, low: 1, medium: 2, high: 3 };

export interface Judgement {
  verdict: Verdict;
  reasons: string[];
  clauseIds: string[];
  fixBy: string | null;
}

export function addDays(base: Date, days: number): string {
  const next = new Date(base.getTime() + days * 86400000);
  return next.toISOString().slice(0, 10);
}

function defectLabel(finding: Finding): string {
  const type = finding.defectType.replace(/_/g, " ");
  return `${type} (${finding.severity})`;
}

/**
 * The model supplies evidence. This function is the only thing that turns
 * evidence into a verdict, so the same photo, note and rule pack always give the
 * same answer, with or without a network. A cloud answer is re-judged here
 * before it can change a record.
 */
export function judge(item: InspectionItem, finding: Finding | null, now = new Date()): Judgement {
  const clauseIds = [...item.clauses];

  if (!finding) {
    return { verdict: "unknown", reasons: ["no structured finding for this item"], clauseIds, fixBy: null };
  }

  if (item.expects === "target_visible") {
    if (!finding.targetPresent) {
      return {
        verdict: "fail",
        reasons: [`${item.label}: target not visible in the photo`],
        clauseIds,
        fixBy: addDays(now, item.fixDays),
      };
    }
    if (finding.defectType !== "none" && SEVERITY_RANK[finding.severity] >= 2) {
      return {
        verdict: "fail",
        reasons: [`${item.label}: ${defectLabel(finding)}`],
        clauseIds,
        fixBy: addDays(now, item.fixDays),
      };
    }
    if (finding.defectType !== "none") {
      return {
        verdict: "unknown",
        reasons: [`${defectLabel(finding)} recorded below the fail threshold, a person has to decide`],
        clauseIds,
        fixBy: null,
      };
    }
    if (finding.obscured) {
      return {
        verdict: "unknown",
        reasons: ["target visible but obscured, a person has to confirm it"],
        clauseIds,
        fixBy: null,
      };
    }
    return { verdict: "pass", reasons: [`${item.label}: present and in place`], clauseIds, fixBy: null };
  }

  if (item.expects === "target_clear") {
    if (!finding.targetPresent) {
      return {
        verdict: "unknown",
        reasons: ["expected equipment not identified in the photo"],
        clauseIds,
        fixBy: null,
      };
    }
    if (finding.defectType !== "none" && SEVERITY_RANK[finding.severity] >= 2) {
      return {
        verdict: "fail",
        reasons: [`${item.label}: ${defectLabel(finding)}`],
        clauseIds,
        fixBy: addDays(now, item.fixDays),
      };
    }
    if (finding.defectType !== "none") {
      return {
        verdict: "unknown",
        reasons: [`${defectLabel(finding)} recorded below the fail threshold, a person has to decide`],
        clauseIds,
        fixBy: null,
      };
    }
    if (finding.obscured) {
      return {
        verdict: "unknown",
        reasons: ["equipment present but the working parts are obscured"],
        clauseIds,
        fixBy: null,
      };
    }
    return { verdict: "pass", reasons: [`${item.label}: equipment present, no defect reported`], clauseIds, fixBy: null };
  }

  if (finding.defectType !== "none") {
    if (SEVERITY_RANK[finding.severity] < 1) {
      return {
        verdict: "unknown",
        reasons: [`${defectLabel(finding)} recorded below the fail threshold`],
        clauseIds,
        fixBy: null,
      };
    }
    return {
      verdict: "fail",
      reasons: [`${item.label}: ${defectLabel(finding)}`],
      clauseIds,
      fixBy: addDays(now, item.fixDays),
    };
  }

  if (finding.obscured) {
    return { verdict: "unknown", reasons: ["view obscured, rescan or check by hand"], clauseIds, fixBy: null };
  }

  return { verdict: "pass", reasons: [`${item.label}: no defect visible`], clauseIds, fixBy: null };
}
