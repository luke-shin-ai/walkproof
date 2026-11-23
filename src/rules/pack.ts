import type { Finding, InspectionItem, Severity, Verdict } from "../types";

export interface RulePack {
  version: string;
  buildingTypes: string[];
  items: InspectionItem[];
}

/**
 * Local copy of the checklist the app ships with. The same shape is served by
 * Remote Config, so a pack refresh changes judgements without a new build.
 */
export const DEFAULT_PACK: RulePack = {
  version: "0.1.0-d0",
  buildingTypes: ["retail", "office"],
  items: [
    {
      id: "fe-01",
      zone: "Lobby",
      label: "Fire extinguisher in its cabinet",
      expects: "target_visible",
      clauses: ["FE-01", "FE-04"],
      fixDays: 3,
    },
    {
      id: "ex-02",
      zone: "Exit A",
      label: "Illuminated exit sign above the door",
      expects: "target_visible",
      clauses: ["EX-02"],
      fixDays: 1,
    },
    {
      id: "el-03",
      zone: "Utility room",
      label: "Distribution board closed and covered",
      expects: "target_clear",
      clauses: ["EL-03", "EL-07"],
      fixDays: 3,
    },
    {
      id: "st-04",
      zone: "Stair core",
      label: "Wall and soffit surfaces free of cracks",
      expects: "no_defect",
      clauses: ["ST-04"],
      fixDays: 30,
    },
    {
      id: "eg-05",
      zone: "Rear corridor",
      label: "Escape route clear of stored goods",
      expects: "no_defect",
      clauses: ["EG-05", "EG-06"],
      fixDays: 1,
    },
  ],
};

const SEVERITY_RANK: Record<Severity, number> = { none: 0, low: 1, medium: 2, high: 3 };

export interface Judgement {
  verdict: Verdict;
  reasons: string[];
  clauseIds: string[];
  fixBy: string | null;
}

function addDays(base: Date, days: number): string {
  const next = new Date(base.getTime() + days * 86400000);
  return next.toISOString().slice(0, 10);
}

/**
 * The model only supplies evidence. This function is the only thing that turns
 * evidence into a verdict, so the same photo and rule pack always give the same
 * answer, with or without a network.
 */
export function judge(item: InspectionItem, finding: Finding | null, now = new Date()): Judgement {
  const clauseIds = [...item.clauses];

  if (!finding) {
    return { verdict: "unknown", reasons: ["no structured finding"], clauseIds, fixBy: null };
  }

  if (item.expects === "target_visible") {
    if (!finding.targetPresent) {
      return {
        verdict: "fail",
        reasons: [`${item.label}: target not visible`],
        clauseIds,
        fixBy: addDays(now, item.fixDays),
      };
    }
    if (finding.obscured) {
      return {
        verdict: "unknown",
        reasons: ["target visible but obscured, needs a person to confirm"],
        clauseIds,
        fixBy: null,
      };
    }
    return { verdict: "pass", reasons: [`${item.label}: present`], clauseIds, fixBy: null };
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
        reasons: [`${finding.defectType} (${finding.severity})`],
        clauseIds,
        fixBy: addDays(now, item.fixDays),
      };
    }
    return { verdict: "pass", reasons: ["equipment present, no defect reported"], clauseIds, fixBy: null };
  }

  if (finding.defectType !== "none") {
    if (SEVERITY_RANK[finding.severity] < 1) {
      return {
        verdict: "unknown",
        reasons: ["possible defect below the recorded threshold"],
        clauseIds,
        fixBy: null,
      };
    }
    return {
      verdict: "fail",
      reasons: [`${finding.defectType} (${finding.severity})`],
      clauseIds,
      fixBy: addDays(now, item.fixDays),
    };
  }

  if (finding.obscured) {
    return { verdict: "unknown", reasons: ["view obscured, rescan or check by hand"], clauseIds, fixBy: null };
  }

  return { verdict: "pass", reasons: ["no defect visible"], clauseIds, fixBy: null };
}
