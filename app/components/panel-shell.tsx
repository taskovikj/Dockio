"use client";

import {
  Activity,
  ArrowLeft,
  Boxes,
  CheckCircle2,
  CircleAlert,
  Copy,
  Database,
  ExternalLink,
  Eye,
  Flame,
  Globe2,
  GitBranch,
  HardDrive,
  HeartPulse,
  Home,
  KeyRound,
  Layers3,
  Lock,
  PackagePlus,
  Play,
  RefreshCw,
  RotateCcw,
  Server,
  Settings,
  Shield,
  Square,
  Terminal,
  Trash2,
  Wrench,
  type LucideIcon
} from "lucide-react";
import { useEffect, useState } from "react";

type Tab = "general" | "services" | "environment" | "database" | "monitoring" | "logs" | "deployments" | "domains" | "preview" | "advanced";
type Strategy = "docker" | "systemd" | "static" | "compose";
type GitMode = "dockerfile" | "node" | "static";
type ServiceRole = "frontend" | "backend" | "worker" | "fullstack";
type DeployProvider = "git" | "image" | "compose" | "compose-yaml";
type DeployStep = "source" | "details" | "build" | "runtime";

interface AuthState {
  setupRequired: boolean;
  setupTokenRequired?: boolean;
  csrfToken?: string;
  user: { email: string; name: string } | null;
}

interface ManagedApp {
  id: string;
  projectId?: string;
  name: string;
  slug: string;
  serviceRole?: ServiceRole;
  strategy: Strategy;
  port: number;
  containerPort?: number;
  status: string;
  source?: "sample" | "git" | "compose";
  repoUrl?: string;
  branch?: string;
  appDirectory?: string;
  dockerImage?: string;
  sourceType?: string;
  publicPreview?: boolean;
  previewUrl?: string;
  portBind?: "localhost" | "public";
  commitSha?: string;
  deployMode?: GitMode | "compose";
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

interface ProjectRecord {
  id: string;
  name: string;
  slug: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

interface DatabaseResource {
  id: string;
  projectId?: string;
  name: string;
  slug: string;
  kind: "managed-postgres" | "external-postgres" | "managed-redis";
  provider: string;
  envKey: string;
  status: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  sslMode?: string;
  maskedUrl?: string;
  dockerContainer?: string;
  dockerVolume?: string;
  localPort?: number;
  createdAt: string;
  updatedAt: string;
  lastMessage?: string;
}

interface AuditEvent {
  id: string;
  action: string;
  message: string;
  createdAt: string;
}

interface DeploymentEvent {
  id: string;
  projectId?: string;
  appId: string;
  action: string;
  status: "running" | "succeeded" | "failed";
  message: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  sourceType?: string;
  strategy?: string;
  branch?: string;
  commitSha?: string;
  imageTag?: string;
  steps?: Array<{ at: string; step: string; status: string; message: string }>;
}

interface DetectedService {
  id: string;
  name: string;
  appDirectory: string;
  mode: GitMode;
  serviceRole: ServiceRole;
  packageManager: string;
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

interface RepoAnalysis {
  repoUrl: string;
  branch: string;
  commitSha?: string;
  services: DetectedService[];
  recommendedServiceId?: string;
  warnings: string[];
}

interface StatePayload {
  setupRequired: boolean;
  projects: ProjectRecord[];
  apps: ManagedApp[];
  databases: DatabaseResource[];
  audit: AuditEvent[];
  deployments: DeploymentEvent[];
  dataDir: string;
}

interface CommandOutput {
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
}

const projectTabs: Array<{ id: Tab; label: string; icon: LucideIcon }> = [
  { id: "general", label: "Overview", icon: Layers3 },
  { id: "services", label: "Services", icon: Boxes },
  { id: "deployments", label: "Deployments", icon: Activity },
  { id: "logs", label: "Logs", icon: Terminal },
  { id: "monitoring", label: "Observability", icon: HeartPulse },
  { id: "environment", label: "Environment Variables", icon: KeyRound },
  { id: "domains", label: "Domains", icon: Globe2 },
  { id: "database", label: "Storage", icon: Database },
  { id: "advanced", label: "Settings", icon: Wrench }
];

const serviceTabs: Array<{ id: Tab; label: string; icon: LucideIcon }> = [
  { id: "general", label: "General", icon: Settings },
  { id: "environment", label: "Environment", icon: KeyRound },
  { id: "domains", label: "Domains", icon: Globe2 },
  { id: "deployments", label: "Deployments", icon: Activity },
  { id: "preview", label: "Preview", icon: Eye },
  { id: "logs", label: "Logs", icon: Terminal },
  { id: "monitoring", label: "Monitoring", icon: HeartPulse },
  { id: "advanced", label: "Advanced", icon: Shield }
];

export function PanelShell() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [state, setState] = useState<StatePayload | null>(null);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [tab, setTab] = useState<Tab>("general");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [csrfToken, setCsrfToken] = useState("");
  const [deployProvider, setDeployProvider] = useState<DeployProvider>("git");
  const [deployStep, setDeployStep] = useState<DeployStep>("source");
  const [authForm, setAuthForm] = useState({ email: "", name: "", password: "", setupCode: "" });
  const [projectForm, setProjectForm] = useState({ name: "New Project", description: "" });
  const [projectDeleteConfirm, setProjectDeleteConfirm] = useState("");
  const [projectDeleteVolumes, setProjectDeleteVolumes] = useState(false);
  const [gitForm, setGitForm] = useState({
    name: "Git App",
    projectId: "",
    serviceRole: "fullstack" as ServiceRole,
    repoUrl: "",
    branch: "main",
    appDirectory: "",
    mode: "node" as GitMode,
    buildCommand: "",
    startCommand: "",
    containerPort: "3000",
    healthPath: "/",
    envText: "",
    corsOrigins: [] as string[],
    databaseId: "",
    publicPreview: true
  });
  const [imageForm, setImageForm] = useState({ name: "Docker Image App", projectId: "", serviceRole: "fullstack" as ServiceRole, image: "nginx:1.27-alpine", containerPort: "80", healthPath: "/", envText: "", publicPreview: false });
  const [composeForm, setComposeForm] = useState({ name: "Compose Stack", projectId: "", repoUrl: "", branch: "main", envText: "" });
  const [composeYamlForm, setComposeYamlForm] = useState({ name: "Pasted Compose Stack", projectId: "", composeYaml: "services:\n  web:\n    image: nginx:1.27-alpine\n    restart: unless-stopped\n", envText: "" });
  const [domainForm, setDomainForm] = useState({ appId: "", domain: "" });
  const [firewallForm, setFirewallForm] = useState({ panelPort: "3099", trustedCidr: "100.64.0.0/10" });
  const [firewallRuleForm, setFirewallRuleForm] = useState({ action: "allow" as "allow" | "deny", port: "8080", protocol: "tcp" as "tcp" | "udp", sourceCidr: "" });
  const [firewallDeleteForm, setFirewallDeleteForm] = useState({ ruleNumber: "" });
  const [appSettingsForm, setAppSettingsForm] = useState({ appId: "", projectId: "", serviceRole: "fullstack" as ServiceRole, corsText: "", databaseId: "" });
  const [externalDbForm, setExternalDbForm] = useState({ projectId: "", name: "External Postgres", provider: "External Postgres", url: "", envKey: "DATABASE_URL" });
  const [managedDbForm, setManagedDbForm] = useState({ projectId: "", name: "Managed Postgres", envKey: "DATABASE_URL" });
  const [managedRedisForm, setManagedRedisForm] = useState({ projectId: "", name: "Managed Redis", envKey: "REDIS_URL" });
  const [appEnvForm, setAppEnvForm] = useState({ appId: "", envText: "", replace: false, deleteKey: "" });
  const [corsPresetForm, setCorsPresetForm] = useState({ frontendOrigin: "", backendOrigin: "" });
  const [logs, setLogs] = useState("");
  const [repoAnalysis, setRepoAnalysis] = useState<RepoAnalysis | null>(null);
  const [selectedDetectionId, setSelectedDetectionId] = useState("");
  const [editingAppId, setEditingAppId] = useState("");

  useEffect(() => {
    void boot();
  }, []);

  async function boot() {
    const nextAuth = await api<AuthState>("/api/auth/state");
    setAuth(nextAuth);
    setCsrfToken(nextAuth.csrfToken || "");
    if (nextAuth.user) await refresh();
  }

  async function refresh() {
    const [nextState, nextStatus] = await Promise.all([
      api<StatePayload>("/api/state"),
      api<Record<string, unknown>>("/api/system/status")
    ]);
    setState(nextState);
    setStatus(nextStatus);
    const defaultApp = selectedProjectId ? nextState.apps.find((app) => app.projectId === selectedProjectId) : nextState.apps[0];
    setDomainForm((form) => ({
      ...form,
      appId: form.appId && nextState.apps.some((app) => app.id === form.appId && (!selectedProjectId || app.projectId === selectedProjectId)) ? form.appId : defaultApp?.id || ""
    }));
    setAppSettingsForm((form) => ({
      ...form,
      appId: form.appId && nextState.apps.some((app) => app.id === form.appId && (!selectedProjectId || app.projectId === selectedProjectId)) ? form.appId : defaultApp?.id || "",
      projectId: form.projectId || nextState.projects[0]?.id || ""
    }));
    setAppEnvForm((form) => ({
      ...form,
      appId: form.appId && nextState.apps.some((app) => app.id === form.appId && (!selectedProjectId || app.projectId === selectedProjectId)) ? form.appId : defaultApp?.id || ""
    }));
    setGitForm((form) => ({ ...form, projectId: form.projectId || nextState.projects[0]?.id || "" }));
    setImageForm((form) => ({ ...form, projectId: form.projectId || nextState.projects[0]?.id || "" }));
    setComposeForm((form) => ({ ...form, projectId: form.projectId || nextState.projects[0]?.id || "" }));
    setComposeYamlForm((form) => ({ ...form, projectId: form.projectId || nextState.projects[0]?.id || "" }));
    setExternalDbForm((form) => ({ ...form, projectId: form.projectId || nextState.projects[0]?.id || "" }));
    setManagedDbForm((form) => ({ ...form, projectId: form.projectId || nextState.projects[0]?.id || "" }));
    setManagedRedisForm((form) => ({ ...form, projectId: form.projectId || nextState.projects[0]?.id || "" }));
    setSelectedProjectId((projectId) => (projectId && !nextState.projects.some((project) => project.id === projectId) ? "" : projectId));
  }

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setNotice("");
    try {
      await action();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Request failed");
    } finally {
      setBusy("");
      if (auth?.user) {
        await refresh().catch(() => {
          // Best effort: keep the original action error visible if refresh also fails.
        });
      }
    }
  }

  async function submitAuth() {
    await run(auth?.setupRequired ? "Creating admin" : "Signing in", async () => {
      const url = auth?.setupRequired ? "/api/auth/setup" : "/api/auth/login";
      const result = await api<AuthState>(url, {
        method: "POST",
        body: auth?.setupRequired ? authForm : { email: authForm.email, password: authForm.password }
      });
      setCsrfToken(result.csrfToken || "");
      setNotice(auth?.setupRequired ? "Admin account created." : "Signed in.");
      await boot();
    });
  }

  async function logout() {
    await run("Signing out", async () => {
      await api("/api/auth/logout", { method: "POST", csrfToken });
      setAuth(await api<AuthState>("/api/auth/state"));
      setState(null);
      setCsrfToken("");
    });
  }

  async function deployGit() {
    await run("Deploying Git app", async () => {
      const result = await api<{ app: ManagedApp }>(editingAppId ? `/api/apps/${editingAppId}/git` : "/api/apps/git", {
        method: "POST",
        csrfToken,
        body: { ...gitForm, projectId: selectedProjectId || gitForm.projectId }
      });
      setDomainForm((form) => ({ ...form, appId: result.app.id }));
      setNotice(result.app.publicPreview ? `${result.app.name} ${editingAppId ? "redeployed" : "deployed"}. Preview: ${previewUrl(result.app, publicIp(status))}` : `${result.app.name} ${editingAppId ? "redeployed" : "deployed"} from ${gitForm.branch}.`);
      setEditingAppId("");
      await refresh();
      setDeployStep("runtime");
    });
  }

  async function detectGitStack() {
    await run("Detecting stack", async () => {
      const result = await api<{ analysis: RepoAnalysis }>("/api/repos/detect", {
        method: "POST",
        csrfToken,
        body: { repoUrl: gitForm.repoUrl, branch: gitForm.branch, appDirectory: gitForm.appDirectory }
      });
      setRepoAnalysis(result.analysis);
      const detected = result.analysis.services.find((service) => service.id === result.analysis.recommendedServiceId) || result.analysis.services[0];
      if (detected) applyDetectedService(detected, result.analysis.branch);
      setDeployStep("build");
      setNotice("Stack detected. Confirm the service and build settings, then continue.");
    });
  }

  function applyDetectedService(service: DetectedService, branch = repoAnalysis?.branch || gitForm.branch) {
    setSelectedDetectionId(service.id);
    setGitForm((form) => ({
      ...form,
      name: !form.name.trim() || form.name === "Git App" ? service.name : form.name,
      branch,
      appDirectory: service.appDirectory,
      mode: service.mode,
      serviceRole: service.serviceRole,
      buildCommand: service.buildCommand,
      startCommand: service.startCommand,
      containerPort: String(service.containerPort),
      healthPath: service.healthPath
    }));
  }

  async function deployImage() {
    await run("Deploying Docker image", async () => {
      const result = await api<{ app: ManagedApp }>("/api/apps/image", {
        method: "POST",
        csrfToken,
        body: { ...imageForm, projectId: selectedProjectId || imageForm.projectId, containerPort: Number(imageForm.containerPort) }
      });
      setDomainForm((form) => ({ ...form, appId: result.app.id }));
      setNotice(result.app.publicPreview ? `${result.app.name} deployed. Preview: ${previewUrl(result.app, publicIp(status))}` : `${result.app.name} deployed from ${imageForm.image}.`);
      await refresh();
      setDeployStep("runtime");
    });
  }

  async function deployCompose() {
    await run("Deploying Compose stack", async () => {
      const result = await api<{ app: ManagedApp }>("/api/apps/compose", {
        method: "POST",
        csrfToken,
        body: { ...composeForm, projectId: selectedProjectId || composeForm.projectId }
      });
      setNotice(`${result.app.name} compose stack deployed.`);
      await refresh();
      setDeployStep("runtime");
    });
  }

  async function deployComposeYaml() {
    await run("Deploying pasted Compose stack", async () => {
      const result = await api<{ app: ManagedApp }>("/api/apps/compose-yaml", {
        method: "POST",
        csrfToken,
        body: { ...composeYamlForm, projectId: selectedProjectId || composeYamlForm.projectId }
      });
      setNotice(`${result.app.name} compose stack deployed.`);
      await refresh();
      setDeployStep("runtime");
    });
  }

  function openProject(projectId: string) {
    setSelectedProjectId(projectId);
    setSelectedServiceId("");
    setTab("general");
    setDomainForm((form) => ({ ...form, appId: "" }));
    setAppSettingsForm((form) => ({ ...form, projectId, appId: "", databaseId: "" }));
    setAppEnvForm((form) => ({ ...form, appId: "", envText: "", deleteKey: "" }));
    setGitForm((form) => ({ ...form, projectId, databaseId: "" }));
    setImageForm((form) => ({ ...form, projectId }));
    setComposeForm((form) => ({ ...form, projectId }));
    setComposeYamlForm((form) => ({ ...form, projectId }));
    setExternalDbForm((form) => ({ ...form, projectId }));
    setManagedDbForm((form) => ({ ...form, projectId }));
    setManagedRedisForm((form) => ({ ...form, projectId }));
    setLogs("");
  }

  function showAllProjects() {
    setSelectedProjectId("");
    setSelectedServiceId("");
    setTab("general");
    setLogs("");
  }

  function openService(app: ManagedApp, nextTab: Tab = "general") {
    setSelectedServiceId(app.id);
    setDomainForm((form) => ({ ...form, appId: app.id }));
    setAppSettingsForm({
      appId: app.id,
      projectId: app.projectId || selectedProjectId || "",
      serviceRole: app.serviceRole || "fullstack",
      corsText: (app.corsOrigins || []).join("\n"),
      databaseId: app.databaseId || ""
    });
    setAppEnvForm((form) => ({ ...form, appId: app.id, deleteKey: "" }));
    setTab(nextTab);
  }

  function startDeployment(provider: DeployProvider = deployProvider) {
    setEditingAppId("");
    setRepoAnalysis(null);
    setSelectedDetectionId("");
    setDeployProvider(provider);
    setDeployStep("source");
    setTab("deployments");
  }

  function editGitDeployment(app: ManagedApp) {
    if (app.source !== "git" && app.sourceType !== "git-url") {
      setNotice("Only public Git services can be edited in the deploy wizard right now.");
      return;
    }
    setEditingAppId(app.id);
    setRepoAnalysis(null);
    setSelectedDetectionId("");
    setDeployProvider("git");
    setDeployStep("details");
    setTab("deployments");
    setGitForm((form) => ({
      ...form,
      name: app.name,
      projectId: app.projectId || selectedProjectId || form.projectId,
      serviceRole: app.serviceRole || "fullstack",
      repoUrl: app.repoUrl || "",
      branch: app.branch || "main",
      appDirectory: app.appDirectory || "",
      mode: (app.deployMode === "dockerfile" || app.deployMode === "static" || app.deployMode === "node") ? app.deployMode : "node",
      buildCommand: app.buildCommand || "",
      startCommand: app.startCommand || "",
      containerPort: String(app.containerPort || 3000),
      healthPath: app.healthPath || "/",
      envText: "",
      corsOrigins: app.corsOrigins || [],
      databaseId: app.databaseId || "",
      publicPreview: Boolean(app.publicPreview)
    }));
    setNotice(`Editing ${app.name}. Existing saved env is preserved unless you paste replacement env values.`);
  }

  async function createProject() {
    await run("Creating project", async () => {
      const result = await api<{ project: ProjectRecord }>("/api/projects", { method: "POST", csrfToken, body: projectForm });
      setProjectForm({ name: "New Project", description: "" });
      openProject(result.project.id);
      setNotice(`${result.project.name} created.`);
      await refresh();
    });
  }

  async function deleteCurrentProject() {
    if (!currentProject) return;
    await run("Deleting project", async () => {
      await api(`/api/projects/${currentProject.id}/delete`, {
        method: "POST",
        csrfToken,
        body: { confirmation: projectDeleteConfirm, deleteVolumes: projectDeleteVolumes }
      });
      setProjectDeleteConfirm("");
      setProjectDeleteVolumes(false);
      setNotice(`${currentProject.name} was deleted.`);
      showAllProjects();
      await refresh();
    });
  }

  async function saveAppSettings() {
    if (!appSettingsForm.appId) return;
    await run("Saving app settings", async () => {
      await api(`/api/apps/${appSettingsForm.appId}/settings`, {
        method: "POST",
        csrfToken,
        body: {
          projectId: selectedProjectId || appSettingsForm.projectId,
          serviceRole: appSettingsForm.serviceRole,
          corsOrigins: splitLines(appSettingsForm.corsText),
          databaseId: appSettingsForm.databaseId
        }
      });
      setNotice("App settings saved.");
      await refresh();
    });
  }

  function applyCorsPreset() {
    const lines = [
      corsPresetForm.frontendOrigin ? `CORS_ORIGIN=${corsPresetForm.frontendOrigin}` : "",
      corsPresetForm.frontendOrigin ? `ALLOWED_ORIGINS=${corsPresetForm.frontendOrigin}` : "",
      corsPresetForm.backendOrigin ? `NEXT_PUBLIC_API_URL=${corsPresetForm.backendOrigin}` : "",
      corsPresetForm.backendOrigin ? `VITE_API_URL=${corsPresetForm.backendOrigin}` : ""
    ].filter(Boolean);
    setGitForm({ ...gitForm, envText: mergeEnvText(gitForm.envText, lines), corsOrigins: corsPresetForm.frontendOrigin ? [corsPresetForm.frontendOrigin] : [] });
    setNotice("CORS/API environment preset added to the deploy form.");
  }

  async function createManagedDatabase() {
    await run("Creating Postgres", async () => {
      const result = await api<{ database: DatabaseResource }>("/api/databases/managed-postgres", { method: "POST", csrfToken, body: { ...managedDbForm, projectId: selectedProjectId || managedDbForm.projectId } });
      setGitForm((form) => ({ ...form, databaseId: result.database.id }));
      setNotice(`${result.database.name} created on localhost:${result.database.localPort || result.database.port}.`);
      await refresh();
    });
  }

  async function createManagedRedis() {
    await run("Creating Redis", async () => {
      const result = await api<{ database: DatabaseResource }>("/api/databases/managed-redis", { method: "POST", csrfToken, body: { ...managedRedisForm, projectId: selectedProjectId || managedRedisForm.projectId } });
      setNotice(`${result.database.name} created. Attach it to a service to inject ${result.database.envKey}.`);
      await refresh();
    });
  }

  async function createExternalDatabase() {
    await run("Saving external database", async () => {
      const result = await api<{ database: DatabaseResource }>("/api/databases/external-postgres", { method: "POST", csrfToken, body: { ...externalDbForm, projectId: selectedProjectId || externalDbForm.projectId } });
      setGitForm((form) => ({ ...form, databaseId: result.database.id }));
      setExternalDbForm((form) => ({ ...form, url: "" }));
      setNotice(`${result.database.name} saved. ${result.database.lastMessage || ""}`.trim());
      await refresh();
    });
  }

  async function databaseAction(databaseId: string, action: "test" | "connection") {
    await run(action === "test" ? "Testing database" : "Revealing connection URL", async () => {
      const result = await api<Record<string, { ok?: boolean; message?: string; envKey?: string; value?: string }>>(`/api/databases/${databaseId}/${action}`, { method: "POST", csrfToken });
      const payload = result.result || result.connection;
      if (action === "connection" && payload?.value) {
        setLogs(`${payload.envKey || "DATABASE_URL"}=${payload.value}`);
        setTab("logs");
        setNotice("Connection URL loaded into Logs. Treat it like a password.");
      } else {
        setNotice(payload?.message || "Database action completed.");
      }
      await refresh();
    });
  }

  async function attachDatabase(databaseId: string, appId: string) {
    if (!appId) return;
    await run("Attaching database", async () => {
      await api(`/api/databases/${databaseId}/attach`, { method: "POST", csrfToken, body: { appId } });
      setNotice("Database env value attached. Redeploy the service to apply it.");
      await refresh();
    });
  }

  async function deleteDatabaseResource(databaseId: string, deleteVolume: boolean) {
    const database = state?.databases.find((item) => item.id === databaseId);
    const expected = database?.slug || database?.name || databaseId;
    const typed = window.prompt(`Type ${expected} to delete this database resource. ${deleteVolume ? "The Docker volume will also be removed." : "The Docker volume is kept when possible."}`);
    if (typed !== expected) {
      setNotice("Database delete cancelled. Confirmation did not match.");
      return;
    }
    await run("Deleting database", async () => {
      await api(`/api/databases/${databaseId}/delete`, { method: "POST", csrfToken, body: { deleteVolume } });
      setNotice("Database resource deleted.");
      await refresh();
    });
  }

  async function saveAppEnvironment() {
    if (!appEnvForm.appId) return;
    await run("Saving environment", async () => {
      await api(`/api/apps/${appEnvForm.appId}/env`, { method: "POST", csrfToken, body: { envText: appEnvForm.envText, replace: appEnvForm.replace } });
      setAppEnvForm((form) => ({ ...form, envText: "" }));
      setNotice("Environment keys saved. Redeploy the service to apply them.");
      await refresh();
    });
  }

  async function deleteAppEnvKey() {
    if (!appEnvForm.appId || !appEnvForm.deleteKey.trim()) return;
    await run("Deleting environment key", async () => {
      await api(`/api/apps/${appEnvForm.appId}/env-delete`, { method: "POST", csrfToken, body: { key: appEnvForm.deleteKey } });
      setAppEnvForm((form) => ({ ...form, deleteKey: "" }));
      setNotice("Environment key removed. Redeploy the service to apply it.");
      await refresh();
    });
  }

  async function configureAppDomain() {
    if (!domainForm.appId || !domainForm.domain) return;
    await run("Configuring domain", async () => {
      await api(`/api/apps/${domainForm.appId}/domain`, { method: "POST", csrfToken, body: { domain: domainForm.domain } });
      setNotice("Domain configured. Make sure DNS points to this VPS public IP.");
      await refresh();
    });
  }

  async function loadLogs(appId: string) {
    await run("Loading logs", async () => {
      const result = await api<{ logs: CommandOutput }>(`/api/apps/${appId}/logs`);
      setLogs([result.logs.command, result.logs.stdout, result.logs.stderr].filter(Boolean).join("\n\n"));
      setTab("logs");
    });
  }

  async function stop(appId: string) {
    await run("Stopping app", async () => {
      await api(`/api/apps/${appId}/stop`, { method: "POST", csrfToken });
      await refresh();
    });
  }

  async function appAction(appId: string, action: "start" | "restart" | "redeploy" | "health" | "delete") {
    if (action === "delete") {
      const app = state?.apps.find((item) => item.id === appId);
      const expected = app?.slug || app?.name || appId;
      const typed = window.prompt(`Type ${expected} to delete this service and its runtime resources. Deployment history is kept.`);
      if (typed !== expected) {
        setNotice("Delete cancelled. The typed service slug did not match.");
        return;
      }
    }
    const label = action === "health" ? "Checking health" : `${action.charAt(0).toUpperCase()}${action.slice(1)} app`;
    await run(label, async () => {
      const result = await api<Record<string, unknown>>(`/api/apps/${appId}/${action}`, { method: "POST", csrfToken });
      if (action === "health" && result.health && typeof result.health === "object") {
        setNotice(String((result.health as { message?: string }).message || "Health check completed."));
      } else {
        setNotice(`${action} completed.`);
      }
      await refresh();
    });
  }

  async function applyFirewall() {
    await run("Applying firewall", async () => {
      const result = await api<{ results: CommandOutput[] }>("/api/firewall/apply", {
        method: "POST",
        csrfToken,
        body: { panelPort: Number(firewallForm.panelPort), trustedCidr: firewallForm.trustedCidr }
      });
      setLogs(result.results.map((item) => `$ ${item.command}\n${item.stdout || item.stderr || (item.ok ? "ok" : "failed")}`).join("\n\n"));
      setNotice("Firewall baseline applied.");
    });
  }

  async function loadDeploymentLogs(deploymentId: string) {
    await run("Loading deployment log", async () => {
      const result = await api<{ logs: CommandOutput }>(`/api/deployments/${deploymentId}/logs`);
      setLogs([result.logs.command, result.logs.stdout, result.logs.stderr].filter(Boolean).join("\n\n"));
      setTab("logs");
    });
  }

  async function applyFirewallRule() {
    await run("Applying firewall rule", async () => {
      const result = await api<{ result: CommandOutput }>("/api/firewall/rule", {
        method: "POST",
        csrfToken,
        body: { ...firewallRuleForm, port: Number(firewallRuleForm.port) }
      });
      setLogs([result.result.command, result.result.stdout, result.result.stderr].filter(Boolean).join("\n\n"));
      setNotice(`Firewall ${firewallRuleForm.action} rule applied.`);
      await refresh();
    });
  }

  async function deleteDeploymentEvent(deploymentId: string) {
    const deployment = state?.deployments.find((item) => item.id === deploymentId);
    if (!window.confirm(`Delete deployment record "${deployment?.action || deploymentId}" and its stored logs? This does not stop a running service.`)) return;
    await run("Deleting deployment", async () => {
      await api(`/api/deployments/${deploymentId}/delete`, { method: "POST", csrfToken });
      setNotice("Deployment record deleted.");
      await refresh();
    });
  }

  async function deleteFirewallRule() {
    await run("Deleting firewall rule", async () => {
      const result = await api<{ result: CommandOutput }>("/api/firewall/delete-rule", {
        method: "POST",
        csrfToken,
        body: { ruleNumber: Number(firewallDeleteForm.ruleNumber) }
      });
      setLogs([result.result.command, result.result.stdout, result.result.stderr].filter(Boolean).join("\n\n"));
      setNotice(`Firewall rule #${firewallDeleteForm.ruleNumber} deleted.`);
      await refresh();
    });
  }

  async function pruneSystem() {
    await run("Pruning Docker", async () => {
      const result = await api<{ result: CommandOutput }>("/api/system/prune", { method: "POST", csrfToken });
      setLogs([result.result.command, result.result.stdout, result.result.stderr].filter(Boolean).join("\n\n"));
      setTab("logs");
      setNotice("Docker prune completed.");
    });
  }

  if (!auth) {
    return <Loading />;
  }

  if (!auth.user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#050505] p-4 text-zinc-100">
        <section className="svp-panel w-full max-w-lg p-5">
          <Brand />
          <h1 className="text-2xl font-black text-ink">{auth.setupRequired ? "Create admin account" : "Sign in"}</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Use auth when the panel port is public. For private Tailscale-only installs it is still safer to keep a password.
          </p>
          <div className="mt-5 grid gap-3">
            <Field label="Email" value={authForm.email} onChange={(email) => setAuthForm({ ...authForm, email })} />
            {auth.setupRequired && <Field label="Name" value={authForm.name} onChange={(name) => setAuthForm({ ...authForm, name })} />}
            <Field label="Password" type="password" value={authForm.password} onChange={(password) => setAuthForm({ ...authForm, password })} />
            {auth.setupRequired && auth.setupTokenRequired && (
              <Field label="Setup code" value={authForm.setupCode} onChange={(setupCode) => setAuthForm({ ...authForm, setupCode })} />
            )}
            {auth.setupRequired && (
              <p className="rounded-md border border-line bg-panel p-3 text-xs text-zinc-400">
                Passwords must be at least 12 characters and include uppercase, lowercase, and a number. On installed servers, the setup code is printed by the installer and stored in `/etc/supavibe-panel/panel.env`.
              </p>
            )}
            <button className="svp-button-primary" onClick={() => void submitAuth()} disabled={Boolean(busy)}>
              <KeyRound size={16} />
              {busy || (auth.setupRequired ? "Create Admin" : "Sign In")}
            </button>
            {notice && <p className="rounded-md border border-line bg-panel p-3 text-sm">{notice}</p>}
          </div>
        </section>
      </main>
    );
  }

  const allApps = state?.apps ?? [];
  const allProjects = state?.projects ?? [];
  const allDatabases = state?.databases ?? [];
  const allDeployments = state?.deployments ?? [];
  const currentProject = allProjects.find((project) => project.id === selectedProjectId);
  const apps = currentProject ? allApps.filter((app) => app.projectId === currentProject.id) : allApps;
  const projects = currentProject ? [currentProject] : allProjects;
  const databases = currentProject ? allDatabases.filter((database) => database.projectId === currentProject.id) : allDatabases;
  const scopedAppIds = new Set(apps.map((app) => app.id));
  const deployments = currentProject ? allDeployments.filter((deployment) => scopedAppIds.has(deployment.appId)) : allDeployments;
  const selectedService = currentProject ? apps.find((app) => app.id === selectedServiceId) : undefined;
  const currentTabs = selectedService ? serviceTabs : projectTabs;
  const filteredProjects = allProjects.filter((project) => {
    const query = projectSearch.trim().toLowerCase();
    if (!query) return true;
    return project.name.toLowerCase().includes(query) || project.slug.toLowerCase().includes(query) || (project.description || "").toLowerCase().includes(query);
  });
  const activeApp = selectedService || apps.find((app) => app.id === domainForm.appId) || apps[0];
  const selectedSettingsApp = apps.find((app) => app.id === appSettingsForm.appId);
  const selectedDomainApp = apps.find((app) => app.id === domainForm.appId) || activeApp;
  const vpsIp = publicIp(status);
  const activePreviewUrl = activeApp ? previewUrl(activeApp, vpsIp) : "";
  const visibleApps = selectedService ? [selectedService] : apps;
  const visibleDeployments = selectedService ? deployments.filter((deployment) => deployment.appId === selectedService.id) : deployments;

  if (!currentProject) {
    return (
      <main className="min-h-screen bg-[#050505] text-zinc-100">
        <div className="grid min-h-screen lg:grid-cols-[240px_1fr]">
          <aside className="border-b border-line bg-[#050505] p-3 lg:border-b-0 lg:border-r">
            <Brand compact />
            <nav className="mt-5 grid gap-4">
              <SidebarGroup title="Main">
                <button className="svp-button justify-start bg-[#1b1b1e]" onClick={showAllProjects}>
                  <Layers3 size={15} />
                  Projects
                </button>
                <button className="svp-button justify-start" onClick={() => setNotice("Open a project to view deployment history.")}>
                  <Activity size={15} />
                  Deployments
                </button>
                <button className="svp-button justify-start" onClick={() => setNotice("Open a project/service to inspect logs.")}>
                  <Terminal size={15} />
                  Logs
                </button>
              </SidebarGroup>
              <SidebarGroup title="Infrastructure">
                <button className="svp-button justify-start" onClick={() => setNotice("Open a project, then Settings to manage UFW and server status.")}>
                  <Shield size={15} />
                  Firewall
                </button>
                <button className="svp-button justify-start" onClick={() => setNotice("Open a project, then Storage to create Postgres, Redis, or external DB records.")}>
                  <Database size={15} />
                  Storage
                </button>
                <ComingSoonItem label="Backups" />
              </SidebarGroup>
              <SidebarGroup title="Settings">
                <ComingSoonItem label="Git Sources" />
                <ComingSoonItem label="Registry" />
              </SidebarGroup>
            </nav>
            <div className="mt-6 border-t border-line pt-4 text-xs text-zinc-500">
              <p>Server IP</p>
              <p className="mt-1 break-all text-zinc-300">{vpsIp || "checking"}</p>
              <p className="mt-3">Signed in</p>
              <p className="mt-1 truncate text-zinc-300">{auth.user?.email}</p>
            </div>
          </aside>

          <section className="min-w-0">
            <header className="border-b border-line px-4 py-3 md:px-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-bold text-zinc-500">Workspace</p>
                  <h1 className="text-xl font-black text-ink">All Projects</h1>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="svp-button" onClick={() => void refresh()} disabled={Boolean(busy)}>
                    <RefreshCw size={15} />
                    Refresh
                  </button>
                  <button className="svp-button" onClick={() => void logout()}>
                    <Lock size={15} />
                    Logout
                  </button>
                </div>
              </div>
            </header>

            <div className="mx-auto max-w-7xl space-y-5 px-4 py-5 md:px-6">
              {(notice || busy) && <Notice busy={busy} notice={notice} />}

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Metric label="Projects" value={allProjects.length} detail="Apps grouped by product" icon={Layers3} />
                <Metric label="Services" value={allApps.length} detail="Frontend, API, workers" icon={Boxes} />
                <Metric label="Databases" value={allDatabases.length} detail="Managed and external" icon={Database} />
                <Metric label="Deployments" value={allDeployments.length} detail="Recent lifecycle events" icon={Activity} />
              </div>

              <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
                <Panel title="New Project" icon={Layers3}>
                  <div className="grid gap-3">
                    <Field label="Project name" value={projectForm.name} onChange={(name) => setProjectForm({ ...projectForm, name })} placeholder="my-product" />
                    <Field label="Slug preview" value={uiSlug(projectForm.name)} onChange={() => undefined} placeholder="auto-generated" />
                    <TextArea label="What will run here?" value={projectForm.description} onChange={(description) => setProjectForm({ ...projectForm, description })} placeholder="Frontend + API + Postgres, domains, env..." />
                    <button className="svp-button-primary w-fit" onClick={() => void createProject()} disabled={Boolean(busy) || !projectForm.name.trim()}>
                      <Layers3 size={16} />
                      Create Project
                    </button>
                  </div>
                </Panel>

                <section className="space-y-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Search projects</span>
                      <input className="svp-input" value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Search projects..." />
                    </label>
                    <button
                      className="svp-button-primary"
                      onClick={() => {
                        setProjectForm({ name: "New Project", description: "" });
                        setNotice("Fill the New Project form on the left, then create it to open the project.");
                      }}
                    >
                      Add New
                    </button>
                  </div>
                  <ProjectCards projects={filteredProjects} apps={allApps} databases={allDatabases} deployments={allDeployments} onOpen={openProject} />
                </section>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#050505] text-zinc-100">
      <div className="grid min-h-screen lg:grid-cols-[240px_1fr]">
        <aside className="border-b border-line bg-[#050505] p-3 lg:border-b-0 lg:border-r">
          <Brand compact />
          <button className="svp-button mt-5 w-full justify-start" onClick={showAllProjects}>
            <Home size={15} />
            Projects Home
          </button>
          <div className="mt-5 rounded-md border border-line bg-panel p-3">
            <p className="svp-label">Current project</p>
            <p className="mt-2 truncate font-black text-ink">{currentProject.name}</p>
            <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{currentProject.description || "Services, deploys, env, domains, storage."}</p>
          </div>
          {selectedService && (
            <button className="svp-button mt-3 w-full justify-start" onClick={() => { setSelectedServiceId(""); setTab("services"); }}>
              <ArrowLeft size={15} />
              Back to Project
            </button>
          )}
          <nav className="mt-5 grid gap-4" aria-label={selectedService ? "Service navigation" : "Project navigation"}>
            <SidebarGroup title={selectedService ? "Service" : "Project"}>
              {currentTabs.filter((item) => ["general", "services", "deployments", "logs", "monitoring", "preview"].includes(item.id)).map((item) => (
                <TabButton key={item.id} item={item} active={tab === item.id} onClick={() => setTab(item.id)} />
              ))}
            </SidebarGroup>
            <SidebarGroup title="Configuration">
              {currentTabs.filter((item) => ["environment", "domains", "database"].includes(item.id)).map((item) => (
                <TabButton key={item.id} item={item} active={tab === item.id} onClick={() => setTab(item.id)} />
              ))}
            </SidebarGroup>
            <SidebarGroup title="Infrastructure">
              {!selectedService && <TabButton item={{ id: "advanced", label: "Firewall & Server", icon: Shield }} active={tab === "advanced"} onClick={() => setTab("advanced")} />}
              {selectedService && <TabButton item={{ id: "advanced", label: "Advanced / Danger", icon: Shield }} active={tab === "advanced"} onClick={() => setTab("advanced")} />}
            </SidebarGroup>
          </nav>
          {!selectedService && apps.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="svp-label">Services</p>
              <div className="mt-2 grid gap-1">
                {apps.slice(0, 6).map((app) => (
                  <button key={app.id} className="rounded-md px-3 py-2 text-left text-sm font-bold text-zinc-400 hover:bg-panel hover:text-ink" onClick={() => openService(app)}>
                    <span className="block truncate">{app.name}</span>
                    <span className="block truncate text-xs font-medium text-zinc-600">{app.serviceRole || "fullstack"} · {app.status}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-6 border-t border-line pt-4 text-xs text-zinc-500">
            <p>Server IP</p>
            <p className="mt-1 break-all text-zinc-300">{vpsIp || "checking"}</p>
            <p className="mt-3">Panel</p>
            <p className="mt-1 text-zinc-300">{auth.user?.email || "Auth protected"}</p>
            <button className="mt-3 text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-ink" onClick={() => void logout()}>
              Logout
            </button>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="border-b border-line bg-[#050505]/95 px-4 py-3 md:px-6">
            <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-bold text-zinc-500">
                  Projects / {currentProject.name}{selectedService ? ` / ${selectedService.name}` : ""}
                </p>
                <h1 className="mt-1 truncate text-2xl font-black tracking-normal text-ink">{selectedService?.name || currentProject.name}</h1>
                <p className="mt-1 max-w-3xl text-sm text-zinc-400">
                  {selectedService
                    ? `${selectedService.serviceRole || "fullstack"} service · ${selectedService.sourceType || selectedService.source || selectedService.strategy} · ${selectedService.slug}`
                    : currentProject.description || "Project workspace for services, deploys, env, storage, domains, logs, firewall, and rollbacks."}
                </p>
                {selectedService && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusPill ok={selectedService.status === "running"} label={selectedService.status} />
                    <span className="svp-badge">{selectedService.serviceRole || "fullstack"}</span>
                    <span className="svp-badge">{selectedService.deployMode || selectedService.strategy}</span>
                    {selectedService.portBind === "public" && <span className="svp-badge">public preview</span>}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedService ? (
                  <>
                    {(selectedService.domain || activePreviewUrl) && (
                      <a className="svp-button-primary" href={selectedService.domain ? `https://${selectedService.domain}` : activePreviewUrl} target="_blank" rel="noreferrer">
                        <ExternalLink size={15} />
                        Open URL
                      </a>
                    )}
                    <button className="svp-button" onClick={() => void appAction(selectedService.id, "redeploy")} disabled={Boolean(busy) || !(selectedService.source || selectedService.sourceType === "docker-image")}>
                      <RefreshCw size={15} />
                      Redeploy
                    </button>
                    <button className="svp-button" onClick={() => void appAction(selectedService.id, selectedService.status === "running" ? "restart" : "start")} disabled={Boolean(busy)}>
                      <RotateCcw size={15} />
                      {selectedService.status === "running" ? "Restart" : "Start"}
                    </button>
                  </>
                ) : (
                  <>
                    <button className="svp-button-primary" onClick={() => startDeployment()} disabled={Boolean(busy)}>
                      <PackagePlus size={15} />
                      Create Service
                    </button>
                    <button className="svp-button" onClick={() => setTab("database")} disabled={Boolean(busy)}>
                      <Database size={15} />
                      Create Database
                    </button>
                  </>
                )}
                {(activeApp?.domain || activePreviewUrl) && (
                  !selectedService && <a className="svp-button" href={activeApp?.domain ? `https://${activeApp.domain}` : activePreviewUrl} target="_blank" rel="noreferrer">
                    <Globe2 size={15} />
                    {activeApp?.domain ? "Visit" : "Preview"}
                  </a>
                )}
                <button className="svp-button" onClick={() => void refresh()} disabled={Boolean(busy)}>
                  <RefreshCw size={15} />
                  Refresh
                </button>
                <button className="svp-button" onClick={() => void logout()}>
                  <Lock size={15} />
                  Logout
                </button>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-7xl space-y-4 px-4 py-5 md:px-6">
            {(notice || busy) && <Notice busy={busy} notice={notice} />}

        {tab === "general" && selectedService && (
          <div className="space-y-4">
            <Panel title="Deploy Settings" icon={Play}>
              <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
                <div className="flex flex-wrap gap-2">
                  <button className="svp-button-primary" onClick={() => void appAction(selectedService.id, "redeploy")} disabled={Boolean(busy) || !(selectedService.source || selectedService.sourceType === "docker-image")}>
                    <Play size={15} />
                    Redeploy
                  </button>
                  <button className="svp-button" onClick={() => selectedService.source === "git" || selectedService.sourceType === "git-url" ? editGitDeployment(selectedService) : setNotice("Edit settings are currently available for public Git services.")}>
                    <Wrench size={15} />
                    Edit Build Settings
                  </button>
                  <button className="svp-button" onClick={() => void appAction(selectedService.id, "restart")} disabled={Boolean(busy)}>
                    <RotateCcw size={15} />
                    Restart
                  </button>
                  <button className="svp-button" onClick={() => selectedService.status === "running" ? void stop(selectedService.id) : void appAction(selectedService.id, "start")} disabled={Boolean(busy)}>
                    <Square size={15} />
                    {selectedService.status === "running" ? "Stop" : "Start"}
                  </button>
                  <button className="svp-button" onClick={() => void loadLogs(selectedService.id)} disabled={Boolean(busy)}>
                    <Terminal size={15} />
                    Logs
                  </button>
                </div>
                <Info title="No autodeploy yet" body="Supavibe deploys manually from this panel right now. Webhooks and GitHub account integrations are intentionally hidden until they work." />
              </div>
            </Panel>

            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <Panel title="Provider / Source" icon={GitBranch}>
                <div className="grid gap-3 text-sm">
                  <Info title="Source type" body={selectedService.sourceType || selectedService.source || selectedService.strategy} />
                  {selectedService.repoUrl && <Info title="Repository" body={`${selectedService.repoUrl} @ ${selectedService.branch || "main"}`} />}
                  {selectedService.appDirectory && <Info title="Build path" body={selectedService.appDirectory} />}
                  {selectedService.dockerImage && <Info title="Docker image" body={selectedService.dockerImage} />}
                  {selectedService.composeProject && <Info title="Compose project" body={selectedService.composeProject} />}
                </div>
              </Panel>

              <Panel title="Build Type" icon={Wrench}>
                <div className="grid gap-3 text-sm">
                  <Info title="Build mode" body={selectedService.deployMode || selectedService.strategy} />
                  <Info title="Build command" body={selectedService.buildCommand || "auto"} />
                  <Info title="Start command" body={selectedService.startCommand || "auto"} />
                  <Info title="Internal port" body={selectedService.containerPort ? `Container listens on :${selectedService.containerPort}` : "Not assigned"} />
                  <Info title="Health path" body={selectedService.healthPath || "/"} />
                </div>
              </Panel>
            </div>

            <Panel title="URLs" icon={Globe2}>
              <div className="grid gap-3 lg:grid-cols-3">
                <UrlCard title="Preview port" url={previewUrl(selectedService, vpsIp)} help={selectedService.publicPreview ? "Public quick-test URL opened through UFW." : "Preview port is disabled. Use Edit Build Settings to enable it on redeploy."} />
                <UrlCard title="Domain" url={selectedService.domain ? `https://${selectedService.domain}` : ""} help="Production URL through Caddy on ports 80/443." />
                <Info title="Internal route" body={selectedService.port ? `${selectedService.portBind === "public" ? "0.0.0.0" : "127.0.0.1"}:${selectedService.port} -> :${selectedService.containerPort || selectedService.port}` : "No runtime port"} />
              </div>
            </Panel>
          </div>
        )}

        {tab === "general" && !selectedService && (
          <div className="space-y-4">
            <Panel title="Project Actions" icon={Play}>
              <div className="flex flex-wrap items-center gap-2">
                <button className="svp-button-primary" onClick={() => startDeployment()} disabled={Boolean(busy)}>
                  <PackagePlus size={15} />
                  Create Service
                </button>
                <button className="svp-button" onClick={() => setTab("database")} disabled={Boolean(busy)}>
                  <Database size={15} />
                  Create Database
                </button>
                <button className="svp-button" onClick={() => void refresh()} disabled={Boolean(busy)}>
                  <RefreshCw size={15} />
                  Reload
                </button>
                {activeApp && (
                  <>
                    <button className="svp-button" onClick={() => void appAction(activeApp.id, "redeploy")} disabled={Boolean(busy) || !(activeApp.source || activeApp.sourceType === "docker-image")}>
                      <Wrench size={15} />
                      Rebuild
                    </button>
                    <button className="svp-button" onClick={() => void appAction(activeApp.id, "restart")} disabled={Boolean(busy)}>
                      <RotateCcw size={15} />
                      Restart
                    </button>
                    <button className="svp-button" onClick={() => void loadLogs(activeApp.id)} disabled={Boolean(busy)}>
                      <Terminal size={15} />
                      Logs
                    </button>
                    {(activeApp.source === "git" || activeApp.sourceType === "git-url") && (
                      <button className="svp-button" onClick={() => editGitDeployment(activeApp)} disabled={Boolean(busy)}>
                        <Wrench size={15} />
                        Edit Deploy
                      </button>
                    )}
                  </>
                )}
              </div>
            </Panel>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Metric label="Services" value={apps.length} detail="Frontend, API, workers" icon={Boxes} />
              <Metric label="Deployments" value={deployments.length} detail="Rollbacks and deploy history" icon={Activity} />
              <Metric label="Storage" value={databases.length} detail="Managed or external Postgres" icon={Database} />
              <Metric label="Domains" value={apps.filter((app) => app.domain).length} detail="Caddy HTTPS routes" icon={Globe2} />
            </div>

            <Panel title="Project Overview" icon={Server}>
              {activeApp ? (
                <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                  <div className="rounded-md border border-line bg-[#050505] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="svp-label">Primary service</p>
                        <h2 className="mt-2 truncate text-xl font-black text-ink">{activeApp.name}</h2>
                        <p className="mt-1 text-sm text-zinc-500">
                          {activeApp.serviceRole || "fullstack"} - {activeApp.strategy} - {activeApp.source || "manual"}
                        </p>
                      </div>
                      <StatusPill ok={activeApp.status === "running"} label={activeApp.status} />
                    </div>
                    <div className="mt-4 grid gap-2 text-sm text-zinc-400">
                      <p>Source: {activeApp.repoUrl ? `${activeApp.repoUrl} @ ${activeApp.branch || "main"}` : activeApp.source || activeApp.sourceType || "manual"}</p>
                      <p>Route: {activeApp.domain ? activeApp.domain : activePreviewUrl || `${activeApp.portBind === "public" ? "0.0.0.0" : "127.0.0.1"}:${activeApp.port}`}</p>
                      <p>Database: {activeApp.databaseId ? databaseName(databases, activeApp.databaseId) : "No database bound"}</p>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button className="svp-button-primary" onClick={() => startDeployment()}>
                        <Play size={15} />
                        Deploy
                      </button>
                      <button className="svp-button" onClick={() => void appAction(activeApp.id, "health")}>
                        <HeartPulse size={15} />
                        Health
                      </button>
                      <button className="svp-button" onClick={() => void loadLogs(activeApp.id)}>
                        <Terminal size={15} />
                        Logs
                      </button>
                      {activeApp.source && (
                        <button className="svp-button" onClick={() => void appAction(activeApp.id, "redeploy")}>
                          <GitBranch size={15} />
                          Redeploy
                        </button>
                      )}
                      {(activeApp.source === "git" || activeApp.sourceType === "git-url") && (
                        <button className="svp-button" onClick={() => editGitDeployment(activeApp)}>
                          <Wrench size={15} />
                          Edit & Redeploy
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="rounded-md border border-line bg-[#050505] p-4">
                    <p className="font-black text-ink">Project resources</p>
                    <div className="mt-3 grid gap-3 text-sm text-zinc-400">
                      <div className="grid grid-cols-2 gap-2">
                        <Info title="Runtime" body={`${apps.filter((app) => app.status === "running").length} running / ${apps.length} total services`} />
                        <Info title="Storage" body={databases.length ? `${databases.length} database resource${databases.length === 1 ? "" : "s"}` : "No database attached"} />
                        <Info title="Routing" body={apps.some((app) => app.domain) ? "Domain route configured" : "No domain connected"} />
                        <Info title="Deploys" body={deployments.length ? `${deployments.length} recorded events` : "No deploy events yet"} />
                      </div>
                      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                        <button className="svp-button" onClick={() => setTab("environment")}>
                          <KeyRound size={14} />
                          Env
                        </button>
                        <button className="svp-button" onClick={() => setTab("database")}>
                          <Database size={14} />
                          Storage
                        </button>
                        <button className="svp-button" onClick={() => setTab("domains")}>
                          <Globe2 size={14} />
                          Domains
                        </button>
                        <button className="svp-button" onClick={() => setTab("advanced")}>
                          <Shield size={14} />
                          Server
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
                  <div>
                    <p className="text-sm text-zinc-400">This project is empty. Add one service first, then configure env vars, storage, domains, and logs inside this same workspace.</p>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <button className="svp-button-primary" onClick={() => setTab("deployments")}>
                        <Play size={15} />
                        Deploy Service
                      </button>
                      <button className="svp-button" onClick={() => setTab("environment")}>
                        <KeyRound size={15} />
                        Prepare Env
                      </button>
                      <button className="svp-button" onClick={() => setTab("database")}>
                        <Database size={15} />
                        Add Database
                      </button>
                    </div>
                  </div>
                  <Info title="How this works" body="Project screens only show resources attached to this project, so frontend, backend, database, domains, and logs stay grouped together." />
                </div>
              )}
            </Panel>

          </div>
        )}

        {tab === "services" && (
          <div className="space-y-4">
            <Panel title="Services" icon={Server}>
              <AppGrid apps={apps} projects={projects} databases={databases} vpsIp={vpsIp} onLogs={loadLogs} onStop={stop} onAction={appAction} onEdit={editGitDeployment} onOpen={openService} />
            </Panel>
            <Panel title="Service Roles" icon={Boxes}>
              <div className="grid gap-3 md:grid-cols-4">
                {roleOptions().map((role) => (
                  <Info key={role.value} title={role.label} body={`${apps.filter((app) => (app.serviceRole || "fullstack") === role.value).length} service${apps.filter((app) => (app.serviceRole || "fullstack") === role.value).length === 1 ? "" : "s"}`} />
                ))}
              </div>
            </Panel>
          </div>
        )}

        {tab === "environment" && (
          <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[440px_1fr]">
              <Panel title="Environment Presets" icon={KeyRound}>
                <div className="grid gap-3">
                  <TextArea label="Deploy-time environment variables" value={gitForm.envText} onChange={(envText) => setGitForm({ ...gitForm, envText })} placeholder={"DATABASE_URL=...\nNODE_ENV=production"} />
                  <div className="grid gap-3 border-t border-line pt-3 md:grid-cols-2">
                    <Field label="Frontend origin" value={corsPresetForm.frontendOrigin} onChange={(frontendOrigin) => setCorsPresetForm({ ...corsPresetForm, frontendOrigin })} placeholder="https://app.example.com" />
                    <Field label="Backend/API origin" value={corsPresetForm.backendOrigin} onChange={(backendOrigin) => setCorsPresetForm({ ...corsPresetForm, backendOrigin })} placeholder="https://api.example.com" />
                  </div>
                  <button className="svp-button w-fit" onClick={applyCorsPreset}>
                    <Globe2 size={15} />
                    Add CORS/API Env Preset
                  </button>
                  <p className="rounded-md border border-line bg-panel p-3 text-xs text-zinc-400">
                    Use this before deploying a frontend/backend pair. It adds common CORS and public API URL keys to the deploy form.
                  </p>
                </div>
              </Panel>

              <Panel title="App Settings" icon={Wrench}>
                <div className="grid gap-3">
                  <label className="grid gap-1">
                    <span className="svp-label">App</span>
                    <select
                      className="svp-input"
                      value={appSettingsForm.appId}
                      onChange={(event) => {
                        const app = apps.find((item) => item.id === event.target.value);
                        setAppSettingsForm({
                          appId: event.target.value,
                          projectId: app?.projectId || projects[0]?.id || "",
                          serviceRole: app?.serviceRole || "fullstack",
                          corsText: (app?.corsOrigins || []).join("\n"),
                          databaseId: app?.databaseId || ""
                        });
                      }}
                    >
                      <option value="">Select app</option>
                      {visibleApps.map((app) => (
                        <option key={app.id} value={app.id}>{app.name}</option>
                      ))}
                    </select>
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Select label="Project" value={appSettingsForm.projectId} onChange={(projectId) => setAppSettingsForm({ ...appSettingsForm, projectId })} options={projects.map((project) => ({ value: project.id, label: project.name }))} />
                    <Select label="Service role" value={appSettingsForm.serviceRole} onChange={(serviceRole) => setAppSettingsForm({ ...appSettingsForm, serviceRole: serviceRole as ServiceRole })} options={roleOptions()} />
                  </div>
                  <Select label="Database binding" value={appSettingsForm.databaseId} onChange={(databaseId) => setAppSettingsForm({ ...appSettingsForm, databaseId })} options={[{ value: "", label: "No database" }, ...databases.map((database) => ({ value: database.id, label: `${database.name} (${database.envKey})` }))]} />
                  <TextArea label="Allowed CORS origins" value={appSettingsForm.corsText} onChange={(corsText) => setAppSettingsForm({ ...appSettingsForm, corsText })} placeholder={"https://app.example.com\nhttps://admin.example.com"} />
                  <button className="svp-button-primary w-fit" onClick={() => void saveAppSettings()} disabled={Boolean(busy) || !appSettingsForm.appId}>
                    <Wrench size={15} />
                    Save Settings
                  </button>
                  {selectedSettingsApp && <Info title="Selected app" body={`${selectedSettingsApp.name} currently belongs to ${projectName(projects, selectedSettingsApp.projectId)} as ${selectedSettingsApp.serviceRole || "fullstack"}.`} />}
                </div>
              </Panel>
            </div>

            <Panel title="Saved Service Environment" icon={Lock}>
              <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
                <div className="grid gap-3">
                  <label className="grid gap-1">
                    <span className="svp-label">Service</span>
                    <select className="svp-input" value={appEnvForm.appId} onChange={(event) => setAppEnvForm({ ...appEnvForm, appId: event.target.value })}>
                      <option value="">Select service</option>
                      {visibleApps.map((app) => (
                        <option key={app.id} value={app.id}>{app.name}</option>
                      ))}
                    </select>
                  </label>
                  <TextArea label="Environment variables" value={appEnvForm.envText} onChange={(envText) => setAppEnvForm({ ...appEnvForm, envText })} placeholder={"JWT_SECRET=...\nDATABASE_URL=..."} />
                  <label className="flex items-start gap-3 rounded-md border border-line bg-[#050505] p-3 text-sm text-zinc-300">
                    <input className="mt-1" type="checkbox" checked={appEnvForm.replace} onChange={(event) => setAppEnvForm({ ...appEnvForm, replace: event.target.checked })} />
                    <span><span className="block font-bold text-ink">Replace existing saved env</span><span className="mt-1 block text-xs text-zinc-500">Leave unchecked to add or update only the keys you paste.</span></span>
                  </label>
                  <button className="svp-button-primary w-fit" onClick={() => void saveAppEnvironment()} disabled={Boolean(busy) || !appEnvForm.appId || !appEnvForm.envText.trim()}>
                    <KeyRound size={15} />
                    Save Env
                  </button>
                </div>
                <div className="grid content-start gap-3">
                  <Info title="Secrets stay server-side" body="Values are written to this VPS data directory and only env key names are shown in the dashboard state." />
                  <Field label="Delete one env key" value={appEnvForm.deleteKey} onChange={(deleteKey) => setAppEnvForm({ ...appEnvForm, deleteKey })} placeholder="JWT_SECRET" />
                  <button className="svp-button-danger w-fit" onClick={() => void deleteAppEnvKey()} disabled={Boolean(busy) || !appEnvForm.appId || !appEnvForm.deleteKey.trim()}>
                    <Trash2 size={15} />
                    Delete Key
                  </button>
                </div>
              </div>
            </Panel>

            <Panel title="Configured Keys" icon={Lock}>
              <div className="grid gap-2">
                {visibleApps.length === 0 && <p className="text-sm text-zinc-500">No app environment keys yet.</p>}
                {visibleApps.map((app) => (
                  <div key={app.id} className="rounded-md border border-line bg-panel p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-ink">{app.name}</p>
                      <span className="svp-badge">{app.serviceRole || "fullstack"}</span>
                      <span className="svp-badge">{projectName(projects, app.projectId)}</span>
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">Env keys: {app.envKeys?.length ? app.envKeys.join(", ") : "No keys captured"}</p>
                    <p className="mt-1 text-xs text-zinc-500">CORS: {app.corsOrigins?.length ? app.corsOrigins.join(", ") : "Not configured"}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        )}

        {tab === "database" && (
          <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-3">
              <Panel title="Managed Postgres" icon={Database}>
                <div className="grid gap-3">
                  <Select label="Project" value={managedDbForm.projectId} onChange={(projectId) => setManagedDbForm({ ...managedDbForm, projectId })} options={projects.map((project) => ({ value: project.id, label: project.name }))} />
                  <Field label="Database name" value={managedDbForm.name} onChange={(name) => setManagedDbForm({ ...managedDbForm, name })} />
                  <Field label="Env key" value={managedDbForm.envKey} onChange={(envKey) => setManagedDbForm({ ...managedDbForm, envKey })} placeholder="DATABASE_URL" />
                  <button className="svp-button-primary w-fit" onClick={() => void createManagedDatabase()} disabled={Boolean(busy)}>
                    <Database size={16} />
                    Create Postgres
                  </button>
                  <Info title="Safe default" body="The container binds Postgres to 127.0.0.1 only. It is not exposed publicly through the firewall." />
                </div>
              </Panel>

              <Panel title="Managed Redis" icon={HardDrive}>
                <div className="grid gap-3">
                  <Select label="Project" value={managedRedisForm.projectId} onChange={(projectId) => setManagedRedisForm({ ...managedRedisForm, projectId })} options={projects.map((project) => ({ value: project.id, label: project.name }))} />
                  <Field label="Redis name" value={managedRedisForm.name} onChange={(name) => setManagedRedisForm({ ...managedRedisForm, name })} />
                  <Field label="Env key" value={managedRedisForm.envKey} onChange={(envKey) => setManagedRedisForm({ ...managedRedisForm, envKey })} placeholder="REDIS_URL" />
                  <button className="svp-button-primary w-fit" onClick={() => void createManagedRedis()} disabled={Boolean(busy)}>
                    <HardDrive size={16} />
                    Create Redis
                  </button>
                  <Info title="Internal network" body="Redis joins the Supavibe Docker network and is injected into services as REDIS_URL when attached." />
                </div>
              </Panel>

              <Panel title="External Postgres" icon={Globe2}>
                <div className="grid gap-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Select label="Project" value={externalDbForm.projectId} onChange={(projectId) => setExternalDbForm({ ...externalDbForm, projectId })} options={projects.map((project) => ({ value: project.id, label: project.name }))} />
                    <Field label="Provider" value={externalDbForm.provider} onChange={(provider) => setExternalDbForm({ ...externalDbForm, provider })} placeholder="Supabase, Neon, RDS..." />
                  </div>
                  <Field label="Name" value={externalDbForm.name} onChange={(name) => setExternalDbForm({ ...externalDbForm, name })} />
                  <Field label="Env key" value={externalDbForm.envKey} onChange={(envKey) => setExternalDbForm({ ...externalDbForm, envKey })} placeholder="DATABASE_URL" />
                  <TextArea label="Postgres URL" value={externalDbForm.url} onChange={(url) => setExternalDbForm({ ...externalDbForm, url })} placeholder="postgres://user:password@host:5432/db?sslmode=require" />
                  <button className="svp-button-primary w-fit" onClick={() => void createExternalDatabase()} disabled={Boolean(busy) || !externalDbForm.url.trim()}>
                    <KeyRound size={16} />
                    Save & Test
                  </button>
                </div>
              </Panel>
            </div>

            <Panel title="Database Resources" icon={Database}>
              <DatabaseGrid databases={databases} projects={projects} apps={apps} onAction={databaseAction} onAttach={attachDatabase} onDelete={deleteDatabaseResource} />
            </Panel>
          </div>
        )}

        {tab === "monitoring" && selectedService && (
          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <Panel title="Service Health" icon={HeartPulse}>
              <div className="grid gap-3">
                <Info title="Status" body={selectedService.status} />
                <Info title="Last message" body={selectedService.lastMessage || "No recent health message."} />
                <Info title="Health check" body={`${selectedService.healthPath || "/"} on 127.0.0.1:${selectedService.port || "unknown"}`} />
                <button className="svp-button-primary w-fit" onClick={() => void appAction(selectedService.id, "health")} disabled={Boolean(busy)}>
                  <HeartPulse size={15} />
                  Check Health
                </button>
              </div>
            </Panel>
            <Panel title="Runtime" icon={Server}>
              <div className="grid gap-3">
                <Info title="Strategy" body={selectedService.strategy} />
                <Info title="Runtime resource" body={selectedService.containerName || selectedService.composeProject || selectedService.serviceName || "Not running"} />
                <Info title="Port binding" body={selectedService.port ? `${selectedService.portBind === "public" ? "0.0.0.0" : "127.0.0.1"}:${selectedService.port}` : "No port"} />
                <Info title="Database" body={selectedService.databaseId ? databaseName(databases, selectedService.databaseId) : "No database bound"} />
              </div>
            </Panel>
          </div>
        )}

        {tab === "monitoring" && !selectedService && (
          <div className="grid gap-4 xl:grid-cols-[1fr_1.3fr]">
            <div className="grid gap-3 md:grid-cols-2">
              <Metric label="Apps" value={apps.length} detail="Active records" icon={Boxes} />
              <Metric label="Docker" value={isOk(status?.docker) ? 1 : 0} detail={outputLabel(status?.docker)} icon={Database} />
              <Metric label="Caddy" value={isActive(status?.caddy) ? 1 : 0} detail={outputLabel(status?.caddy)} icon={Globe2} />
              <Metric label="Data" value={1} detail={state?.dataDir || "-"} icon={HardDrive} />
            </div>
            <Panel title="Server Status" icon={Activity}>
              <pre className="svp-code max-h-[520px] overflow-auto rounded-md p-4 text-xs">{JSON.stringify(status, null, 2)}</pre>
            </Panel>
          </div>
        )}

        {tab === "logs" && (
          <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
            <Panel title="Services" icon={Server}>
              <div className="grid gap-2">
                {visibleApps.length === 0 && <p className="text-sm text-zinc-500">Deploy an app first, then logs appear here.</p>}
                {visibleApps.map((app) => (
                  <button key={app.id} className="svp-button justify-start" onClick={() => void loadLogs(app.id)}>
                    <Terminal size={14} />
                    {app.name}
                  </button>
                ))}
              </div>
            </Panel>
            <Panel title="Runtime Logs" icon={Terminal}>
              <div className="mb-3 flex flex-wrap gap-2">
                {activeApp && (
                  <button className="svp-button" onClick={() => void loadLogs(activeApp.id)} disabled={Boolean(busy)}>
                    <RefreshCw size={14} />
                    Refresh Logs
                  </button>
                )}
                <button className="svp-button" onClick={() => void navigator.clipboard?.writeText(logs)} disabled={!logs}>
                  <Copy size={14} />
                  Copy
                </button>
                <button className="svp-button" onClick={() => setLogs("")} disabled={!logs}>
                  Clear
                </button>
              </div>
              <pre className="svp-code min-h-96 overflow-auto rounded-md p-4 text-xs">{logs || "Select a service to load recent logs."}</pre>
            </Panel>
          </div>
        )}

        {tab === "deployments" && selectedService && (
          <div className="space-y-4">
            <Panel title="Service Deployments" icon={Activity}>
              <div className="mb-4 flex flex-wrap gap-2">
                <button className="svp-button-primary" onClick={() => void appAction(selectedService.id, "redeploy")} disabled={Boolean(busy) || !(selectedService.source || selectedService.sourceType === "docker-image")}>
                  <RefreshCw size={15} />
                  Redeploy Latest
                </button>
                {(selectedService.source === "git" || selectedService.sourceType === "git-url") && (
                  <button className="svp-button" onClick={() => editGitDeployment(selectedService)} disabled={Boolean(busy)}>
                    <Wrench size={15} />
                    Edit Source & Build
                  </button>
                )}
                <button className="svp-button" onClick={() => void loadLogs(selectedService.id)} disabled={Boolean(busy)}>
                  <Terminal size={15} />
                  Runtime Logs
                </button>
              </div>
              <DeploymentList deployments={visibleDeployments} apps={apps} onLogs={loadDeploymentLogs} onDelete={deleteDeploymentEvent} />
            </Panel>
          </div>
        )}

        {tab === "deployments" && !selectedService && (
          <div className="space-y-4">
            <Panel title={editingAppId ? "Edit & Redeploy Service" : "Create Service"} icon={editingAppId ? Wrench : PackagePlus}>
              {editingAppId && (
                <div className="mb-4 rounded-md border border-action/40 bg-action/10 p-3 text-sm text-zinc-300">
                  Editing <span className="font-bold text-ink">{apps.find((app) => app.id === editingAppId)?.name || "service"}</span>. The existing service, preview port, logs, env keys, and history stay attached to the same service record.
                </div>
              )}
              <DeploymentSteps active={deployStep} />

              {deployStep === "source" && (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    { id: "git" as DeployProvider, title: "Application", body: "Deploy a public Git repository with Node, Next, Vite, static, or Dockerfile settings.", icon: GitBranch },
                    { id: "image" as DeployProvider, title: "Docker Image", body: "Run an existing image from Docker Hub, GHCR, or another registry.", icon: Boxes },
                    { id: "compose" as DeployProvider, title: "Docker Compose", body: "Clone a public repo that contains docker-compose.yml or compose.yaml.", icon: Layers3 },
                    { id: "compose-yaml" as DeployProvider, title: "Paste Compose YAML", body: "Deploy a small compose stack from pasted YAML.", icon: Terminal }
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        className={`rounded-md border p-4 text-left transition hover:border-action ${deployProvider === item.id ? "border-action bg-action/10" : "border-line bg-panel"}`}
                        onClick={() => setDeployProvider(item.id)}
                      >
                        <Icon size={18} className="text-action" />
                        <p className="mt-3 font-black text-ink">{item.title}</p>
                        <p className="mt-1 text-sm text-zinc-500">{item.body}</p>
                      </button>
                    );
                  })}
                </div>
              )}

              {deployStep === "details" && deployProvider === "git" && (
                <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
                  <div className="grid gap-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="App name" value={gitForm.name} onChange={(name) => setGitForm({ ...gitForm, name })} />
                      <Select label="Service role" value={gitForm.serviceRole} onChange={(serviceRole) => setGitForm({ ...gitForm, serviceRole: serviceRole as ServiceRole })} options={roleOptions()} />
                    </div>
                    <Field label="Repository URL" value={gitForm.repoUrl} onChange={(repoUrl) => { setGitForm({ ...gitForm, repoUrl }); setRepoAnalysis(null); }} placeholder="https://github.com/user/repo.git" />
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Branch" value={gitForm.branch} onChange={(branch) => { setGitForm({ ...gitForm, branch }); setRepoAnalysis(null); }} />
                      <Field label="Root directory optional" value={gitForm.appDirectory} onChange={(appDirectory) => { setGitForm({ ...gitForm, appDirectory }); setRepoAnalysis(null); }} placeholder="apps/web or blank" />
                    </div>
                    <button className="svp-button-primary w-fit" onClick={() => void detectGitStack()} disabled={Boolean(busy) || !gitForm.repoUrl.trim()}>
                      <Activity size={16} />
                      Detect Stack
                    </button>
                  </div>
                  <Info title="What happens next" body="Detection clones the repo temporarily, finds deployable services, and fills build/start/port/health defaults. You confirm before deploy." />
                </div>
              )}

              {deployStep === "details" && deployProvider === "image" && (
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="App name" value={imageForm.name} onChange={(name) => setImageForm({ ...imageForm, name })} />
                  <Select label="Service role" value={imageForm.serviceRole} onChange={(serviceRole) => setImageForm({ ...imageForm, serviceRole: serviceRole as ServiceRole })} options={roleOptions()} />
                  <Field label="Image" value={imageForm.image} onChange={(image) => setImageForm({ ...imageForm, image })} placeholder="nginx:1.27-alpine or ghcr.io/user/app:tag" />
                  <Field label="Container port" value={imageForm.containerPort} onChange={(containerPort) => setImageForm({ ...imageForm, containerPort })} placeholder="3000" />
                  <Field label="Health path" value={imageForm.healthPath} onChange={(healthPath) => setImageForm({ ...imageForm, healthPath })} placeholder="/" />
                </div>
              )}

              {deployStep === "details" && deployProvider === "compose" && (
                <div className="grid gap-3">
                  <Field label="Stack name" value={composeForm.name} onChange={(name) => setComposeForm({ ...composeForm, name })} />
                  <Field label="Repository URL" value={composeForm.repoUrl} onChange={(repoUrl) => setComposeForm({ ...composeForm, repoUrl })} placeholder="https://github.com/user/compose-repo.git" />
                  <Field label="Branch" value={composeForm.branch} onChange={(branch) => setComposeForm({ ...composeForm, branch })} />
                </div>
              )}

              {deployStep === "details" && deployProvider === "compose-yaml" && (
                <div className="grid gap-3">
                  <Field label="Stack name" value={composeYamlForm.name} onChange={(name) => setComposeYamlForm({ ...composeYamlForm, name })} />
                  <TextArea label="compose.yaml" value={composeYamlForm.composeYaml} onChange={(composeYaml) => setComposeYamlForm({ ...composeYamlForm, composeYaml })} />
                </div>
              )}

              {deployStep === "build" && deployProvider === "git" && (
                <div className="grid gap-4 xl:grid-cols-[1fr_1.15fr]">
                  <div className="grid gap-3">
                    <p className="text-sm text-zinc-400">Confirm one detected service, then adjust build/runtime settings only here.</p>
                    {repoAnalysis ? (
                      <DetectionReview analysis={repoAnalysis} selectedServiceId={selectedDetectionId} onSelect={(service) => applyDetectedService(service, repoAnalysis.branch)} />
                    ) : (
                      <Info title="Detection not run yet" body="You can go back and detect the stack, or continue with manual Node/Next/Vite defaults." />
                    )}
                  </div>
                  <div className="grid gap-3">
                    <div className="flex flex-wrap gap-2">
                      <button className={`svp-tab ${gitForm.mode === "node" ? "svp-tab-active" : ""}`} onClick={() => setGitForm({ ...gitForm, mode: "node" })}>Generated Dockerfile</button>
                      <button className={`svp-tab ${gitForm.mode === "dockerfile" ? "svp-tab-active" : ""}`} onClick={() => setGitForm({ ...gitForm, mode: "dockerfile" })}>Repo Dockerfile</button>
                      <button className={`svp-tab ${gitForm.mode === "static" ? "svp-tab-active" : ""}`} onClick={() => setGitForm({ ...gitForm, mode: "static" })}>Static build</button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Build command" value={gitForm.buildCommand} onChange={(buildCommand) => setGitForm({ ...gitForm, buildCommand })} placeholder="auto: npm run build" />
                      <Field label="Start command" value={gitForm.startCommand} onChange={(startCommand) => setGitForm({ ...gitForm, startCommand })} placeholder="auto: npm run start" />
                      <Field label="Container port" value={gitForm.containerPort} onChange={(containerPort) => setGitForm({ ...gitForm, containerPort })} placeholder="3000" />
                      <Field label="Health path" value={gitForm.healthPath} onChange={(healthPath) => setGitForm({ ...gitForm, healthPath })} placeholder="/" />
                    </div>
                  </div>
                </div>
              )}

              {deployStep === "runtime" && (
                <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
                  <div className="grid gap-3">
                    {deployProvider === "git" && (
                      <>
                        <Select label="Database" value={gitForm.databaseId} onChange={(databaseId) => setGitForm({ ...gitForm, databaseId })} options={[{ value: "", label: "No database" }, ...databases.map((database) => ({ value: database.id, label: `${database.name} (${database.envKey})` }))]} />
                        <TextArea label="Environment variables" value={gitForm.envText} onChange={(envText) => setGitForm({ ...gitForm, envText })} placeholder={"DATABASE_URL=...\nJWT_SECRET=..."} />
                        <label className="flex items-start gap-3 rounded-md border border-line bg-[#050505] p-3 text-sm text-zinc-300">
                          <input className="mt-1" type="checkbox" checked={gitForm.publicPreview} onChange={(event) => setGitForm({ ...gitForm, publicPreview: event.target.checked })} />
                          <span><span className="block font-bold text-ink">Create public port preview</span><span className="mt-1 block text-xs text-zinc-500">Opens a generated high port in UFW. For production, add a domain and use Caddy on 80/443.</span></span>
                        </label>
                      </>
                    )}
                    {deployProvider === "image" && (
                      <>
                        <TextArea label="Image env" value={imageForm.envText} onChange={(envText) => setImageForm({ ...imageForm, envText })} />
                        <label className="flex items-start gap-3 rounded-md border border-line bg-[#050505] p-3 text-sm text-zinc-300">
                          <input className="mt-1" type="checkbox" checked={imageForm.publicPreview} onChange={(event) => setImageForm({ ...imageForm, publicPreview: event.target.checked })} />
                          <span><span className="block font-bold text-ink">Create public port preview</span><span className="mt-1 block text-xs text-zinc-500">Useful for smoke tests. The panel opens the generated port in UFW.</span></span>
                        </label>
                      </>
                    )}
                    {deployProvider === "compose" && <TextArea label="Compose .env" value={composeForm.envText} onChange={(envText) => setComposeForm({ ...composeForm, envText })} />}
                    {deployProvider === "compose-yaml" && <TextArea label="Compose .env" value={composeYamlForm.envText} onChange={(envText) => setComposeYamlForm({ ...composeYamlForm, envText })} />}
                  </div>
                  <div className="space-y-3">
                    <Info title="Project" body={`Deploying into ${currentProject.name}. Other projects are hidden while you work here.`} />
                    <Info title="Firewall" body="Preview ports are explicit. Domains should go through Caddy on ports 80/443." />
                    <button
                      className="svp-button-primary w-full justify-center"
                      onClick={() => {
                        if (deployProvider === "git") void deployGit();
                        if (deployProvider === "image") void deployImage();
                        if (deployProvider === "compose") void deployCompose();
                        if (deployProvider === "compose-yaml") void deployComposeYaml();
                      }}
                      disabled={Boolean(busy)}
                    >
                      <Play size={16} />
                      {editingAppId ? "Save & Redeploy" : "Deploy"}
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-5 flex flex-wrap justify-between gap-2 border-t border-line pt-4">
                <button className="svp-button" onClick={() => setDeployStep(previousDeployStep(deployStep, deployProvider))} disabled={deployStep === "source" || Boolean(busy)}>Back</button>
                {deployStep !== "runtime" && (
                  <button className="svp-button-primary" onClick={() => setDeployStep(nextDeployStep(deployStep, deployProvider))} disabled={Boolean(busy) || !canContinueDeploy(deployStep, deployProvider, gitForm, imageForm, composeForm, composeYamlForm)}>
                    Continue
                  </button>
                )}
                {editingAppId && (
                  <button className="svp-button" onClick={() => { setEditingAppId(""); setRepoAnalysis(null); setSelectedDetectionId(""); }} disabled={Boolean(busy)}>
                    Cancel Edit
                  </button>
                )}
              </div>
            </Panel>

            <Panel title="Recent Deployments" icon={Activity}>
              <DeploymentList deployments={visibleDeployments} apps={apps} onLogs={loadDeploymentLogs} onDelete={deleteDeploymentEvent} />
            </Panel>
          </div>
        )}

        {tab === "preview" && selectedService && (
          <div className="space-y-4">
            <Panel title="Preview Port" icon={Eye}>
              <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
                <div className="grid gap-3">
                  <UrlCard
                    title="Preview URL"
                    url={previewUrl(selectedService, vpsIp)}
                    help={selectedService.publicPreview ? "This is a quick public test URL on a generated VPS port." : "Preview is disabled. Use Edit Build Settings and enable public preview, then redeploy."}
                  />
                  <div className="grid gap-3 md:grid-cols-3">
                    <Info title="Internal container port" body={selectedService.containerPort ? `:${selectedService.containerPort}` : "Not configured"} />
                    <Info title="Assigned VPS port" body={selectedService.port ? `${selectedService.portBind === "public" ? "public" : "localhost"} :${selectedService.port}` : "Not assigned"} />
                    <Info title="Health path" body={selectedService.healthPath || "/"} />
                  </div>
                </div>
                <div className="grid content-start gap-3">
                  <Info title="Preview vs domain" body="Preview ports are for quick testing. Production traffic should use Domains so Caddy handles HTTPS on 80/443." />
                  <Info title="Firewall" body={selectedService.publicPreview ? "Supavibe attempts to allow this port in UFW during deploy." : "No public preview port is currently exposed."} />
                  <button className="svp-button" onClick={() => editGitDeployment(selectedService)} disabled={selectedService.source !== "git" && selectedService.sourceType !== "git-url"}>
                    <Wrench size={15} />
                    Change Preview Setting
                  </button>
                </div>
              </div>
            </Panel>
          </div>
        )}

        {tab === "domains" && (
          <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
            <Panel title="Add Domain" icon={Globe2}>
              <div className="grid gap-3">
                <label className="grid gap-1">
                  <span className="svp-label">App</span>
                  <select className="svp-input" value={domainForm.appId} onChange={(event) => setDomainForm({ ...domainForm, appId: event.target.value })}>
                    <option value="">Select app</option>
                    {visibleApps.map((app) => (
                      <option key={app.id} value={app.id}>
                        {app.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Field label="Domain" value={domainForm.domain} onChange={(domain) => setDomainForm({ ...domainForm, domain })} placeholder="app.example.com" />
                <button className="svp-button-primary" onClick={() => void configureAppDomain()} disabled={!domainForm.appId || !domainForm.domain || Boolean(busy)}>
                  <Globe2 size={16} />
                  Configure Caddy
                </button>
              </div>
            </Panel>
            <Panel title="DNS Requirement" icon={Shield}>
              <div className="space-y-3 text-sm text-zinc-400">
                <p>Point domains to this VPS public IP, then configure Caddy here. Caddy will request HTTPS certificates automatically.</p>
                <pre className="svp-code overflow-auto rounded-md p-3 text-xs">{`A     ${domainForm.domain || "app.example.com"} -> ${vpsIp || "YOUR_VPS_PUBLIC_IP"}\nAAAA  optional if this VPS has IPv6`}</pre>
                {selectedDomainApp && <Info title="Selected app" body={`${selectedDomainApp.name} via ${selectedDomainApp.strategy}${selectedDomainApp.port ? ` on 127.0.0.1:${selectedDomainApp.port}` : ""}`} />}
              </div>
            </Panel>
          </div>
        )}

        {tab === "advanced" && selectedService && (
          <div className="space-y-4">
            <Panel title="Advanced Service Settings" icon={Shield}>
              <div className="grid gap-3 md:grid-cols-2">
                <Info title="Container" body={selectedService.containerName || selectedService.composeProject || selectedService.serviceName || "Not created yet"} />
                <Info title="Image / release" body={selectedService.imageTag || selectedService.dockerImage || "Not available"} />
                <Info title="Root directory" body={selectedService.rootDir || "Managed by Supavibe"} />
                <Info title="Public exposure" body={selectedService.publicPreview ? `Preview port ${selectedService.port} is public` : selectedService.domain ? "Public only through Caddy domain" : "No public route configured"} />
              </div>
            </Panel>

            <Panel title="Danger Zone" icon={Trash2}>
              <div className="grid gap-3 rounded-md border border-red-900/60 bg-red-950/20 p-4 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <p className="font-black text-red-100">Delete this service</p>
                  <p className="mt-1 text-sm text-red-200/75">
                    Removes runtime resources for this service. Deployment history stays in the project. Type-confirmation is required.
                  </p>
                </div>
                <button className="svp-button-danger" onClick={() => void appAction(selectedService.id, "delete")} disabled={Boolean(busy)}>
                  <Trash2 size={15} />
                  Delete Service
                </button>
              </div>
            </Panel>
          </div>
        )}

        {tab === "advanced" && !selectedService && (
          <div className="space-y-4">
            <Panel title="Firewall Status" icon={Shield}>
              <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
                <pre className="svp-code max-h-80 overflow-auto rounded-md p-3 text-xs">{commandOutputText(status?.ufw) || "UFW status is not available yet. Click Refresh after install."}</pre>
                <div className="space-y-3 text-sm text-zinc-400">
                  <Info title="Real VPS firewall" body="These actions call UFW on this server through a restricted sudoers allowlist installed by Supavibe." />
                  <button className="svp-button w-full justify-center" onClick={() => void refresh()} disabled={Boolean(busy)}>
                    <RefreshCw size={16} />
                    Refresh Status
                  </button>
                </div>
              </div>
            </Panel>
            <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
              <Panel title="Firewall Baseline" icon={Shield}>
                <div className="grid gap-3">
                  <Field label="Panel port" value={firewallForm.panelPort} onChange={(panelPort) => setFirewallForm({ ...firewallForm, panelPort })} />
                  <Field label="Trusted CIDR" value={firewallForm.trustedCidr} onChange={(trustedCidr) => setFirewallForm({ ...firewallForm, trustedCidr })} placeholder="100.64.0.0/10" />
                  <button className="svp-button-primary" onClick={() => void applyFirewall()} disabled={Boolean(busy)}>
                    <Flame size={16} />
                    Apply Baseline
                  </button>
                  <button className="svp-button" onClick={() => void pruneSystem()} disabled={Boolean(busy)}>
                    <Wrench size={16} />
                    Docker Prune
                  </button>
                </div>
              </Panel>
              <Panel title="Expose / Block Port" icon={Flame}>
                <div className="grid gap-3">
                  <div className="grid gap-3 md:grid-cols-3">
                    <Select label="Action" value={firewallRuleForm.action} onChange={(action) => setFirewallRuleForm({ ...firewallRuleForm, action: action as "allow" | "deny" })} options={[{ value: "allow", label: "Allow" }, { value: "deny", label: "Deny" }]} />
                    <Field label="Port" value={firewallRuleForm.port} onChange={(port) => setFirewallRuleForm({ ...firewallRuleForm, port })} placeholder="8080" />
                    <Select label="Protocol" value={firewallRuleForm.protocol} onChange={(protocol) => setFirewallRuleForm({ ...firewallRuleForm, protocol: protocol as "tcp" | "udp" })} options={[{ value: "tcp", label: "TCP" }, { value: "udp", label: "UDP" }]} />
                  </div>
                  <Field label="Source CIDR optional" value={firewallRuleForm.sourceCidr} onChange={(sourceCidr) => setFirewallRuleForm({ ...firewallRuleForm, sourceCidr })} placeholder="100.64.0.0/10 or blank for public" />
                  <button className={firewallRuleForm.action === "deny" ? "svp-button-danger w-fit" : "svp-button-primary w-fit"} onClick={() => void applyFirewallRule()} disabled={Boolean(busy)}>
                    <Flame size={16} />
                    Apply Rule
                  </button>
                  <div className="border-t border-line pt-3">
                    <Field label="Delete numbered UFW rule" value={firewallDeleteForm.ruleNumber} onChange={(ruleNumber) => setFirewallDeleteForm({ ...firewallDeleteForm, ruleNumber })} placeholder="Run ufw status numbered, then enter number" />
                    <button className="svp-button-danger mt-3 w-fit" onClick={() => void deleteFirewallRule()} disabled={Boolean(busy) || !firewallDeleteForm.ruleNumber.trim()}>
                      <Trash2 size={16} />
                      Delete Rule
                    </button>
                  </div>
                </div>
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="Security Settings" icon={Shield}>
                <div className="grid gap-3 lg:grid-cols-2">
                  <Info title="Panel auth" body="Admin login, CSRF checks, rate limits, secure headers, and same-origin checks are enabled." />
                  <Info title="Public panel" body="If this port is public, keep a strong password and restrict the panel port to your IP or Tailscale CIDR." />
                  <Info title="App isolation" body="Docker apps run without privileged mode or host networking. Git preview ports are exposed only when you enable preview." />
                  <Info title="Secrets" body="Env values and database URLs are not returned in normal state responses. Revealing a DB URL is audited." />
                </div>
              </Panel>

              <Panel title="Management Surface" icon={Shield}>
                <div className="grid gap-3 lg:grid-cols-2">
                  <Info title="Docker" body="Builds images, starts labelled containers, and binds app ports to localhost or explicit preview ports." />
                  <Info title="No Docker" body="Creates systemd Node services for simple apps without exposing raw shell commands." />
                  <Info title="Static" body="Serves generated static assets through Caddy with rollback-friendly folders." />
                  <Info title="Shell access" body="No web terminal is exposed. Use SSH for shell work and this panel for structured actions." />
                </div>
              </Panel>
            </div>

            <Panel title="Danger Zone" icon={Trash2}>
              <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
                <div>
                  <p className="text-sm text-zinc-400">
                    Delete this full project, including its services, deployment records, managed database containers, stored secrets, Caddy route files, and managed app files. Database volumes are kept unless you explicitly include them.
                  </p>
                  <p className="mt-3 text-sm font-bold text-red-300">Type {currentProject.slug} to confirm.</p>
                </div>
                <div className="grid gap-3">
                  <Field label="Confirmation" value={projectDeleteConfirm} onChange={setProjectDeleteConfirm} placeholder={currentProject.slug} />
                  <label className="flex items-start gap-3 rounded-md border border-red-950/70 bg-red-950/20 p-3 text-sm text-red-100">
                    <input className="mt-1" type="checkbox" checked={projectDeleteVolumes} onChange={(event) => setProjectDeleteVolumes(event.target.checked)} />
                    <span><span className="block font-bold">Also delete managed database volumes</span><span className="mt-1 block text-xs text-red-200/70">Leave off when you might need the data later.</span></span>
                  </label>
                  <button className="svp-button-danger justify-center" onClick={() => void deleteCurrentProject()} disabled={Boolean(busy) || projectDeleteConfirm !== currentProject.slug}>
                    <Trash2 size={16} />
                    Delete Full Project
                  </button>
                </div>
              </div>
            </Panel>

            <Panel title="Audit" icon={Activity}>
              <div className="grid gap-2">
                {(state?.audit ?? []).map((event) => (
                  <div key={event.id} className="rounded-md border border-line bg-panel p-3 text-sm">
                    <p className="font-bold text-ink">{event.action}</p>
                    <p className="text-zinc-400">{event.message}</p>
                    <p className="text-xs text-zinc-600">{new Date(event.createdAt).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${compact ? "" : "mb-6"}`}>
      <div className="flex h-10 w-10 items-center justify-center rounded-md border border-line bg-[#111113] text-white">
        <Server size={20} />
      </div>
      <div>
        <p className="font-black text-ink">Supavibe VPS</p>
        <p className="text-xs text-zinc-500">Self-hosted panel</p>
      </div>
    </div>
  );
}

function SidebarGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <p className="px-2 text-[0.68rem] font-black uppercase tracking-wide text-zinc-600">{title}</p>
      {children}
    </div>
  );
}

function ComingSoonItem({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-line bg-[#080809] px-3 py-2 text-sm text-zinc-600">
      <span>{label}</span>
      <span className="text-[0.65rem] font-black uppercase">Soon</span>
    </div>
  );
}

function UrlCard({ title, url, help }: { title: string; url: string; help: string }) {
  return (
    <div className="rounded-md border border-line bg-panel p-3">
      <p className="font-black text-ink">{title}</p>
      {url ? (
        <>
          <a className="mt-2 block break-all text-sm font-bold text-action" href={url} target="_blank" rel="noreferrer">{url}</a>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="svp-button" href={url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} />
              Open
            </a>
            <button className="svp-button" onClick={() => void navigator.clipboard?.writeText(url)}>
              <Copy size={14} />
              Copy
            </button>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-zinc-500">Not configured</p>
      )}
      <p className="mt-3 text-xs text-zinc-500">{help}</p>
    </div>
  );
}

function DeploymentSteps({ active }: { active: DeployStep }) {
  const items: Array<{ id: DeployStep; label: string }> = [
    { id: "source", label: "Source" },
    { id: "details", label: "Details" },
    { id: "build", label: "Build" },
    { id: "runtime", label: "Runtime" }
  ];
  return (
    <div className="mb-5 grid gap-2 md:grid-cols-4">
      {items.map((item, index) => (
        <div key={item.id} className={`rounded-md border p-3 text-sm ${active === item.id ? "border-action bg-action/10 text-ink" : "border-line bg-panel text-zinc-500"}`}>
          <span className="svp-badge mr-2">{index + 1}</span>
          {item.label}
        </div>
      ))}
    </div>
  );
}

function nextDeployStep(step: DeployStep, provider: DeployProvider): DeployStep {
  if (step === "source") return "details";
  if (step === "details") return provider === "git" ? "build" : "runtime";
  if (step === "build") return "runtime";
  return "runtime";
}

function previousDeployStep(step: DeployStep, provider: DeployProvider): DeployStep {
  if (step === "runtime") return provider === "git" ? "build" : "details";
  if (step === "build") return "details";
  if (step === "details") return "source";
  return "source";
}

function canContinueDeploy(
  step: DeployStep,
  provider: DeployProvider,
  gitForm: { repoUrl: string },
  imageForm: { image: string },
  composeForm: { repoUrl: string },
  composeYamlForm: { composeYaml: string }
) {
  if (step === "source") return true;
  if (step === "build") return true;
  if (provider === "git") return Boolean(gitForm.repoUrl.trim());
  if (provider === "image") return Boolean(imageForm.image.trim());
  if (provider === "compose") return Boolean(composeForm.repoUrl.trim());
  return Boolean(composeYamlForm.composeYaml.trim());
}

function SecurityBanner({ status }: { status: Record<string, unknown> | null }) {
  return (
    <div className="rounded-md border border-yellow-900/70 bg-yellow-950/25 p-3 text-sm text-yellow-100">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-black">If this port is public, keep login enabled and restrict the panel port by firewall.</p>
          <p className="mt-1 text-yellow-200/80">Apps should be public through Caddy on 80/443. App runtimes should stay on localhost ports.</p>
        </div>
        <span className="svp-badge">Public IP: {publicIp(status) || "checking"}</span>
      </div>
    </div>
  );
}

function ProjectCards({
  projects,
  apps,
  databases,
  deployments,
  onOpen
}: {
  projects: ProjectRecord[];
  apps: ManagedApp[];
  databases: DatabaseResource[];
  deployments: DeploymentEvent[];
  onOpen: (projectId: string) => void;
}) {
  if (projects.length === 0) {
    return <p className="rounded-md border border-line bg-panel p-4 text-sm text-zinc-500">No projects match that search. Create a project to group its services, domains, databases, logs, and deploy history.</p>;
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {projects.map((project) => {
        const projectApps = apps.filter((app) => app.projectId === project.id);
        const projectDbs = databases.filter((database) => database.projectId === project.id);
        const projectAppIds = new Set(projectApps.map((app) => app.id));
        const lastDeployment = deployments.find((deployment) => projectAppIds.has(deployment.appId));
        const primaryDomain = projectApps.find((app) => app.domain)?.domain;
        const runningCount = projectApps.filter((app) => app.status === "running").length;
        return (
          <button key={project.id} className="rounded-md border border-line bg-panel p-4 text-left transition hover:border-zinc-600 hover:bg-[#161618]" onClick={() => onOpen(project.id)}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-black text-ink">{project.name}</p>
                <p className="mt-1 truncate text-sm text-zinc-500">{primaryDomain || project.description || "No domain connected yet"}</p>
              </div>
              <StatusPill ok={runningCount > 0 || projectApps.length === 0} label={projectApps.length ? `${runningCount}/${projectApps.length} running` : "new"} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="svp-badge">{projectApps.length} services</span>
              <span className="svp-badge">{projectApps.filter((app) => app.serviceRole === "frontend").length} frontend</span>
              <span className="svp-badge">{projectApps.filter((app) => app.serviceRole === "backend").length} backend</span>
              <span className="svp-badge">{projectDbs.length} db</span>
              <span className="svp-badge">slug {project.slug}</span>
            </div>
            <div className="mt-4 grid gap-1 text-xs text-zinc-500">
              <p>{lastDeployment ? `${lastDeployment.action}: ${lastDeployment.message}` : "Open project to manage its services, storage, domains, and logs."}</p>
              <p>Created {new Date(project.createdAt).toLocaleDateString()} · Updated {new Date(project.updatedAt).toLocaleDateString()}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ProjectGrid({ projects, apps, databases }: { projects: ProjectRecord[]; apps: ManagedApp[]; databases: DatabaseResource[] }) {
  if (projects.length === 0) return <p className="text-sm text-zinc-500">No projects yet. Create one, then deploy frontend/backend services into it.</p>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {projects.map((project) => {
        const projectApps = apps.filter((app) => app.projectId === project.id);
        const projectDbs = databases.filter((database) => database.projectId === project.id);
        return (
          <article key={project.id} className="rounded-md border border-line bg-panel p-3">
            <p className="font-bold text-ink">{project.name}</p>
            {project.description && <p className="mt-1 text-xs text-zinc-500">{project.description}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="svp-badge">{projectApps.length} services</span>
              <span className="svp-badge">{projectApps.filter((app) => app.serviceRole === "frontend").length} frontend</span>
              <span className="svp-badge">{projectApps.filter((app) => app.serviceRole === "backend").length} backend</span>
              <span className="svp-badge">{projectDbs.length} db</span>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function AppGrid({
  apps,
  projects,
  databases,
  vpsIp,
  onLogs,
  onStop,
  onAction,
  onEdit,
  onOpen
}: {
  apps: ManagedApp[];
  projects: ProjectRecord[];
  databases: DatabaseResource[];
  vpsIp: string;
  onLogs: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onAction: (id: string, action: "start" | "restart" | "redeploy" | "health" | "delete") => Promise<void>;
  onEdit: (app: ManagedApp) => void;
  onOpen: (app: ManagedApp) => void;
}) {
  if (apps.length === 0) return <p className="text-sm text-zinc-500">No services yet. Deploy a public Git repository from the Deployments tab.</p>;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {apps.map((app) => {
        const appPreview = previewUrl(app, vpsIp);
        return (
        <article key={app.id} className="rounded-md border border-line bg-panel p-3 transition hover:border-zinc-600">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <button className="truncate text-left font-bold text-ink hover:underline" onClick={() => onOpen(app)}>{app.name}</button>
              <p className="text-xs text-zinc-500">
                {projectName(projects, app.projectId)} - {app.serviceRole || "fullstack"} - {app.deployMode || app.strategy} {app.sourceType || app.source ? `- ${app.sourceType || app.source}` : ""} {app.port ? `- ${app.portBind === "public" ? "0.0.0.0" : "127.0.0.1"}:${app.port}` : ""}
                {app.containerPort ? ` -> :${app.containerPort}` : ""}
              </p>
              {app.repoUrl && <p className="mt-1 truncate text-xs text-zinc-600">{app.repoUrl} {app.branch ? `@ ${app.branch}` : ""}</p>}
              {app.appDirectory && <p className="mt-1 truncate text-xs text-zinc-600">directory {app.appDirectory}</p>}
              {app.dockerImage && <p className="mt-1 truncate text-xs text-zinc-600">image {app.dockerImage}</p>}
              {app.commitSha && <p className="mt-1 text-xs text-zinc-600">commit {app.commitSha}</p>}
              {app.domain && <a className="mt-1 block break-all text-xs font-bold text-action" href={`https://${app.domain}`} target="_blank" rel="noreferrer">{app.domain}</a>}
              {appPreview && <a className="mt-1 block break-all text-xs font-bold text-action" href={appPreview} target="_blank" rel="noreferrer">Preview {appPreview}</a>}
              {app.databaseId && <p className="mt-1 text-xs text-zinc-600">db {databaseName(databases, app.databaseId)}</p>}
            </div>
            <StatusPill ok={app.status === "running"} label={app.status} />
          </div>
          {app.lastMessage && <p className="mt-2 text-xs text-zinc-500">{app.lastMessage}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="svp-button" onClick={() => void onLogs(app.id)}>
              <Terminal size={14} />
              Logs
            </button>
            <button className="svp-button" onClick={() => onOpen(app)}>
              <Settings size={14} />
              Manage
            </button>
            <button className="svp-button" onClick={() => void onAction(app.id, "health")}>
              <HeartPulse size={14} />
              Health
            </button>
            <button className="svp-button" onClick={() => void onAction(app.id, "start")}>
              <Play size={14} />
              Start
            </button>
            <button className="svp-button" onClick={() => void onAction(app.id, "restart")}>
              <RotateCcw size={14} />
              Restart
            </button>
            {(app.source || app.sourceType === "docker-image") && (
              <button className="svp-button" onClick={() => void onAction(app.id, "redeploy")}>
                <GitBranch size={14} />
                Redeploy
              </button>
            )}
            {(app.source === "git" || app.sourceType === "git-url") && (
              <button className="svp-button" onClick={() => onEdit(app)}>
                <Wrench size={14} />
                Edit
              </button>
            )}
            <button className="svp-button" onClick={() => void onStop(app.id)}>
              <Square size={14} />
              Stop
            </button>
            <button className="svp-button-danger" onClick={() => void onAction(app.id, "delete")}>
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        </article>
        );
      })}
    </div>
  );
}

function DetectionReview({
  analysis,
  selectedServiceId,
  onSelect
}: {
  analysis: RepoAnalysis;
  selectedServiceId: string;
  onSelect: (service: DetectedService) => void;
}) {
  const selected = analysis.services.find((service) => service.id === selectedServiceId) || analysis.services[0];
  return (
    <div className="rounded-md border border-action/40 bg-action/10 p-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="flex items-center gap-2 font-black text-ink">
            <CheckCircle2 size={16} className="text-action" />
            Detected stack
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            {analysis.branch} {analysis.commitSha ? `- commit ${analysis.commitSha}` : ""}. Confirm this service before deploying.
          </p>
        </div>
        <StatusPill ok label={`${selected?.confidence || 0}% confidence`} />
      </div>

      {analysis.warnings.length > 0 && (
        <div className="mt-3 grid gap-2">
          {analysis.warnings.map((warning) => (
            <p key={warning} className="flex items-start gap-2 rounded-md border border-yellow-900/60 bg-yellow-950/20 p-2 text-xs text-yellow-100">
              <CircleAlert size={14} className="mt-0.5 shrink-0" />
              {warning}
            </p>
          ))}
        </div>
      )}

      <div className="mt-3 grid gap-2">
        {analysis.services.map((service) => (
          <button
            key={service.id}
            className={`rounded-md border p-3 text-left transition ${service.id === selectedServiceId ? "border-action bg-action/10" : "border-line bg-[#050505] hover:border-zinc-600"}`}
            onClick={() => onSelect(service)}
          >
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-bold text-ink">{service.name}</p>
                <p className="text-xs text-zinc-500">
                  {service.framework} - {service.mode} - {service.appDirectory || "repo root"} - port {service.containerPort}
                </p>
              </div>
              <span className="svp-badge">{service.serviceRole}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="svp-badge">{service.packageManager}</span>
              {service.hasDockerfile && <span className="svp-badge">Dockerfile</span>}
              {service.requiredEnv.length > 0 && <span className="svp-badge">{service.requiredEnv.length} env keys</span>}
            </div>
            {service.reasons.length > 0 && <p className="mt-2 text-xs text-zinc-500">{service.reasons.slice(0, 4).join(" - ")}</p>}
            {service.requiredEnv.length > 0 && <p className="mt-2 break-all text-xs text-zinc-600">Env: {service.requiredEnv.join(", ")}</p>}
          </button>
        ))}
      </div>
    </div>
  );
}

function DeploymentList({ deployments, apps, onLogs, onDelete }: { deployments: DeploymentEvent[]; apps: ManagedApp[]; onLogs: (id: string) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  if (deployments.length === 0) return <p className="text-sm text-zinc-500">No deployment events yet.</p>;
  return (
    <div className="grid gap-2">
      {deployments.slice(0, 8).map((event) => {
        const app = apps.find((item) => item.id === event.appId);
        return (
          <div key={event.id} className="flex flex-col gap-1 rounded-md border border-line bg-panel p-3 text-sm md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-bold text-ink">{app?.name || event.appId} - {event.action}</p>
              <p className="text-zinc-400">{event.message}</p>
              <p className="text-xs text-zinc-600">
                {[event.sourceType, event.strategy, event.branch ? `branch ${event.branch}` : "", event.commitSha ? `commit ${event.commitSha}` : ""].filter(Boolean).join(" - ")}
              </p>
              <p className="text-xs text-zinc-600">
                Started {new Date(event.startedAt || event.createdAt).toLocaleString()}
                {event.finishedAt ? ` · Finished ${new Date(event.finishedAt).toLocaleString()}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className="svp-button" onClick={() => void onLogs(event.id)}>
                <Terminal size={14} />
                Logs
              </button>
              <button className="svp-button-danger" onClick={() => void onDelete(event.id)}>
                <Trash2 size={14} />
                Delete
              </button>
              <StatusPill ok={event.status === "succeeded"} label={event.status} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DatabaseGrid({
  databases,
  projects,
  apps,
  onAction,
  onAttach,
  onDelete
}: {
  databases: DatabaseResource[];
  projects: ProjectRecord[];
  apps: ManagedApp[];
  onAction: (id: string, action: "test" | "connection") => Promise<void>;
  onAttach: (id: string, appId: string) => Promise<void>;
  onDelete: (id: string, deleteVolume: boolean) => Promise<void>;
}) {
  if (databases.length === 0) return <p className="text-sm text-zinc-500">No database resources yet. Create managed Postgres or connect an external provider.</p>;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {databases.map((database) => (
        <article key={database.id} className="rounded-md border border-line bg-panel p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-bold text-ink">{database.name}</p>
              <p className="text-xs text-zinc-500">{projectName(projects, database.projectId)} - {database.provider} - {database.envKey}</p>
              <p className="mt-1 break-all text-xs text-zinc-600">{database.maskedUrl || `${database.host || "localhost"}:${database.port || 5432}/${database.database || ""}`}</p>
              {database.lastMessage && <p className="mt-2 text-xs text-zinc-500">{database.lastMessage}</p>}
            </div>
            <StatusPill ok={["running", "reachable"].includes(database.status)} label={database.status} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="svp-button" onClick={() => void onAction(database.id, "test")}>
              <HeartPulse size={14} />
              Test
            </button>
            <button className="svp-button" onClick={() => void onAction(database.id, "connection")}>
              <KeyRound size={14} />
              Reveal URL
            </button>
            <button className="svp-button-danger" onClick={() => void onDelete(database.id, false)}>
              <Trash2 size={14} />
              Delete
            </button>
            {database.kind === "managed-postgres" && (
              <button className="svp-button-danger" onClick={() => void onDelete(database.id, true)}>
                <Trash2 size={14} />
                Delete + Volume
              </button>
            )}
          </div>
          <label className="mt-3 grid gap-1">
            <span className="svp-label">Attach to service</span>
            <select className="svp-input" value="" onChange={(event) => event.target.value && void onAttach(database.id, event.target.value)}>
              <option value="">Choose service...</option>
              {apps
                .filter((app) => !database.projectId || !app.projectId || app.projectId === database.projectId)
                .map((app) => (
                  <option key={app.id} value={app.id}>{app.name}</option>
                ))}
            </select>
          </label>
        </article>
      ))}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="grid gap-1">
      <span className="svp-label">{label}</span>
      <input className="svp-input" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type={type} />
    </label>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="grid gap-1">
      <span className="svp-label">{label}</span>
      <select className="svp-input" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.length === 0 && <option value="">Create a project first</option>}
        {options.map((option) => (
          <option key={option.value || option.label} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="grid gap-1">
      <span className="svp-label">{label}</span>
      <textarea className="svp-input min-h-28 resize-y font-mono text-xs" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="svp-panel p-4">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="text-zinc-300" size={18} />
        <h2 className="font-black text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: number; detail: string; icon: LucideIcon }) {
  return (
    <section className="svp-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="svp-label">{label}</p>
          <p className="mt-2 text-3xl font-black text-ink">{value}</p>
          <p className="mt-1 break-all text-xs text-zinc-500">{detail}</p>
        </div>
        <div className="rounded-md border border-line bg-[#050505] p-2 text-zinc-300">
          <Icon size={20} />
        </div>
      </div>
    </section>
  );
}

function Info({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-line bg-panel p-3 text-sm">
      <p className="font-bold text-ink">{title}</p>
      <p className="mt-1 text-zinc-500">{body}</p>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  const Icon = ok ? CheckCircle2 : CircleAlert;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-bold ${ok ? "border-emerald-900 bg-emerald-950/40 text-emerald-300" : "border-yellow-900 bg-yellow-950/40 text-yellow-300"}`}>
      <Icon size={13} />
      {label}
    </span>
  );
}

function TabButton({ item, active, onClick }: { item: { id: Tab; label: string; icon: LucideIcon }; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button className={`flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-bold ${active ? "bg-panel text-action" : "text-zinc-500 hover:bg-panel"}`} onClick={onClick}>
      <Icon size={17} />
      {item.label}
    </button>
  );
}

function Notice({ busy, notice }: { busy: string; notice: string }) {
  return (
    <div className="svp-panel flex items-start gap-3 p-3">
      {busy ? <RefreshCw className="mt-0.5 animate-spin text-action" size={18} /> : <CheckCircle2 className="mt-0.5 text-action" size={18} />}
      <div>
        <p className="text-sm font-bold text-ink">{busy || "Status"}</p>
        {notice && <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-400">{notice}</p>}
      </div>
    </div>
  );
}

function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050505] p-4 text-zinc-100">
      <section className="svp-panel p-5">
        <Brand />
        <p className="text-sm text-zinc-500">Loading panel...</p>
      </section>
    </main>
  );
}

async function api<T>(url: string, options: { method?: string; body?: unknown; csrfToken?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body) headers["Content-Type"] = "application/json";
  if (options.csrfToken) headers["X-Supavibe-CSRF"] = options.csrfToken;
  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : `HTTP ${response.status}`);
  return data as T;
}

function isOk(value: unknown) {
  return Boolean(value && typeof value === "object" && "ok" in value && (value as { ok?: boolean }).ok);
}

function isActive(value: unknown) {
  return Boolean(value && typeof value === "object" && (value as { stdout?: string; status?: string }).stdout?.trim() === "active");
}

function outputLabel(value: unknown) {
  if (!value || typeof value !== "object") return "-";
  const item = value as { stdout?: string; stderr?: string; output?: string };
  return (item.stdout || item.output || item.stderr || "-").trim().slice(0, 90);
}

function publicIp(status: Record<string, unknown> | null) {
  const publicIpValue = status?.publicIp;
  if (!publicIpValue || typeof publicIpValue !== "object") return "";
  return String((publicIpValue as { ip?: string }).ip || "");
}

function commandOutputText(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const output = value as Partial<CommandOutput> & { output?: string; error?: string };
  return [output.command, output.stdout || output.output, output.stderr || output.error].filter(Boolean).join("\n\n");
}

function previewUrl(app: ManagedApp, vpsIp: string) {
  if (!app.publicPreview || !app.port) return "";
  if (app.previewUrl && !app.previewUrl.includes("SERVER_IP")) return app.previewUrl;
  const host = vpsIp || "SERVER_IP";
  return `http://${host}:${app.port}`;
}

function roleOptions() {
  return [
    { value: "frontend", label: "Frontend" },
    { value: "backend", label: "Backend/API" },
    { value: "worker", label: "Worker" },
    { value: "fullstack", label: "Full-stack" }
  ];
}

function projectName(projects: ProjectRecord[], projectId?: string) {
  return projects.find((project) => project.id === projectId)?.name || "Unassigned";
}

function databaseName(databases: DatabaseResource[], databaseId?: string) {
  return databases.find((database) => database.id === databaseId)?.name || "Unknown database";
}

function splitLines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function uiSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "project";
}

function mergeEnvText(existing: string, additions: string[]) {
  const current = existing.trim();
  const next = additions.filter(Boolean).join("\n");
  if (!current) return next;
  return `${current}\n${next}`;
}
