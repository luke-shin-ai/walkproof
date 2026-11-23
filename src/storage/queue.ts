import type { Observation } from "../types";

const DB_NAME = "walkproof";
const DB_VERSION = 2;
const STORE_CAPTURES = "captures";
const STORE_OBSERVATIONS = "observations";

export interface QueuedCapture {
  id: string;
  itemId: string;
  note: string;
  photoName: string;
  photoBytes: number;
  photoDataUrl: string | null;
  createdAt: string;
}

const memory = {
  captures: [] as QueuedCapture[],
  observations: [] as Observation[],
};

function hasIndexedDb(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of [STORE_CAPTURES, STORE_OBSERVATIONS]) {
        if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
      }
      db.createObjectStore(STORE_CAPTURES, { keyPath: "id" }).createIndex("createdAt", "createdAt");
      db.createObjectStore(STORE_OBSERVATIONS, { keyPath: "id" }).createIndex("createdAt", "createdAt");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb open failed"));
  });
}

function withStore<T>(storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const request = run(transaction.objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("indexeddb request failed"));
        transaction.oncomplete = () => db.close();
      }),
  );
}

/** The capture is written before any model work, so a closed tab does not lose a photo. */
export async function putCapture(capture: QueuedCapture): Promise<void> {
  if (!hasIndexedDb()) {
    memory.captures = memory.captures.filter((entry) => entry.id !== capture.id).concat(capture);
    return;
  }
  await withStore(STORE_CAPTURES, "readwrite", (store) => store.put(capture));
}

export async function listCaptures(): Promise<QueuedCapture[]> {
  if (!hasIndexedDb()) return [...memory.captures];
  const rows = (await withStore(STORE_CAPTURES, "readonly", (store) => store.getAll())) as QueuedCapture[];
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function deleteCapture(id: string): Promise<void> {
  if (!hasIndexedDb()) {
    memory.captures = memory.captures.filter((entry) => entry.id !== id);
    return;
  }
  await withStore(STORE_CAPTURES, "readwrite", (store) => store.delete(id));
}

export async function saveObservation(observation: Observation): Promise<void> {
  if (!hasIndexedDb()) {
    memory.observations = memory.observations.filter((entry) => entry.id !== observation.id).concat(observation);
    return;
  }
  await withStore(STORE_OBSERVATIONS, "readwrite", (store) => store.put(observation));
}

/** The latest record per item. Older attempts stay in the store, out of the screen. */
function latestPerItem(rows: Observation[]): Observation[] {
  const latest = new Map<string, Observation>();
  for (const row of [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) latest.set(row.itemId, row);
  return [...latest.values()];
}

export async function loadObservations(): Promise<Observation[]> {
  if (!hasIndexedDb()) return latestPerItem(memory.observations);
  const rows = (await withStore(STORE_OBSERVATIONS, "readonly", (store) => store.getAll())) as Observation[];
  return latestPerItem(rows);
}

export async function clearWalk(): Promise<void> {
  memory.captures = [];
  memory.observations = [];
  if (!hasIndexedDb()) return;
  await withStore(STORE_CAPTURES, "readwrite", (store) => store.clear());
  await withStore(STORE_OBSERVATIONS, "readwrite", (store) => store.clear());
}
