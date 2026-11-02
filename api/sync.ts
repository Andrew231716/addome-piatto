import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

type VercelRequest = IncomingMessage & {
  method?: string;
  headers: IncomingMessage["headers"];
  body?: {
    accountId?: string;
    email?: string;
    payload?: unknown;
    action?: "pull" | "push";
    syncToken?: string;
  };
};

type VercelResponse = ServerResponse & {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
  end: (chunk?: unknown) => void;
};

type CloudEnvelope = {
  email?: string | null;
  updatedAt: string;
  syncTokenHash: string;
  data: unknown;
};

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function readBearer(req: VercelRequest) {
  const header = req.headers.authorization || req.headers.Authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return "";
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1]?.trim() || "";
}

function allowOrigin(req: VercelRequest) {
  const origin = (req.headers.origin as string | undefined) || "";
  if (!origin) return "*";
  try {
    const host = new URL(origin).hostname;
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".vercel.app") ||
      host === "addome-piatto.vercel.app"
    ) {
      return origin;
    }
  } catch {
    /* ignore */
  }
  return "https://addome-piatto.vercel.app";
}

async function readJson(req: VercelRequest) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as VercelRequest["body"];
}

async function githubRequest(path: string, init?: RequestInit) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) {
    throw new Error("GITHUB_TOKEN o GITHUB_REPO non configurati su Vercel.");
  }
  const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  return response;
}

async function readCloudFile(path: string): Promise<{ envelope: CloudEnvelope | null; sha?: string }> {
  const response = await githubRequest(path);
  if (response.status === 404) return { envelope: null };
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const data = (await response.json()) as { content: string; sha: string };
  const decoded = Buffer.from(data.content, "base64").toString("utf8");
  const parsed = JSON.parse(decoded) as CloudEnvelope & { data?: unknown };
  // Legacy files without syncTokenHash are locked until first authenticated reclaim is impossible —
  // require token hash match going forward; treat missing hash as unauthorized for pull/push.
  return { envelope: parsed, sha: data.sha };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = allowOrigin(req);
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  try {
    const body = await readJson(req);
    const accountId = body?.accountId?.trim();
    const action = body?.action ?? "push";
    const syncToken = (body?.syncToken || readBearer(req) || "").trim();

    if (!accountId) {
      res.status(400).json({ ok: false, error: "accountId obbligatorio" });
      return;
    }
    if (!syncToken || syncToken.length < 16) {
      res.status(401).json({ ok: false, error: "Token sync mancante. Esci e rientra nell’account." });
      return;
    }

    const path = `cloud-data/${accountId}.json`;
    const hash = tokenHash(syncToken);
    const existing = await readCloudFile(path);

    if (existing.envelope?.syncTokenHash && existing.envelope.syncTokenHash !== hash) {
      res.status(403).json({ ok: false, error: "Token sync non valido per questo account." });
      return;
    }

    // Legacy cloud files without hash: only allow push that claims ownership (sets hash), block pull.
    if (existing.envelope && !existing.envelope.syncTokenHash) {
      if (action === "pull") {
        res.status(403).json({
          ok: false,
          error: "Backup legacy senza token. Fai un nuovo caricamento cloud da questo dispositivo.",
        });
        return;
      }
    }

    if (action === "pull") {
      if (!existing.envelope) {
        res.status(200).json({ ok: true, payload: null });
        return;
      }
      res.status(200).json({ ok: true, payload: existing.envelope.data ?? null });
      return;
    }

    const envelope: CloudEnvelope = {
      email: body?.email ?? null,
      updatedAt: new Date().toISOString(),
      syncTokenHash: hash,
      data: body?.payload ?? null,
    };
    const content = Buffer.from(JSON.stringify(envelope, null, 2), "utf8").toString("base64");

    const put = await githubRequest(path, {
      method: "PUT",
      body: JSON.stringify({
        message: `sync: ${accountId}`,
        content,
        sha: existing.sha,
        branch: process.env.GITHUB_DATA_BRANCH || "main",
      }),
    });

    if (!put.ok) {
      res.status(502).json({ ok: false, error: await put.text() });
      return;
    }

    res.status(200).json({ ok: true, syncedAt: envelope.updatedAt });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Sync non riuscita",
    });
  }
}
