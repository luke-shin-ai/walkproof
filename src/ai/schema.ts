/**
 * One schema object is handed to both inference paths: the on-device prompt
 * constraint and the cloud response schema. A change here changes both, which
 * is what keeps a low-end tablet and a laptop producing the same record shape.
 */
export const FINDING_SCHEMA = {
  type: "object",
  properties: {
    targetPresent: { type: "boolean" },
    targetName: { type: "string" },
    defectType: {
      type: "string",
      enum: ["none", "blockage", "crack", "exposed_parts", "missing_label", "damaged_housing", "other"],
    },
    severity: { type: "string", enum: ["none", "low", "medium", "high"] },
    obscured: { type: "boolean" },
    note: { type: "string" },
  },
  required: ["targetPresent", "targetName", "defectType", "severity", "obscured", "note"],
} as const;

export function buildPrompt(itemLabel: string, expects: string, note: string): string {
  return [
    "You are checking one photo from a building safety walkthrough.",
    `Checklist item: ${itemLabel}.`,
    `What the inspector has to see: ${expects}.`,
    note.trim() ? `Inspector note: ${note.trim()}` : "Inspector note: none.",
    "Describe only what is visible in the photo. If the subject is not visible, set targetPresent to false.",
    "Set obscured to true when a cover, glare, or angle hides the part that matters.",
    "Use defectType none when nothing is wrong, and severity none in that case.",
    "Answer in the JSON object only.",
  ].join(" ");
}
