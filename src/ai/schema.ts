import type { DefectType, Finding, InspectionItem, Severity, Verdict } from "../types";

export const DEFECT_TYPE_VALUES: DefectType[] = [
  "none",
  "blockage",
  "crack",
  "exposed_parts",
  "missing_label",
  "damaged_housing",
  "not_lit",
  "painted_over",
  "other",
];

export const SEVERITY_VALUES: Severity[] = ["none", "low", "medium", "high"];

export const VERDICT_VALUES: Verdict[] = ["pass", "fail", "unknown"];

/**
 * The finding fields are the one shape both inference paths must produce. The
 * on-device model gets them as a prompt constraint, the cloud model gets them as
 * a response schema, and the local note parser produces the same object. A tablet
 * and a laptop therefore hand the rule layer the same record.
 */
const FINDING_PROPERTIES = {
  targetPresent: { type: "boolean" },
  targetName: { type: "string" },
  defectType: { type: "string", enum: DEFECT_TYPE_VALUES },
  severity: { type: "string", enum: SEVERITY_VALUES },
  obscured: { type: "boolean" },
  note: { type: "string" },
} as const;

const FINDING_REQUIRED = [
  "targetPresent",
  "targetName",
  "defectType",
  "severity",
  "obscured",
  "note",
] as const;

export const FINDING_SCHEMA = {
  type: "object",
  properties: FINDING_PROPERTIES,
  required: [...FINDING_REQUIRED],
} as const;

/** The cloud answer is the finding plus one clause id from the pack and a remedy. */
export const CLOUD_ANSWER_SCHEMA = {
  type: "object",
  properties: {
    ...FINDING_PROPERTIES,
    clauseId: { type: "string" },
    remedy: { type: "string" },
    suggestedVerdict: { type: "string", enum: VERDICT_VALUES },
  },
  required: [...FINDING_REQUIRED, "clauseId", "remedy", "suggestedVerdict"],
} as const;

const EXPECTS_TEXT: Record<InspectionItem["expects"], string> = {
  target_visible: "the item itself has to be visible in the photo",
  target_clear: "the equipment has to be visible and its working parts clear of obstruction",
  no_defect: "the surface or route has to be visible and free of the defect named in the item",
};

export function buildStructurePrompt(item: InspectionItem, note: string): string {
  return [
    "You turn one inspector's line into a structured building safety finding.",
    `Checklist item: ${item.label}.`,
    `What has to be seen: ${EXPECTS_TEXT[item.expects]}.`,
    `Inspector note: ${note.trim() || "none"}.`,
    "Use only what the note says. Do not invent damage the note does not mention.",
    "If the note says the item or the view was not visible, set targetPresent to false.",
    "Set obscured to true when glare, a cover, or the angle hid the part that matters.",
    "Use defectType none and severity none when the note reports nothing wrong.",
    "Answer with the JSON object only.",
  ].join(" ");
}

export function buildClassifyPrompt(item: InspectionItem, clauseIds: string[], payloadJson: string): string {
  return [
    "You classify one building safety observation the device could not decide.",
    `Checklist item: ${item.label} in ${item.zone}.`,
    `Allowed clause ids: ${clauseIds.join(", ")}. Cite exactly one of them and no other value.`,
    `Observation: ${payloadJson}`,
    "Set defectType and severity from what the observation describes. Use none when nothing is wrong.",
    "suggestedVerdict must follow from your own defectType and severity.",
    "remedy is one short sentence a building manager can act on today.",
    "Answer with the JSON object only. No text outside the object.",
  ].join(" ");
}

export interface FieldProblem {
  field: string;
  problem: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Shape check shared by the note parser, the on-device answer and the cloud gate. */
export function validateFindingShape(value: unknown): FieldProblem[] {
  const problems: FieldProblem[] = [];
  if (!isRecord(value)) {
    return [{ field: "root", problem: "not an object" }];
  }
  if (typeof value.targetPresent !== "boolean") problems.push({ field: "targetPresent", problem: "must be a boolean" });
  if (typeof value.targetName !== "string") problems.push({ field: "targetName", problem: "must be a string" });
  if (typeof value.defectType !== "string" || !DEFECT_TYPE_VALUES.includes(value.defectType as DefectType)) {
    problems.push({ field: "defectType", problem: "not a known defect type" });
  }
  if (typeof value.severity !== "string" || !SEVERITY_VALUES.includes(value.severity as Severity)) {
    problems.push({ field: "severity", problem: "not a known severity" });
  }
  if (typeof value.obscured !== "boolean") problems.push({ field: "obscured", problem: "must be a boolean" });
  if (typeof value.note !== "string") problems.push({ field: "note", problem: "must be a string" });
  return problems;
}

/** Pull the first JSON object out of a model answer, without judging its content. */
export function extractJsonObject(raw: string): { value: unknown; problem: string | null } {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return { value: null, problem: "no JSON object in the answer" };
  try {
    return { value: JSON.parse(raw.slice(start, end + 1)), problem: null };
  } catch {
    return { value: null, problem: "answer is not valid JSON" };
  }
}

/** Pull the first JSON object out of a model answer and check its shape. */
export function parseFinding(raw: string): { finding: Finding | null; problems: FieldProblem[] } {
  const extracted = extractJsonObject(raw);
  if (extracted.problem) {
    return { finding: null, problems: [{ field: "root", problem: extracted.problem }] };
  }
  const parsed = extracted.value;
  const problems = validateFindingShape(parsed);
  if (problems.length || !isRecord(parsed)) return { finding: null, problems };
  return {
    finding: {
      targetPresent: parsed.targetPresent as boolean,
      targetName: String(parsed.targetName),
      defectType: parsed.defectType as DefectType,
      severity: parsed.severity as Severity,
      obscured: parsed.obscured as boolean,
      note: String(parsed.note),
    },
    problems: [],
  };
}
