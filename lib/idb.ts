const DB_NAME = "gym-food";
const DB_VERSION = 2;

type StoreName = "accounts" | "sessions" | "userData";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction;

      if (!db.objectStoreNames.contains("accounts")) {
        const accounts = db.createObjectStore("accounts", { keyPath: "id" });
        accounts.createIndex("email", "email", { unique: true });
      } else if (tx) {
        const accounts = tx.objectStore("accounts");
        if (![...accounts.indexNames].includes("email")) {
          accounts.createIndex("email", "email", { unique: true });
        }
      }

      if (!db.objectStoreNames.contains("sessions")) {
        db.createObjectStore("sessions", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("userData")) {
        db.createObjectStore("userData", { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB non disponibile"));
  });
}

function runStore<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  execute: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = execute(store);
        let result: T;
        let settled = false;

        request.onsuccess = () => {
          result = request.result;
        };
        request.onerror = () => {
          settled = true;
          reject(request.error ?? new Error("Richiesta IndexedDB fallita"));
        };
        tx.oncomplete = () => {
          if (!settled) resolve(result);
        };
        tx.onabort = () => {
          settled = true;
          reject(tx.error ?? new Error("Transazione IndexedDB annullata"));
        };
        tx.onerror = () => {
          settled = true;
          reject(tx.error ?? new Error("Transazione IndexedDB fallita"));
        };
      }),
  );
}

export async function idbGet<T>(storeName: StoreName, key: string): Promise<T | undefined> {
  return runStore(storeName, "readonly", (store) => store.get(key)) as Promise<T | undefined>;
}

export async function idbPut<T extends object>(storeName: StoreName, value: T): Promise<void> {
  await runStore(storeName, "readwrite", (store) => store.put(value));
}

export async function idbDelete(storeName: StoreName, key: string): Promise<void> {
  await runStore(storeName, "readwrite", (store) => store.delete(key));
}

export async function idbGetAll<T>(storeName: StoreName): Promise<T[]> {
  const values = await runStore<T[]>(storeName, "readonly", (store) => store.getAll());
  return values ?? [];
}

export async function idbFindByIndex<T>(
  storeName: StoreName,
  indexName: string,
  value: IDBValidKey,
): Promise<T | undefined> {
  try {
    return (await runStore(storeName, "readonly", (store) => store.index(indexName).get(value))) as T | undefined;
  } catch {
    // Index missing or broken: caller should fall back to a full scan.
    return undefined;
  }
}
