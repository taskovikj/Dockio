import crypto from "node:crypto";
import { UserFacingError, redact } from "./validate";

export interface GitHubAppAuth {
  appId: string;
  privateKey: string;
}

export interface GitHubInstallationToken {
  token: string;
  expiresAt?: string;
}

export interface GitHubInstallationSummary {
  installationId: number;
  accountLogin: string;
  accountType: string;
  accountAvatarUrl?: string;
  targetType?: string;
  repositorySelection?: string;
  permissions?: Record<string, unknown>;
  events?: string[];
}

export interface GitHubRepositorySummary {
  githubRepoId: number;
  fullName: string;
  owner: string;
  name: string;
  private: boolean;
  defaultBranch: string;
  cloneUrl: string;
  htmlUrl: string;
  archived: boolean;
  disabled: boolean;
  pushedAt?: string;
  updatedAt?: string;
}

export interface GitHubBranchSummary {
  name: string;
  sha?: string;
  protected?: boolean;
}

export interface GitHubManifestConversion {
  id: number;
  name: string;
  slug?: string;
  htmlUrl?: string;
  pem: string;
  webhookSecret: string;
  clientId?: string;
  clientSecret?: string;
}

type Json = Record<string, unknown>;

const API = "https://api.github.com";

export function createGitHubAppJwt(auth: GitHubAppAuth) {
  if (!/^\d{1,20}$/.test(String(auth.appId || ""))) {
    throw new UserFacingError("GitHub App ID is invalid. Reconnect the GitHub App from the Git page.", 400);
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
  const payload = base64UrlJson({
    iat: now - 60,
    exp: now + 9 * 60,
    iss: auth.appId
  });
  const body = `${header}.${payload}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(body);
  signer.end();
  const privateKey = normalizePrivateKey(auth.privateKey);
  let signature: string;
  try {
    signature = signer.sign(privateKey).toString("base64url");
  } catch {
    throw new UserFacingError("GitHub App private key could not sign API requests. Reconnect GitHub or paste a fresh private key.", 400);
  }
  return `${body}.${signature}`;
}

export async function getInstallationAccessToken(auth: GitHubAppAuth, installationId: number): Promise<GitHubInstallationToken> {
  const json = await githubRequest<unknown>(`/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    token: createGitHubAppJwt(auth)
  });
  if (!isRecord(json)) {
    throw new UserFacingError("GitHub did not return an installation token response. Reinstall the GitHub App and try again.", 502);
  }
  const token = String(json.token || "");
  if (!token) throw new UserFacingError("GitHub did not return an installation token.", 502);
  return { token, expiresAt: typeof json.expires_at === "string" ? json.expires_at : undefined };
}

export async function listInstallations(auth: GitHubAppAuth): Promise<GitHubInstallationSummary[]> {
  const json = await githubRequest<unknown>(`/app/installations?per_page=100`, {
    token: createGitHubAppJwt(auth)
  });
  if (!Array.isArray(json)) {
    throw new UserFacingError("GitHub did not return an installations list. Click Install App, select repositories, then refresh installations.", 502);
  }
  return json.map((item) => {
    const row = item as Json;
    const account = (row.account || {}) as Json;
    return {
      installationId: Number(row.id),
      accountLogin: String(account.login || row.id || ""),
      accountType: String(account.type || "User"),
      accountAvatarUrl: typeof account.avatar_url === "string" ? account.avatar_url : undefined,
      targetType: typeof row.target_type === "string" ? row.target_type : undefined,
      repositorySelection: typeof row.repository_selection === "string" ? row.repository_selection : undefined,
      permissions: typeof row.permissions === "object" && row.permissions ? row.permissions as Record<string, unknown> : undefined,
      events: Array.isArray(row.events) ? row.events.map(String) : undefined
    };
  }).filter((installation) => Number.isInteger(installation.installationId) && installation.installationId > 0);
}

export async function listInstallationRepositories(token: string): Promise<GitHubRepositorySummary[]> {
  const json = await githubRequest<unknown>(`/installation/repositories?per_page=100`, { token });
  if (!isRecord(json) || !Array.isArray(json.repositories)) {
    throw new UserFacingError("GitHub did not return a repository list for this installation. Check repository access in the GitHub App install screen.", 502);
  }
  return json.repositories.map((item) => normalizeRepository(item as Json));
}

export async function listRepositoryBranches(token: string, fullName: string): Promise<GitHubBranchSummary[]> {
  const repo = normalizeGitHubRepoFullName(fullName);
  const json = await githubRequest<unknown>(`/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/branches?per_page=100`, { token });
  if (!Array.isArray(json)) {
    throw new UserFacingError("GitHub did not return branches for this repository. Check that the GitHub App can read repository contents.", 502);
  }
  return json.map((item) => {
    const row = item as Json;
    const commit = (row.commit || {}) as Json;
    return {
      name: String(row.name || ""),
      sha: typeof commit.sha === "string" ? commit.sha : undefined,
      protected: Boolean(row.protected)
    };
  }).filter((branch) => branch.name);
}

export async function convertGitHubManifestCode(code: string): Promise<GitHubManifestConversion> {
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(code)) {
    throw new UserFacingError("GitHub manifest callback code is invalid.", 400);
  }
  const json = await githubPublicRequest<Json>(`/app-manifests/${encodeURIComponent(code)}/conversions`, {
    method: "POST"
  });
  const id = Number(json.id);
  const pem = String(json.pem || "");
  const webhookSecret = String(json.webhook_secret || "");
  if (!Number.isInteger(id) || !pem || !webhookSecret) {
    throw new UserFacingError("GitHub did not return a complete App manifest conversion.", 502);
  }
  return {
    id,
    name: String(json.name || "GitHub"),
    slug: typeof json.slug === "string" ? json.slug : undefined,
    htmlUrl: typeof json.html_url === "string" ? json.html_url : undefined,
    pem,
    webhookSecret,
    clientId: typeof json.client_id === "string" ? json.client_id : undefined,
    clientSecret: typeof json.client_secret === "string" ? json.client_secret : undefined
  };
}

export function verifyGitHubSignature(rawBody: string, secret: string, signatureHeader: string | null) {
  if (!signatureHeader) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const actual = signatureHeader.trim();
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function branchFromGitHubRef(ref: string) {
  const prefix = "refs/heads/";
  if (!ref.startsWith(prefix)) return "";
  return ref.slice(prefix.length);
}

export function normalizeGitHubRepoFullName(value: string) {
  const fullName = value.trim().replace(/^https:\/\/github\.com\//i, "").replace(/\.git$/i, "").replace(/^\/+|\/+$/g, "");
  if (!/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(fullName)) {
    throw new UserFacingError("GitHub repository must look like owner/repo.", 400);
  }
  const [owner = "", name = ""] = fullName.split("/");
  return {
    fullName: `${owner}/${name}`,
    owner,
    name,
    cloneUrl: `https://github.com/${owner}/${name}.git`,
    htmlUrl: `https://github.com/${owner}/${name}`
  };
}

export function normalizePrivateKey(value: string) {
  const key = value.trim().replace(/\\n/g, "\n");
  if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(key) || !/-----END [A-Z ]*PRIVATE KEY-----/.test(key)) {
    throw new UserFacingError("GitHub App private key must be a PEM private key.", 400);
  }
  return key.endsWith("\n") ? key : key + "\n";
}

export function githubWebhookUrl(publicDockioUrl: string) {
  if (!publicDockioUrl) return "";
  const url = new URL(publicDockioUrl);
  url.pathname = "/api/webhooks/github";
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function githubRequest<T>(path: string, options: { method?: string; token: string; body?: unknown }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(API + path, {
      method: options.method || "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${options.token}`,
        "User-Agent": "Dockio-Panel/0.1",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.body ? { "Content-Type": "application/json" } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(30_000)
    });
  } catch (error) {
    throw new UserFacingError(`Could not reach GitHub API: ${redact(errorMessage(error))}`, 502);
  }
  const parsed = await parseGitHubResponse(response, path);
  if (!response.ok) {
    throw new UserFacingError(`GitHub API error: ${redact(githubApiMessage(parsed, response))}`, response.status >= 500 ? 502 : 400);
  }
  return parsed as T;
}

async function githubPublicRequest<T>(path: string, options: { method?: string; body?: unknown }): Promise<T> {
  let response: Response;
  try {
    response = await fetch(API + path, {
      method: options.method || "GET",
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Dockio-Panel/0.1",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.body ? { "Content-Type": "application/json" } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(30_000)
    });
  } catch (error) {
    throw new UserFacingError(`Could not reach GitHub API: ${redact(errorMessage(error))}`, 502);
  }
  const parsed = await parseGitHubResponse(response, path);
  if (!response.ok) {
    throw new UserFacingError(`GitHub API error: ${redact(githubApiMessage(parsed, response))}`, response.status >= 500 ? 502 : 400);
  }
  return parsed as T;
}

async function parseGitHubResponse(response: Response, path: string): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) return { message: text.slice(0, 300) };
    throw new UserFacingError(`GitHub returned an invalid JSON response for ${path}. Try again, then reconnect the GitHub App if it keeps happening.`, 502);
  }
}

function githubApiMessage(parsed: unknown, response: Response) {
  if (isRecord(parsed) && typeof parsed.message === "string" && parsed.message.trim()) return parsed.message;
  return `${response.status} ${response.statusText}`.trim();
}

function isRecord(value: unknown): value is Json {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "request failed";
}

function normalizeRepository(row: Json): GitHubRepositorySummary {
  const fullName = normalizeGitHubRepoFullName(String(row.full_name || ""));
  return {
    githubRepoId: Number(row.id),
    fullName: fullName.fullName,
    owner: fullName.owner,
    name: fullName.name,
    private: Boolean(row.private),
    defaultBranch: String(row.default_branch || "main"),
    cloneUrl: typeof row.clone_url === "string" ? row.clone_url : fullName.cloneUrl,
    htmlUrl: typeof row.html_url === "string" ? row.html_url : fullName.htmlUrl,
    archived: Boolean(row.archived),
    disabled: Boolean(row.disabled),
    pushedAt: typeof row.pushed_at === "string" ? row.pushed_at : undefined,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined
  };
}

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
