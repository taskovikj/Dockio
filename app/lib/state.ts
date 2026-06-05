import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { redactValue, slug } from "./validate";

export type AppStrategy = "docker" | "systemd" | "static" | "compose";
export type AppStatus = "created" | "running" | "failed" | "stopped";
export type ServiceRole = "frontend" | "backend" | "worker" | "fullstack";
export type DatabaseKind = "managed-postgres" | "external-postgres" | "managed-redis";
export type DeploymentStatus = "running" | "succeeded" | "failed";
export type PreviewDomainMode = "sslip" | "custom" | "disabled";
export type PreviewDomainStatus = "disabled" | "pending" | "active" | "error";

export interface PanelSettings {
  publicServerIp?: string;
  publicDockioUrl?: string;
  previewDomainMode: PreviewDomainMode;
  previewBaseDomain?: string;
  autoPreviewDomainsEnabled: boolean;
  caddySitesDir: string;
  caddyMainConfig: string;
  localProxyPortRangeStart: number;
  localProxyPortRangeEnd: number;
}

export interface AdminAccount {
  email: string;
  name: string;
  passwordHash: string;
  salt: string;
  iterations: number;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  tokenHash: string;
  csrfToken?: string;
  expiresAt: string;
  createdAt: string;
}

export interface ManagedApp {
  id: string;
  projectId?: string;
  name: string;
  slug: string;
  serviceRole?: ServiceRole;
  strategy: AppStrategy;
  port: number;
  containerPort?: number;
  status: AppStatus;
  source?: "sample" | "git" | "compose";
  repoUrl?: string;
  branch?: string;
  appDirectory?: string;
  dockerImage?: string;
  sourceType?: "sample" | "git-url" | "github-app" | "docker-image" | "compose-yaml";
  gitProviderConnectionId?: string;
  gitInstallationId?: string;
  gitRepositoryId?: string;
  repoFullName?: string;
  githubRepoId?: number;
  autoDeployEnabled?: boolean;
  autoDeployBranch?: string;
  watchPaths?: string[];
  lastWebhookAt?: string;
  lastWebhookStatus?: "accepted" | "ignored" | "failed";
  lastWebhookMessage?: string;
  publicPreview?: boolean;
  previewUrl?: string;
  portBind?: "localhost" | "public";
  internalPort?: number;
  localProxyPort?: number;
  publicPreviewPort?: number;
  previewDomainEnabled?: boolean;
  previewDomainHostname?: string;
  previewDomainStatus?: PreviewDomainStatus;
  previewDomainError?: string;
  previewDomainMode?: Exclude<PreviewDomainMode, "disabled">;
  previewCaddyFile?: string;
  previewCaddyReloadStatus?: string;
  commitSha?: string;
  deployMode?: "dockerfile" | "node" | "static" | "compose";
  buildCommand?: string;
  startCommand?: string;
  healthPath?: string;
  envKeys?: string[];
  corsOrigins?: string[];
  databaseId?: string;
  domain?: string;
  serviceName?: string;
  containerName?: string;
  composeProject?: string;
  imageTag?: string;
  rootDir?: string;
  createdAt: string;
  updatedAt: string;
  lastMessage?: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  slug: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseResource {
  id: string;
  projectId?: string;
  name: string;
  slug: string;
  kind: DatabaseKind;
  provider: string;
  envKey: string;
  status: "created" | "reachable" | "unreachable" | "running" | "failed";
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  sslMode?: string;
  maskedUrl?: string;
  secretPath?: string;
  dockerContainer?: string;
  dockerVolume?: string;
  localPort?: number;
  createdAt: string;
  updatedAt: string;
  lastMessage?: string;
}

export interface DeploymentEvent {
  id: string;
  projectId?: string;
  appId: string;
  action: string;
  status: DeploymentStatus;
  message: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  sourceType?: string;
  strategy?: string;
  trigger?: "manual" | "webhook" | "system";
  provider?: "public_git" | "github_app" | "docker_image" | "compose";
  branch?: string;
  commitSha?: string;
  commitMessage?: string;
  pusher?: string;
  webhookDeliveryId?: string;
  repositoryFullName?: string;
  imageTag?: string;
  logsPath?: string;
  steps?: Array<{ at: string; step: string; status: DeploymentStatus; message: string }>;
}

export interface AuditEvent {
  id: string;
  action: string;
  message: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface GitProviderConnection {
  id: string;
  provider: "github";
  name: string;
  appId: string;
  clientId?: string;
  appSlug?: string;
  appUrl?: string;
  installUrl?: string;
  privateKeyEncrypted: string;
  webhookSecretEncrypted: string;
  clientSecretEncrypted?: string;
  status: "connected" | "needs_setup" | "error";
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GitInstallation {
  id: string;
  providerConnectionId: string;
  installationId: number;
  accountLogin: string;
  accountType: "User" | "Organization" | string;
  accountAvatarUrl?: string;
  targetType?: string;
  repositorySelection?: "all" | "selected" | string;
  permissions?: Record<string, unknown>;
  events?: string[];
  status: "active" | "error";
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt?: string;
}

export interface GitRepository {
  id: string;
  installationId: string;
  provider: "github";
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
  lastSyncedAt?: string;
}

export interface GitWebhookEvent {
  id: string;
  providerConnectionId?: string;
  installationId?: number;
  repositoryFullName?: string;
  githubRepoId?: number;
  branch?: string;
  deliveryId?: string;
  event: string;
  status: "accepted" | "ignored" | "failed";
  message: string;
  createdAt: string;
}

export interface PanelState {
  version: 1;
  admin: AdminAccount | null;
  sessions: SessionRecord[];
  projects: ProjectRecord[];
  apps: ManagedApp[];
  databases: DatabaseResource[];
  audit: AuditEvent[];
  deployments: DeploymentEvent[];
  settings: PanelSettings;
  gitConnections: GitProviderConnection[];
  gitInstallations: GitInstallation[];
  gitRepositories: GitRepository[];
  gitWebhookEvents: GitWebhookEvent[];
}

export const defaultPanelSettings: PanelSettings = {
  publicDockioUrl: "",
  previewDomainMode: "sslip",
  previewBaseDomain: "",
  autoPreviewDomainsEnabled: true,
  caddySitesDir: "/etc/caddy/dockio/sites",
  caddyMainConfig: "/etc/caddy/Caddyfile",
  localProxyPortRangeStart: 31000,
  localProxyPortRangeEnd: 39999
};

const initialState: PanelState = {
  version: 1,
  admin: null,
  sessions: [],
  projects: [],
  apps: [],
  databases: [],
  audit: [],
  deployments: [],
  settings: defaultPanelSettings,
  gitConnections: [],
  gitInstallations: [],
  gitRepositories: [],
  gitWebhookEvents: []
};

export function getDataDir() {
  return path.resolve(process.env.DIO_DATA_DIR || process.env.YP_DATA_DIR || path.join(process.cwd(), ".data-dockio-panel"));
}

export function getStatePath() {
  return path.join(getDataDir(), "state.json");
}

export function getAppsDir() {
  return path.join(getDataDir(), "apps");
}

export function getSecretsDir() {
  return path.join(getDataDir(), "secrets");
}

export function getLogsDir() {
  return path.join(getDataDir(), "logs");
}

export function ensureDataDir() {
  fs.mkdirSync(getDataDir(), { recursive: true, mode: 0o750 });
  fs.mkdirSync(getAppsDir(), { recursive: true, mode: 0o750 });
  fs.mkdirSync(getSecretsDir(), { recursive: true, mode: 0o700 });
  fs.mkdirSync(getLogsDir(), { recursive: true, mode: 0o750 });
  fs.mkdirSync(path.join(getDataDir(), "tmp"), { recursive: true, mode: 0o750 });
  if (!fs.existsSync(getStatePath())) {
    writeState(initialState);
  }
}

export function readState(): PanelState {
  ensureDataDir();
  try {
    const parsed = JSON.parse(fs.readFileSync(getStatePath(), "utf8")) as PanelState;
    let changed = false;
    const next = {
      ...initialState,
      ...parsed,
      settings: normalizeSettings(parsed.settings),
      sessions: (parsed.sessions || []).filter((session) => new Date(session.expiresAt).getTime() > Date.now()),
      projects: (parsed.projects || []).map((project) => ({ ...project, slug: project.slug || slug(project.name || project.id) })),
      apps: (parsed.apps || []).map((app) => {
        const normalized = normalizeApp(app);
        if (JSON.stringify(normalized) !== JSON.stringify(app)) changed = true;
        return normalized;
      }),
      databases: (parsed.databases || []).map((database) => ({ ...database, slug: database.slug || slug(database.name || database.id) })),
      audit: parsed.audit || [],
      deployments: parsed.deployments || [],
      gitConnections: (parsed.gitConnections || []).map(normalizeGitConnection),
      gitInstallations: (parsed.gitInstallations || []).map(normalizeGitInstallation),
      gitRepositories: (parsed.gitRepositories || []).map(normalizeGitRepository),
      gitWebhookEvents: (parsed.gitWebhookEvents || []).slice(0, 200)
    };
    if (next.projects.length === 0) {
      const now = new Date().toISOString();
      next.projects = [{ id: "default", name: "Default Project", slug: "default", description: next.apps.length > 0 ? "Imported prototype apps" : "First project workspace", createdAt: now, updatedAt: now }];
      next.apps = next.apps.map((app) => ({ ...app, projectId: app.projectId || "default" }));
      writeState(next);
    } else if (changed || !parsed.settings) {
      writeState(next);
    }
    return next;
  } catch (error) {
    const brokenPath = `${getStatePath()}.broken-${Date.now()}`;
    try {
      if (fs.existsSync(getStatePath())) fs.renameSync(getStatePath(), brokenPath);
    } catch {
      // Best effort only: if the state file cannot be moved, recreate below.
    }
    console.error("Dockio state file was unreadable and has been reset.", error);
    writeState(initialState);
    return initialState;
  }
}

function normalizeSettings(settings?: Partial<PanelSettings>): PanelSettings {
  const start = Number(settings?.localProxyPortRangeStart || defaultPanelSettings.localProxyPortRangeStart);
  const end = Number(settings?.localProxyPortRangeEnd || defaultPanelSettings.localProxyPortRangeEnd);
  const mode = settings?.previewDomainMode || defaultPanelSettings.previewDomainMode;
  return {
    ...defaultPanelSettings,
    ...settings,
    previewDomainMode: ["sslip", "custom", "disabled"].includes(mode) ? mode : "sslip",
    publicServerIp: settings?.publicServerIp || "",
    publicDockioUrl: normalizeOptionalUrl(settings?.publicDockioUrl || ""),
    previewBaseDomain: settings?.previewBaseDomain || "",
    autoPreviewDomainsEnabled: settings?.autoPreviewDomainsEnabled !== false,
    caddySitesDir: settings?.caddySitesDir || defaultPanelSettings.caddySitesDir,
    caddyMainConfig: settings?.caddyMainConfig || defaultPanelSettings.caddyMainConfig,
    localProxyPortRangeStart: Number.isInteger(start) ? start : defaultPanelSettings.localProxyPortRangeStart,
    localProxyPortRangeEnd: Number.isInteger(end) ? end : defaultPanelSettings.localProxyPortRangeEnd
  };
}

function normalizeOptionalUrl(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function normalizeApp(app: ManagedApp): ManagedApp {
  const slugged = app.slug || slug(app.name || app.id);
  const internalPort = app.internalPort || app.containerPort || (app.deployMode === "static" ? 80 : undefined);
  const localProxyPort = app.localProxyPort || app.port || undefined;
  const publicPreviewPort = app.publicPreviewPort || (app.publicPreview && app.portBind === "public" ? app.port : undefined);
  const previewDomainEnabled = app.previewDomainEnabled ?? (app.source === "git" || app.sourceType === "git-url");
  const previewDomainStatus =
    app.previewDomainStatus ||
    (app.previewDomainHostname ? "active" : previewDomainEnabled ? "pending" : "disabled");
  return {
    ...app,
    slug: slugged,
    internalPort,
    localProxyPort,
    publicPreviewPort,
    previewDomainEnabled,
    previewDomainStatus,
    port: localProxyPort || app.port || 0,
    portBind: app.publicPreview ? "public" : "localhost"
  };
}

function normalizeGitConnection(connection: GitProviderConnection): GitProviderConnection {
  return {
    ...connection,
    provider: "github",
    name: connection.name || "GitHub",
    appId: String(connection.appId || ""),
    status: connection.status || "needs_setup",
    createdAt: connection.createdAt || new Date().toISOString(),
    updatedAt: connection.updatedAt || connection.createdAt || new Date().toISOString()
  };
}

function normalizeGitInstallation(installation: GitInstallation): GitInstallation {
  return {
    ...installation,
    installationId: Number(installation.installationId),
    accountLogin: installation.accountLogin || String(installation.installationId || ""),
    accountType: installation.accountType || "User",
    status: installation.status || "active",
    createdAt: installation.createdAt || new Date().toISOString(),
    updatedAt: installation.updatedAt || installation.createdAt || new Date().toISOString()
  };
}

function normalizeGitRepository(repository: GitRepository): GitRepository {
  const fullName = repository.fullName || `${repository.owner}/${repository.name}`;
  const [owner = repository.owner || "", name = repository.name || ""] = fullName.split("/");
  return {
    ...repository,
    provider: "github",
    githubRepoId: Number(repository.githubRepoId),
    fullName,
    owner,
    name,
    defaultBranch: repository.defaultBranch || "main",
    cloneUrl: repository.cloneUrl || `https://github.com/${fullName}.git`,
    htmlUrl: repository.htmlUrl || `https://github.com/${fullName}`,
    private: Boolean(repository.private),
    archived: Boolean(repository.archived),
    disabled: Boolean(repository.disabled)
  };
}

export function writeState(state: PanelState) {
  fs.mkdirSync(getDataDir(), { recursive: true, mode: 0o750 });
  const file = getStatePath();
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
  if (fs.existsSync(file)) {
    try {
      fs.copyFileSync(file, `${file}.backup`);
    } catch {
      // Best effort backup only; the atomic rename below is the important bit.
    }
  }
  fs.renameSync(temp, file);
}

export function updateState<T>(mutator: (state: PanelState) => T) {
  const state = readState();
  const result = mutator(state);
  writeState(state);
  return result;
}

export function audit(action: string, message: string, metadata?: Record<string, unknown>) {
  updateState((state) => {
    state.audit.unshift({
      id: crypto.randomUUID(),
      action,
      message,
      createdAt: new Date().toISOString(),
      metadata: redactValue(metadata) as Record<string, unknown> | undefined
    });
    state.audit = state.audit.slice(0, 250);
  });
}

export function publicState() {
  const state = readState();
  return {
    setupRequired: !state.admin,
    settings: state.settings,
    projects: state.projects,
    apps: state.apps.map(({ rootDir: _rootDir, ...app }) => app),
    databases: state.databases.map(({ secretPath: _secretPath, ...database }) => database),
    audit: state.audit.slice(0, 80),
    deployments: state.deployments.slice(0, 120).map(({ logsPath: _logsPath, ...deployment }) => deployment),
    gitConnections: state.gitConnections.map(({ privateKeyEncrypted: privateKey, webhookSecretEncrypted: webhookSecret, clientSecretEncrypted: clientSecret, ...connection }) => ({
      ...connection,
      privateKeyConfigured: Boolean(privateKey),
      webhookSecretConfigured: Boolean(webhookSecret),
      clientSecretConfigured: Boolean(clientSecret)
    })),
    gitInstallations: state.gitInstallations,
    gitRepositories: state.gitRepositories,
    gitWebhookEvents: state.gitWebhookEvents.slice(0, 80),
    dataDir: getDataDir()
  };
}

export function deploymentEvent(appId: string, action: string, status: DeploymentStatus, message: string) {
  updateState((state) => {
    const app = state.apps.find((item) => item.id === appId);
    state.deployments.unshift({
      id: crypto.randomUUID(),
      projectId: app?.projectId,
      appId,
      action,
      status,
      message,
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      finishedAt: status === "running" ? undefined : new Date().toISOString(),
      sourceType: app?.sourceType || app?.source,
      strategy: app?.deployMode || app?.strategy,
      trigger: "manual",
      provider: app?.sourceType === "github-app" ? "github_app" : app?.sourceType === "docker-image" ? "docker_image" : app?.source === "compose" ? "compose" : "public_git",
      branch: app?.branch,
      commitSha: app?.commitSha,
      repositoryFullName: app?.repoFullName,
      imageTag: app?.imageTag
    });
    state.deployments = state.deployments.slice(0, 300);
  });
}

export function startDeployment(input: {
  appId: string;
  action: string;
  message: string;
  sourceType?: string;
  strategy?: string;
  branch?: string;
  trigger?: DeploymentEvent["trigger"];
  provider?: DeploymentEvent["provider"];
  commitSha?: string;
  commitMessage?: string;
  pusher?: string;
  webhookDeliveryId?: string;
  repositoryFullName?: string;
}) {
  const deploymentId = crypto.randomUUID();
  const now = new Date().toISOString();
  const logsPath = path.join(getLogsDir(), `${deploymentId}.log`);
  fs.mkdirSync(getLogsDir(), { recursive: true, mode: 0o750 });
  fs.writeFileSync(logsPath, `[${now}] ${input.message}\n`, { mode: 0o640 });
  updateState((state) => {
    const app = state.apps.find((item) => item.id === input.appId);
    state.deployments.unshift({
      id: deploymentId,
      projectId: app?.projectId,
      appId: input.appId,
      action: input.action,
      status: "running",
      message: input.message,
      createdAt: now,
      startedAt: now,
      sourceType: input.sourceType || app?.sourceType || app?.source,
      strategy: input.strategy || app?.deployMode || app?.strategy,
      trigger: input.trigger || "manual",
      provider: input.provider,
      branch: input.branch || app?.branch,
      commitSha: input.commitSha,
      commitMessage: input.commitMessage,
      pusher: input.pusher,
      webhookDeliveryId: input.webhookDeliveryId,
      repositoryFullName: input.repositoryFullName,
      logsPath,
      steps: [{ at: now, step: "queued", status: "running", message: input.message }]
    });
    state.deployments = state.deployments.slice(0, 300);
  });
  return deploymentId;
}

export function appendDeploymentLog(deploymentId: string, step: string, message: string) {
  const at = new Date().toISOString();
  let logsPath = "";
  const stepRecord: { at: string; step: string; status: DeploymentStatus; message: string } = { at, step, status: "running", message };
  updateState((state) => {
    const deployment = state.deployments.find((item) => item.id === deploymentId);
    if (!deployment) return;
    logsPath = deployment.logsPath || "";
    deployment.message = message;
    deployment.steps = [...(deployment.steps || []), stepRecord].slice(-80);
  });
  if (logsPath) fs.appendFileSync(logsPath, `[${at}] ${step}: ${String(redactValue(message))}\n`, { mode: 0o640 });
}

export function finishDeployment(deploymentId: string, status: Exclude<DeploymentStatus, "running">, message: string, patch?: Partial<DeploymentEvent>) {
  const at = new Date().toISOString();
  let logsPath = "";
  updateState((state) => {
    const deployment = state.deployments.find((item) => item.id === deploymentId);
    if (!deployment) return;
    logsPath = deployment.logsPath || "";
    Object.assign(deployment, patch || {});
    deployment.status = status;
    deployment.message = message;
    deployment.finishedAt = at;
    deployment.steps = [...(deployment.steps || []), { at, step: "finished", status, message }].slice(-80);
  });
  if (logsPath) fs.appendFileSync(logsPath, `[${at}] finished: ${String(redactValue(message))}\n`, { mode: 0o640 });
}
