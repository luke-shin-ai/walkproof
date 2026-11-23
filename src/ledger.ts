import type { InferenceSource, Observation } from "./types";

const BUDGET_KEY = "walkproof.cloudBudget";

interface BudgetState {
  day: string;
  spent: number;
  limit: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function budget(): BudgetState {
  const raw = localStorage.getItem(BUDGET_KEY);
  const fallback: BudgetState = { day: today(), spent: 0, limit: 20 };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as BudgetState;
    return parsed.day === today() ? parsed : { day: today(), spent: 0, limit: parsed.limit || 20 };
  } catch {
    return fallback;
  }
}

export function spendCloudCall(): BudgetState {
  const state = budget();
  const next = { ...state, spent: state.spent + 1 };
  localStorage.setItem(BUDGET_KEY, JSON.stringify(next));
  return next;
}

export function budgetLeft(): number {
  const state = budget();
  return Math.max(0, state.limit - state.spent);
}

export interface LedgerEntry {
  itemId: string;
  label: string;
  requestedSource: InferenceSource;
  actualSource: InferenceSource;
  latencyMs: number;
  photoBytes: number;
  cloudReason: string | null;
  createdAt: string;
}

export function ledgerFrom(observations: Observation[]): LedgerEntry[] {
  return observations.map((observation) => ({
    itemId: observation.itemId,
    label: observation.label,
    requestedSource: "on_device",
    actualSource: observation.source,
    latencyMs: observation.latencyMs,
    photoBytes: observation.photoBytes,
    cloudReason: observation.source === "in_cloud" ? observation.reasons.join("; ") : null,
    createdAt: observation.createdAt,
  }));
}

export function ledgerCsv(observations: Observation[]): string {
  const rows = [["item_id", "label", "source", "latency_ms", "photo_bytes", "verdict", "created_at"]];
  for (const observation of observations) {
    rows.push([
      observation.itemId,
      observation.label,
      observation.source,
      String(observation.latencyMs),
      String(observation.photoBytes),
      observation.verdict,
      observation.createdAt,
    ]);
  }
  return rows.map((row) => row.join(",")).join("\n");
}
