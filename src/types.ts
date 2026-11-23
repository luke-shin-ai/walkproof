export type Verdict = "pass" | "fail" | "unknown";

export type Severity = "none" | "low" | "medium" | "high";

export type InferenceSource = "on_device" | "in_cloud" | "unknown";

export interface InspectionItem {
  id: string;
  zone: string;
  label: string;
  /** What the photo has to show for the deterministic rule to judge it. */
  expects: "target_visible" | "target_clear" | "no_defect";
  /** Rule pack clause ids this item can cite. */
  clauses: string[];
  /** Days allowed to fix a failure, from the rule pack. */
  fixDays: number;
}

export interface Finding {
  targetPresent: boolean;
  targetName: string;
  defectType: string;
  severity: Severity;
  obscured: boolean;
  note: string;
}

export interface Observation {
  itemId: string;
  label: string;
  photoName: string;
  photoBytes: number;
  note: string;
  finding: Finding | null;
  verdict: Verdict;
  reasons: string[];
  source: InferenceSource;
  latencyMs: number;
  clauseIds: string[];
  fixBy: string | null;
  createdAt: string;
}
