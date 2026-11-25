export type Verdict = "pass" | "fail" | "unknown";

export type Severity = "none" | "low" | "medium" | "high";

export type DefectType =
  | "none"
  | "blockage"
  | "crack"
  | "exposed_parts"
  | "missing_label"
  | "damaged_housing"
  | "not_lit"
  | "painted_over"
  | "other";

export type Expects = "target_visible" | "target_clear" | "no_defect";

/**
 * Where the evidence behind a record came from. `rejected_unsupported` means a
 * cloud answer came back but the device refused it, so a person has to look at
 * the item before the record can be signed.
 */
export type InferenceSource = "on_device" | "in_cloud" | "rejected_unsupported" | "unknown";

/** Which layer turned the inspector's line into a structured finding. */
export type DeviceStructuring = "on_device" | "local_rules" | "none";

export interface Clause {
  id: string;
  text: string;
}

export interface InspectionItem {
  id: string;
  zone: string;
  label: string;
  /** What the photo has to show for the deterministic rule to judge it. */
  expects: Expects;
  /** Clause ids this item can cite. The cloud may only cite one of these. */
  clauses: string[];
  /** Days allowed to fix a failure, from the rule pack. */
  fixDays: number;
}

export interface RulePack {
  version: string;
  buildingTypes: string[];
  /** Cloud calls allowed per day per device. */
  cloudDailyBudget: number;
  clauses: Clause[];
  items: InspectionItem[];
}

/** The one record shape both inference paths have to produce. */
export interface Finding {
  targetPresent: boolean;
  targetName: string;
  defectType: DefectType;
  severity: Severity;
  obscured: boolean;
  note: string;
}

/** What the cloud is allowed to add: one clause from the pack and a remedy. */
export interface CloudAnswer extends Finding {
  clauseId: string;
  remedy: string;
  suggestedVerdict: Verdict;
}

export interface CloudCheck {
  model: string;
  modelFallback: boolean;
  /** What the AI Logic SDK reported for this answer: `on_device` or `in_cloud`. */
  inferenceSource?: string;
  payload: string;
  payloadBytes: number;
  accepted: boolean;
  reasons: string[];
  answer: CloudAnswer | null;
  latencyMs: number;
  error: string | null;
  budgetUsed: number;
  budgetLimit: number;
  /** Why this item was put to the cloud: the pack left it open, or the device's own reading did not hold. */
  askedBecause: "pack_open" | "untrusted_reading";
  /** The verdict the device held before the call, always unknown for an item that is sent. */
  deviceVerdict: Verdict;
  /** True when the accepted answer let the rule pack settle pass or fail. */
  settled: boolean;
}

export interface Observation {
  id: string;
  itemId: string;
  /**
   * What the device did with the answer it structured, before the rule pack
   * judged it: kept it, amended it from the line, or held the item open.
   */
  noteCheck?: {
    action: "kept" | "amended" | "held";
    hold: "none" | "inconclusive" | "misread";
    answerVerdict: Verdict;
    reasons: string[];
  };
  label: string;
  zone: string;
  photoName: string;
  photoBytes: number;
  /** Re-encoded on the device, so EXIF and other metadata do not survive. */
  photoDataUrl: string | null;
  note: string;
  finding: Finding | null;
  verdict: Verdict;
  reasons: string[];
  source: InferenceSource;
  deviceSource: DeviceStructuring;
  latencyMs: number;
  deviceLatencyMs: number;
  cloud: CloudCheck | null;
  clauseIds: string[];
  fixBy: string | null;
  reviewRequired: boolean;
  createdAt: string;
  packVersion: string;
}

export interface WalkInfo {
  buildingName: string;
  buildingType: string;
  inspector: string;
  startedAt: string;
}
