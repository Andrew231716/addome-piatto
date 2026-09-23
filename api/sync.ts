import type { IncomingMessage, ServerResponse } from "node:http";

type VercelRequest = IncomingMessage & {
  method?: string;
  body?: {
    accountId?: string;
    email?: string;
    payload?: unknown;
    action?: "pull" | "push";
  };
};

type VercelResponse = ServerResponse & {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
  end: (chunk?: unknown) => void;
};

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
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
    if (!accountId) {
      res.status(400).json({ ok: false, error: "accountId obbligatorio" });
      return;
    }

    const path = `cloud-data/${accountId}.json`;

    if (action === "pull") {
      const response = await githubRequest(path);
      if (response.status === 404) {
        res.status(200).json({ ok: true, payload: null });
        return;
      }
      if (!response.ok) {
        const text = await response.text();
        res.status(502).json({ ok: false, error: text });
        return;
      }
      const data = (await response.json()) as { content: string; encoding: string };
      const decoded = Buffer.from(data.content, "base64").toString("utf8");
      res.status(200).json({ ok: true, payload: JSON.parse(decoded) });
      return;
    }

    const payload = {
      email: body?.email ?? null,
      updatedAt: new Date().toISOString(),
      data: body?.payload ?? null,
    };
    const content = Buffer.from(JSON.stringify(payload, null, 2), "utf8").toString("base64");

    let sha: string | undefined;
    const existing = await githubRequest(path);
    if (existing.ok) {
      const current = (await existing.json()) as { sha: string };
      sha = current.sha;
    }

    const put = await githubRequest(path, {
      method: "PUT",
      body: JSON.stringify({
        message: `sync: ${accountId}`,
        content,
        sha,
        branch: process.env.GITHUB_DATA_BRANCH || "main",
      }),
    });

    if (!put.ok) {
      res.status(502).json({ ok: false, error: await put.text() });
      return;
    }

    res.status(200).json({ ok: true, syncedAt: payload.updatedAt });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "Sync non riuscita",
    });
  }
}
