export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface BudgetState {
  day: string;
  spent: number;
  limit: number;
}

export const BUDGET_KEY = "walkproof.cloudBudget.v1";

export function browserStore(): KeyValueStore | null {
  try {
    if (typeof localStorage === "undefined") return null;
    localStorage.getItem(BUDGET_KEY);
    return localStorage;
  } catch {
    return null;
  }
}

function parseStored(raw: string | null, limit: number): { spent: number; limit: number } {
  if (!raw) return { spent: 0, limit };
  try {
    const parsed = JSON.parse(raw) as Partial<BudgetState>;
    const spent = typeof parsed.spent === "number" && Number.isFinite(parsed.spent) && parsed.spent >= 0 ? Math.floor(parsed.spent) : 0;
    const storedLimit = typeof parsed.limit === "number" && parsed.limit > 0 ? Math.floor(parsed.limit) : limit;
    return { spent, limit: storedLimit };
  } catch {
    return { spent: 0, limit };
  }
}

/** The meter resets at the local date change, so a night shift never borrows tomorrow's calls. */
export function readBudget(store: KeyValueStore | null, today: string, limit: number): BudgetState {
  if (!store) return { day: today, spent: 0, limit };
  const raw = store.getItem(BUDGET_KEY);
  let day = today;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<BudgetState>;
      if (typeof parsed.day === "string") day = parsed.day;
    } catch {
      day = today;
    }
  }
  const counters = parseStored(raw, limit);
  if (day !== today) return { day: today, spent: 0, limit: counters.limit };
  return { day, spent: counters.spent, limit: counters.limit };
}

export interface SpendResult {
  ok: boolean;
  state: BudgetState;
}

/**
 * G2: a call is only made when the day's budget has room. The caller gets
 * `ok: false` and the item stays in the queue instead of quietly spending.
 */
export function trySpend(store: KeyValueStore | null, today: string, limit: number): SpendResult {
  const state = readBudget(store, today, limit);
  if (state.spent >= state.limit) return { ok: false, state };
  const next: BudgetState = { day: today, spent: state.spent + 1, limit: state.limit };
  if (store) store.setItem(BUDGET_KEY, JSON.stringify(next));
  return { ok: true, state: next };
}

export function budgetLeft(state: BudgetState): number {
  return Math.max(0, state.limit - state.spent);
}
