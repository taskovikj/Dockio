import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { redactValue } from "./validate";

export type AppStrategy = "docker" | "systemd" | "static" | "compose";
export type AppStatus = "created" | "running" | "failed" | "stopped";
export type ServiceRole = "frontend" | "backend" | "worker" | "fullstack";
export type DatabaseKind = "managed-postgres" | "external-postgres";
export type DeploymentStatus = "running" | "succeeded" | "failed";

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
  sourceType?: "sample" | "git-url" | "docker-image" | "compose-yaml";
  publicPreview?: boolean;
  previewUrl?: string;
  portBind?: "localhost" | "public";
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
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseResource {
  id: string;
  projectId?: string;
  name: string;
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
  branch?: string;
  commitSha?: string;
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

export interface PanelState {
  version: 1;
  admin: AdminAccount | null;
  sessions: SessionRecord[];
  projects: ProjectRecord[];
  apps: ManagedApp[];
  databases: DatabaseResource[];
  audit: AuditEvent[];
  deployments: DeploymentEvent[];
}

const initialState: PanelState = {
  version: 1,
  admin: null,
  sessions: [],
  projects: [],
  apps: [],
  databases: [],
  audit: [],
  deployments: []
};

export function getDataDir() {
  return path.resolve(process.env.SVP_DATA_DIR || process.env.YP_DATA_DIR || path.join(process.cwd(), ".data-supavibe-panel"));
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
    const next = {
      ...initialState,
      ...parsed,
      sessions: (parsed.sessions || []).filter((session) => new Date(session.expiresAt).getTime() > Date.now()),
      projects: parsed.projects || [],
      apps: parsed.apps || [],
      databases: parsed.databases || [],
      audit: parsed.audit || [],
      deployments: parsed.deployments || []
    };
    if (next.projects.length === 0) {
      const now = new Date().toISOString();
      next.projects = [{ id: "default", name: "Default Project", description: next.apps.length > 0 ? "Imported prototype apps" : "First project workspace", createdAt: now, updatedAt: now }];
      next.apps = next.apps.map((app) => ({ ...app, projectId: app.projectId || "default" }));
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
    console.error("Supavibe state file was unreadable and has been reset.", error);
    writeState(initialState);
    return initialState;
  }
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
    projects: state.projects,
    apps: state.apps.map(({ rootDir: _rootDir, ...app }) => app),
    databases: state.databases.map(({ secretPath: _secretPath, ...database }) => database),
    audit: state.audit.slice(0, 80),
    deployments: state.deployments.slice(0, 120).map(({ logsPath: _logsPath, ...deployment }) => deployment),
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
      branch: app?.branch,
      commitSha: app?.commitSha,
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
      branch: input.branch || app?.branch,
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
