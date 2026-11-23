import type { Observation } from "../types";

const DB_NAME = "walkproof";
const DB_VERSION = 1;
const STORE_OBSERVATIONS = "observations";

export interface QueuedObservation {
  itemId: string;
  label: string;
  photoName: string;
  photoBytes: number;
  note: string;
  base64: string;
  mimeType: string;
  createdAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_OBSERVATIONS)) {
        const store = db.createObjectStore(STORE_OBSERVATIONS, { keyPath: "itemId" });
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb open failed"));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_OBSERVATIONS, mode);
        const request = run(transaction.objectStore(STORE_OBSERVATIONS));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("indexeddb request failed"));
        transaction.oncomplete = () => db.close();
      }),
  );
}

export function putQueued(item: QueuedObservation): Promise<IDBValidKey> {
  return tx("readwrite", (store) => store.put(item));
}

export function getQueued(itemId: string): Promise<QueuedObservation | undefined> {
  return tx("readonly", (store) => store.get(itemId)) as Promise<QueuedObservation | undefined>;
}

export function listQueued(): Promise<QueuedObservation[]> {
  return tx("readonly", (store) => store.getAll()) as Promise<QueuedObservation[]>;
}

export function deleteQueued(itemId: string): Promise<undefined> {
  return tx("readwrite", (store) => store.delete(itemId)) as Promise<undefined>;
}

const RESULT_KEY = "walkproof.results";

/** Results stay in the device store. Nothing here is uploaded by the skeleton. */
export function saveResult(observation: Observation): void {
  const results = loadResults();
  results.push(observation);
  localStorage.setItem(RESULT_KEY, JSON.stringify(results));
}

export function loadResults(): Observation[] {
  try {
    const raw = localStorage.getItem(RESULT_KEY);
    return raw ? (JSON.parse(raw) as Observation[]) : [];
  } catch {
    return [];
  }
}

export function clearResults(): void {
  localStorage.removeItem(RESULT_KEY);
}
