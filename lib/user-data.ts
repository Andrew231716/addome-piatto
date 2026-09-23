import { idbDelete, idbGet, idbPut } from "./idb";

export async function loadUserValue<T>(userId: string, key: string, fallback: T): Promise<T> {
  const record = await idbGet<{ key: string; value: T }>("userData", `${userId}:${key}`);
  if (!record) {
    // Migrate from previous localStorage keys once per user/key.
    try {
      const legacy = window.localStorage.getItem(key);
      if (legacy != null) {
        const parsed = JSON.parse(legacy) as T;
        await idbPut("userData", { key: `${userId}:${key}`, value: parsed });
        return parsed;
      }
    } catch {
      /* ignore */
    }
    return fallback;
  }
  return record.value;
}

export async function saveUserValue<T>(userId: string, key: string, value: T): Promise<void> {
  await idbPut("userData", { key: `${userId}:${key}`, value });
}

export async function clearUserValue(userId: string, key: string): Promise<void> {
  await idbDelete("userData", `${userId}:${key}`);
}
