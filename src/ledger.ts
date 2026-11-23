import type { Observation, RulePack, Verdict, WalkInfo } from "./types";

export interface LedgerRow {
  id: string;
  itemId: string;
  label: string;
  zone: string;
  verdict: Verdict;
  source: string;
  clauseIds: string[];
  fixBy: string | null;
  latencyMs: number;
  photoBytes: number;
  cloudModel: string | null;
  cloudAccepted: boolean | null;
  reasons: string;
  createdAt: string;
}

export function ledgerRows(observations: Observation[]): LedgerRow[] {
  return observations.map((observation) => ({
    id: observation.id,
    itemId: observation.itemId,
    label: observation.label,
    zone: observation.zone,
    verdict: observation.verdict,
    source: observation.source,
    clauseIds: observation.clauseIds,
    fixBy: observation.fixBy,
    latencyMs: observation.latencyMs,
    photoBytes: observation.photoBytes,
    cloudModel: observation.cloud ? observation.cloud.model : null,
    cloudAccepted: observation.cloud ? observation.cloud.accepted : null,
    reasons: observation.reasons.join("; "),
    createdAt: observation.createdAt,
  }));
}

function csvCell(value: string | number | boolean | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function ledgerCsv(observations: Observation[]): string {
  const header = [
    "record_id",
    "item_id",
    "zone",
    "item",
    "verdict",
    "source",
    "clauses",
    "fix_by",
    "latency_ms",
    "photo_bytes",
    "cloud_model",
    "cloud_accepted",
    "reasons",
    "created_at",
  ];
  const lines = [header.join(",")];
  for (const row of ledgerRows(observations)) {
    lines.push(
      [
        row.id,
        row.itemId,
        row.zone,
        row.label,
        row.verdict,
        row.source,
        row.clauseIds.join(" "),
        row.fixBy,
        row.latencyMs,
        row.photoBytes,
        row.cloudModel,
        row.cloudAccepted,
        row.reasons,
        row.createdAt,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n");
}

export interface WalkSummary {
  checked: number;
  total: number;
  pass: number;
  fail: number;
  unknown: number;
  review: number;
  onDevice: number;
  inCloud: number;
  rejected: number;
  cloudCalls: number;
  photosOnDevice: number;
  photoBytesOnDevice: number;
  medianLatencyMs: number;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[middle - 1] + sorted[middle]) / 2) : sorted[middle];
}

export function summarize(observations: Observation[], total: number): WalkSummary {
  const latestByItem = new Map<string, Observation>();
  for (const observation of observations) latestByItem.set(observation.itemId, observation);
  const latest = [...latestByItem.values()];
  return {
    checked: latest.length,
    total,
    pass: latest.filter((entry) => entry.verdict === "pass").length,
    fail: latest.filter((entry) => entry.verdict === "fail").length,
    unknown: latest.filter((entry) => entry.verdict === "unknown").length,
    review: latest.filter((entry) => entry.reviewRequired).length,
    onDevice: latest.filter((entry) => entry.source === "on_device").length,
    inCloud: latest.filter((entry) => entry.source === "in_cloud").length,
    rejected: latest.filter((entry) => entry.source === "rejected_unsupported").length,
    cloudCalls: observations.filter((entry) => entry.cloud !== null).length,
    photosOnDevice: latest.filter((entry) => entry.photoDataUrl !== null).length,
    photoBytesOnDevice: latest.reduce((sum, entry) => sum + entry.photoBytes, 0),
    medianLatencyMs: median(latest.map((entry) => entry.latencyMs).filter((value) => value > 0)),
  };
}

export interface ReportViolation {
  itemId: string;
  label: string;
  zone: string;
  clauseId: string;
  clauseText: string;
  verdict: Verdict;
  detail: string;
  fixBy: string | null;
  note: string;
  photoDataUrl: string | null;
  source: string;
  reviewRequired: boolean;
}

export interface ReportModel {
  buildingName: string;
  buildingType: string;
  inspector: string;
  inspectedAt: string;
  packVersion: string;
  summary: WalkSummary;
  violations: ReportViolation[];
  reviews: ReportViolation[];
  signatureLines: string[];
}

function clauseTextOf(pack: RulePack, clauseIds: string[]): { id: string; text: string } {
  const id = clauseIds[0] ?? "";
  const clause = pack.clauses.find((entry) => entry.id === id);
  return { id, text: clause ? clause.text : "" };
}

function toViolation(observation: Observation, pack: RulePack): ReportViolation {
  const clause = clauseTextOf(pack, observation.clauseIds);
  return {
    itemId: observation.itemId,
    label: observation.label,
    zone: observation.zone,
    clauseId: clause.id,
    clauseText: clause.text,
    verdict: observation.verdict,
    detail: observation.reasons.join("; "),
    fixBy: observation.fixBy,
    note: observation.finding ? observation.finding.note : observation.note,
    photoDataUrl: observation.photoDataUrl,
    source: observation.source,
    reviewRequired: observation.reviewRequired,
  };
}

/** The printable record: what failed, with the clause and the deadline, and what needs a person. */
export function reportModel(walk: WalkInfo, observations: Observation[], pack: RulePack): ReportModel {
  const latestByItem = new Map<string, Observation>();
  for (const observation of observations) latestByItem.set(observation.itemId, observation);
  const latest = pack.items
    .map((item) => latestByItem.get(item.id))
    .filter((entry): entry is Observation => entry !== undefined);

  return {
    buildingName: walk.buildingName,
    buildingType: walk.buildingType,
    inspector: walk.inspector,
    inspectedAt: walk.startedAt,
    packVersion: pack.version,
    summary: summarize(observations, pack.items.length),
    violations: latest.filter((entry) => entry.verdict === "fail").map((entry) => toViolation(entry, pack)),
    reviews: latest.filter((entry) => entry.reviewRequired).map((entry) => toViolation(entry, pack)),
    signatureLines: ["Inspector", "Building manager", "Reviewer, where an item was left to a person"],
  };
}
