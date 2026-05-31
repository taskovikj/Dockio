import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { redactValue } from "./validate";

export type AppStrategy = "docker" | "systemd" | "static" | "compose";
export type AppStatus = "created" | "running" | "failed" | "stopped";

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
  name: string;
  strategy: AppStrategy;
  port: number;
  containerPort?: number;
  status: AppStatus;
  source?: "sample" | "git" | "compose";
  repoUrl?: string;
  branch?: string;
  commitSha?: string;
  deployMode?: "dockerfile" | "node" | "static" | "compose";
  buildCommand?: string;
  startCommand?: string;
  healthPath?: string;
  envKeys?: string[];
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

export interface DeploymentEvent {
  id: string;
  appId: string;
  action: string;
  status: "succeeded" | "failed";
  message: string;
  createdAt: string;
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
  apps: ManagedApp[];
  audit: AuditEvent[];
  deployments: DeploymentEvent[];
}

const initialState: PanelState = {
  version: 1,
  admin: null,
  sessions: [],
  apps: [],
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

export function ensureDataDir() {
  fs.mkdirSync(getDataDir(), { recursive: true, mode: 0o750 });
  fs.mkdirSync(getAppsDir(), { recursive: true, mode: 0o750 });
  fs.mkdirSync(path.join(getDataDir(), "tmp"), { recursive: true, mode: 0o750 });
  if (!fs.existsSync(getStatePath())) {
    writeState(initialState);
  }
}

export function readState(): PanelState {
  ensureDataDir();
  try {
    const parsed = JSON.parse(fs.readFileSync(getStatePath(), "utf8")) as PanelState;
    return {
      ...initialState,
      ...parsed,
      sessions: (parsed.sessions || []).filter((session) => new Date(session.expiresAt).getTime() > Date.now()),
      apps: parsed.apps || [],
      audit: parsed.audit || [],
      deployments: parsed.deployments || []
    };
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
    apps: state.apps.map(({ rootDir: _rootDir, ...app }) => app),
    audit: state.audit.slice(0, 80),
    deployments: state.deployments.slice(0, 120),
    dataDir: getDataDir()
  };
}

export function deploymentEvent(appId: string, action: string, status: "succeeded" | "failed", message: string) {
  updateState((state) => {
    state.deployments.unshift({
      id: crypto.randomUUID(),
      appId,
      action,
      status,
      message,
      createdAt: new Date().toISOString()
    });
    state.deployments = state.deployments.slice(0, 300);
  });
}
