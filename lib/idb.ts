const DB_NAME = "gym-food";
const DB_VERSION = 1;

type StoreName = "accounts" | "sessions" | "userData";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("accounts")) {
        const accounts = db.createObjectStore("accounts", { keyPath: "id" });
        accounts.createIndex("email", "email", { unique: true });
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

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Richiesta IndexedDB fallita"));
  });
}

export async function idbGet<T>(storeName: StoreName, key: string): Promise<T | undefined> {
  const db = await openDb();
  const value = await requestToPromise(db.transaction(storeName, "readonly").objectStore(storeName).get(key));
  return value as T | undefined;
}

export async function idbPut<T extends object>(storeName: StoreName, value: T): Promise<void> {
  const db = await openDb();
  await requestToPromise(db.transaction(storeName, "readwrite").objectStore(storeName).put(value));
}

export async function idbDelete(storeName: StoreName, key: string): Promise<void> {
  const db = await openDb();
  await requestToPromise(db.transaction(storeName, "readwrite").objectStore(storeName).delete(key));
}

export async function idbGetAll<T>(storeName: StoreName): Promise<T[]> {
  const db = await openDb();
  const values = await requestToPromise(db.transaction(storeName, "readonly").objectStore(storeName).getAll());
  return (values as T[]) ?? [];
}

export async function idbFindByIndex<T>(
  storeName: StoreName,
  indexName: string,
  value: IDBValidKey,
): Promise<T | undefined> {
  const db = await openDb();
  const result = await requestToPromise(
    db.transaction(storeName, "readonly").objectStore(storeName).index(indexName).get(value),
  );
  return result as T | undefined;
}
