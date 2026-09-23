#!/usr/bin/env node
/**
 * Creates (if needed) the GitHub repo, pushes the current branch, and links it to Vercel.
 * Requires: GITHUB_TOKEN
 * Optional: GITHUB_USERNAME, VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error("GITHUB_TOKEN mancante");
  process.exit(1);
}

async function gh(path, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const err = new Error(data?.message || text || response.statusText);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

const me = await gh("/user");
const owner = process.env.GITHUB_USERNAME || me.login;
const repoName = process.env.GITHUB_REPO_NAME || "addome-piatto";
const fullName = `${owner}/${repoName}`;

console.log(`GitHub user: ${me.login}`);
console.log(`Target repo: ${fullName}`);

let repo;
try {
  repo = await gh(`/repos/${fullName}`);
  console.log("Repo già esistente");
} catch (error) {
  if (error.status !== 404) throw error;
  console.log("Creo il repository…");
  repo = await gh(me.type === "Organization" ? `/orgs/${owner}/repos` : "/user/repos", {
    method: "POST",
    body: JSON.stringify({
      name: repoName,
      description: "GYM & FOOD — allenamenti, nutrizione, progressi e coaching",
      private: false,
      auto_init: false,
    }),
  });
}

const remoteUrl = `https://x-access-token:${token}@github.com/${fullName}.git`;
if (!existsSync(".git")) {
  execSync("git init", { stdio: "inherit" });
}

try {
  execSync("git remote remove origin", { stdio: "ignore" });
} catch {
  /* no origin yet */
}
execSync(`git remote add origin ${remoteUrl}`, { stdio: "inherit" });
execSync("git checkout -B main", { stdio: "inherit" });
execSync("git add -A", { stdio: "inherit" });
try {
  execSync('git -c user.email="agent@cursor.local" -c user.name="Cursor Agent" commit -m "chore: publish GYM & FOOD source with auth, IndexedDB and API sync"', {
    stdio: "inherit",
  });
} catch {
  console.log("Nessun nuovo commit da creare");
}
execSync("git push -u origin main --force", { stdio: "inherit" });

const vercelToken = process.env.VERCEL_TOKEN;
const teamId = process.env.VERCEL_TEAM_ID || "team_61beDrc3HWIaHppqpNE3cCs0";
const projectId = process.env.VERCEL_PROJECT_ID || "prj_d5YizMWCQOqmBzEnUl4afnptZ6bS";

if (vercelToken) {
  console.log("Collego il repo al progetto Vercel…");
  const linkResponse = await fetch(
    `https://api.vercel.com/v9/projects/${projectId}/link?teamId=${teamId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "github",
        repo: repoName,
        org: owner,
        gitCredentialId: undefined,
      }),
    },
  );
  const linkText = await linkResponse.text();
  console.log("Vercel link:", linkResponse.status, linkText.slice(0, 500));

  // Set env for cloud sync
  for (const [key, value] of [
    ["GITHUB_TOKEN", token],
    ["GITHUB_REPO", fullName],
  ]) {
    await fetch(`https://api.vercel.com/v10/projects/${projectId}/env?teamId=${teamId}&upsert=true`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${vercelToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        key,
        value,
        type: "encrypted",
        target: ["production", "preview", "development"],
      }),
    });
  }
  console.log("Env GITHUB_TOKEN / GITHUB_REPO impostate su Vercel");
} else {
  console.log("VERCEL_TOKEN assente: skip link progetto");
}

console.log(`\nPubblicato: ${repo.html_url}`);
