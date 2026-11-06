import { applyCloudRows, copyLocalData, setCloudRevision, pushCloud } from "./cloud";
import { idbDelete, idbFindByIndex, idbGet, idbGetAll, idbPut } from "./idb";

export type Account = {
  id: string;
  email: string;
  name: string;
  passwordSalt: string;
  passwordHash: string;
  syncToken: string;
  createdAt: string;
};

/** Public mirror never stores password hashes (XSS surface). */
type AccountMirror = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
};

export type Session = {
  id: "current";
  accountId: string;
  email: string;
  name: string;
  syncToken: string;
  createdAt: string;
  /** ISO timestamp — local session soft expiry. */
  expiresAt: string;
  remote?: boolean;
  recoveryCode?: string;
};

const SESSION_KEY = "current" as const;
const LEGACY_PROFILE_KEY = "addome-profile";
const ACCOUNTS_MIRROR_KEY = "gym-food-accounts-public-v2";
const SESSION_DAYS = 30;

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
  return toHex(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return toHex(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function sessionExpiry() {
  const expires = new Date();
  expires.setDate(expires.getDate() + SESSION_DAYS);
  return expires.toISOString();
}

function readAccountsMirror(): AccountMirror[] {
  try {
    const raw = window.localStorage.getItem(ACCOUNTS_MIRROR_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AccountMirror[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAccountsMirror(accounts: AccountMirror[]) {
  window.localStorage.setItem(ACCOUNTS_MIRROR_KEY, JSON.stringify(accounts));
}

/** Drop legacy mirror that contained password hashes. */
function scrubLegacyMirror() {
  try {
    window.localStorage.removeItem("gym-food-accounts-v1");
  } catch {
    /* ignore */
  }
}

function toMirror(account: Account): AccountMirror {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    createdAt: account.createdAt,
  };
}

async function persistAccount(account: Account) {
  await idbPut("accounts", account);
  scrubLegacyMirror();
  const mirrored = readAccountsMirror().filter((item) => item.id !== account.id && item.email !== account.email);
  mirrored.push(toMirror(account));
  writeAccountsMirror(mirrored);
}

async function ensureSyncToken(account: Account): Promise<Account> {
  if (account.syncToken && account.syncToken.length >= 16) return account;
  const next = { ...account, syncToken: randomToken() };
  await persistAccount(next);
  return next;
}

async function findAccountByEmail(email: string): Promise<Account | undefined> {
  const normalized = normalizeEmail(email);
  const byIndex = await idbFindByIndex<Account>("accounts", "email", normalized);
  if (byIndex) return ensureSyncToken(byIndex);
  const fromDb = (await idbGetAll<Account>("accounts")).find((account) => account.email === normalized);
  if (fromDb) return ensureSyncToken(fromDb);
  return undefined;
}

export async function getSession(): Promise<Session | null> {
  scrubLegacyMirror();
  const session = (await idbGet<Session>("sessions", SESSION_KEY)) ?? null;
  if (!session) return null;
  if (session.expiresAt && Date.parse(session.expiresAt) < Date.now()) {
    await logoutAccount();
    return null;
  }
  if (!session.syncToken && !session.remote) {
    const account =
      (await idbGet<Account>("accounts", session.accountId)) ??
      (await idbGetAll<Account>("accounts")).find((item) => item.id === session.accountId);
    if (!account) return session;
    const secured = await ensureSyncToken(account);
    return writeSession(secured);
  }
  return session;
}

export async function listAccounts(): Promise<AccountMirror[]> {
  const fromDb = await idbGetAll<Account>("accounts");
  if (fromDb.length > 0) {
    const mirrors = fromDb.map(toMirror);
    writeAccountsMirror(mirrors);
    return mirrors;
  }
  return readAccountsMirror();
}

async function writeSession(account: Account): Promise<Session> {
  const secured = await ensureSyncToken(account);
  const session: Session = {
    id: SESSION_KEY,
    accountId: secured.id,
    email: secured.email,
    name: secured.name,
    syncToken: secured.syncToken,
    createdAt: new Date().toISOString(),
    expiresAt: sessionExpiry(),
  };
  await idbPut("sessions", session);
  return session;
}

async function registerLocalAccount(input: {
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
    syncToken: randomToken(),
    createdAt: new Date().toISOString(),
  };

  await persistAccount(account);
  const saved = await findAccountByEmail(email);
  if (!saved) throw new Error("Registrazione non salvata su questo dispositivo. Riprova.");
  return writeSession(saved);
}

async function loginLocalAccount(input: { email: string; password: string }): Promise<Session> {
  const email = normalizeEmail(input.email);
  const account = await findAccountByEmail(email);
  if (!account) {
    throw new Error("Account non trovato su questo dispositivo. Registrati di nuovo oppure controlla l’email.");
  }
  const passwordHash = await hashPassword(input.password, account.passwordSalt);
  if (passwordHash !== account.passwordHash) throw new Error("Password non corretta.");
  return writeSession(account);
}

async function changeLocalPassword(accountId: string, currentPassword: string, nextPassword: string): Promise<void> {
  if (nextPassword.length < 6) throw new Error("La nuova password deve avere almeno 6 caratteri.");
  const account = await idbGet<Account>("accounts", accountId);
  if (!account) throw new Error("Account non trovato.");
  const currentHash = await hashPassword(currentPassword, account.passwordSalt);
  if (currentHash !== account.passwordHash) throw new Error("Password attuale non corretta.");
  const passwordSalt = randomSalt();
  const passwordHash = await hashPassword(nextPassword, passwordSalt);
  await persistAccount({ ...account, passwordSalt, passwordHash });
}

export async function logoutAccount(): Promise<void> {
  try { await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) }); } catch { /* local logout still works offline */ }
  await idbDelete("sessions", SESSION_KEY);
}

export async function deleteAccount(accountId: string): Promise<void> {
  await idbDelete("accounts", accountId);
  writeAccountsMirror(readAccountsMirror().filter((item) => item.id !== accountId));
  const userRows = await idbGetAll<{ key: string }>("userData");
  await Promise.all(
    userRows
      .filter((row) => row.key.startsWith(`${accountId}:`))
      .map((row) => idbDelete("userData", row.key)),
  );
  const session = await idbGet<Session>("sessions", SESSION_KEY);
  if (session?.accountId === accountId) await logoutAccount();
}

export async function updateAccountName(accountId: string, name: string): Promise<Session | null> {
  const session = await idbGet<Session>('sessions', SESSION_KEY);
  if (session?.remote) {
    const result = await remoteAccount({ action: 'rename', name });
    await idbPut('sessions', result.session);
    return result.session;
  }
  const account = await idbGet<Account>("accounts", accountId);
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
  const accounts = await idbGetAll<Account>("accounts");
  if (accounts.length > 0) return null;
  return registerLocalAccount({
    email: "ospite@local.gymfood",
    name: legacy.name,
    password,
  });
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(digest);
}

async function remoteAccount(body: Record<string, unknown>): Promise<{session: Session; snapshot?: unknown; revision?: number; recoveryCode?: string}> {
  const response = await fetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json() as { ok?: boolean; error?: string; session: Session; snapshot?: unknown; revision?: number; recoveryCode?: string };
  if (!response.ok || !data.ok) throw new Error(data.error || 'Accesso cloud non riuscito');
  return data;
}
async function acceptRemote(result: Awaited<ReturnType<typeof remoteAccount>>, localId?: string) {
  const session = { ...result.session, recoveryCode: result.recoveryCode };
  if (Array.isArray(result.snapshot) && result.snapshot.length) await applyCloudRows(session.accountId, result.snapshot);
  else if (localId) await copyLocalData(localId, session.accountId);
  setCloudRevision(session.accountId, result.revision ?? 0);
  await idbPut('sessions', session);
  if (localId && !result.snapshot) {
    localStorage.setItem(`gym-cloud-dirty:${session.accountId}`, "true");
    try { await pushCloud(session); localStorage.removeItem(`gym-cloud-dirty:${session.accountId}`); } catch { /* automatic sync retries, local data retained */ }
  }
  return session;
}
export async function registerAccount(input: {email:string;name:string;password:string}): Promise<Session> {
  return acceptRemote(await remoteAccount({action:'register',...input}));
}
export async function loginAccount(input: {email:string;password:string}): Promise<Session> {
  try { const result = await remoteAccount({action:'login',...input}); const previous = await findAccountByEmail(input.email); return await acceptRemote(result, previous?.id); }
  catch (remoteError) {
    // A legacy account is migrated only after verifying its password on this device.
    let local: Session;
    try { local = await loginLocalAccount(input); } catch { throw remoteError; }
    if (input.password.length < 10) return local;
    try { return await acceptRemote(await remoteAccount({action:'register',...input,name:local.name}),local.accountId); }
    catch { return local; }
  }
}
export async function recoverAccount(input: {email:string;password:string;recoveryCode:string}): Promise<Session> {
  return acceptRemote(await remoteAccount({action:'recover',...input}));
}
export async function generateRecoveryCode(currentPassword: string) {
  const result = await remoteAccount({action:'recovery-code',currentPassword});
  return result.recoveryCode!;
}
export async function changePassword(accountId: string, currentPassword: string, nextPassword: string) {
  const session = await idbGet<Session>('sessions',SESSION_KEY);
  if (session?.remote) {
    const result = await remoteAccount({action:'change-password',currentPassword,password:nextPassword});
    await idbPut('sessions',result.session);
  } else {
    await changeLocalPassword(accountId,currentPassword,nextPassword);
    const account = await idbGet<Account>('accounts',accountId);
    if (account && nextPassword.length >= 10) await acceptRemote(await remoteAccount({action:'register',email:account.email,name:account.name,password:nextPassword}),accountId);
  }
}
