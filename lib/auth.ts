import { idbDelete, idbFindByIndex, idbGet, idbGetAll, idbPut } from "./idb";

export type Account = {
  id: string;
  email: string;
  name: string;
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
};

export type Session = {
  id: "current";
  accountId: string;
  email: string;
  name: string;
  createdAt: string;
};

const SESSION_KEY = "current" as const;
const LEGACY_PROFILE_KEY = "addome-profile";
const ACCOUNTS_MIRROR_KEY = "gym-food-accounts-v1";

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function hashPassword(password: string, saltHex: string) {
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: fromHex(saltHex),
      iterations: 150_000,
    },
    keyMaterial,
    256,
  );
  return toHex(bits);
}

function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // Important: hash only the view bytes, not the possibly larger underlying ArrayBuffer.
  return toHex(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function readAccountsMirror(): Account[] {
  try {
    const raw = window.localStorage.getItem(ACCOUNTS_MIRROR_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Account[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAccountsMirror(accounts: Account[]) {
  window.localStorage.setItem(ACCOUNTS_MIRROR_KEY, JSON.stringify(accounts));
}

async function persistAccount(account: Account) {
  await idbPut("accounts", account);
  const mirrored = readAccountsMirror().filter((item) => item.id !== account.id && item.email !== account.email);
  mirrored.push(account);
  writeAccountsMirror(mirrored);
}

async function findAccountByEmail(email: string): Promise<Account | undefined> {
  const normalized = normalizeEmail(email);

  const byIndex = await idbFindByIndex<Account>("accounts", "email", normalized);
  if (byIndex) return byIndex;

  const fromDb = (await idbGetAll<Account>("accounts")).find((account) => account.email === normalized);
  if (fromDb) return fromDb;

  return readAccountsMirror().find((account) => account.email === normalized);
}

export async function getSession(): Promise<Session | null> {
  return (await idbGet<Session>("sessions", SESSION_KEY)) ?? null;
}

export async function listAccounts(): Promise<Account[]> {
  const fromDb = await idbGetAll<Account>("accounts");
  if (fromDb.length > 0) {
    writeAccountsMirror(fromDb);
    return fromDb;
  }
  return readAccountsMirror();
}

async function writeSession(account: Account): Promise<Session> {
  const session: Session = {
    id: SESSION_KEY,
    accountId: account.id,
    email: account.email,
    name: account.name,
    createdAt: new Date().toISOString(),
  };
  await idbPut("sessions", session);
  return session;
}

export async function registerAccount(input: {
  email: string;
  name: string;
  password: string;
}): Promise<Session> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  if (!email || !email.includes("@")) throw new Error("Inserisci un’email valida.");
  if (name.length < 2) throw new Error("Inserisci il tuo nome.");
  if (input.password.length < 6) throw new Error("La password deve avere almeno 6 caratteri.");

  const existing = await findAccountByEmail(email);
  if (existing) throw new Error("Esiste già un account con questa email. Usa Accedi.");

  const passwordSalt = randomSalt();
  const passwordHash = await hashPassword(input.password, passwordSalt);
  const account: Account = {
    id: crypto.randomUUID(),
    email,
    name,
    passwordSalt,
    passwordHash,
    createdAt: new Date().toISOString(),
  };

  await persistAccount(account);

  // Verify the account is readable before continuing.
  const saved = await findAccountByEmail(email);
  if (!saved) {
    throw new Error("Registrazione non salvata su questo dispositivo. Riprova.");
  }

  return writeSession(saved);
}

export async function loginAccount(input: { email: string; password: string }): Promise<Session> {
  const email = normalizeEmail(input.email);
  const account = await findAccountByEmail(email);
  if (!account) {
    throw new Error("Account non trovato su questo dispositivo. Registrati di nuovo oppure controlla l’email.");
  }
  const passwordHash = await hashPassword(input.password, account.passwordSalt);
  if (passwordHash !== account.passwordHash) throw new Error("Password non corretta.");
  return writeSession(account);
}

export async function logoutAccount(): Promise<void> {
  await idbDelete("sessions", SESSION_KEY);
}

export async function updateAccountName(accountId: string, name: string): Promise<Session | null> {
  const account =
    (await idbGet<Account>("accounts", accountId)) ??
    readAccountsMirror().find((item) => item.id === accountId);
  if (!account) return null;
  const next = { ...account, name: name.trim() || account.name };
  await persistAccount(next);
  return writeSession(next);
}

export function readLegacyLocalProfile(): { name: string } | null {
  try {
    const raw = window.localStorage.getItem(LEGACY_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { name?: string };
    if (!parsed?.name) return null;
    return { name: parsed.name };
  } catch {
    return null;
  }
}

export async function migrateLegacyGuest(password = "gymfood"): Promise<Session | null> {
  const legacy = readLegacyLocalProfile();
  if (!legacy) return null;
  const accounts = await listAccounts();
  if (accounts.length > 0) return null;
  return registerAccount({
    email: "andrea@local.gymfood",
    name: legacy.name,
    password,
  });
}
