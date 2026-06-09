import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  appendDeploymentLog,
  audit,
  defaultPanelSettings,
  deploymentEvent,
  finishDeployment,
  getAppsDir,
  getDataDir,
  getLogsDir,
  getSecretsDir,
  readState,
  startDeployment,
  updateState,
  type DatabaseResource,
  type GitProviderConnection,
  type GitRepository,
  type ManagedApp,
  type PanelSettings,
  type PreviewDomainMode,
  type ServiceRole
} from "./state";
import {
  branchFromGitHubRef,
  convertGitHubManifestCode,
  getInstallationAccessToken,
  githubWebhookUrl,
  listInstallationRepositories,
  listInstallations,
  listRepositoryBranches,
  normalizeGitHubRepoFullName,
  normalizePrivateKey,
  verifyGitHubSignature
} from "./github";
import { decryptSecret, encryptSecret, secretStorageStatus } from "./secrets";
import {
  assertManagedPath,
  assertSafeAppName,
  assertSafeCidr,
  assertSafeDockerName,
  assertSafeDockerImage,
  assertSafeDomain,
  assertSafeEnvKey,
  assertSafeGitRepo,
  assertSafeId,
  assertNetworkPort,
  assertSafePort,
  assertSafeBranch,
  assertSafeComposeYaml,
  assertSafeOrigin,
  assertSafeRelativePath,
  assertSafeSystemdService,
  parseEnvText,
  redact,
  slug,
  UserFacingError
} from "./validate";

const execFileAsync = promisify(execFile);

export interface CommandOutput {
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
  code?: number;
}

export interface FirewallRule {
  number?: number;
  to: string;
  action: string;
  direction: string;
  from: string;
  port?: number;
  protocol?: "tcp" | "udp";
  public: boolean;
  raw: string;
}

export interface ParsedFirewallStatus {
  ok: boolean;
  active: boolean;
  status: string;
  defaultIncoming?: string;
  defaultOutgoing?: string;
  defaultRouted?: string;
  rules: FirewallRule[];
  exposedPorts: FirewallRule[];
  warnings: string[];
  raw: string;
  error?: string;
}

export interface DetectedService {
  id: string;
  name: string;
  appDirectory: string;
  mode: "dockerfile" | "node" | "static";
  serviceRole: ServiceRole;
  packageManager: "npm" | "pnpm" | "yarn";
  framework: string;
  buildCommand: string;
  startCommand: string;
  containerPort: number;
  healthPath: string;
  confidence: number;
  reasons: string[];
  requiredEnv: string[];
  hasDockerfile: boolean;
}

export interface RepoAnalysis {
  repoUrl: string;
  branch: string;
  commitSha?: string;
  services: DetectedService[];
  recommendedServiceId?: string;
  warnings: string[];
}

const PREVIEW_IMPORT_LINE = "import /etc/caddy/dockio/sites/*.caddy";

interface CpuTimesSnapshot {
  idle: number;
  total: number;
}

interface UsageSnapshot {
  at: string;
  cpuPercent: number;
  memoryPercent: number;
  storagePercent: number;
  containersRunning: number;
  containersTotal: number;
}

let previousCpuTimes: CpuTimesSnapshot | undefined;
const usageHistory: UsageSnapshot[] = [];

export async function createProject(input: { name: string; description?: string }) {
  const name = assertSafeAppName(input.name);
  const current = readState();
  const projectSlug = uniqueSlug(current.projects.map((project) => project.slug || project.id), slug(name));
  const now = new Date().toISOString();
  const project = {
    id: projectSlug + "-" + crypto.randomBytes(3).toString("hex"),
    name,
    slug: projectSlug,
    description: (input.description || "").trim().slice(0, 280),
    createdAt: now,
    updatedAt: now
  };
  updateState((state) => {
    state.projects.unshift(project);
  });
  audit("project.create", "Created project " + name + ".", { projectId: project.id });
  return project;
}

export async function deleteProject(input: { projectId: string; confirmation: string; deleteVolumes?: boolean }) {
  const projectId = assertSafeId(input.projectId, "projectId");
  const state = readState();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) throw new Error("Project not found.");
  if (input.confirmation !== project.slug) throw new UserFacingError(`Type ${project.slug} to confirm project deletion.`, 400);

  const projectApps = state.apps.filter((app) => app.projectId === projectId);
  const projectDatabases = state.databases.filter((database) => database.projectId === projectId);
  for (const app of projectApps) {
    await cleanupAppResources(app);
  }
  for (const database of projectDatabases) {
    await cleanupDatabaseResource(database, Boolean(input.deleteVolumes));
  }

  updateState((next) => {
    const appIds = new Set(projectApps.map((app) => app.id));
    removeDeploymentFiles(next.deployments.filter((deployment) => appIds.has(deployment.appId)));
    next.deployments = next.deployments.filter((deployment) => !appIds.has(deployment.appId));
    next.apps = next.apps.filter((app) => app.projectId !== projectId);
    next.databases = next.databases.filter((database) => database.projectId !== projectId);
    next.projects = next.projects.filter((item) => item.id !== projectId);
    if (next.projects.length === 0) {
      const now = new Date().toISOString();
      next.projects.push({ id: "default", name: "Default Project", slug: "default", description: "First project workspace", createdAt: now, updatedAt: now });
    }
  });
  audit("project.delete", "Deleted project " + project.name + ".", {
    projectId,
    apps: projectApps.length,
    databases: projectDatabases.length
  });
  return { ok: true };
}

export async function analyzeGitRepo(input: { repoUrl: string; branch?: string; appDirectory?: string }): Promise<RepoAnalysis> {
  const repoUrl = assertSafeGitRepo(input.repoUrl);
  const requestedBranch = assertSafeBranch(input.branch || "main");
  const requestedDirectory = assertSafeRelativePath(input.appDirectory || "", "App directory");
  const tempRoot = assertManagedPath(getDataDir(), path.join(getDataDir(), "tmp"));
  fs.mkdirSync(tempRoot, { recursive: true, mode: 0o750 });
  const cloneDir = assertManagedPath(tempRoot, path.join(tempRoot, "detect-" + crypto.randomBytes(6).toString("hex")));
  const warnings: string[] = [];

  try {
    let clone = await safeRun("git", ["clone", "--depth", "1", "--branch", requestedBranch, repoUrl, cloneDir]);
    if (!clone.ok && requestedBranch === "main") {
      warnings.push("Branch main was not found, so the repository default branch was analyzed instead.");
      clone = await safeRun("git", ["clone", "--depth", "1", repoUrl, cloneDir]);
    }
    if (!clone.ok) throw new UserFacingError("Could not clone repository for detection: " + (clone.stderr || clone.stdout), 400);

    const branch = await safeRun("git", ["rev-parse", "--abbrev-ref", "HEAD"], cloneDir);
    const commit = await safeRun("git", ["rev-parse", "--short", "HEAD"], cloneDir);
    const candidateDirs = requestedDirectory ? [requestedDirectory] : findDetectionCandidates(cloneDir);
    const services = candidateDirs
      .map((dir) => detectService(cloneDir, dir, repoUrl))
      .filter((service): service is DetectedService => Boolean(service))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 8);

    if (services.length === 0) {
      throw new UserFacingError("No deployable Node, static, or Dockerfile service was detected. Add a Dockerfile or package.json first.", 400);
    }
    if (findComposeFile(cloneDir)) warnings.push("A Compose file was found at the repository root. Use Compose From Git if this project is a multi-container stack.");
    if (services.some((service) => service.appDirectory && service.packageManager === "pnpm")) {
      warnings.push("Monorepo pnpm apps may need a repo-level Dockerfile if workspace packages are required during build.");
    }

    audit("repo.detect", "Detected deploy stack from public Git repository.", {
      repoUrl,
      branch: branch.ok ? branch.stdout.trim() : requestedBranch,
      services: services.map((service) => ({ directory: service.appDirectory, framework: service.framework, mode: service.mode }))
    });
    return {
      repoUrl,
      branch: branch.ok ? branch.stdout.trim() : requestedBranch,
      commitSha: commit.ok ? commit.stdout.trim() : undefined,
      services,
      recommendedServiceId: services[0]?.id,
      warnings
    };
  } finally {
    try {
      fs.rmSync(cloneDir, { recursive: true, force: true });
    } catch {
      // Temp cleanup is best effort; managed temp files are under DIO_DATA_DIR/tmp.
    }
  }
}

export async function serverStatus() {
  const settings = readState().settings;
  const [hostname, osRelease, disk, docker, caddy, ufw, ufwVerbose, publicIp, dockerContainers, dockerImages, dockerVolumes] = await Promise.all([
    safeRun("hostnamectl", []),
    safeRead("/etc/os-release"),
    safeRun("df", ["-Pk", "/"]),
    safeRun("docker", ["version", "--format", "{{.Server.Version}}"]),
    safeRun("systemctl", ["is-active", "caddy"]),
    safeRun("sudo", ["ufw", "status", "numbered"]),
    safeRun("sudo", ["ufw", "status", "verbose"]),
    fetchPublicIp(),
    safeRun("docker", ["ps", "-a", "--filter", "label=dockio=true", "--format", "{{.State}}"]),
    safeRun("docker", ["image", "ls", "--filter", "label=dockio=true", "-q"]),
    safeRun("docker", ["volume", "ls", "--filter", "label=dockio=true", "-q"])
  ]);
  const memory = memoryStatus();
  const cpu = cpuStatus();
  const storage = diskUsageStatus(disk);
  const dockerResources = dockerResourceStatus(dockerContainers, dockerImages, dockerVolumes);
  const usage = {
    at: new Date().toISOString(),
    cpu,
    memory,
    storage,
    dockerResources,
    uptime: uptimeStatus()
  };

  return {
    time: usage.at,
    hostname,
    osRelease,
    disk,
    memory,
    cpu,
    docker,
    caddy,
    ufw,
    firewall: parseFirewallStatus(ufw, ufwVerbose),
    usage,
    usageHistory: recordUsageSample(usage),
    publicIp,
    previewDomains: await previewDomainSystemStatus(settings),
    settings,
    dataDir: getDataDir(),
    node: process.version,
    platform: os.type() + " " + os.release() + " " + os.arch()
  };
}

export async function getFirewallStatus() {
  const [numbered, verbose] = await Promise.all([
    safeRun("sudo", ["ufw", "status", "numbered"]),
    safeRun("sudo", ["ufw", "status", "verbose"])
  ]);
  return {
    legacy: numbered,
    firewall: parseFirewallStatus(numbered, verbose)
  };
}

export async function updatePreviewSettings(input: Partial<PanelSettings>) {
  const settings = normalizePreviewSettings(input);
  updateState((state) => {
    state.settings = { ...state.settings, ...settings };
  });
  audit("settings.preview", "Updated auto preview domain settings.", {
    mode: settings.previewDomainMode,
    baseDomain: settings.previewBaseDomain,
    publicServerIp: settings.publicServerIp,
    portRange: [settings.localProxyPortRangeStart, settings.localProxyPortRangeEnd]
  });
  return readState().settings;
}

export async function updateAppSettings(input: {
  appId: string;
  projectId?: string;
  serviceRole?: ServiceRole;
  corsOrigins?: string[];
  databaseId?: string;
}) {
  const appId = assertSafeId(input.appId, "appId");
  const projectId = input.projectId ? assertSafeId(input.projectId, "projectId") : "";
  const databaseId = input.databaseId ? assertSafeId(input.databaseId, "databaseId") : "";
  const role = input.serviceRole || "fullstack";
  if (!["frontend", "backend", "worker", "fullstack"].includes(role)) throw new Error("Invalid service role.");
  const corsOrigins = (input.corsOrigins || []).map(assertSafeOrigin).filter(Boolean).slice(0, 20);
  const state = readState();
  if (projectId && !state.projects.some((project) => project.id === projectId)) throw new Error("Project not found.");
  if (databaseId && !state.databases.some((database) => database.id === databaseId)) throw new Error("Database not found.");
  updateState((next) => {
    const app = next.apps.find((item) => item.id === appId);
    if (!app) throw new Error("App not found.");
    app.projectId = projectId || undefined;
    app.serviceRole = role;
    app.corsOrigins = corsOrigins;
    app.databaseId = databaseId || undefined;
    app.updatedAt = new Date().toISOString();
    app.lastMessage = "App settings updated.";
  });
  audit("app.settings", "Updated app settings.", { appId, projectId, role, corsOrigins, databaseId });
  return readState().apps.find((item) => item.id === appId);
}

export async function createGitHubManifestFlow(input: {
  name?: string;
  publicDockioUrl: string;
  owner?: string;
}) {
  const publicDockioUrl = cleanPublicUrl(input.publicDockioUrl);
  const name = assertSafeAppName(input.name || "Dockio GitHub");
  const owner = cleanOptionalText(input.owner, 80);
  if (owner && !/^[A-Za-z0-9_.-]{1,80}$/.test(owner)) {
    throw new UserFacingError("GitHub organization/user owner contains invalid characters.", 400);
  }
  const stateToken = crypto.randomBytes(24).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const redirectUrl = joinPublicUrl(publicDockioUrl, "/api/git/github/manifest/callback");
  const webhookUrl = githubWebhookUrl(publicDockioUrl);
  const setupUrl = joinPublicUrl(publicDockioUrl, "/#tab=git");
  const manifest = {
    name,
    url: publicDockioUrl,
    hook_attributes: {
      url: webhookUrl,
      active: true
    },
    redirect_url: redirectUrl,
    callback_urls: [publicDockioUrl],
    setup_url: setupUrl,
    public: false,
    default_permissions: {
      contents: "read",
      metadata: "read"
    },
    default_events: ["push"]
  };
  const actionBase = owner
    ? `https://github.com/organizations/${encodeURIComponent(owner)}/settings/apps/new`
    : "https://github.com/settings/apps/new";
  const actionUrl = `${actionBase}?state=${encodeURIComponent(stateToken)}`;
  updateState((state) => {
    state.gitManifestSessions = (state.gitManifestSessions || []).filter((session) => {
      return session.status === "pending" && new Date(session.expiresAt).getTime() > Date.now();
    });
    state.gitManifestSessions.unshift({
      id: "ghmanifest-" + crypto.randomBytes(5).toString("hex"),
      provider: "github",
      stateHash: manifestStateHash(stateToken),
      name,
      publicDockioUrl,
      createdAt: now.toISOString(),
      expiresAt,
      status: "pending"
    });
    state.settings.publicDockioUrl = publicDockioUrl;
  });
  audit("git.github.manifest_start", "Started GitHub App manifest connection.", {
    publicDockioUrl,
    owner: owner || "personal",
    webhookUrl
  });
  return {
    actionUrl,
    manifest,
    expiresAt,
    webhookUrl,
    redirectUrl,
    warning: publicDockioUrl.startsWith("https://")
      ? ""
      : "GitHub can register this App over HTTP, but production webhooks and public panel access should use HTTPS."
  };
}

export async function completeGitHubManifestFlow(input: { code: string; state: string }) {
  const stateToken = input.state.trim();
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(stateToken)) throw new UserFacingError("GitHub manifest state is invalid.", 400);
  const stateHash = manifestStateHash(stateToken);
  const now = Date.now();
  const session = readState().gitManifestSessions.find((item) => item.stateHash === stateHash);
  if (!session || session.status !== "pending") {
    throw new UserFacingError("GitHub connection request was not found or was already used.", 400);
  }
  if (new Date(session.expiresAt).getTime() <= now) {
    updateState((state) => {
      const current = state.gitManifestSessions.find((item) => item.id === session.id);
      if (current) current.status = "expired";
    });
    throw new UserFacingError("GitHub connection request expired. Start Connect GitHub again.", 400);
  }

  try {
    const conversion = await convertGitHubManifestCode(input.code.trim());
    const appUrl = conversion.htmlUrl || (conversion.slug ? `https://github.com/apps/${conversion.slug}` : undefined);
    const installUrl = conversion.slug ? `https://github.com/apps/${conversion.slug}/installations/new` : undefined;
    const connection = await saveGitHubConnection({
      name: conversion.name || session.name,
      appId: String(conversion.id),
      clientId: conversion.clientId || "",
      clientSecret: conversion.clientSecret || "",
      appSlug: conversion.slug || "",
      appUrl,
      installUrl,
      privateKey: conversion.pem,
      webhookSecret: conversion.webhookSecret,
      publicDockioUrl: session.publicDockioUrl
    });
    updateState((state) => {
      const current = state.gitManifestSessions.find((item) => item.id === session.id);
      if (current) {
        current.status = "completed";
        current.completedConnectionId = connection?.id;
      }
    });
    audit("git.github.manifest_complete", "Completed GitHub App manifest connection.", {
      connectionId: connection?.id,
      appId: conversion.id,
      appSlug: conversion.slug
    });
    return connection;
  } catch (error) {
    updateState((state) => {
      const current = state.gitManifestSessions.find((item) => item.id === session.id);
      if (current) {
        current.status = "error";
        current.errorMessage = error instanceof Error ? redact(error.message).slice(0, 500) : "GitHub manifest conversion failed.";
      }
    });
    throw error;
  }
}

export async function saveGitHubConnection(input: {
  id?: string;
  name: string;
  appId: string;
  clientId?: string;
  clientSecret?: string;
  appSlug?: string;
  appUrl?: string;
  installUrl?: string;
  privateKey: string;
  webhookSecret: string;
  publicDockioUrl?: string;
}) {
  const name = assertSafeAppName(input.name || "GitHub");
  const appId = String(input.appId || "").trim();
  if (!/^\d{1,20}$/.test(appId)) throw new UserFacingError("GitHub App ID must be numeric.", 400);
  const privateKey = normalizePrivateKey(input.privateKey);
  const webhookSecret = input.webhookSecret.trim();
  if (webhookSecret.length < 12 || webhookSecret.length > 240) throw new UserFacingError("Webhook secret must be 12-240 characters.", 400);
  const publicDockioUrl = input.publicDockioUrl ? cleanPublicUrl(input.publicDockioUrl) : undefined;
  const now = new Date().toISOString();
  const id = input.id ? assertSafeId(input.id, "connectionId") : "github-" + crypto.randomBytes(5).toString("hex");
  updateState((state) => {
    const existing = state.gitConnections.find((connection) => connection.id === id);
    const next: GitProviderConnection = {
      id,
      provider: "github",
      name,
      appId,
      clientId: cleanOptionalText(input.clientId, 120),
      appSlug: cleanOptionalText(input.appSlug, 120),
      appUrl: cleanOptionalUrl(input.appUrl),
      installUrl: cleanOptionalUrl(input.installUrl),
      privateKeyEncrypted: encryptSecret(privateKey),
      webhookSecretEncrypted: encryptSecret(webhookSecret),
      clientSecretEncrypted: input.clientSecret?.trim() ? encryptSecret(input.clientSecret.trim()) : existing?.clientSecretEncrypted,
      status: "connected",
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    if (existing) Object.assign(existing, next);
    else state.gitConnections.unshift(next);
    if (publicDockioUrl !== undefined) state.settings.publicDockioUrl = publicDockioUrl;
  });
  audit("git.github.save", "Saved GitHub App connection.", { connectionId: id, appId, name, publicDockioUrl });
  return readState().gitConnections.find((connection) => connection.id === id);
}

export async function disconnectGitHubConnection(connectionId: string) {
  const id = assertSafeId(connectionId, "connectionId");
  updateState((state) => {
    state.gitConnections = state.gitConnections.filter((connection) => connection.id !== id);
    const installationIds = new Set(state.gitInstallations.filter((installation) => installation.providerConnectionId === id).map((installation) => installation.id));
    state.gitInstallations = state.gitInstallations.filter((installation) => installation.providerConnectionId !== id);
    state.gitRepositories = state.gitRepositories.filter((repository) => !installationIds.has(repository.installationId));
  });
  audit("git.github.disconnect", "Disconnected GitHub App connection.", { connectionId: id });
  return { ok: true };
}

export async function syncGitHubInstallations(connectionId: string) {
  const connection = getGitHubConnection(connectionId);
  try {
    const auth = githubAuthForConnection(connection);
    const installations = await listInstallations(auth);
    const now = new Date().toISOString();
    updateState((state) => {
      const currentConnection = state.gitConnections.find((item) => item.id === connection.id);
      if (currentConnection) {
        currentConnection.status = "connected";
        currentConnection.errorMessage = undefined;
        currentConnection.updatedAt = now;
      }
      for (const installation of installations) {
        const id = `ghinst-${connection.id}-${installation.installationId}`;
        const existing = state.gitInstallations.find((item) => item.id === id);
        const next = {
          id,
          providerConnectionId: connection.id,
          installationId: installation.installationId,
          accountLogin: installation.accountLogin,
          accountType: installation.accountType,
          accountAvatarUrl: installation.accountAvatarUrl,
          targetType: installation.targetType,
          repositorySelection: installation.repositorySelection,
          permissions: installation.permissions,
          events: installation.events,
          status: "active" as const,
          errorMessage: undefined,
          createdAt: existing?.createdAt || now,
          updatedAt: now,
          lastSyncedAt: now
        };
        if (existing) Object.assign(existing, next);
        else state.gitInstallations.unshift(next);
      }
    });
    audit("git.github.sync_installations", "Synced GitHub App installations.", { connectionId: connection.id, count: installations.length });
    return readState().gitInstallations.filter((installation) => installation.providerConnectionId === connection.id);
  } catch (error) {
    const message = normalizeGitHubSyncError(error, "installations");
    updateState((state) => {
      const currentConnection = state.gitConnections.find((item) => item.id === connection.id);
      if (currentConnection) {
        currentConnection.status = "error";
        currentConnection.errorMessage = message;
        currentConnection.updatedAt = new Date().toISOString();
      }
    });
    audit("git.github.sync_installations_failed", "GitHub App installation sync failed.", { connectionId: connection.id, error: message });
    throw new UserFacingError(message, error instanceof UserFacingError ? error.status : 502);
  }
}

export async function syncGitHubRepositories(installationRecordId: string) {
  const installation = getGitHubInstallation(installationRecordId);
  const connection = getGitHubConnection(installation.providerConnectionId);
  try {
    const token = await getInstallationTokenForRecord(connection, installation.installationId);
    const repos = await listInstallationRepositories(token.token);
    const now = new Date().toISOString();
    updateState((state) => {
      const seen = new Set<number>();
      for (const repo of repos) {
        seen.add(repo.githubRepoId);
        const id = `ghrepo-${repo.githubRepoId}`;
        const existing = state.gitRepositories.find((item) => item.id === id);
        const next: GitRepository = {
          id,
          installationId: installation.id,
          provider: "github",
          githubRepoId: repo.githubRepoId,
          fullName: repo.fullName,
          owner: repo.owner,
          name: repo.name,
          private: repo.private,
          defaultBranch: repo.defaultBranch,
          cloneUrl: repo.cloneUrl,
          htmlUrl: repo.htmlUrl,
          archived: repo.archived,
          disabled: repo.disabled,
          pushedAt: repo.pushedAt,
          updatedAt: repo.updatedAt,
          lastSyncedAt: now
        };
        if (existing) Object.assign(existing, next);
        else state.gitRepositories.unshift(next);
      }
      state.gitRepositories = state.gitRepositories.filter((repo) => repo.installationId !== installation.id || seen.has(repo.githubRepoId));
      const current = state.gitInstallations.find((item) => item.id === installation.id);
      if (current) {
        current.status = "active";
        current.errorMessage = undefined;
        current.updatedAt = now;
        current.lastSyncedAt = now;
      }
    });
    audit("git.github.sync_repositories", "Synced GitHub repositories.", { installationId: installation.installationId, count: repos.length });
    return readState().gitRepositories.filter((repo) => repo.installationId === installation.id);
  } catch (error) {
    const message = normalizeGitHubSyncError(error, "repositories");
    updateState((state) => {
      const current = state.gitInstallations.find((item) => item.id === installation.id);
      if (current) {
        current.status = "error";
        current.errorMessage = message;
        current.updatedAt = new Date().toISOString();
      }
    });
    audit("git.github.sync_repositories_failed", "GitHub repository sync failed.", { installationId: installation.id, error: message });
    throw new UserFacingError(message, error instanceof UserFacingError ? error.status : 502);
  }
}

function normalizeGitHubSyncError(error: unknown, scope: "installations" | "repositories") {
  const fallback = scope === "installations"
    ? "GitHub installation sync failed. Click Install App, select repositories, then refresh installations."
    : "GitHub repository sync failed. Check repository access in the GitHub App installation, then refresh repositories.";
  const raw = error instanceof Error ? error.message : "";
  const message = redact(raw || fallback).trim();
  const lower = message.toLowerCase();
  if (lower.includes("unexpected end of json input") || lower.includes("invalid json")) {
    return scope === "installations"
      ? "GitHub returned an empty or invalid installation response. Click Install App, select repositories, then refresh installations."
      : "GitHub returned an empty or invalid repository response. Reinstall or update repository access, then refresh repositories.";
  }
  if (lower.includes("bad credentials") || lower.includes("integration not found") || lower.includes("jwt") || lower.includes("private key")) {
    return "GitHub App authentication failed. Reconnect GitHub from the Git page or paste a fresh private key.";
  }
  if (lower.includes("not found") && scope === "repositories") {
    return "GitHub cannot see repositories for this installation. Open Install App, select at least one repository, then refresh repositories.";
  }
  return message.startsWith("GitHub") ? message : `${fallback} ${message}`;
}

export async function getGitHubBranches(input: { installationId: string; repositoryId: string }) {
  const installation = getGitHubInstallation(input.installationId);
  const repository = getGitHubRepository(input.repositoryId);
  if (repository.installationId !== installation.id) throw new Error("Repository does not belong to this GitHub installation.");
  const connection = getGitHubConnection(installation.providerConnectionId);
  const token = await getInstallationTokenForRecord(connection, installation.installationId);
  return listRepositoryBranches(token.token, repository.fullName);
}

export async function analyzeGitHubRepository(input: { installationId: string; repositoryId: string; branch?: string; appDirectory?: string }): Promise<RepoAnalysis> {
  const installation = getGitHubInstallation(input.installationId);
  const repository = getGitHubRepository(input.repositoryId);
  if (repository.installationId !== installation.id) throw new Error("Repository does not belong to this GitHub installation.");
  const connection = getGitHubConnection(installation.providerConnectionId);
  const token = await getInstallationTokenForRecord(connection, installation.installationId);
  const gitAuth = createGitAskPass(token.token);
  const branch = assertSafeBranch(input.branch || repository.defaultBranch || "main");
  const appDirectory = assertSafeRelativePath(input.appDirectory || "", "App directory");
  const tempRoot = assertManagedPath(getDataDir(), path.join(getDataDir(), "tmp"));
  fs.mkdirSync(tempRoot, { recursive: true, mode: 0o750 });
  const cloneDir = assertManagedPath(tempRoot, path.join(tempRoot, "detect-" + crypto.randomBytes(6).toString("hex")));
  const warnings: string[] = [];
  try {
    const clone = await safeRun("git", ["clone", "--depth", "1", "--branch", branch, repository.cloneUrl, cloneDir], undefined, gitAuth.env);
    if (!clone.ok) throw new UserFacingError("Could not clone GitHub App repository for detection: " + (clone.stderr || clone.stdout), 400);
    const currentBranch = await safeRun("git", ["rev-parse", "--abbrev-ref", "HEAD"], cloneDir);
    const commit = await safeRun("git", ["rev-parse", "--short", "HEAD"], cloneDir);
    const candidateDirs = appDirectory ? [appDirectory] : findDetectionCandidates(cloneDir);
    const services = candidateDirs
      .map((dir) => detectService(cloneDir, dir, repository.cloneUrl))
      .filter((service): service is DetectedService => Boolean(service))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 8);
    if (services.length === 0) throw new UserFacingError("No deployable Node, static, or Dockerfile service was detected in this GitHub repository.", 400);
    if (findComposeFile(cloneDir)) warnings.push("A Compose file was found at the repository root. Use Compose From Git if this project is a multi-container stack.");
    audit("repo.detect_github", "Detected deploy stack from GitHub App repository.", { repository: repository.fullName, branch, services: services.length });
    return {
      repoUrl: repository.cloneUrl,
      branch: currentBranch.ok ? currentBranch.stdout.trim() : branch,
      commitSha: commit.ok ? commit.stdout.trim() : undefined,
      services,
      recommendedServiceId: services[0]?.id,
      warnings
    };
  } finally {
    gitAuth.cleanup();
    try {
      fs.rmSync(cloneDir, { recursive: true, force: true });
    } catch {
      // Managed temp cleanup is best effort.
    }
  }
}

export async function deployGitHubApp(input: {
  name: string;
  projectId?: string;
  serviceRole?: ServiceRole;
  gitInstallationId: string;
  gitRepositoryId: string;
  branch?: string;
  appDirectory?: string;
  mode: "dockerfile" | "node" | "static";
  buildCommand?: string;
  startCommand?: string;
  containerPort?: number;
  healthPath?: string;
  envText?: string;
  corsOrigins?: string[];
  databaseId?: string;
  publicPreview?: boolean;
  previewDomainEnabled?: boolean;
  autoDeployEnabled?: boolean;
}) {
  const name = assertSafeAppName(input.name);
  const projectId = input.projectId ? assertSafeId(input.projectId, "projectId") : "";
  const databaseId = input.databaseId ? assertSafeId(input.databaseId, "databaseId") : "";
  const installation = getGitHubInstallation(input.gitInstallationId);
  const repository = getGitHubRepository(input.gitRepositoryId);
  if (repository.installationId !== installation.id) throw new Error("Repository does not belong to this GitHub installation.");
  if (repository.archived || repository.disabled) throw new UserFacingError("This GitHub repository is archived or disabled and cannot be deployed.", 400);
  const connection = getGitHubConnection(installation.providerConnectionId);
  const corsOrigins = (input.corsOrigins || []).map(assertSafeOrigin).filter(Boolean).slice(0, 20);
  const state = readState();
  if (projectId && !state.projects.some((project) => project.id === projectId)) throw new Error("Project not found.");
  if (databaseId && !state.databases.some((database) => database.id === databaseId)) throw new Error("Database not found.");
  const project = projectId ? state.projects.find((item) => item.id === projectId) : undefined;
  const database = databaseId ? state.databases.find((item) => item.id === databaseId) : undefined;
  const appSlug = uniqueSlug(state.apps.filter((app) => app.projectId === projectId).map((app) => app.slug || app.id), slug(name));
  const id = appSlug + "-" + crypto.randomBytes(3).toString("hex");
  const appDir = assertManagedPath(getAppsDir(), path.join(getAppsDir(), project?.slug || "default", appSlug));
  fs.mkdirSync(appDir, { recursive: true, mode: 0o750 });
  const branch = assertSafeBranch(input.branch || repository.defaultBranch || "main");
  const appDirectory = assertSafeRelativePath(input.appDirectory || "", "App directory");
  const internalPort = input.mode === "static" ? 80 : assertContainerPort(input.containerPort || 3000);
  const localProxyPort = await findOpenProxyPort(state.settings);
  const publicPreview = Boolean(input.publicPreview);
  const publicPreviewPort = publicPreview ? await findOpenPort() : undefined;
  const previewDomainEnabled = input.previewDomainEnabled ?? (state.settings.autoPreviewDomainsEnabled && state.settings.previewDomainMode !== "disabled");
  const env = parseEnvText(input.envText || "");
  const now = new Date().toISOString();
  const app: ManagedApp = {
    id,
    projectId: projectId || undefined,
    name,
    slug: appSlug,
    serviceRole: input.serviceRole || "fullstack",
    strategy: "docker",
    source: "git",
    sourceType: "github-app",
    gitProviderConnectionId: connection.id,
    gitInstallationId: installation.id,
    gitRepositoryId: repository.id,
    repoFullName: repository.fullName,
    githubRepoId: repository.githubRepoId,
    repoUrl: repository.cloneUrl,
    branch,
    autoDeployEnabled: Boolean(input.autoDeployEnabled),
    autoDeployBranch: branch,
    appDirectory,
    deployMode: input.mode,
    buildCommand: cleanCommand(input.buildCommand || ""),
    startCommand: cleanCommand(input.startCommand || ""),
    containerPort: internalPort,
    internalPort,
    healthPath: cleanHealthPath(input.healthPath || "/"),
    envKeys: uniqueStrings([...env.keys, ...(database ? [database.envKey] : [])]),
    corsOrigins,
    databaseId: databaseId || undefined,
    port: localProxyPort,
    localProxyPort,
    publicPreviewPort,
    publicPreview,
    portBind: publicPreview ? "public" : "localhost",
    previewDomainEnabled,
    previewDomainStatus: previewDomainEnabled ? "pending" : "disabled",
    status: "created",
    rootDir: appDir,
    createdAt: now,
    updatedAt: now
  };
  updateState((state) => {
    state.apps.unshift(app);
  });

  return executeGitDeployment({
    appId: app.id,
    action: "deploy",
    env,
    auditMessage: "GitHub App service deployed.",
    trigger: "manual",
    provider: "github_app",
    repositoryFullName: repository.fullName
  });
}

export async function updateGitHubAppDeployment(appId: string, input: {
  name: string;
  projectId?: string;
  serviceRole?: ServiceRole;
  gitInstallationId: string;
  gitRepositoryId: string;
  branch?: string;
  appDirectory?: string;
  mode: "dockerfile" | "node" | "static";
  buildCommand?: string;
  startCommand?: string;
  containerPort?: number;
  healthPath?: string;
  envText?: string;
  corsOrigins?: string[];
  databaseId?: string;
  publicPreview?: boolean;
  previewDomainEnabled?: boolean;
  autoDeployEnabled?: boolean;
}) {
  const existing = getManagedApp(appId);
  if (existing.source !== "git" || existing.sourceType !== "github-app") {
    throw new Error("Only GitHub App services can be edited with this action.");
  }
  const name = assertSafeAppName(input.name);
  const projectId = input.projectId ? assertSafeId(input.projectId, "projectId") : existing.projectId || "";
  const databaseId = input.databaseId ? assertSafeId(input.databaseId, "databaseId") : "";
  const installation = getGitHubInstallation(input.gitInstallationId);
  const repository = getGitHubRepository(input.gitRepositoryId);
  if (repository.installationId !== installation.id) throw new Error("Repository does not belong to this GitHub installation.");
  const connection = getGitHubConnection(installation.providerConnectionId);
  const state = readState();
  if (projectId && !state.projects.some((project) => project.id === projectId)) throw new Error("Project not found.");
  if (databaseId && !state.databases.some((database) => database.id === databaseId)) throw new Error("Database not found.");
  const branch = assertSafeBranch(input.branch || existing.branch || repository.defaultBranch || "main");
  const appDirectory = assertSafeRelativePath(input.appDirectory || "", "App directory");
  const env = parseEnvText(input.envText?.trim() ? input.envText : userEnvText(existing));
  const publicPreview = Boolean(input.publicPreview);
  const previewDomainEnabled = input.previewDomainEnabled ?? existing.previewDomainEnabled ?? (state.settings.autoPreviewDomainsEnabled && state.settings.previewDomainMode !== "disabled");
  updateState((next) => {
    const app = next.apps.find((item) => item.id === existing.id);
    if (!app) throw new Error("App not found.");
    Object.assign(app, {
      name,
      projectId: projectId || undefined,
      serviceRole: input.serviceRole || app.serviceRole || "fullstack",
      strategy: "docker",
      source: "git",
      sourceType: "github-app",
      gitProviderConnectionId: connection.id,
      gitInstallationId: installation.id,
      gitRepositoryId: repository.id,
      repoFullName: repository.fullName,
      githubRepoId: repository.githubRepoId,
      repoUrl: repository.cloneUrl,
      branch,
      autoDeployEnabled: Boolean(input.autoDeployEnabled),
      autoDeployBranch: branch,
      appDirectory,
      deployMode: input.mode,
      buildCommand: cleanCommand(input.buildCommand || ""),
      startCommand: cleanCommand(input.startCommand || ""),
      containerPort: input.mode === "static" ? 80 : assertContainerPort(input.containerPort || app.containerPort || 3000),
      internalPort: input.mode === "static" ? 80 : assertContainerPort(input.containerPort || app.containerPort || 3000),
      healthPath: cleanHealthPath(input.healthPath || app.healthPath || "/"),
      envKeys: uniqueStrings([...env.keys, ...(databaseId ? [state.databases.find((database) => database.id === databaseId)?.envKey || "DATABASE_URL"] : [])]),
      corsOrigins: (input.corsOrigins || []).map(assertSafeOrigin).filter(Boolean).slice(0, 20),
      databaseId: databaseId || undefined,
      publicPreview,
      publicPreviewPort: publicPreview ? app.publicPreviewPort : undefined,
      portBind: publicPreview ? "public" : "localhost",
      previewDomainEnabled,
      previewDomainStatus: previewDomainEnabled ? (app.previewDomainStatus === "active" ? "active" : "pending") : "disabled",
      status: "created",
      lastMessage: "GitHub App redeploy queued with updated settings.",
      updatedAt: new Date().toISOString()
    });
  });
  let updated = getManagedApp(existing.id);
  if (!updated.localProxyPort && !updated.port) {
    const localProxyPort = await findOpenProxyPort(readState().settings);
    markApp(updated.id, { port: localProxyPort, localProxyPort });
    updated = getManagedApp(updated.id);
  }
  if (updated.publicPreview && !updated.publicPreviewPort) {
    const publicPreviewPort = await findOpenPort();
    markApp(updated.id, { publicPreviewPort });
  }
  return executeGitDeployment({
    appId: updated.id,
    action: "redeploy",
    env,
    auditMessage: "GitHub App service updated and redeployed.",
    trigger: "manual",
    provider: "github_app",
    repositoryFullName: repository.fullName
  });
}

const appDeploymentQueue = new Map<string, Promise<void>>();

export async function handleGitHubWebhook(request: Request) {
  const rawBody = await request.text();
  const event = request.headers.get("x-github-event") || "";
  const deliveryId = request.headers.get("x-github-delivery") || "";
  const signature = request.headers.get("x-hub-signature-256");
  const state = readState();
  const connection = state.gitConnections.find((item) => {
    if (!item.webhookSecretEncrypted) return false;
    try {
      return verifyGitHubSignature(rawBody, decryptSecret(item.webhookSecretEncrypted), signature);
    } catch {
      return false;
    }
  });

  if (!connection) {
    audit("git.github.webhook_rejected", "Rejected GitHub webhook with invalid or missing signature.", { event, deliveryId });
    throw new UserFacingError("Invalid GitHub webhook signature.", 401);
  }

  if (event !== "push") {
    recordGitWebhookEvent({
      providerConnectionId: connection.id,
      event,
      deliveryId,
      status: "ignored",
      message: `Ignored unsupported GitHub event ${event || "unknown"}.`
    });
    return { status: "ignored", message: "Only push events are handled right now." };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw new UserFacingError("Malformed GitHub webhook payload.", 400);
  }
  const repository = (payload.repository || {}) as Record<string, unknown>;
  const installation = (payload.installation || {}) as Record<string, unknown>;
  const repoFullName = String(repository.full_name || "");
  const githubRepoId = Number(repository.id || 0);
  const installationId = Number(installation.id || 0);
  const branch = branchFromGitHubRef(String(payload.ref || ""));
  const commitSha = String(payload.after || "");
  const commits = Array.isArray(payload.commits) ? payload.commits as Array<Record<string, unknown>> : [];
  const headCommit = (payload.head_commit || commits[commits.length - 1] || {}) as Record<string, unknown>;
  const commitMessage = typeof headCommit.message === "string" ? headCommit.message.split(/\r?\n/)[0]?.slice(0, 180) || "" : "";
  const pusher = typeof (payload.pusher as Record<string, unknown> | undefined)?.name === "string"
    ? String((payload.pusher as Record<string, unknown>).name)
    : typeof (payload.sender as Record<string, unknown> | undefined)?.login === "string"
      ? String((payload.sender as Record<string, unknown>).login)
      : "";
  if (!repoFullName || !branch || !githubRepoId) {
    recordGitWebhookEvent({
      providerConnectionId: connection.id,
      event,
      deliveryId,
      status: "ignored",
      message: "Push payload did not include repository id/full_name or a branch ref."
    });
    return { status: "ignored", message: "Push payload was missing repository or branch details." };
  }

  const latest = readState();
  const candidates = latest.apps.filter((app) => app.source === "git" && app.sourceType === "github-app" && app.autoDeployEnabled);
  const matches = candidates.filter((app) => {
    const repoMatches = (app.githubRepoId && app.githubRepoId === githubRepoId) || (app.repoFullName || "").toLowerCase() === repoFullName.toLowerCase();
    const branchMatches = (app.autoDeployBranch || app.branch || "main") === branch;
    const installationMatches = !app.gitInstallationId || latest.gitInstallations.find((item) => item.id === app.gitInstallationId)?.installationId === installationId;
    return repoMatches && branchMatches && installationMatches;
  });

  if (matches.length === 0) {
    const reason = candidates.some((app) => ((app.githubRepoId && app.githubRepoId === githubRepoId) || (app.repoFullName || "").toLowerCase() === repoFullName.toLowerCase()))
      ? `No auto-deploy service matched branch ${branch}.`
      : `No auto-deploy service is watching ${repoFullName}.`;
    recordGitWebhookEvent({
      providerConnectionId: connection.id,
      installationId,
      repositoryFullName: repoFullName,
      githubRepoId,
      branch,
      event,
      deliveryId,
      status: "ignored",
      message: reason
    });
    return { status: "ignored", message: reason };
  }

  for (const app of matches) {
    queueGitHubAutoDeploy(app.id, {
      deliveryId,
      repoFullName,
      branch,
      commitSha,
      commitMessage,
      pusher
    });
  }
  recordGitWebhookEvent({
    providerConnectionId: connection.id,
    installationId,
    repositoryFullName: repoFullName,
    githubRepoId,
    branch,
    event,
    deliveryId,
    status: "accepted",
    message: `Queued ${matches.length} auto-deploy${matches.length === 1 ? "" : "s"} for ${repoFullName}@${branch}.`
  });
  return { status: "accepted", queued: matches.length };
}

export async function setGitHubAutoDeploy(input: { appId: string; enabled: boolean; branch?: string }) {
  const appId = assertSafeId(input.appId, "appId");
  const branch = input.branch ? assertSafeBranch(input.branch) : "";
  updateState((state) => {
    const app = state.apps.find((item) => item.id === appId);
    if (!app) throw new Error("App not found.");
    if (app.sourceType !== "github-app") throw new Error("Auto-deploy is available for GitHub App services only.");
    app.autoDeployEnabled = Boolean(input.enabled);
    app.autoDeployBranch = branch || app.branch || "main";
    app.updatedAt = new Date().toISOString();
    app.lastMessage = input.enabled ? `Auto-deploy enabled for ${app.autoDeployBranch}.` : "Auto-deploy disabled.";
  });
  audit("git.github.autodeploy", input.enabled ? "Enabled GitHub auto-deploy." : "Disabled GitHub auto-deploy.", { appId, branch });
  return readState().apps.find((app) => app.id === appId);
}

export function gitIntegrationStatus() {
  const state = readState();
  return {
    connections: state.gitConnections.length,
    installations: state.gitInstallations.length,
    repositories: state.gitRepositories.length,
    webhookUrl: githubWebhookUrl(state.settings.publicDockioUrl || ""),
    publicDockioUrl: state.settings.publicDockioUrl || "",
    secretStorage: secretStorageStatus(),
    recentWebhooks: state.gitWebhookEvents.slice(0, 20)
  };
}

export async function deployGitApp(input: {
  name: string;
  projectId?: string;
  serviceRole?: ServiceRole;
  repoUrl: string;
  branch?: string;
  appDirectory?: string;
  mode: "dockerfile" | "node" | "static";
  buildCommand?: string;
  startCommand?: string;
  containerPort?: number;
  healthPath?: string;
  envText?: string;
  corsOrigins?: string[];
  databaseId?: string;
  publicPreview?: boolean;
  previewDomainEnabled?: boolean;
}) {
  const name = assertSafeAppName(input.name);
  const projectId = input.projectId ? assertSafeId(input.projectId, "projectId") : "";
  const databaseId = input.databaseId ? assertSafeId(input.databaseId, "databaseId") : "";
  const corsOrigins = (input.corsOrigins || []).map(assertSafeOrigin).filter(Boolean).slice(0, 20);
  const state = readState();
  if (projectId && !state.projects.some((project) => project.id === projectId)) throw new Error("Project not found.");
  if (databaseId && !state.databases.some((database) => database.id === databaseId)) throw new Error("Database not found.");
  const project = projectId ? state.projects.find((item) => item.id === projectId) : undefined;
  const database = databaseId ? state.databases.find((item) => item.id === databaseId) : undefined;
  const appSlug = uniqueSlug(state.apps.filter((app) => app.projectId === projectId).map((app) => app.slug || app.id), slug(name));
  const projectSlug = project?.slug || "default";
  const repoUrl = assertSafeGitRepo(input.repoUrl);
  const branch = assertSafeBranch(input.branch || "main");
  const appDirectory = assertSafeRelativePath(input.appDirectory || "", "App directory");
  const id = appSlug + "-" + crypto.randomBytes(3).toString("hex");
  const appDir = assertManagedPath(getAppsDir(), path.join(getAppsDir(), projectSlug, appSlug));
  fs.mkdirSync(appDir, { recursive: true, mode: 0o750 });
  const now = new Date().toISOString();
  const internalPort = input.mode === "static" ? 80 : assertContainerPort(input.containerPort || 3000);
  const localProxyPort = await findOpenProxyPort(state.settings);
  const publicPreview = Boolean(input.publicPreview);
  const publicPreviewPort = publicPreview ? await findOpenPort() : undefined;
  const previewDomainEnabled = input.previewDomainEnabled ?? (state.settings.autoPreviewDomainsEnabled && state.settings.previewDomainMode !== "disabled");
  const env = parseEnvText(input.envText || "");
  const app: ManagedApp = {
    id,
    projectId: projectId || undefined,
    name,
    slug: appSlug,
    serviceRole: input.serviceRole || "fullstack",
    strategy: "docker",
    source: "git",
    sourceType: "git-url",
    repoUrl,
    branch,
    appDirectory,
    deployMode: input.mode,
    buildCommand: cleanCommand(input.buildCommand || ""),
    startCommand: cleanCommand(input.startCommand || ""),
    containerPort: internalPort,
    internalPort,
    healthPath: cleanHealthPath(input.healthPath || "/"),
    envKeys: uniqueStrings([...env.keys, ...(database ? [database.envKey] : [])]),
    corsOrigins,
    databaseId: databaseId || undefined,
    port: localProxyPort,
    localProxyPort,
    publicPreviewPort,
    publicPreview,
    portBind: publicPreview ? "public" : "localhost",
    previewDomainEnabled,
    previewDomainStatus: previewDomainEnabled ? "pending" : "disabled",
    status: "created",
    rootDir: appDir,
    createdAt: now,
    updatedAt: now
  };
  updateState((state) => {
    state.apps.unshift(app);
  });

  return executeGitDeployment({
    appId: app.id,
    action: "deploy",
    env,
    auditMessage: "Git app deployed."
  });
}

export async function updateGitAppDeployment(appId: string, input: {
  name: string;
  projectId?: string;
  serviceRole?: ServiceRole;
  repoUrl: string;
  branch?: string;
  appDirectory?: string;
  mode: "dockerfile" | "node" | "static";
  buildCommand?: string;
  startCommand?: string;
  containerPort?: number;
  healthPath?: string;
  envText?: string;
  corsOrigins?: string[];
  databaseId?: string;
  publicPreview?: boolean;
  previewDomainEnabled?: boolean;
}) {
  const existing = getManagedApp(appId);
  if (existing.source !== "git" && existing.sourceType !== "git-url") {
    throw new Error("Only public Git services can be edited and redeployed with this action.");
  }
  const name = assertSafeAppName(input.name);
  const projectId = input.projectId ? assertSafeId(input.projectId, "projectId") : existing.projectId || "";
  const databaseId = input.databaseId ? assertSafeId(input.databaseId, "databaseId") : "";
  const corsOrigins = (input.corsOrigins || []).map(assertSafeOrigin).filter(Boolean).slice(0, 20);
  const state = readState();
  if (projectId && !state.projects.some((project) => project.id === projectId)) throw new Error("Project not found.");
  if (databaseId && !state.databases.some((database) => database.id === databaseId)) throw new Error("Database not found.");
  const repoUrl = assertSafeGitRepo(input.repoUrl);
  const branch = assertSafeBranch(input.branch || existing.branch || "main");
  const appDirectory = assertSafeRelativePath(input.appDirectory || "", "App directory");
  const mode = input.mode;
  const publicPreview = Boolean(input.publicPreview);
  const previewDomainEnabled = input.previewDomainEnabled ?? existing.previewDomainEnabled ?? (state.settings.autoPreviewDomainsEnabled && state.settings.previewDomainMode !== "disabled");
  const env = parseEnvText(input.envText?.trim() ? input.envText : userEnvText(existing));
  const project = projectId ? state.projects.find((item) => item.id === projectId) : undefined;
  const appDir = existing.rootDir
    ? assertManagedPath(getAppsDir(), existing.rootDir)
    : assertManagedPath(getAppsDir(), path.join(getAppsDir(), project?.slug || "default", existing.slug || slug(existing.name)));

  fs.mkdirSync(appDir, { recursive: true, mode: 0o750 });
  updateState((next) => {
    const app = next.apps.find((item) => item.id === existing.id);
    if (!app) throw new Error("App not found.");
    Object.assign(app, {
      name,
      projectId: projectId || undefined,
      serviceRole: input.serviceRole || app.serviceRole || "fullstack",
      strategy: "docker",
      source: "git",
      sourceType: "git-url",
      repoUrl,
      branch,
      appDirectory,
      deployMode: mode,
      buildCommand: cleanCommand(input.buildCommand || ""),
      startCommand: cleanCommand(input.startCommand || ""),
      containerPort: mode === "static" ? 80 : assertContainerPort(input.containerPort || app.containerPort || 3000),
      internalPort: mode === "static" ? 80 : assertContainerPort(input.containerPort || app.containerPort || 3000),
      healthPath: cleanHealthPath(input.healthPath || app.healthPath || "/"),
      envKeys: uniqueStrings([...env.keys, ...(databaseId ? [state.databases.find((database) => database.id === databaseId)?.envKey || "DATABASE_URL"] : [])]),
      corsOrigins,
      databaseId: databaseId || undefined,
      port: app.localProxyPort || app.port || 0,
      localProxyPort: app.localProxyPort || app.port || 0,
      publicPreview,
      publicPreviewPort: publicPreview ? app.publicPreviewPort : undefined,
      portBind: publicPreview ? "public" : "localhost",
      previewDomainEnabled,
      previewDomainStatus: previewDomainEnabled ? (app.previewDomainStatus === "active" ? "active" : "pending") : "disabled",
      previewUrl: previewDomainEnabled ? app.previewUrl : publicPreview ? app.previewUrl : undefined,
      rootDir: appDir,
      status: "created",
      lastMessage: "Redeploy queued with updated settings.",
      updatedAt: new Date().toISOString()
    });
  });

  let updated = getManagedApp(existing.id);
  if (!updated.localProxyPort && !updated.port) {
    const localProxyPort = await findOpenProxyPort(readState().settings);
    markApp(updated.id, { port: localProxyPort, localProxyPort });
    updated = getManagedApp(updated.id);
  }
  if (updated.publicPreview && !updated.publicPreviewPort) {
    const publicPreviewPort = await findOpenPort();
    markApp(updated.id, { publicPreviewPort });
    updated = getManagedApp(updated.id);
  }

  return executeGitDeployment({
    appId: updated.id,
    action: "redeploy",
    env,
    auditMessage: "Git app updated and redeployed."
  });
}

async function executeGitDeployment(input: {
  appId: string;
  action: "deploy" | "redeploy";
  env: ReturnType<typeof parseEnvText>;
  auditMessage: string;
  trigger?: "manual" | "webhook" | "system";
  provider?: "public_git" | "github_app" | "docker_image" | "compose";
  commitSha?: string;
  commitMessage?: string;
  pusher?: string;
  webhookDeliveryId?: string;
  repositoryFullName?: string;
}) {
  const app = getManagedApp(input.appId);
  if (!app.repoUrl || !app.branch || !app.deployMode || app.deployMode === "compose") throw new Error("Git deployment settings are incomplete.");
  const repoUrl = assertSafeGitRepo(app.repoUrl);
  const branch = assertSafeBranch(app.branch);
  const appDirectory = assertSafeRelativePath(app.appDirectory || "", "App directory");
  const appDir = app.rootDir ? assertManagedPath(getAppsDir(), app.rootDir) : assertManagedPath(getAppsDir(), path.join(getAppsDir(), app.slug || slug(app.name)));
  const sourceDir = assertManagedPath(getAppsDir(), path.join(appDir, "source"));
  fs.mkdirSync(appDir, { recursive: true, mode: 0o750 });

  const deploymentId = startDeployment({
    appId: app.id,
    action: input.action,
    message: `${input.action === "redeploy" ? "Redeploying" : "Deploying"} ${app.name} from ${branch}.`,
    sourceType: app.sourceType || "git-url",
    strategy: app.deployMode,
    branch,
    trigger: input.trigger || "manual",
    provider: input.provider || (app.sourceType === "github-app" ? "github_app" : "public_git"),
    commitSha: input.commitSha,
    commitMessage: input.commitMessage,
    pusher: input.pusher,
    webhookDeliveryId: input.webhookDeliveryId,
    repositoryFullName: input.repositoryFullName || app.repoFullName
  });
  const gitAuth = await gitAuthForAppClone(app);
  try {
    const envFile = writeAppEnvFile(app, input.env.env, deploymentId);
    appendDeploymentLog(deploymentId, "preparing workspace", `Workspace ready for ${app.id}.`);
    if (fs.existsSync(sourceDir)) {
      appendDeploymentLog(deploymentId, "cleaning workspace", "Removing the previous managed source checkout.");
      fs.rmSync(assertManagedPath(appDir, sourceDir), { recursive: true, force: true });
    }
    appendDeploymentLog(deploymentId, "cloning repository", `${app.sourceType === "github-app" ? app.repoFullName || "GitHub App repository" : repoUrl} @ ${branch}`);
    await safeRunForDeployment(deploymentId, "git clone", "git", ["clone", "--depth", "1", "--branch", branch, repoUrl, sourceDir], undefined, gitAuth?.env);
    appendDeploymentLog(deploymentId, "checking branch", "Repository cloned.");
    const commit = await safeRun("git", ["rev-parse", "--short", "HEAD"], sourceDir);
    const image = "dio_" + app.id + ":" + Date.now();
    const buildDir = appDirectory ? assertManagedPath(sourceDir, path.join(sourceDir, appDirectory)) : sourceDir;
    if (!fs.existsSync(buildDir)) throw new Error(`App directory ${appDirectory} was not found in the repository.`);
    appendDeploymentLog(deploymentId, "detecting app", appDirectory ? `Using app directory ${appDirectory}.` : "Using repository root.");
    const dockerfile = prepareDockerfile(buildDir, appDir, app.deployMode, app);
    appendDeploymentLog(deploymentId, "building image", `Building ${image}.`);
    await safeRunForDeployment(deploymentId, "docker build", "docker", ["build", "-t", image, "-f", dockerfile, buildDir]);
    appendDeploymentLog(deploymentId, "starting service", `Starting container on 127.0.0.1:${app.localProxyPort || app.port} for Caddy preview routing.`);
    await replaceDockerContainer(app, image, envFile);
    markApp(app.id, { containerName: "dio_" + app.id, imageTag: image });
    await waitForAppHealth(app, deploymentId);
    await ensurePreviewDomain(app.id, deploymentId);
    if (app.publicPreview) {
      await openPreviewFirewallPort(getPublicPreviewPort(app), deploymentId);
    }
    const finalApp = getManagedApp(app.id);
    const previewText = finalApp.previewUrl || (finalApp.publicPreview ? await previewUrlForPort(getPublicPreviewPort(finalApp)) : "");
    markApp(app.id, {
      status: "running",
      imageTag: image,
      containerName: "dio_" + app.id,
      commitSha: commit.ok ? commit.stdout.trim() : undefined,
      lastMessage: previewText
        ? `Git ${app.deployMode} app deployed from ${branch}. Preview: ${previewText}`
        : `Git ${app.deployMode} app deployed from ${branch}. Add a domain or enable preview domains to expose it.`
    });
    finishDeployment(deploymentId, "succeeded", previewText ? `Deployed ${app.name}. Preview: ${previewText}` : `Deployed ${app.name} from ${branch}.`, { commitSha: commit.ok ? commit.stdout.trim() : input.commitSha, imageTag: image, repositoryFullName: input.repositoryFullName || app.repoFullName });
    audit("app.deploy_git", input.auditMessage, { appId: app.id, name: app.name, repoUrl, branch, appDirectory, mode: app.deployMode, publicPreview: app.publicPreview, previewDomainEnabled: finalApp.previewDomainEnabled, envKeys: input.env.keys });
    return readState().apps.find((item) => item.id === app.id) || app;
  } catch (error) {
    const message = error instanceof Error ? redact(error.message) : "Deploy failed.";
    markApp(app.id, { status: "failed", lastMessage: message });
    finishDeployment(deploymentId, "failed", message);
    throw error;
  } finally {
    gitAuth?.cleanup();
  }
}

export async function deployComposeApp(input: { name: string; projectId?: string; repoUrl: string; branch?: string; envText?: string }) {
  const name = assertSafeAppName(input.name);
  const projectId = input.projectId ? assertSafeId(input.projectId, "projectId") : "";
  const state = readState();
  if (projectId && !state.projects.some((project) => project.id === projectId)) throw new Error("Project not found.");
  const project = projectId ? state.projects.find((item) => item.id === projectId) : undefined;
  const appSlug = uniqueSlug(state.apps.filter((app) => app.projectId === projectId).map((app) => app.slug || app.id), slug(name));
  const repoUrl = assertSafeGitRepo(input.repoUrl);
  const branch = assertSafeBranch(input.branch || "main");
  const id = appSlug + "-" + crypto.randomBytes(3).toString("hex");
  const appDir = assertManagedPath(getAppsDir(), path.join(getAppsDir(), project?.slug || "default", appSlug));
  const sourceDir = assertManagedPath(getAppsDir(), path.join(appDir, "source"));
  fs.mkdirSync(appDir, { recursive: true, mode: 0o750 });
  const env = parseEnvText(input.envText || "");
  const now = new Date().toISOString();
  const app: ManagedApp = {
    id,
    projectId: projectId || undefined,
    name,
    slug: appSlug,
    serviceRole: "fullstack",
    strategy: "compose",
    source: "compose",
    sourceType: "git-url",
    repoUrl,
    branch,
    deployMode: "compose",
    composeProject: "dio_" + id,
    envKeys: env.keys,
    port: 0,
    status: "created",
    rootDir: appDir,
    createdAt: now,
    updatedAt: now
  };
  updateState((state) => {
    state.apps.unshift(app);
  });
  return executeComposeGitDeployment(app.id, env, "compose_deploy");
}

async function executeComposeGitDeployment(appId: string, env: ReturnType<typeof parseEnvText>, action: "compose_deploy" | "compose_redeploy") {
  const app = getManagedApp(appId);
  if (!app.repoUrl || !app.branch || !app.composeProject || !app.rootDir) throw new Error("Compose deployment settings are incomplete.");
  const repoUrl = assertSafeGitRepo(app.repoUrl);
  const branch = assertSafeBranch(app.branch || "main");
  const appDir = assertManagedPath(getAppsDir(), app.rootDir);
  const sourceDir = assertManagedPath(appDir, path.join(appDir, "source"));
  fs.mkdirSync(appDir, { recursive: true, mode: 0o750 });
  const deploymentId = startDeployment({
    appId: app.id,
    action,
    message: `${action === "compose_redeploy" ? "Redeploying" : "Deploying"} Compose stack ${app.name}.`,
    sourceType: "git-url",
    strategy: "compose",
    branch
  });
  try {
    if (fs.existsSync(sourceDir)) {
      appendDeploymentLog(deploymentId, "cleaning workspace", "Removing the previous Compose checkout.");
      fs.rmSync(sourceDir, { recursive: true, force: true });
    }
    appendDeploymentLog(deploymentId, "cloning repository", `${repoUrl} @ ${branch}`);
    await safeRunOrThrow("git", ["clone", "--depth", "1", "--branch", branch, repoUrl, sourceDir]);
    writeEnvFile(sourceDir, env.env);
    const composeFile = findComposeFile(sourceDir);
    if (!composeFile) throw new Error("No docker-compose.yml, docker-compose.yaml, compose.yml, or compose.yaml found.");
    const commit = await safeRun("git", ["rev-parse", "--short", "HEAD"], sourceDir);
    appendDeploymentLog(deploymentId, "validating compose", "Running docker compose config.");
    await safeRunOrThrow("docker", ["compose", "-p", app.composeProject!, "-f", composeFile, "config", "-q"], sourceDir);
    appendDeploymentLog(deploymentId, "starting compose", "Running docker compose up -d --build.");
    await safeRunOrThrow("docker", ["compose", "-p", app.composeProject!, "-f", composeFile, "up", "-d", "--build"], sourceDir);
    markApp(app.id, {
      status: "running",
      commitSha: commit.ok ? commit.stdout.trim() : undefined,
      lastMessage: "Docker Compose stack is running. Review compose ports before exposing publicly."
    });
    finishDeployment(deploymentId, "succeeded", `Compose stack ${app.name} deployed.`, { commitSha: commit.ok ? commit.stdout.trim() : undefined });
    audit("app.deploy_compose", "Compose stack deployed.", { appId: app.id, name: app.name, repoUrl, branch, envKeys: env.keys });
    return readState().apps.find((item) => item.id === app.id) || app;
  } catch (error) {
    const message = error instanceof Error ? redact(error.message) : "Compose deploy failed.";
    markApp(app.id, { status: "failed", lastMessage: message });
    finishDeployment(deploymentId, "failed", message);
    throw error;
  }
}

export async function deployComposeYamlApp(input: { name: string; projectId?: string; composeYaml: string; envText?: string }) {
  const name = assertSafeAppName(input.name);
  const projectId = input.projectId ? assertSafeId(input.projectId, "projectId") : "";
  const state = readState();
  if (projectId && !state.projects.some((project) => project.id === projectId)) throw new Error("Project not found.");
  const project = projectId ? state.projects.find((item) => item.id === projectId) : undefined;
  const appSlug = uniqueSlug(state.apps.filter((app) => app.projectId === projectId).map((app) => app.slug || app.id), slug(name));
  const composeYaml = assertSafeComposeYaml(input.composeYaml);
  const id = appSlug + "-" + crypto.randomBytes(3).toString("hex");
  const appDir = assertManagedPath(getAppsDir(), path.join(getAppsDir(), project?.slug || "default", appSlug));
  const sourceDir = assertManagedPath(getAppsDir(), path.join(appDir, "compose"));
  fs.mkdirSync(sourceDir, { recursive: true, mode: 0o750 });
  const env = parseEnvText(input.envText || "");
  const composeFile = path.join(sourceDir, "compose.yaml");
  fs.writeFileSync(composeFile, composeYaml, { mode: 0o640 });
  writeEnvFile(sourceDir, env.env);
  const now = new Date().toISOString();
  const app: ManagedApp = {
    id,
    projectId: projectId || undefined,
    name,
    slug: appSlug,
    serviceRole: "fullstack",
    strategy: "compose",
    source: "compose",
    sourceType: "compose-yaml",
    deployMode: "compose",
    composeProject: "dio_" + id,
    envKeys: env.keys,
    port: 0,
    status: "created",
    rootDir: appDir,
    createdAt: now,
    updatedAt: now
  };
  updateState((state) => {
    state.apps.unshift(app);
  });
  const deploymentId = startDeployment({ appId: app.id, action: "compose_deploy", message: `Deploying pasted Compose stack ${name}.`, sourceType: "compose-yaml", strategy: "compose" });
  try {
    appendDeploymentLog(deploymentId, "validating compose", "Running docker compose config.");
    await safeRunOrThrow("docker", ["compose", "-p", app.composeProject!, "-f", composeFile, "config", "-q"], sourceDir);
    appendDeploymentLog(deploymentId, "starting compose", "Running docker compose up -d.");
    await safeRunOrThrow("docker", ["compose", "-p", app.composeProject!, "-f", composeFile, "up", "-d"], sourceDir);
    markApp(app.id, { status: "running", lastMessage: "Pasted Docker Compose stack is running." });
    finishDeployment(deploymentId, "succeeded", `Compose stack ${name} deployed.`);
    audit("app.deploy_compose_yaml", "Pasted Compose stack deployed.", { appId: app.id, name, envKeys: env.keys });
    return readState().apps.find((item) => item.id === app.id) || app;
  } catch (error) {
    const message = error instanceof Error ? redact(error.message) : "Compose deploy failed.";
    markApp(app.id, { status: "failed", lastMessage: message });
    finishDeployment(deploymentId, "failed", message);
    throw error;
  }
}

export async function deployDockerImageApp(input: {
  name: string;
  projectId?: string;
  serviceRole?: ServiceRole;
  image: string;
  containerPort: number;
  envText?: string;
  healthPath?: string;
  publicPreview?: boolean;
  previewDomainEnabled?: boolean;
}) {
  const name = assertSafeAppName(input.name);
  const projectId = input.projectId ? assertSafeId(input.projectId, "projectId") : "";
  const state = readState();
  if (projectId && !state.projects.some((project) => project.id === projectId)) throw new Error("Project not found.");
  const project = projectId ? state.projects.find((item) => item.id === projectId) : undefined;
  const appSlug = uniqueSlug(state.apps.filter((app) => app.projectId === projectId).map((app) => app.slug || app.id), slug(name));
  const projectSlug = project?.slug || "default";
  const image = assertSafeDockerImage(input.image);
  const containerPort = assertContainerPort(input.containerPort || 3000);
  const publicPreview = Boolean(input.publicPreview);
  const previewDomainEnabled = input.previewDomainEnabled ?? (state.settings.autoPreviewDomainsEnabled && state.settings.previewDomainMode !== "disabled");
  const localProxyPort = await findOpenProxyPort(state.settings);
  const env = parseEnvText(input.envText || "");
  const id = appSlug + "-" + crypto.randomBytes(3).toString("hex");
  const appDir = assertManagedPath(getAppsDir(), path.join(getAppsDir(), projectSlug, appSlug));
  fs.mkdirSync(appDir, { recursive: true, mode: 0o750 });
  const now = new Date().toISOString();
  const app: ManagedApp = {
    id,
    projectId: projectId || undefined,
    name,
    slug: appSlug,
    serviceRole: input.serviceRole || "fullstack",
    strategy: "docker",
    sourceType: "docker-image",
    dockerImage: image,
    containerPort,
    healthPath: cleanHealthPath(input.healthPath || "/"),
    envKeys: env.keys,
    port: localProxyPort,
    localProxyPort,
    publicPreviewPort: publicPreview ? await findOpenPort() : undefined,
    internalPort: containerPort,
    publicPreview,
    portBind: publicPreview ? "public" : "localhost",
    previewDomainEnabled,
    previewDomainStatus: previewDomainEnabled ? "pending" : "disabled",
    status: "created",
    rootDir: appDir,
    createdAt: now,
    updatedAt: now
  };
  updateState((state) => {
    state.apps.unshift(app);
  });
  return executeDockerImageDeployment(app.id, env, "deploy_image");
}

async function executeDockerImageDeployment(appId: string, env: ReturnType<typeof parseEnvText>, action: "deploy_image" | "redeploy_image") {
  const app = getManagedApp(appId);
  if (!app.dockerImage) throw new Error("Docker image settings are incomplete.");
  const image = assertSafeDockerImage(app.dockerImage);
  const deploymentId = startDeployment({ appId: app.id, action, message: `${action === "redeploy_image" ? "Redeploying" : "Deploying"} Docker image ${image}.`, sourceType: "docker-image", strategy: "docker" });
  try {
    const envFile = writeAppEnvFile(app, env.env, deploymentId);
    appendDeploymentLog(deploymentId, "pulling image", image);
    await safeRunOrThrow("docker", ["pull", image]);
    appendDeploymentLog(deploymentId, "starting service", `Starting container on 127.0.0.1:${app.localProxyPort || app.port}.`);
    await replaceDockerContainer(app, image, envFile);
    markApp(app.id, { containerName: "dio_" + app.id, imageTag: image });
    await waitForAppHealth(app, deploymentId);
    await ensurePreviewDomain(app.id, deploymentId);
    if (app.publicPreview) {
      await openPreviewFirewallPort(getPublicPreviewPort(app), deploymentId);
    }
    const finalApp = getManagedApp(app.id);
    const previewText = finalApp.previewUrl || (finalApp.publicPreview ? await previewUrlForPort(getPublicPreviewPort(finalApp)) : "");
    markApp(app.id, {
      status: "running",
      containerName: "dio_" + app.id,
      imageTag: image,
      lastMessage: previewText ? `Docker image is running. Preview: ${previewText}` : "Docker image is running on a localhost port."
    });
    finishDeployment(deploymentId, "succeeded", previewText ? `Docker image ${image} deployed. Preview: ${previewText}` : `Docker image ${image} deployed.`, { imageTag: image });
    audit("app.deploy_image", "Docker image deployed.", {
      appId: app.id,
      name: app.name,
      image,
      publicPreview: finalApp.publicPreview,
      previewDomainEnabled: finalApp.previewDomainEnabled,
      envKeys: env.keys
    });
    return readState().apps.find((item) => item.id === app.id) || app;
  } catch (error) {
    const message = error instanceof Error ? redact(error.message) : "Docker image deploy failed.";
    markApp(app.id, { status: "failed", lastMessage: message });
    finishDeployment(deploymentId, "failed", message);
    throw error;
  }
}

export async function configureDomain(input: { appId: string; domain: string }) {
  const appId = assertSafeId(input.appId, "appId");
  const domain = assertSafeDomain(input.domain);
  const app = readState().apps.find((item) => item.id === appId);
  if (!app) throw new Error("App not found.");
  const rootDir = app.rootDir ? assertManagedPath(getAppsDir(), app.rootDir) : "";
  if (app.strategy === "static" && !rootDir) throw new Error("Static app root directory is missing.");
  const targetPort = app.localProxyPort || app.port;
  if (app.strategy !== "static") assertSafePort(targetPort);

  const caddyDir = "/etc/caddy/conf.d";
  const content =
    app.strategy === "static"
      ? domain + " {\n    encode gzip\n    root * " + rootDir + "\n    file_server\n}\n"
      : domain + " {\n    encode gzip\n    reverse_proxy 127.0.0.1:" + targetPort + "\n}\n";
  const temp = await writeTemp("dio_" + app.id + ".caddy", content);
  await safeRunOrThrow("sudo", ["mkdir", "-p", caddyDir]);
  await safeRunOrThrow("sudo", ["install", "-m", "0644", "-o", "root", "-g", "root", temp, path.join(caddyDir, "dio_" + app.id + ".caddy")]);
  const validation = await safeRun("sudo", ["caddy", "validate", "--config", "/etc/caddy/Caddyfile"]);
  if (!validation.ok) throw new Error("Caddy validation failed: " + (validation.stderr || validation.stdout));
  const reload = await safeRun("sudo", ["systemctl", "reload", "caddy"]);
  if (!reload.ok) throw new Error("Caddy reload failed: " + (reload.stderr || reload.stdout));

  updateState((state) => {
    const current = state.apps.find((item) => item.id === app.id);
    if (current) {
      current.domain = domain;
      current.updatedAt = new Date().toISOString();
      current.lastMessage = "Domain configured through Caddy.";
    }
  });
  audit("domain.configure", "Configured " + domain + " for " + app.name + ".", { appId: app.id, domain });
  return readState().apps.find((item) => item.id === app.id);
}

export async function readAppLogs(appId: string) {
  const id = assertSafeId(appId, "appId");
  const app = readState().apps.find((item) => item.id === id);
  if (!app) throw new Error("App not found.");
  if (app.strategy === "docker" && app.containerName) {
    return safeRun("docker", ["logs", "--tail", "200", assertSafeDockerName(app.containerName)]);
  }
  if (app.strategy === "compose" && app.composeProject) {
    return safeRun("docker", ["compose", "-p", assertSafeDockerName(app.composeProject), "logs", "--tail", "200"]);
  }
  if (app.serviceName) {
    return safeRun("journalctl", ["-u", assertSafeSystemdService(app.serviceName), "-n", "200", "--no-pager"]);
  }
  const latestDeployment = readState().deployments.find((item) => item.appId === id);
  if (latestDeployment) {
    return readDeploymentLogs(latestDeployment.id);
  }
  return { ok: true, command: "static", stdout: "Static app is served by Caddy after a domain is configured.", stderr: "" };
}

export async function readDeploymentLogs(deploymentId: string) {
  const id = assertSafeId(deploymentId, "deploymentId");
  const deployment = readState().deployments.find((item) => item.id === id);
  if (!deployment) throw new Error("Deployment not found.");
  if (!deployment.logsPath) {
    return { ok: true, command: "deployment-log", stdout: deployment.message, stderr: "" };
  }
  const logsPath = assertManagedPath(getLogsDir(), deployment.logsPath);
  const text = fs.existsSync(logsPath) ? fs.readFileSync(logsPath, "utf8") : "Deployment log file is missing.";
  return { ok: true, command: "deployment-log " + id, stdout: redact(text).split(/\r?\n/).slice(-1000).join("\n"), stderr: "" };
}

export async function deleteDeployment(deploymentId: string) {
  const id = assertSafeId(deploymentId, "deploymentId");
  let removed = false;
  updateState((state) => {
    const deployment = state.deployments.find((item) => item.id === id);
    if (!deployment) return;
    removeDeploymentFiles([deployment]);
    state.deployments = state.deployments.filter((item) => item.id !== id);
    removed = true;
  });
  if (!removed) throw new Error("Deployment not found.");
  audit("deployment.delete", "Deleted deployment event.", { deploymentId: id });
  return { ok: true };
}

export async function stopApp(appId: string) {
  const id = assertSafeId(appId, "appId");
  const app = readState().apps.find((item) => item.id === id);
  if (!app) throw new Error("App not found.");
  if (app.strategy === "docker" && app.containerName) {
    await safeRun("docker", ["rm", "-f", assertSafeDockerName(app.containerName)]);
  }
  if (app.serviceName) {
    await safeRun("sudo", ["systemctl", "disable", "--now", assertSafeSystemdService(app.serviceName)]);
  }
  if (app.strategy === "compose" && app.composeProject && app.rootDir) {
    const sourceDir = composeSourceDirForApp(app);
    const composeFile = findComposeFile(sourceDir);
    if (composeFile) await safeRun("docker", ["compose", "-p", assertSafeDockerName(app.composeProject), "-f", composeFile, "stop"], sourceDir);
  }
  updateState((state) => {
    const current = state.apps.find((item) => item.id === id);
    if (current) {
      current.status = "stopped";
      current.updatedAt = new Date().toISOString();
      current.lastMessage = "Stopped by dashboard.";
    }
  });
  audit("app.stop", "Stopped " + app.name + ".", { appId: id });
  return readState().apps.find((item) => item.id === id);
}

export async function restartApp(appId: string) {
  const app = getManagedApp(appId);
  if (app.strategy === "docker" && app.containerName) {
    await safeRunOrThrow("docker", ["restart", assertSafeDockerName(app.containerName)]);
  } else if (app.serviceName) {
    await safeRunOrThrow("sudo", ["systemctl", "restart", assertSafeSystemdService(app.serviceName)]);
  } else if (app.strategy === "compose" && app.composeProject && app.rootDir) {
    const sourceDir = composeSourceDirForApp(app);
    const composeFile = findComposeFile(sourceDir);
    if (!composeFile) throw new Error("Compose file is missing.");
    await safeRunOrThrow("docker", ["compose", "-p", assertSafeDockerName(app.composeProject), "-f", composeFile, "up", "-d"], sourceDir);
  } else {
    throw new Error("No restart action is available for this app.");
  }
  markApp(app.id, { status: "running", lastMessage: "Restarted from dashboard." });
  deploymentEvent(app.id, "restart", "succeeded", "App restarted.");
  audit("app.restart", "Restarted app.", { appId: app.id });
  return getManagedApp(app.id);
}

export async function startApp(appId: string) {
  const app = getManagedApp(appId);
  if (app.strategy === "docker" && app.containerName) {
    const result = await safeRun("docker", ["start", assertSafeDockerName(app.containerName)]);
    if (result.ok) {
      markApp(app.id, { status: "running", lastMessage: "Started from dashboard." });
      audit("app.start", "Started app.", { appId: app.id });
      return getManagedApp(app.id);
    }
  }
  return redeployApp(app.id);
}

export async function redeployApp(appId: string) {
  const app = getManagedApp(appId);
  const envText = userEnvText(app);
  if (app.source === "git" && app.sourceType === "github-app" && app.gitInstallationId && app.gitRepositoryId && app.deployMode && app.deployMode !== "compose") {
    return updateGitHubAppDeployment(app.id, {
      name: app.name,
      projectId: app.projectId,
      serviceRole: app.serviceRole,
      gitInstallationId: app.gitInstallationId,
      gitRepositoryId: app.gitRepositoryId,
      branch: app.branch,
      appDirectory: app.appDirectory,
      mode: app.deployMode,
      buildCommand: app.buildCommand,
      startCommand: app.startCommand,
      containerPort: app.containerPort,
      healthPath: app.healthPath,
      envText,
      corsOrigins: app.corsOrigins,
      databaseId: app.databaseId,
      publicPreview: app.publicPreview,
      previewDomainEnabled: app.previewDomainEnabled,
      autoDeployEnabled: app.autoDeployEnabled
    });
  }
  if (app.source === "git" && app.repoUrl && app.deployMode && app.deployMode !== "compose") {
    return updateGitAppDeployment(app.id, {
      name: app.name,
      projectId: app.projectId,
      serviceRole: app.serviceRole,
      repoUrl: app.repoUrl,
      branch: app.branch,
      appDirectory: app.appDirectory,
      mode: app.deployMode,
      buildCommand: app.buildCommand,
      startCommand: app.startCommand,
      containerPort: app.containerPort,
      healthPath: app.healthPath,
      envText,
      corsOrigins: app.corsOrigins,
      databaseId: app.databaseId,
      publicPreview: app.publicPreview,
      previewDomainEnabled: app.previewDomainEnabled
    });
  }
  if (app.source === "compose" && app.repoUrl) {
    markApp(app.id, { status: "created", lastMessage: "Compose redeploy queued." });
    return executeComposeGitDeployment(app.id, parseEnvText(envText), "compose_redeploy");
  }
  if (app.sourceType === "docker-image" && app.dockerImage) {
    if (app.publicPreview && !app.publicPreviewPort) {
      markApp(app.id, { publicPreviewPort: await findOpenPort() });
    }
    markApp(app.id, { status: "created", lastMessage: "Docker image redeploy queued." });
    return executeDockerImageDeployment(app.id, parseEnvText(envText), "redeploy_image");
  }
  throw new Error("Redeploy is available for Git, Compose repository, and Docker image apps only.");
}

export async function deleteApp(appId: string) {
  const app = getManagedApp(appId);
  await cleanupAppResources(app);
  updateState((state) => {
    state.apps = state.apps.filter((item) => item.id !== app.id);
  });
  audit("app.delete", "Deleted app resources and kept deployment history.", { appId: app.id, name: app.name });
  return { ok: true };
}

export async function checkAppHealth(appId: string) {
  const app = getManagedApp(appId);
  const localPort = app.localProxyPort || app.port;
  if (!localPort) return { ok: false, message: "No localhost port is registered for this app." };
  const pathName = cleanHealthPath(app.healthPath || "/");
  try {
    const result = await fetchLocalHealth(localPort, pathName);
    const ok = result.status >= 200 && result.status < 500;
    const message = `HTTP ${result.status} from ${pathName}`;
    markApp(app.id, { lastMessage: message, status: ok ? "running" : "failed" });
    return { ok, status: result.status, message };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Health check failed.";
    markApp(app.id, { lastMessage: message, status: "failed" });
    return { ok: false, message };
  }
}

export async function systemPrune() {
  const result = await safeRun("docker", ["system", "prune", "-af"]);
  audit("system.prune", "Docker system prune executed.");
  return result;
}

export async function createManagedPostgres(input: { projectId?: string; name: string; envKey?: string }) {
  const name = assertSafeAppName(input.name || "Postgres");
  const projectId = input.projectId ? assertSafeId(input.projectId, "projectId") : "";
  const envKey = assertSafeEnvKey(input.envKey || "DATABASE_URL");
  const state = readState();
  if (projectId && !state.projects.some((project) => project.id === projectId)) throw new Error("Project not found.");
  const dbSlug = uniqueSlug(state.databases.filter((database) => database.projectId === projectId).map((database) => database.slug || database.id), slug(name));
  const id = dbSlug + "-" + crypto.randomBytes(3).toString("hex");
  const localPort = await findOpenPort();
  const username = "dio_" + crypto.randomBytes(3).toString("hex");
  const database = "dio_" + crypto.randomBytes(3).toString("hex");
  const password = crypto.randomBytes(24).toString("base64url");
  const volume = "dio_pg_" + id;
  const container = "dio_pg_" + id;
  const postgresEnvFile = writeSecretFile(
    id + "-postgres-env",
    [`POSTGRES_USER=${username}`, `POSTGRES_PASSWORD=${password}`, `POSTGRES_DB=${database}`].join("\n") + "\n"
  );
  await safeRunOrThrow("docker", ["volume", "create", "--label", "dockio=true", volume]);
  await ensureDockerNetwork();
  await safeRun("docker", ["rm", "-f", container]);
  try {
    await safeRunOrThrow("docker", [
      "run",
      "-d",
      "--name",
      container,
      "--restart",
      "unless-stopped",
      "--memory",
      "768m",
      "--cpus",
      "1.0",
      "--pids-limit",
      "256",
      "--label",
      "dockio=true",
      "--label",
      "dockio.managed=true",
      "--label",
      "dockio.project=" + (state.projects.find((project) => project.id === projectId)?.slug || "default"),
      "--label",
      "dockio.database=" + dbSlug,
      "--label",
      "dockio.databaseId=" + id,
      "--network",
      "dockio",
      "--env-file",
      postgresEnvFile,
      "-v",
      volume + ":/var/lib/postgresql/data",
      "-p",
      "127.0.0.1:" + localPort + ":5432",
      "postgres:16-alpine"
    ]);
  } finally {
    fs.rmSync(postgresEnvFile, { force: true });
  }
  const connectionUrl = `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${container}:5432/${encodeURIComponent(database)}`;
  const secretPath = writeSecretFile(id, connectionUrl);
  const now = new Date().toISOString();
  const resource: DatabaseResource = {
    id,
    projectId: projectId || undefined,
    name,
    slug: dbSlug,
    kind: "managed-postgres",
    provider: "Docker Postgres 16",
    envKey,
    status: "running",
    host: container,
    port: 5432,
    database,
    username,
    maskedUrl: maskDatabaseUrl(connectionUrl),
    secretPath,
    dockerContainer: container,
    dockerVolume: volume,
    localPort,
    createdAt: now,
    updatedAt: now,
    lastMessage: `Managed Postgres is running internally at ${container}:5432 and locally at 127.0.0.1:${localPort}.`
  };
  updateState((state) => {
    state.databases.unshift(resource);
  });
  audit("database.create_managed", "Created managed Postgres.", { databaseId: id, projectId, envKey });
  return { ...resource, secretPath: undefined };
}

export async function createManagedRedis(input: { projectId?: string; name: string; envKey?: string }) {
  const name = assertSafeAppName(input.name || "Redis");
  const projectId = input.projectId ? assertSafeId(input.projectId, "projectId") : "";
  const envKey = assertSafeEnvKey(input.envKey || "REDIS_URL");
  const state = readState();
  if (projectId && !state.projects.some((project) => project.id === projectId)) throw new Error("Project not found.");
  const dbSlug = uniqueSlug(state.databases.filter((database) => database.projectId === projectId).map((database) => database.slug || database.id), slug(name));
  const id = dbSlug + "-" + crypto.randomBytes(3).toString("hex");
  const container = "dio_redis_" + id;
  await ensureDockerNetwork();
  await safeRun("docker", ["rm", "-f", container]);
  await safeRunOrThrow("docker", [
    "run",
    "-d",
    "--name",
    container,
    "--restart",
    "unless-stopped",
    "--memory",
    "256m",
    "--cpus",
    "0.5",
    "--pids-limit",
    "128",
    "--label",
    "dockio=true",
    "--label",
    "dockio.managed=true",
    "--label",
    "dockio.project=" + (state.projects.find((project) => project.id === projectId)?.slug || "default"),
    "--label",
    "dockio.database=" + dbSlug,
    "--label",
    "dockio.databaseId=" + id,
    "--network",
    "dockio",
    "redis:7-alpine"
  ]);
  const connectionUrl = `redis://${container}:6379`;
  const secretPath = writeSecretFile(id, connectionUrl);
  const now = new Date().toISOString();
  const resource: DatabaseResource = {
    id,
    projectId: projectId || undefined,
    name,
    slug: dbSlug,
    kind: "managed-redis",
    provider: "Docker Redis 7",
    envKey,
    status: "running",
    host: container,
    port: 6379,
    maskedUrl: connectionUrl,
    secretPath,
    dockerContainer: container,
    createdAt: now,
    updatedAt: now,
    lastMessage: "Managed Redis is available inside the Dockio Docker network."
  };
  updateState((next) => {
    next.databases.unshift(resource);
  });
  audit("database.create_redis", "Created managed Redis.", { databaseId: id, projectId, envKey });
  return { ...resource, secretPath: undefined };
}

export async function createExternalDatabase(input: { projectId?: string; name: string; url: string; provider?: string; envKey?: string }) {
  const name = assertSafeAppName(input.name || "External Postgres");
  const projectId = input.projectId ? assertSafeId(input.projectId, "projectId") : "";
  const envKey = assertSafeEnvKey(input.envKey || "DATABASE_URL");
  const state = readState();
  if (projectId && !state.projects.some((project) => project.id === projectId)) throw new Error("Project not found.");
  const parsed = parsePostgresUrl(input.url);
  const dbSlug = uniqueSlug(state.databases.filter((database) => database.projectId === projectId).map((database) => database.slug || database.id), slug(name));
  const id = dbSlug + "-" + crypto.randomBytes(3).toString("hex");
  const secretPath = writeSecretFile(id, parsed.url);
  const tcp = await testTcp(parsed.host, parsed.port);
  const now = new Date().toISOString();
  const resource: DatabaseResource = {
    id,
    projectId: projectId || undefined,
    name,
    slug: dbSlug,
    kind: "external-postgres",
    provider: (input.provider || "External Postgres").trim().slice(0, 80),
    envKey,
    status: tcp.ok ? "reachable" : "unreachable",
    host: parsed.host,
    port: parsed.port,
    database: parsed.database,
    username: parsed.username,
    sslMode: parsed.sslMode,
    maskedUrl: maskDatabaseUrl(parsed.url),
    secretPath,
    createdAt: now,
    updatedAt: now,
    lastMessage: tcp.ok ? "TCP connection succeeded." : tcp.message
  };
  updateState((state) => {
    state.databases.unshift(resource);
  });
  audit("database.create_external", "Registered external Postgres.", { databaseId: id, projectId, provider: resource.provider, host: parsed.host, envKey });
  return { ...resource, secretPath: undefined };
}

export async function testDatabase(databaseId: string) {
  const id = assertSafeId(databaseId, "databaseId");
  const database = readState().databases.find((item) => item.id === id);
  if (!database) throw new Error("Database not found.");
  if (database.dockerContainer) {
    const inspect = await safeRun("docker", ["inspect", "-f", "{{.State.Running}}", assertDockioDockerResource(database.dockerContainer)]);
    const ok = inspect.ok && inspect.stdout.trim() === "true";
    updateState((state) => {
      const current = state.databases.find((item) => item.id === id);
      if (current) {
        current.status = ok ? "running" : "failed";
        current.lastMessage = ok ? "Container is running." : (inspect.stderr || inspect.stdout || "Container is not running.");
        current.updatedAt = new Date().toISOString();
      }
    });
    audit("database.test", "Tested managed database container.", { databaseId: id, ok });
    return { ok, message: ok ? "Container is running." : (inspect.stderr || inspect.stdout || "Container is not running.") };
  }
  const host = database.host || "127.0.0.1";
  const port = assertNetworkPort(database.port || 5432);
  const result = await testTcp(host, port);
  updateState((state) => {
    const current = state.databases.find((item) => item.id === id);
    if (current) {
      current.status = result.ok ? (current.kind === "managed-postgres" ? "running" : "reachable") : "unreachable";
      current.lastMessage = result.message;
      current.updatedAt = new Date().toISOString();
    }
  });
  audit("database.test", "Tested database connection.", { databaseId: id, ok: result.ok });
  return { ok: result.ok, message: result.message };
}

export async function getDatabaseConnection(databaseId: string) {
  const id = assertSafeId(databaseId, "databaseId");
  const database = readState().databases.find((item) => item.id === id);
  if (!database || !database.secretPath) throw new Error("Database secret not found.");
  const secretPath = assertManagedPath(getSecretsDir(), database.secretPath);
  const connectionUrl = fs.readFileSync(secretPath, "utf8").trim();
  audit("database.reveal", "Revealed database connection URL.", { databaseId: id });
  return { envKey: database.envKey, value: connectionUrl };
}

export async function attachDatabaseToApp(input: { databaseId: string; appId: string }) {
  const databaseId = assertSafeId(input.databaseId, "databaseId");
  const appId = assertSafeId(input.appId, "appId");
  const state = readState();
  const database = state.databases.find((item) => item.id === databaseId);
  const app = state.apps.find((item) => item.id === appId);
  if (!database || !database.secretPath) throw new Error("Database secret not found.");
  if (!app) throw new Error("App not found.");
  if (database.projectId && app.projectId && database.projectId !== app.projectId) throw new Error("Database and service must belong to the same project.");
  const value = fs.readFileSync(assertManagedPath(getSecretsDir(), database.secretPath), "utf8").trim();
  upsertAppEnvValues(app, { [database.envKey]: value }, false);
  updateState((next) => {
    const current = next.apps.find((item) => item.id === app.id);
    if (current) {
      current.databaseId = database.id;
      current.envKeys = uniqueStrings([...(current.envKeys || []), database.envKey]);
      current.lastMessage = `${database.envKey} attached from ${database.name}. Redeploy to apply it.`;
      current.updatedAt = new Date().toISOString();
    }
  });
  audit("database.attach", "Attached database to service env.", { databaseId, appId, envKey: database.envKey });
  return readState().apps.find((item) => item.id === app.id);
}

export async function deleteDatabase(input: { databaseId: string; deleteVolume?: boolean }) {
  const databaseId = assertSafeId(input.databaseId, "databaseId");
  const database = readState().databases.find((item) => item.id === databaseId);
  if (!database) throw new Error("Database not found.");
  await cleanupDatabaseResource(database, Boolean(input.deleteVolume));
  updateState((state) => {
    state.databases = state.databases.filter((item) => item.id !== databaseId);
    for (const app of state.apps) {
      if (app.databaseId === databaseId) {
        app.databaseId = undefined;
        app.lastMessage = "Database binding was removed because the database resource was deleted.";
        app.updatedAt = new Date().toISOString();
      }
    }
  });
  audit("database.delete", "Deleted database resource.", { databaseId, deleteVolume: Boolean(input.deleteVolume) });
  return { ok: true };
}

export async function setAppEnvironment(input: { appId: string; envText: string; replace?: boolean }) {
  const app = getManagedApp(input.appId);
  const parsed = parseEnvText(input.envText || "");
  upsertAppEnvValues(app, parsed.env, Boolean(input.replace));
  updateState((state) => {
    const current = state.apps.find((item) => item.id === app.id);
    if (current) {
      const existing = Boolean(input.replace) ? [] : current.envKeys || [];
      current.envKeys = uniqueStrings([...existing, ...parsed.keys]);
      current.lastMessage = "Environment variables saved. Redeploy to apply them.";
      current.updatedAt = new Date().toISOString();
    }
  });
  audit("app.env_set", "Saved service environment variables.", { appId: app.id, keys: parsed.keys, replace: Boolean(input.replace) });
  return readState().apps.find((item) => item.id === app.id);
}

export async function deleteAppEnvironmentKey(input: { appId: string; key: string }) {
  const app = getManagedApp(input.appId);
  const key = assertSafeEnvKey(input.key);
  const env = readAppEnvObject(app);
  delete env[key];
  writeAppEnvFile(app, env);
  updateState((state) => {
    const current = state.apps.find((item) => item.id === app.id);
    if (current) {
      current.envKeys = (current.envKeys || []).filter((item) => item !== key);
      current.lastMessage = `${key} removed from environment. Redeploy to apply it.`;
      current.updatedAt = new Date().toISOString();
    }
  });
  audit("app.env_delete", "Deleted service environment key.", { appId: app.id, key });
  return readState().apps.find((item) => item.id === app.id);
}

function parseFirewallStatus(numbered: CommandOutput, verbose: CommandOutput): ParsedFirewallStatus {
  const numberedText = numbered.stdout || numbered.stderr || "";
  const verboseText = verbose.stdout || verbose.stderr || "";
  const raw = [verboseText, numberedText && numberedText !== verboseText ? numberedText : ""].filter(Boolean).join("\n\n").trim();
  const statusMatch = raw.match(/Status:\s*([A-Za-z]+)/i);
  const status = (statusMatch?.[1] || (numbered.ok || verbose.ok ? "unknown" : "error")).toLowerCase();
  const defaults = raw.match(/Default:\s*([^,]+)\s*\(incoming\),\s*([^,]+)\s*\(outgoing\)(?:,\s*([^)]+)\s*\(routed\))?/i);
  const rules = numberedText
    .split(/\r?\n/)
    .map(parseFirewallRuleLine)
    .filter((rule): rule is FirewallRule => Boolean(rule));
  const exposedPorts = rules.filter((rule) => rule.action === "allow" && rule.direction === "in");
  const panelPort = Number(process.env.DIO_PORT || process.env.PORT || 3099);
  const warnings: string[] = [];

  if (status === "inactive") warnings.push("UFW is inactive.");
  for (const rule of exposedPorts) {
    if (!rule.public) continue;
    if (rule.port === 7788) warnings.push("Port 7788 is public. The Dockio agent/control ports must never be exposed.");
    if (rule.port === panelPort) warnings.push(`Panel port ${panelPort} is public. Restrict it to your IP or VPN CIDR if possible.`);
    if (rule.port === 22 || rule.to.toLowerCase() === "openssh") warnings.push("SSH is public. For production, restrict SSH to trusted source IPs.");
  }

  return {
    ok: numbered.ok || verbose.ok,
    active: status === "active",
    status,
    defaultIncoming: defaults?.[1]?.trim().toLowerCase(),
    defaultOutgoing: defaults?.[2]?.trim().toLowerCase(),
    defaultRouted: defaults?.[3]?.trim().toLowerCase(),
    rules,
    exposedPorts,
    warnings: uniqueStrings(warnings),
    raw,
    error: numbered.ok || verbose.ok ? undefined : numbered.stderr || verbose.stderr || "UFW status failed."
  };
}

function parseFirewallRuleLine(line: string): FirewallRule | undefined {
  const trimmed = line.trim();
  const match = trimmed.match(/^\[\s*(\d+)\]\s+(.+?)\s{2,}([A-Z]+(?:\s+(?:IN|OUT))?)\s{2,}(.+)$/);
  if (!match) return undefined;
  const [, numberText = "", to = "", actionBlock = "", from = ""] = match;
  const words = actionBlock.trim().toLowerCase().split(/\s+/);
  const action = words[0] || "";
  const direction = words.includes("out") ? "out" : "in";
  const parsedTarget = parseFirewallTarget(to);
  return {
    number: Number(numberText),
    to: to.trim(),
    action,
    direction,
    from: from.trim(),
    port: parsedTarget.port,
    protocol: parsedTarget.protocol,
    public: isPublicFirewallSource(from),
    raw: trimmed
  };
}

function parseFirewallTarget(value: string): { port?: number; protocol?: "tcp" | "udp" } {
  const target = value.trim();
  if (/^openssh$/i.test(target)) return { port: 22, protocol: "tcp" };
  if (/^http$/i.test(target)) return { port: 80, protocol: "tcp" };
  if (/^https$/i.test(target)) return { port: 443, protocol: "tcp" };
  const match = target.match(/\b(\d{1,5})(?::\d{1,5})?(?:\/(tcp|udp))?\b/i);
  const port = Number(match?.[1] || 0);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return {};
  const protocol = (match?.[2]?.toLowerCase() as "tcp" | "udp" | undefined) || undefined;
  return { port, protocol };
}

function isPublicFirewallSource(value: string) {
  const source = value.trim().toLowerCase();
  return source === "anywhere" || source === "anywhere (v6)" || source === "0.0.0.0/0" || source === "::/0";
}

export async function applyFirewallBaseline(input: { panelPort: number; trustedCidr?: string }) {
  const panelPort = assertSafePort(input.panelPort);
  const trustedCidr = assertSafeCidr(input.trustedCidr || "");
  const commands: CommandOutput[] = [];
  commands.push(await safeRun("sudo", ["ufw", "allow", "OpenSSH"]));
  commands.push(await safeRun("sudo", ["ufw", "allow", "80/tcp"]));
  commands.push(await safeRun("sudo", ["ufw", "allow", "443/tcp"]));
  if (trustedCidr) {
    commands.push(await safeRun("sudo", ["ufw", "allow", "from", trustedCidr, "to", "any", "port", String(panelPort), "proto", "tcp"]));
  } else {
    commands.push(await safeRun("sudo", ["ufw", "allow", String(panelPort) + "/tcp"]));
  }
  commands.push(await safeRun("sudo", ["ufw", "--force", "enable"]));
  audit("firewall.apply", "Applied firewall baseline.", { panelPort, trustedCidr: trustedCidr || "public" });
  return commands;
}

export async function applyFirewallRule(input: { action: "allow" | "deny"; port: number; protocol?: "tcp" | "udp"; sourceCidr?: string }) {
  const port = assertNetworkPort(input.port);
  const protocol = input.protocol || "tcp";
  const sourceCidr = assertSafeCidr(input.sourceCidr || "");
  const args = ["ufw", input.action];
  if (sourceCidr) args.push("from", sourceCidr, "to", "any", "port", String(port), "proto", protocol);
  else args.push(String(port) + "/" + protocol);
  const result = await safeRun("sudo", args);
  audit("firewall.rule", `${input.action} ${port}/${protocol}.`, { port, protocol, sourceCidr: sourceCidr || "any" });
  return result;
}

export async function deleteFirewallRule(input: { ruleNumber: number }) {
  const ruleNumber = input.ruleNumber;
  if (!Number.isInteger(ruleNumber) || ruleNumber < 1 || ruleNumber > 999) throw new Error("Firewall rule number must be between 1 and 999.");
  const result = await safeRun("sudo", ["ufw", "--force", "delete", String(ruleNumber)]);
  audit("firewall.delete_rule", `Deleted firewall rule #${ruleNumber}.`, { ruleNumber });
  return result;
}

export async function controlFirewall(input: { action: "enable" | "disable" | "reload" }) {
  const action = input.action;
  let result: CommandOutput;
  if (action === "enable") result = await safeRun("sudo", ["ufw", "--force", "enable"]);
  else if (action === "disable") result = await safeRun("sudo", ["ufw", "disable"]);
  else if (action === "reload") result = await safeRun("sudo", ["ufw", "reload"]);
  else throw new Error("Unsupported firewall action.");
  audit("firewall.control", `Firewall ${action}.`, { action, ok: result.ok });
  return result;
}

export async function regeneratePreviewDomain(appId: string) {
  const app = getManagedApp(appId);
  await removePreviewDomainRoute(app);
  markApp(app.id, {
    previewDomainEnabled: true,
    previewDomainHostname: undefined,
    previewDomainStatus: "pending",
    previewDomainError: undefined,
    previewUrl: app.publicPreview ? await previewUrlForPort(getPublicPreviewPort(app)) : undefined,
    lastMessage: "Preview domain regeneration requested."
  });
  await ensurePreviewDomain(app.id);
  audit("preview.regenerate", "Regenerated preview domain.", { appId: app.id });
  return getManagedApp(app.id);
}

export async function disablePreviewDomain(appId: string) {
  const app = getManagedApp(appId);
  await removePreviewDomainRoute(app);
  const fallbackUrl = app.publicPreview ? await previewUrlForPort(getPublicPreviewPort(app)) : undefined;
  markApp(app.id, {
    previewDomainEnabled: false,
    previewDomainHostname: undefined,
    previewDomainStatus: "disabled",
    previewDomainError: undefined,
    previewDomainMode: undefined,
    previewCaddyFile: undefined,
    previewCaddyReloadStatus: undefined,
    previewUrl: fallbackUrl,
    lastMessage: fallbackUrl ? "Auto preview domain disabled. Public preview port remains available." : "Auto preview domain disabled."
  });
  audit("preview.disable", "Disabled preview domain.", { appId: app.id });
  return getManagedApp(app.id);
}

async function openPreviewFirewallPort(port: number, deploymentId?: string) {
  const safePort = assertNetworkPort(port);
  const result = await safeRun("sudo", ["ufw", "allow", `${safePort}/tcp`]);
  if (deploymentId) {
    appendDeploymentLog(
      deploymentId,
      result.ok ? "firewall" : "firewall warning",
      result.ok ? `Allowed preview port ${safePort}/tcp in UFW.` : `Could not update UFW for preview port ${safePort}/tcp: ${result.stderr || result.stdout}`
    );
  }
  audit("firewall.preview_port", result.ok ? `Allowed preview port ${safePort}/tcp.` : `Preview firewall update failed for ${safePort}/tcp.`, { port: safePort, ok: result.ok });
  return result;
}

async function ensurePreviewDomain(appId: string, deploymentId?: string) {
  const initial = getManagedApp(appId);
  const settings = readState().settings;
  if (!initial.previewDomainEnabled || !settings.autoPreviewDomainsEnabled || settings.previewDomainMode === "disabled") {
    markApp(initial.id, { previewDomainStatus: "disabled", previewDomainError: undefined });
    return getManagedApp(initial.id);
  }
  if (!initial.localProxyPort && !initial.port) {
    markApp(initial.id, { previewDomainStatus: "error", previewDomainError: "No localhost proxy port is assigned yet." });
    return getManagedApp(initial.id);
  }

  markApp(initial.id, { previewDomainStatus: "pending", previewDomainError: undefined });
  try {
    if (deploymentId) appendDeploymentLog(deploymentId, "preview domain", "Configuring Caddy preview hostname.");
    const support = await previewDomainSystemStatus(settings);
    if (!support.importConfigured) {
      throw new UserFacingError(`Caddy is missing ${PREVIEW_IMPORT_LINE}. Re-run the installer or add that import to ${settings.caddyMainConfig}.`, 500);
    }
    const app = getManagedApp(initial.id);
    const hostname = await previewHostnameForApp(app, settings);
    const caddyFile = previewCaddyFileForApp(app, settings);
    const content = [
      hostname + " {",
      "    encode gzip zstd",
      "    reverse_proxy 127.0.0.1:" + assertSafePort(app.localProxyPort || app.port),
      "}",
      ""
    ].join("\n");
    const temp = await writeTemp(path.basename(caddyFile), content);
    await safeRunOrThrow("sudo", ["mkdir", "-p", assertSafeCaddySitesDir(settings.caddySitesDir)]);
    await safeRunOrThrow("sudo", ["install", "-m", "0644", "-o", "root", "-g", "root", temp, caddyFile]);
    const validation = await safeRun("sudo", ["caddy", "validate", "--config", assertSafeCaddyMainConfig(settings.caddyMainConfig)]);
    if (!validation.ok) throw new Error("Caddy validation failed: " + (validation.stderr || validation.stdout));
    const reload = await safeRun("sudo", ["systemctl", "reload", "caddy"]);
    if (!reload.ok) throw new Error("Caddy reload failed: " + (reload.stderr || reload.stdout));
    markApp(app.id, {
      previewUrl: "https://" + hostname,
      previewDomainEnabled: true,
      previewDomainHostname: hostname,
      previewDomainStatus: "active",
      previewDomainError: undefined,
      previewDomainMode: settings.previewDomainMode === "custom" ? "custom" : "sslip",
      previewCaddyFile: caddyFile,
      previewCaddyReloadStatus: "validated and reloaded",
      lastMessage: `Preview domain active: https://${hostname}`
    });
    if (deploymentId) appendDeploymentLog(deploymentId, "preview domain", `Preview domain active: https://${hostname}`);
  } catch (error) {
    const app = getManagedApp(initial.id);
    const rawMessage = error instanceof Error ? redact(error.message) : "Preview domain failed.";
    const message = humanPreviewDomainError(rawMessage);
    const fallbackUrl = app.publicPreview ? await previewUrlForPort(getPublicPreviewPort(app)) : undefined;
    markApp(app.id, {
      previewUrl: fallbackUrl,
      previewDomainStatus: "error",
      previewDomainError: message,
      previewCaddyReloadStatus: "failed",
      lastMessage: fallbackUrl ? `Preview domain failed. Public fallback: ${fallbackUrl}` : `Preview domain failed: ${message}`
    });
    if (deploymentId) appendDeploymentLog(deploymentId, "preview domain warning", `Preview domain failed but deploy will stay successful: ${message}`);
  }
  return getManagedApp(initial.id);
}

function humanPreviewDomainError(message: string) {
  if (message.includes("no new privileges") || message.includes("NoNewPrivileges")) {
    return [
      "The panel service is blocking sudo with NoNewPrivileges=true, so it cannot write/reload Caddy preview routes.",
      "Update/re-run the installer, or set NoNewPrivileges=false in /etc/systemd/system/dockio-panel.service and restart the panel."
    ].join(" ");
  }
  return message;
}

async function waitForAppHealth(app: ManagedApp, deploymentId: string) {
  const safePort = assertSafePort(app.localProxyPort || app.port);
  const pathName = cleanHealthPath(app.healthPath || "/");
  appendDeploymentLog(deploymentId, "health check", `Waiting for ${pathName} on 127.0.0.1:${safePort}.`);
  let lastMessage = "No response yet.";
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const result = await fetchLocalHealth(safePort, pathName, 3000);
      lastMessage = `HTTP ${result.status} from ${pathName}`;
      if (result.status >= 200 && result.status < 500) {
        appendDeploymentLog(deploymentId, "health check", `Service is reachable: ${lastMessage}.`);
        return;
      }
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : "Health check failed.";
    }
    await sleep(1000);
  }
  await appendContainerDiagnostics(app.id, deploymentId);
  appendDeploymentLog(deploymentId, "health check failed", lastMessage);
  throw new UserFacingError(`Service started, but health check failed at ${pathName} on port ${safePort}: ${redact(lastMessage)}`, 500);
}

async function appendContainerDiagnostics(appId: string, deploymentId: string) {
  const current = readState().apps.find((item) => item.id === appId);
  if (!current?.containerName) return;
  const container = assertSafeDockerName(current.containerName);
  const inspect = await safeRun("docker", ["inspect", "--format", "status={{.State.Status}} restarting={{.State.Restarting}} exit={{.State.ExitCode}} error={{.State.Error}}", container]);
  appendDeploymentLog(deploymentId, "container status", inspect.stdout || inspect.stderr || "Container status unavailable.");
  const ports = await safeRun("docker", ["port", container]);
  appendDeploymentLog(deploymentId, "container ports", ports.stdout || ports.stderr || "No Docker port output.");
  const logs = await safeRun("docker", ["logs", "--tail", "80", container]);
  appendDeploymentLog(deploymentId, "container logs", logs.stdout || logs.stderr || "No recent container logs.");
}

async function fetchLocalHealth(port: number, pathName: string, timeoutMs = 5000) {
  const safePort = assertSafePort(port);
  const safePath = cleanHealthPath(pathName);
  const response = await fetch(`http://127.0.0.1:${safePort}${safePath}`, { signal: AbortSignal.timeout(timeoutMs) });
  return { status: response.status };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function replaceDockerContainer(app: ManagedApp, image: string, envFile?: string) {
  const container = "dio_" + app.id;
  const containerPort = app.deployMode === "static" ? 80 : assertContainerPort(app.internalPort || app.containerPort || 3000);
  const localProxyPort = assertSafePort(app.localProxyPort || app.port);
  const project = app.projectId ? readState().projects.find((item) => item.id === app.projectId) : undefined;
  await ensureDockerNetwork();
  await safeRun("docker", ["rm", "-f", container]);
  const args = [
    "run",
    "-d",
    "--name",
    container,
    "--restart",
    "unless-stopped",
    "--cap-drop",
    "ALL",
    ...containerRuntimeCaps(containerPort),
    "--security-opt",
    "no-new-privileges",
    "--memory",
    "768m",
    "--cpus",
    "1.0",
    "--pids-limit",
    "256",
    "--label",
    "dockio=true",
    "--label",
    "dockio.managed=true",
    "--label",
    "dockio.project=" + (project?.slug || "default"),
    "--label",
    "dockio.service=" + (app.slug || slug(app.name)),
    "--label",
    "dockio.appId=" + app.id,
    "--network",
    "dockio",
    "-p",
    "127.0.0.1:" + localProxyPort + ":" + containerPort
  ];
  if (app.publicPreview) {
    args.push("-p", "0.0.0.0:" + getPublicPreviewPort(app) + ":" + containerPort);
  }
  if (envFile) args.push("--env-file", envFile);
  args.push(image);
  await safeRunOrThrow("docker", args);
}

function containerRuntimeCaps(containerPort: number) {
  if (containerPort >= 1024) return [];
  return [
    "--cap-add",
    "NET_BIND_SERVICE",
    "--cap-add",
    "CHOWN",
    "--cap-add",
    "SETUID",
    "--cap-add",
    "SETGID"
  ];
}

function markApp(appId: string, patch: Partial<ManagedApp>) {
  updateState((state) => {
    const app = state.apps.find((item) => item.id === appId);
    if (app) Object.assign(app, patch, { updatedAt: new Date().toISOString() });
  });
}

async function cleanupAppResources(app: ManagedApp) {
  try {
    await stopApp(app.id);
  } catch {
    // Deletion should keep going even if the process is already gone.
  }
  if (app.strategy === "compose" && app.composeProject && app.rootDir) {
    const sourceDir = composeSourceDirForApp(app);
    const composeFile = findComposeFile(sourceDir);
    if (composeFile) await safeRun("docker", ["compose", "-p", assertSafeDockerName(app.composeProject), "-f", composeFile, "down", "--remove-orphans"], sourceDir);
  }
  if (app.containerName) await safeRun("docker", ["rm", "-f", assertSafeDockerName(app.containerName)]);
  if (app.imageTag) await safeRun("docker", ["image", "rm", assertSafeDockerImage(app.imageTag)]);
  if (app.domain) {
    await safeRun("sudo", ["rm", "-f", path.join("/etc/caddy/conf.d", "dio_" + app.id + ".caddy")]);
    await safeRun("sudo", ["systemctl", "reload", "caddy"]);
  }
  await removePreviewDomainRoute(app);
  if (app.rootDir) {
    try {
      fs.rmSync(assertManagedPath(getAppsDir(), app.rootDir), { recursive: true, force: true });
    } catch {
      // Managed files are best-effort cleanup; state removal below is authoritative.
    }
  }
}

async function cleanupDatabaseResource(database: DatabaseResource, deleteVolume = false) {
  if (database.kind === "managed-postgres") {
    if (database.dockerContainer) await safeRun("docker", ["rm", "-f", assertDockioDockerResource(database.dockerContainer)]);
    if (deleteVolume && database.dockerVolume) await safeRun("docker", ["volume", "rm", assertDockioDockerResource(database.dockerVolume)]);
  }
  if (database.kind === "managed-redis" && database.dockerContainer) {
    await safeRun("docker", ["rm", "-f", assertDockioDockerResource(database.dockerContainer)]);
  }
  if (database.secretPath) {
    try {
      fs.rmSync(assertManagedPath(getSecretsDir(), database.secretPath), { force: true });
    } catch {
      // Secret cleanup is best effort; the database record is removed below.
    }
  }
}

function removeDeploymentFiles(deployments: Array<{ logsPath?: string }>) {
  for (const deployment of deployments) {
    if (!deployment.logsPath) continue;
    try {
      fs.rmSync(assertManagedPath(getLogsDir(), deployment.logsPath), { force: true });
    } catch {
      // Old or missing log files should not block deletion of state records.
    }
  }
}

function assertDockioDockerResource(value: string) {
  if (!/^dio_[a-z0-9_-]{2,120}$/.test(value)) throw new Error("Managed Docker resource name is invalid.");
  return value;
}

function normalizePreviewSettings(input: Partial<PanelSettings>) {
  const current = readState().settings || defaultPanelSettings;
  const candidate = { ...current, ...input };
  const mode: PreviewDomainMode = ["sslip", "custom", "disabled"].includes(candidate.previewDomainMode) ? candidate.previewDomainMode : "sslip";
  const start = assertSafePort(Number(candidate.localProxyPortRangeStart || defaultPanelSettings.localProxyPortRangeStart));
  const end = assertSafePort(Number(candidate.localProxyPortRangeEnd || defaultPanelSettings.localProxyPortRangeEnd));
  if (end <= start) throw new Error("Local proxy port range end must be greater than the start.");
  if (end - start > 20_000) throw new Error("Local proxy port range is too large.");
  const publicServerIp = (candidate.publicServerIp || "").trim();
  if (publicServerIp) normalizeIpv4(publicServerIp);
  const previewBaseDomain = (candidate.previewBaseDomain || "").trim().toLowerCase();
  if (mode === "custom" && !previewBaseDomain) throw new Error("Custom preview mode needs a preview base domain.");
  if (previewBaseDomain) assertSafeDomain(previewBaseDomain.replace(/^\*\./, ""));
  const publicDockioUrl = candidate.publicDockioUrl ? cleanPublicUrl(candidate.publicDockioUrl) : "";
  return {
    publicServerIp,
    publicDockioUrl,
    previewDomainMode: mode,
    previewBaseDomain: previewBaseDomain.replace(/^\*\./, ""),
    autoPreviewDomainsEnabled: candidate.autoPreviewDomainsEnabled !== false,
    caddySitesDir: assertSafeCaddySitesDir(candidate.caddySitesDir || defaultPanelSettings.caddySitesDir),
    caddyMainConfig: assertSafeCaddyMainConfig(candidate.caddyMainConfig || defaultPanelSettings.caddyMainConfig),
    localProxyPortRangeStart: start,
    localProxyPortRangeEnd: end
  };
}

async function previewDomainSystemStatus(settings: PanelSettings) {
  const normalized = normalizePreviewSettings(settings);
  const main = await safeRead(normalized.caddyMainConfig);
  const sitesDirExists = fs.existsSync(normalized.caddySitesDir);
  const mainOutput = main.ok ? main.output || "" : "";
  const importConfigured = main.ok && mainOutput.includes(PREVIEW_IMPORT_LINE);
  return {
    enabled: normalized.autoPreviewDomainsEnabled && normalized.previewDomainMode !== "disabled",
    mode: normalized.previewDomainMode,
    publicServerIp: normalized.publicServerIp,
    baseDomain: normalized.previewBaseDomain,
    caddyMainConfig: normalized.caddyMainConfig,
    caddySitesDir: normalized.caddySitesDir,
    sitesDirExists,
    importLine: PREVIEW_IMPORT_LINE,
    importConfigured,
    status: importConfigured ? "ready" : "missing-import",
    message: importConfigured ? "Caddy imports generated preview routes." : `Add "${PREVIEW_IMPORT_LINE}" to ${normalized.caddyMainConfig} or re-run the installer.`
  };
}

async function previewHostnameForApp(app: ManagedApp, settings: PanelSettings) {
  const project = app.projectId ? readState().projects.find((item) => item.id === app.projectId) : undefined;
  const mode = settings.previewDomainMode === "custom" ? "custom" : "sslip";
  const serviceSlug = slug(app.slug || app.name);
  const projectSlug = slug(project?.slug || project?.name || "default");
  const shortId = previewShortId(app.previewDomainHostname || app.id);
  const left = previewHostnameLabel(serviceSlug, projectSlug, shortId);
  if (mode === "custom") {
    const baseDomain = assertSafeDomain((settings.previewBaseDomain || "").replace(/^\*\./, ""));
    return assertSafeDomain(`${left}.${baseDomain}`);
  }
  const ip = settings.publicServerIp?.trim() || (await fetchPublicIp()).ip || "";
  const ipv4 = normalizeIpv4(ip);
  return assertSafeDomain(`${left}.${ipv4.replace(/\./g, "-")}.sslip.io`);
}

function previewHostnameLabel(serviceSlug: string, projectSlug: string, shortId: string) {
  const suffix = "-" + slug(shortId).slice(0, 12).replace(/^-+|-+$/g, "");
  const maxBaseLength = Math.max(1, 63 - suffix.length);
  const base = slug(`${serviceSlug}-${projectSlug}`)
    .slice(0, maxBaseLength)
    .replace(/^-+|-+$/g, "");
  return slug(`${base || "app"}${suffix}`).slice(0, 63).replace(/^-+|-+$/g, "") || `app-${previewShortId(shortId)}`;
}

function previewCaddyFileForApp(app: ManagedApp, settings: PanelSettings) {
  const file = `preview-${slug(app.id)}.caddy`;
  return assertSafeCaddyPreviewFile(assertSafeCaddySitesDir(settings.caddySitesDir).replace(/\/+$/, "") + "/" + file, settings);
}

async function removePreviewDomainRoute(app: ManagedApp) {
  const settings = readState().settings;
  const caddyFile = app.previewCaddyFile || previewCaddyFileForApp(app, settings);
  try {
    await safeRun("sudo", ["rm", "-f", assertSafeCaddyPreviewFile(caddyFile, settings)]);
    await safeRun("sudo", ["systemctl", "reload", "caddy"]);
  } catch {
    // Route cleanup should not block app/project deletion.
  }
}

function assertSafeCaddySitesDir(value: string) {
  const dir = value.trim().replace(/\/+$/, "");
  if (!dir.startsWith("/etc/caddy/") || dir.includes("..") || /[\0\r\n]/.test(dir)) {
    throw new Error("Caddy sites directory must stay under /etc/caddy.");
  }
  return dir;
}

function assertSafeCaddyMainConfig(value: string) {
  const file = value.trim();
  if (file !== "/etc/caddy/Caddyfile") throw new Error("Only /etc/caddy/Caddyfile is supported as the main Caddy config.");
  return file;
}

function assertSafeCaddyPreviewFile(value: string, settings: PanelSettings) {
  const sitesDir = assertSafeCaddySitesDir(settings.caddySitesDir);
  const file = value.trim();
  if (!file.startsWith(sitesDir + "/") || !/^preview-[a-z0-9-]{2,90}\.caddy$/.test(file.slice(sitesDir.length + 1))) {
    throw new Error("Preview Caddy file path is invalid.");
  }
  return file;
}

function normalizeIpv4(value: string) {
  const ip = value.trim();
  const parts = ip.split(".");
  if (parts.length !== 4) throw new Error("sslip.io preview mode needs an IPv4 public server IP.");
  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    throw new Error("Public server IP must be a valid IPv4 address.");
  }
  return octets.join(".");
}

function previewShortId(value: string) {
  const clean = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (clean.slice(-6) || crypto.randomBytes(3).toString("hex")).slice(0, 6);
}

function getPublicPreviewPort(app: ManagedApp) {
  return assertSafePort(app.publicPreviewPort || app.port);
}

async function safeRun(command: string, args: string[], cwd?: string, env?: Record<string, string>): Promise<CommandOutput> {
  assertAllowedCommand(command, args);
  const printable = [command, ...args].join(" ");
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      timeout: 15 * 60 * 1000,
      maxBuffer: 5 * 1024 * 1024
    });
    return { ok: true, command: redact(printable), stdout: redact(stdout), stderr: redact(stderr) };
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string; code?: number };
    return {
      ok: false,
      command: redact(printable),
      stdout: redact(err.stdout || ""),
      stderr: redact(err.stderr || err.message),
      code: typeof err.code === "number" ? err.code : undefined
    };
  }
}

async function safeRunOrThrow(command: string, args: string[], cwd?: string) {
  const result = await safeRun(command, args, cwd);
  if (!result.ok) {
    throw new UserFacingError(result.command + " failed: " + (result.stderr || result.stdout), 500);
  }
  return result;
}

async function safeRunForDeployment(deploymentId: string, step: string, command: string, args: string[], cwd?: string, env?: Record<string, string>) {
  const result = await safeRun(command, args, cwd, env);
  appendDeploymentLog(deploymentId, step, deploymentCommandLog(result));
  if (!result.ok) {
    throw new UserFacingError(result.command + " failed: " + (result.stderr || result.stdout), 500);
  }
  return result;
}

function deploymentCommandLog(result: CommandOutput) {
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (!output) return result.ok ? `${result.command} completed.` : `${result.command} failed.`;
  const lines = output.split(/\r?\n/).slice(-80).join("\n");
  return lines.length > 12_000 ? lines.slice(-12_000) : lines;
}

async function safeRead(file: string) {
  try {
    return { ok: true, output: fs.readFileSync(file, "utf8") };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "read failed" };
  }
}

async function fetchPublicIp() {
  try {
    const response = await fetch("https://api.ipify.org", { signal: AbortSignal.timeout(3000) });
    return { ok: true, ip: await response.text() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "public IP check failed" };
  }
}

async function previewUrlForPort(port: number) {
  const publicIp = await fetchPublicIp();
  const host = publicIp.ok && publicIp.ip ? publicIp.ip.trim() : "SERVER_IP";
  return `http://${host}:${assertNetworkPort(port)}`;
}

function memoryStatus() {
  try {
    const text = fs.readFileSync("/proc/meminfo", "utf8");
    const values = Object.fromEntries(
      text.split("\n").map((line) => {
        const [key, value] = line.split(":");
        return [key, Number((value || "").trim().split(/\s+/)[0] || 0)];
      })
    );
    const total = values.MemTotal || 0;
    const available = values.MemAvailable || 0;
    return memoryUsageFromBytes(total * 1024, available * 1024, "procfs");
  } catch (error) {
    const total = os.totalmem();
    const available = os.freemem();
    if (total > 0) return memoryUsageFromBytes(total, available, "node-os");
    return { ok: false, error: error instanceof Error ? error.message : "memory check failed" };
  }
}

function cpuStatus() {
  const load = loadStatus();
  const snapshot = readCpuTimes();
  const cores = Math.max(1, os.cpus().length);
  let percent = 0;
  if (snapshot && previousCpuTimes) {
    const idle = snapshot.idle - previousCpuTimes.idle;
    const total = snapshot.total - previousCpuTimes.total;
    if (total > 0) percent = clampPercent(((total - idle) / total) * 100);
  } else if (load.ok) {
    percent = clampPercent((Number(load.load1) / cores) * 100);
  }
  if (snapshot) previousCpuTimes = snapshot;
  return {
    ok: load.ok || Boolean(snapshot),
    percent,
    cores,
    load1: load.ok ? load.load1 : undefined,
    load5: load.ok ? load.load5 : undefined,
    load15: load.ok ? load.load15 : undefined,
    error: load.ok ? undefined : load.error
  };
}

function loadStatus() {
  try {
    const [load1, load5, load15] = fs.readFileSync("/proc/loadavg", "utf8").trim().split(/\s+/);
    return { ok: true, load1, load5, load15 };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "load check failed" };
  }
}

function readCpuTimes(): CpuTimesSnapshot | undefined {
  try {
    const line = fs.readFileSync("/proc/stat", "utf8").split("\n")[0] || "";
    const parts = line.trim().split(/\s+/).slice(1).map((part) => Number(part));
    if (parts.length < 4 || parts.some((part) => Number.isNaN(part))) return undefined;
    const idle = (parts[3] ?? 0) + (parts[4] ?? 0);
    const total = parts.reduce((sum, value) => sum + value, 0);
    return { idle, total };
  } catch {
    return undefined;
  }
}

function memoryUsageFromBytes(total: number, available: number, source: string) {
  const used = Math.max(0, total - available);
  return {
    ok: true,
    source,
    totalMb: Math.round(total / 1024 / 1024),
    availableMb: Math.round(available / 1024 / 1024),
    usedMb: Math.round(used / 1024 / 1024),
    percent: total > 0 ? clampPercent((used / total) * 100) : 0,
    totalLabel: formatBytes(total),
    availableLabel: formatBytes(available),
    usedLabel: formatBytes(used)
  };
}

function diskUsageStatus(disk: CommandOutput) {
  if (!disk.ok) {
    return { ok: false, percent: 0, error: disk.stderr || disk.stdout || "disk check failed" };
  }
  const lines = disk.stdout.trim().split(/\r?\n/).filter(Boolean);
  const columns = (lines[1] || "").trim().split(/\s+/);
  const totalKb = Number(columns[1] || 0);
  const usedKb = Number(columns[2] || 0);
  const availableKb = Number(columns[3] || 0);
  const percent = Number(String(columns[4] || "0").replace("%", ""));
  return {
    ok: totalKb > 0,
    filesystem: columns[0] || "",
    mount: columns[5] || "/",
    totalKb,
    usedKb,
    availableKb,
    percent: clampPercent(Number.isFinite(percent) ? percent : totalKb > 0 ? (usedKb / totalKb) * 100 : 0),
    totalLabel: formatBytes(totalKb * 1024),
    usedLabel: formatBytes(usedKb * 1024),
    availableLabel: formatBytes(availableKb * 1024)
  };
}

function dockerResourceStatus(containers: CommandOutput, images: CommandOutput, volumes: CommandOutput) {
  const states = containers.ok ? containers.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [];
  const running = states.filter((state) => state === "running").length;
  return {
    ok: containers.ok,
    containers: states.length,
    running,
    stopped: Math.max(0, states.length - running),
    images: countOutputLines(images),
    volumes: countOutputLines(volumes),
    error: containers.ok ? undefined : containers.stderr || containers.stdout || "Docker resource check failed"
  };
}

function countOutputLines(output: CommandOutput) {
  if (!output.ok) return 0;
  return output.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
}

function uptimeStatus() {
  const seconds = Math.max(0, Math.floor(os.uptime()));
  return { seconds, label: formatDuration(seconds) };
}

function recordUsageSample(usage: {
  at: string;
  cpu: ReturnType<typeof cpuStatus>;
  memory: ReturnType<typeof memoryStatus>;
  storage: ReturnType<typeof diskUsageStatus>;
  dockerResources: ReturnType<typeof dockerResourceStatus>;
}) {
  usageHistory.push({
    at: usage.at,
    cpuPercent: usage.cpu.percent || 0,
    memoryPercent: usage.memory.ok && "percent" in usage.memory ? usage.memory.percent : 0,
    storagePercent: usage.storage.percent || 0,
    containersRunning: usage.dockerResources.running || 0,
    containersTotal: usage.dockerResources.containers || 0
  });
  while (usageHistory.length > 120) usageHistory.shift();
  return [...usageHistory];
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function formatDuration(totalSeconds: number) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

async function findOpenPort() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const port = 32000 + crypto.randomInt(25000);
    if (await canListen(port)) return port;
  }
  throw new Error("Could not find an open local port.");
}

async function findOpenProxyPort(settings: PanelSettings) {
  const start = assertSafePort(settings.localProxyPortRangeStart || defaultPanelSettings.localProxyPortRangeStart);
  const end = assertSafePort(settings.localProxyPortRangeEnd || defaultPanelSettings.localProxyPortRangeEnd);
  const span = Math.max(1, end - start + 1);
  for (let attempt = 0; attempt < Math.min(span, 120); attempt += 1) {
    const port = start + crypto.randomInt(span);
    if (await canListen(port)) return port;
  }
  for (let port = start; port <= end; port += 1) {
    if (await canListen(port)) return port;
  }
  throw new Error(`Could not find an open localhost proxy port in ${start}-${end}.`);
}

function canListen(port: number) {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

async function writeTemp(name: string, content: string) {
  const tempDir = path.join(getDataDir(), "tmp");
  fs.mkdirSync(tempDir, { recursive: true, mode: 0o750 });
  const file = path.join(tempDir, slug(name) + "-" + Date.now());
  fs.writeFileSync(file, content, { mode: 0o600 });
  return file;
}

function assertAllowedCommand(command: string, args: string[]) {
  const allowed = new Set(["hostnamectl", "df", "docker", "systemctl", "sudo", "journalctl", "git"]);
  if (!allowed.has(command)) throw new Error("Command is not allowed.");
  if (args.some((arg) => arg.includes("\0") || arg.length > 500)) throw new Error("Command argument is invalid.");
  if (command === "sudo" && !["ufw", "mkdir", "install", "caddy", "systemctl", "rm"].includes(args[0] || "")) {
    throw new Error("sudo command is not allowed.");
  }
}

function getGitHubConnection(connectionId: string) {
  const id = assertSafeId(connectionId, "connectionId");
  const connection = readState().gitConnections.find((item) => item.id === id);
  if (!connection) throw new Error("GitHub connection not found.");
  return connection;
}

function getGitHubInstallation(installationId: string) {
  const id = assertSafeId(installationId, "installationId");
  const installation = readState().gitInstallations.find((item) => item.id === id);
  if (!installation) throw new Error("GitHub installation not found. Refresh installations from the Git page.");
  return installation;
}

function getGitHubRepository(repositoryId: string) {
  const id = assertSafeId(repositoryId, "repositoryId");
  const repository = readState().gitRepositories.find((item) => item.id === id);
  if (!repository) throw new Error("GitHub repository not found. Refresh repositories from the Git page.");
  return repository;
}

function githubAuthForConnection(connection: GitProviderConnection) {
  return {
    appId: connection.appId,
    privateKey: decryptSecret(connection.privateKeyEncrypted)
  };
}

async function getInstallationTokenForRecord(connection: GitProviderConnection, installationId: number) {
  return getInstallationAccessToken(githubAuthForConnection(connection), installationId);
}

async function gitAuthForAppClone(app: ManagedApp) {
  if (app.sourceType !== "github-app") return undefined;
  if (!app.gitProviderConnectionId || !app.gitInstallationId) throw new Error("GitHub App source is missing connection details.");
  const connection = getGitHubConnection(app.gitProviderConnectionId);
  const installation = getGitHubInstallation(app.gitInstallationId);
  const token = await getInstallationTokenForRecord(connection, installation.installationId);
  return createGitAskPass(token.token);
}

function createGitAskPass(token: string) {
  const tempDir = path.join(getDataDir(), "tmp");
  fs.mkdirSync(tempDir, { recursive: true, mode: 0o750 });
  const file = path.join(tempDir, `git-askpass-${crypto.randomBytes(8).toString("hex")}.sh`);
  const script = [
    "#!/bin/sh",
    "case \"$1\" in",
    "  *Username*) printf '%s\\n' 'x-access-token' ;;",
    "  *Password*) printf '%s\\n' \"$DIO_GITHUB_TOKEN\" ;;",
    "  *) printf '\\n' ;;",
    "esac",
    ""
  ].join("\n");
  fs.writeFileSync(file, script, { mode: 0o700 });
  return {
    env: {
      GIT_TERMINAL_PROMPT: "0",
      GIT_ASKPASS: file,
      DIO_GITHUB_TOKEN: token
    },
    cleanup: () => {
      try {
        fs.rmSync(assertManagedPath(tempDir, file), { force: true });
      } catch {
        // Temp credential helper cleanup is best effort.
      }
    }
  };
}

function queueGitHubAutoDeploy(appId: string, meta: {
  deliveryId: string;
  repoFullName: string;
  branch: string;
  commitSha: string;
  commitMessage: string;
  pusher: string;
}) {
  const app = getManagedApp(appId);
  markApp(app.id, {
    lastWebhookAt: new Date().toISOString(),
    lastWebhookStatus: "accepted",
    lastWebhookMessage: `Auto-deploy queued from ${meta.repoFullName}@${meta.branch}.`
  });
  const previous = appDeploymentQueue.get(app.id) || Promise.resolve();
  const task = previous
    .catch(() => undefined)
    .then(() => executeGitDeployment({
      appId: app.id,
      action: "redeploy",
      env: parseEnvText(userEnvText(getManagedApp(app.id))),
      auditMessage: "GitHub webhook auto-deploy executed.",
      trigger: "webhook",
      provider: "github_app",
      commitSha: meta.commitSha,
      commitMessage: meta.commitMessage,
      pusher: meta.pusher,
      webhookDeliveryId: meta.deliveryId,
      repositoryFullName: meta.repoFullName
    }))
    .then(() => {
      markApp(app.id, {
        lastWebhookAt: new Date().toISOString(),
        lastWebhookStatus: "accepted",
        lastWebhookMessage: `Auto-deploy completed for ${meta.repoFullName}@${meta.branch}.`
      });
    })
    .catch((error) => {
      markApp(app.id, {
        lastWebhookAt: new Date().toISOString(),
        lastWebhookStatus: "failed",
        lastWebhookMessage: redact(error instanceof Error ? error.message : "Webhook deploy failed.")
      });
    })
    .finally(() => {
      if (appDeploymentQueue.get(app.id) === task) appDeploymentQueue.delete(app.id);
    });
  appDeploymentQueue.set(app.id, task);
}

function recordGitWebhookEvent(input: {
  providerConnectionId?: string;
  installationId?: number;
  repositoryFullName?: string;
  githubRepoId?: number;
  branch?: string;
  deliveryId?: string;
  event: string;
  status: "accepted" | "ignored" | "failed";
  message: string;
}) {
  updateState((state) => {
    state.gitWebhookEvents.unshift({
      id: crypto.randomUUID(),
      providerConnectionId: input.providerConnectionId,
      installationId: input.installationId,
      repositoryFullName: input.repositoryFullName,
      githubRepoId: input.githubRepoId,
      branch: input.branch,
      deliveryId: input.deliveryId,
      event: input.event,
      status: input.status,
      message: redact(input.message),
      createdAt: new Date().toISOString()
    });
    state.gitWebhookEvents = state.gitWebhookEvents.slice(0, 200);
  });
}

function cleanPublicUrl(value: string) {
  const origin = assertSafeOrigin(value);
  const hostname = new URL(origin).hostname.toLowerCase();
  if (["0.0.0.0", "::", "[::]", "0:0:0:0:0:0:0:0"].includes(hostname)) {
    throw new UserFacingError("Use the real panel IP or domain for Dockio public URL, not 0.0.0.0.", 400);
  }
  return origin.replace(/\/$/, "");
}

function joinPublicUrl(origin: string, pathname: string) {
  const url = new URL(origin);
  if (pathname.startsWith("/#")) {
    url.pathname = "/";
    url.search = "";
    url.hash = pathname.slice(2);
    return url.toString();
  }
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function manifestStateHash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function cleanOptionalUrl(value?: string) {
  const raw = (value || "").trim();
  if (!raw) return undefined;
  return assertSafeOrigin(raw);
}

function cleanOptionalText(value: string | undefined, max: number) {
  const raw = (value || "").trim();
  if (!raw) return undefined;
  if (raw.length > max || /[\x00-\x1f\x7f]/.test(raw)) throw new Error("GitHub connection value contains invalid characters.");
  return raw;
}

function getManagedApp(appId: string) {
  const id = assertSafeId(appId, "appId");
  const app = readState().apps.find((item) => item.id === id);
  if (!app) throw new Error("App not found.");
  return app;
}

function cleanCommand(value: string) {
  const command = value.trim();
  if (!command) return "";
  if (command.length > 160 || /[\x00\r\n]/.test(command)) throw new Error("Command must be one line under 160 characters.");
  return command;
}

function cleanHealthPath(value: string) {
  const health = value.trim() || "/";
  if (!health.startsWith("/") || health.includes("..") || health.length > 120) throw new Error("Health path must start with / and not contain ..");
  return health;
}

function assertContainerPort(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error("Container port must be between 1 and 65535.");
  return value;
}

function writeEnvFile(appDir: string, env: Record<string, string>) {
  if (Object.keys(env).length === 0) return undefined;
  fs.mkdirSync(appDir, { recursive: true, mode: 0o750 });
  const file = path.join(appDir, ".env");
  const content = Object.entries(env)
    .map(([key, value]) => `${key}=${value.replace(/\r?\n/g, "\\n")}`)
    .join("\n");
  fs.writeFileSync(file, content + "\n", { mode: 0o600 });
  return file;
}

function writeAppEnvFile(app: ManagedApp, userEnv: Record<string, string>, deploymentId?: string) {
  if (!app.rootDir) throw new Error("App root directory is missing.");
  const appRoot = assertManagedPath(getAppsDir(), app.rootDir);
  const runtimeEnv: Record<string, string> = {
    ...userEnv,
    PORT: String(app.deployMode === "static" ? 80 : app.containerPort || app.port || 3000),
    HOST: "0.0.0.0",
    DOCKIO_SERVICE_ID: app.id,
    DOCKIO_SERVICE_SLUG: app.slug || slug(app.name)
  };
  if (app.projectId) {
    const project = readState().projects.find((item) => item.id === app.projectId);
    runtimeEnv.DOCKIO_PROJECT_ID = app.projectId;
    runtimeEnv.DOCKIO_PROJECT_SLUG = project?.slug || "default";
  }
  if (deploymentId) runtimeEnv.DOCKIO_DEPLOYMENT_ID = deploymentId;
  if (app.databaseId) {
    const database = readState().databases.find((item) => item.id === app.databaseId);
    if (database?.secretPath) {
      runtimeEnv[assertSafeEnvKey(database.envKey)] = fs.readFileSync(assertManagedPath(getSecretsDir(), database.secretPath), "utf8").trim();
    }
  }
  return writeEnvFile(appRoot, runtimeEnv);
}

function readAppEnvObject(app: ManagedApp) {
  if (!app.rootDir) return {};
  const file = assertManagedPath(getAppsDir(), path.join(assertManagedPath(getAppsDir(), app.rootDir), ".env"));
  if (!fs.existsSync(file)) return {};
  const env: Record<string, string> = {};
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = assertSafeEnvKey(line.slice(0, index));
    env[key] = line.slice(index + 1).replace(/\\n/g, "\n");
  }
  return env;
}

function upsertAppEnvValues(app: ManagedApp, values: Record<string, string>, replace: boolean) {
  const clean = Object.fromEntries(Object.entries(values).map(([key, value]) => [assertSafeEnvKey(key), String(value)]));
  const env = replace ? clean : { ...readAppEnvObject(app), ...clean };
  writeAppEnvFile(app, env);
}

function userEnvText(app: ManagedApp) {
  const env = readAppEnvObject(app);
  const userOnly = Object.entries(env).filter(([key]) => {
    if (key.startsWith("DOCKIO_")) return false;
    if (["PORT", "HOST"].includes(key)) return false;
    return true;
  });
  return userOnly.map(([key, value]) => `${key}=${value.replace(/\r?\n/g, "\\n")}`).join("\n");
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean).map(assertSafeEnvKey)));
}

function uniqueSlug(existing: string[], base: string) {
  const taken = new Set(existing.filter(Boolean));
  let candidate = slug(base);
  let index = 2;
  while (taken.has(candidate)) {
    const suffix = "-" + index;
    candidate = slug(base).slice(0, 48 - suffix.length) + suffix;
    index += 1;
  }
  return candidate;
}

async function ensureDockerNetwork() {
  const inspect = await safeRun("docker", ["network", "inspect", "dockio"]);
  if (inspect.ok) return;
  await safeRunOrThrow("docker", ["network", "create", "--label", "dockio=true", "dockio"]);
}

function writeSecretFile(name: string, content: string) {
  const secretsDir = getSecretsDir();
  fs.mkdirSync(secretsDir, { recursive: true, mode: 0o700 });
  const file = assertManagedPath(secretsDir, path.join(secretsDir, slug(name) + ".secret"));
  fs.writeFileSync(file, content, { mode: 0o600 });
  return file;
}

function parsePostgresUrl(value: string) {
  const raw = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Database URL must be a valid postgres:// or postgresql:// URL.");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) throw new Error("Only Postgres URLs are supported right now.");
  if (!parsed.hostname) throw new Error("Database URL must include a host.");
  const port = parsed.port ? assertNetworkPort(Number(parsed.port)) : 5432;
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "postgres";
  return {
    url: raw,
    host: parsed.hostname,
    port,
    database,
    username: decodeURIComponent(parsed.username || ""),
    sslMode: parsed.searchParams.get("sslmode") || parsed.searchParams.get("ssl") || ""
  };
}

function maskDatabaseUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.password) parsed.password = "****";
    if (parsed.username) parsed.username = parsed.username.replace(/(.{2}).+/, "$1***");
    return parsed.toString();
  } catch {
    return redact(value);
  }
}

function testTcp(host: string, port: number) {
  return new Promise<{ ok: boolean; message: string }>((resolve) => {
    const socket = net.createConnection({ host, port, timeout: 5000 }, () => {
      socket.destroy();
      resolve({ ok: true, message: `TCP connection to ${host}:${port} succeeded.` });
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ ok: false, message: `Timed out connecting to ${host}:${port}.` });
    });
    socket.on("error", (error) => {
      resolve({ ok: false, message: error.message });
    });
  });
}

function prepareDockerfile(sourceDir: string, appDir: string, mode: "dockerfile" | "node" | "static", app: ManagedApp) {
  if (mode === "dockerfile") {
    const existing = path.join(sourceDir, "Dockerfile");
    if (!fs.existsSync(existing)) throw new Error("Dockerfile mode selected, but the repository has no Dockerfile at the root.");
    return existing;
  }
  const runtimePort = mode === "static" ? 80 : assertContainerPort(app.containerPort || 3000);
  const packageManager = detectPackageManager(sourceDir);
  const installCommand = packageManager === "pnpm" ? "corepack enable && pnpm install --frozen-lockfile" : packageManager === "yarn" ? "corepack enable && yarn install --frozen-lockfile" : "npm ci || npm install";
  const run = packageManager === "pnpm" ? "pnpm" : packageManager === "yarn" ? "yarn" : "npm run";
  const buildCommand = app.buildCommand || `${run} build`;
  const startCommand = app.startCommand || `${run} start`;
  const dockerfile =
    mode === "static"
      ? [
          "FROM node:22-alpine AS builder",
          "WORKDIR /app",
          "COPY . .",
          "RUN " + installCommand,
          "RUN " + buildCommand,
          "RUN mkdir -p /app/.dio-static && if [ -d dist ]; then cp -a dist/. /app/.dio-static/; elif [ -d build ]; then cp -a build/. /app/.dio-static/; elif [ -d out ]; then cp -a out/. /app/.dio-static/; else echo 'No dist, build, or out directory found after build' && exit 1; fi",
          "FROM nginx:1.27-alpine",
          "COPY --from=builder /app/.dio-static /usr/share/nginx/html",
          "EXPOSE 80",
          "CMD [\"nginx\", \"-g\", \"daemon off;\"]",
          ""
        ].join("\n")
      : [
          "FROM node:22-alpine",
          "WORKDIR /app",
          "COPY . .",
          "RUN " + installCommand,
          "RUN " + buildCommand,
          "ENV NODE_ENV=production",
          "ENV HOST=0.0.0.0",
          "ENV PORT=" + runtimePort,
          "EXPOSE " + runtimePort,
          "CMD [\"sh\", \"-lc\", " + JSON.stringify(startCommand) + "]",
          ""
        ].join("\n");
  const file = path.join(appDir, "Dockerfile." + mode);
  fs.writeFileSync(file, dockerfile, { mode: 0o640 });
  return file;
}

function detectPackageManager(sourceDir: string) {
  if (fs.existsSync(path.join(sourceDir, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(sourceDir, "yarn.lock"))) return "yarn";
  return "npm";
}

function findDetectionCandidates(repoDir: string) {
  const candidates = new Set<string>();
  if (isDeployCandidate(repoDir)) candidates.add("");
  for (const parent of ["apps", "services", "packages"]) {
    const parentDir = path.join(repoDir, parent);
    if (!fs.existsSync(parentDir)) continue;
    for (const item of fs.readdirSync(parentDir, { withFileTypes: true })) {
      if (item.isDirectory() && !item.name.startsWith(".") && isDeployCandidate(path.join(parentDir, item.name))) {
        candidates.add(`${parent}/${item.name}`);
      }
    }
  }
  for (const name of ["web", "frontend", "client", "api", "backend", "server"]) {
    const dir = path.join(repoDir, name);
    if (fs.existsSync(dir) && isDeployCandidate(dir)) candidates.add(name);
  }
  return Array.from(candidates);
}

function isDeployCandidate(dir: string) {
  return fs.existsSync(path.join(dir, "package.json")) || fs.existsSync(path.join(dir, "Dockerfile"));
}

function detectService(repoDir: string, relativeDir: string, repoUrl: string): DetectedService | null {
  const serviceDir = assertManagedPath(repoDir, path.join(repoDir, relativeDir));
  if (!isDeployCandidate(serviceDir)) return null;
  const packageJson = readPackageJson(serviceDir);
  const scripts = (packageJson?.scripts || {}) as Record<string, string>;
  const deps = {
    ...((packageJson?.dependencies || {}) as Record<string, string>),
    ...((packageJson?.devDependencies || {}) as Record<string, string>)
  };
  const hasDockerfile = fs.existsSync(path.join(serviceDir, "Dockerfile"));
  const packageManager = detectPackageManagerForService(repoDir, serviceDir);
  const reasons: string[] = [];
  const requiredEnv = detectEnvKeys(serviceDir);
  const repoName = slug(path.basename(new URL(repoUrl).pathname.replace(/\.git$/, "")));
  const name = assertSafeAppName((packageJson?.name ? String(packageJson.name).replace(/^@[^/]+\//, "") : "") || path.basename(relativeDir || repoName) || repoName);
  let mode: DetectedService["mode"] = "node";
  let serviceRole: ServiceRole = "fullstack";
  let framework = "Node";
  let containerPort = detectPortFromFiles(serviceDir, scripts) || 3000;
  let healthPath = "/";
  let confidence = packageJson ? 55 : 35;

  if (hasDockerfile) {
    mode = "dockerfile";
    framework = "Dockerfile";
    containerPort = detectExposePort(path.join(serviceDir, "Dockerfile")) || containerPort;
    reasons.push("Dockerfile found");
    confidence += 30;
  }

  if (deps.next || hasAnyFile(serviceDir, ["next.config.js", "next.config.mjs", "next.config.ts"])) {
    framework = "Next.js";
    serviceRole = "frontend";
    containerPort = containerPort || 3000;
    reasons.push("Next.js dependency/config found");
    confidence += 24;
  } else if (deps.vite || deps["@vitejs/plugin-react"] || hasAnyFile(serviceDir, ["vite.config.js", "vite.config.ts", "vite.config.mjs"])) {
    framework = deps.react ? "Vite React" : "Vite";
    serviceRole = "frontend";
    if (!hasDockerfile) {
      mode = "static";
      containerPort = 80;
    }
    reasons.push("Vite build detected");
    confidence += 22;
  } else if (deps.express || deps.fastify || deps["@nestjs/core"] || deps.hono || deps.koa) {
    framework = deps["@nestjs/core"] ? "NestJS" : deps.fastify ? "Fastify" : deps.hono ? "Hono" : deps.koa ? "Koa" : "Express";
    serviceRole = "backend";
    healthPath = "/health";
    reasons.push(`${framework} backend dependency found`);
    confidence += 22;
  } else if (packageJson) {
    reasons.push("package.json found");
  }

  if (scripts.build) reasons.push("build script found");
  if (scripts.start) reasons.push("start script found");
  if (!scripts.start && scripts.dev && mode === "node") reasons.push("no start script; dev script will be used for preview");

  return {
    id: slug(`${relativeDir || "root"}-${framework}`),
    name,
    appDirectory: relativeDir,
    mode,
    serviceRole,
    packageManager,
    framework,
    buildCommand: scripts.build ? runCommand(packageManager, "build") : "",
    startCommand: mode === "static" ? "" : scripts.start ? runCommand(packageManager, "start") : scripts.dev ? runCommand(packageManager, "dev") : "",
    containerPort,
    healthPath,
    confidence: Math.min(confidence, 100),
    reasons,
    requiredEnv,
    hasDockerfile
  };
}

function readPackageJson(dir: string) {
  const file = path.join(dir, "package.json");
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    throw new UserFacingError(`package.json in ${path.basename(dir)} is not valid JSON.`, 400);
  }
}

function detectPackageManagerForService(repoDir: string, serviceDir: string): "npm" | "pnpm" | "yarn" {
  if (fs.existsSync(path.join(serviceDir, "pnpm-lock.yaml")) || fs.existsSync(path.join(repoDir, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(serviceDir, "yarn.lock")) || fs.existsSync(path.join(repoDir, "yarn.lock"))) return "yarn";
  return "npm";
}

function runCommand(packageManager: "npm" | "pnpm" | "yarn", script: string) {
  return packageManager === "npm" ? `npm run ${script}` : `${packageManager} ${script}`;
}

function hasAnyFile(dir: string, names: string[]) {
  return names.some((name) => fs.existsSync(path.join(dir, name)));
}

function detectEnvKeys(serviceDir: string) {
  const keys = new Set<string>();
  for (const name of [".env.example", ".env.sample", ".env.local.example"]) {
    const file = path.join(serviceDir, name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (match?.[1]) keys.add(match[1]);
    }
  }
  return Array.from(keys).slice(0, 40);
}

function detectPortFromFiles(serviceDir: string, scripts: Record<string, string>) {
  const scriptText = Object.values(scripts).join(" ");
  const scriptPort = scriptText.match(/(?:PORT=|--port\s+|-p\s+)(\d{2,5})/i)?.[1];
  if (scriptPort) return assertNetworkPort(Number(scriptPort));
  for (const name of [".env.example", ".env.sample", ".env.local.example"]) {
    const file = path.join(serviceDir, name);
    if (!fs.existsSync(file)) continue;
    const match = fs.readFileSync(file, "utf8").match(/^PORT\s*=\s*(\d{2,5})/m);
    if (match?.[1]) return assertNetworkPort(Number(match[1]));
  }
  return 0;
}

function detectExposePort(dockerfile: string) {
  try {
    const match = fs.readFileSync(dockerfile, "utf8").match(/^\s*EXPOSE\s+(\d{2,5})/im);
    return match?.[1] ? assertNetworkPort(Number(match[1])) : 0;
  } catch {
    return 0;
  }
}

function findComposeFile(sourceDir: string) {
  for (const name of ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]) {
    const file = path.join(sourceDir, name);
    if (fs.existsSync(file)) return file;
  }
  return "";
}

function composeSourceDirForApp(app: ManagedApp) {
  const root = assertManagedPath(getAppsDir(), app.rootDir || "");
  const pasted = assertManagedPath(getAppsDir(), path.join(root, "compose"));
  if (fs.existsSync(pasted)) return pasted;
  return assertManagedPath(getAppsDir(), path.join(root, "source"));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
}
