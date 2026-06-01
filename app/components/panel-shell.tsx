"use client";

import {
  Activity,
  Boxes,
  CheckCircle2,
  CircleAlert,
  Database,
  Flame,
  Globe2,
  GitBranch,
  HardDrive,
  HeartPulse,
  KeyRound,
  Layers3,
  Lock,
  Play,
  RefreshCw,
  RotateCcw,
  Server,
  Shield,
  Square,
  Terminal,
  Trash2,
  Wrench,
  type LucideIcon
} from "lucide-react";
import { useEffect, useState } from "react";

type Tab = "general" | "services" | "environment" | "database" | "monitoring" | "logs" | "deployments" | "domains" | "advanced";
type Strategy = "docker" | "systemd" | "static" | "compose";
type GitMode = "dockerfile" | "node" | "static";
type ServiceRole = "frontend" | "backend" | "worker" | "fullstack";

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
  imageTag?: string;
  rootDir?: string;
  createdAt: string;
  updatedAt: string;
  lastMessage?: string;
}

interface ProjectRecord {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

interface DatabaseResource {
  id: string;
  projectId?: string;
  name: string;
  kind: "managed-postgres" | "external-postgres";
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

const tabs: Array<{ id: Tab; label: string; icon: LucideIcon }> = [
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

export function PanelShell() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [state, setState] = useState<StatePayload | null>(null);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [tab, setTab] = useState<Tab>("general");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [csrfToken, setCsrfToken] = useState("");
  const [authForm, setAuthForm] = useState({ email: "", name: "", password: "", setupCode: "" });
  const [projectForm, setProjectForm] = useState({ name: "New Project", description: "" });
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
  const [corsPresetForm, setCorsPresetForm] = useState({ frontendOrigin: "", backendOrigin: "" });
  const [logs, setLogs] = useState("");

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
    setGitForm((form) => ({ ...form, projectId: form.projectId || nextState.projects[0]?.id || "" }));
    setImageForm((form) => ({ ...form, projectId: form.projectId || nextState.projects[0]?.id || "" }));
    setComposeForm((form) => ({ ...form, projectId: form.projectId || nextState.projects[0]?.id || "" }));
    setComposeYamlForm((form) => ({ ...form, projectId: form.projectId || nextState.projects[0]?.id || "" }));
    setExternalDbForm((form) => ({ ...form, projectId: form.projectId || nextState.projects[0]?.id || "" }));
    setManagedDbForm((form) => ({ ...form, projectId: form.projectId || nextState.projects[0]?.id || "" }));
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
      const result = await api<{ app: ManagedApp }>("/api/apps/git", {
        method: "POST",
        csrfToken,
        body: { ...gitForm, projectId: selectedProjectId || gitForm.projectId }
      });
      setDomainForm((form) => ({ ...form, appId: result.app.id }));
      setNotice(result.app.publicPreview ? `${result.app.name} deployed. Preview: ${previewUrl(result.app, publicIp(status))}` : `${result.app.name} deployed from ${gitForm.branch}.`);
      await refresh();
    });
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
    });
  }

  function openProject(projectId: string) {
    setSelectedProjectId(projectId);
    setTab("general");
    setDomainForm((form) => ({ ...form, appId: "" }));
    setAppSettingsForm((form) => ({ ...form, projectId, appId: "", databaseId: "" }));
    setGitForm((form) => ({ ...form, projectId, databaseId: "" }));
    setImageForm((form) => ({ ...form, projectId }));
    setComposeForm((form) => ({ ...form, projectId }));
    setComposeYamlForm((form) => ({ ...form, projectId }));
    setExternalDbForm((form) => ({ ...form, projectId }));
    setManagedDbForm((form) => ({ ...form, projectId }));
    setLogs("");
  }

  function showAllProjects() {
    setSelectedProjectId("");
    setTab("general");
    setLogs("");
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

  async function appAction(appId: string, action: "restart" | "redeploy" | "health" | "delete") {
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
  const filteredProjects = allProjects.filter((project) => {
    const query = projectSearch.trim().toLowerCase();
    if (!query) return true;
    return project.name.toLowerCase().includes(query) || (project.description || "").toLowerCase().includes(query);
  });
  const activeApp = apps.find((app) => app.id === domainForm.appId) || apps[0];
  const selectedSettingsApp = apps.find((app) => app.id === appSettingsForm.appId);
  const selectedDomainApp = apps.find((app) => app.id === domainForm.appId) || activeApp;
  const vpsIp = publicIp(status);
  const activePreviewUrl = activeApp ? previewUrl(activeApp, vpsIp) : "";

  if (!currentProject) {
    return (
      <main className="min-h-screen bg-[#050505] text-zinc-100">
        <div className="grid min-h-screen lg:grid-cols-[240px_1fr]">
          <aside className="border-b border-line bg-[#050505] p-3 lg:border-b-0 lg:border-r">
            <Brand compact />
            <div className="mt-5 grid gap-2">
              <button className="svp-button justify-start bg-[#1b1b1e]" onClick={showAllProjects}>
                <Layers3 size={15} />
                Projects
              </button>
            </div>
            <div className="mt-6 border-t border-line pt-4 text-xs text-zinc-500">
              <p>Server IP</p>
              <p className="mt-1 break-all text-zinc-300">{vpsIp || "checking"}</p>
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
            <Layers3 size={15} />
            All Projects
          </button>
          <div className="mt-5 rounded-md border border-line bg-panel p-3">
            <p className="svp-label">Current project</p>
            <p className="mt-2 truncate font-black text-ink">{currentProject.name}</p>
            <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{currentProject.description || "Services, deploys, env, domains, storage."}</p>
          </div>
          <nav className="mt-5 grid gap-1" aria-label="Project navigation">
            {tabs.map((item) => (
              <TabButton key={item.id} item={item} active={tab === item.id} onClick={() => setTab(item.id)} />
            ))}
          </nav>
          <div className="mt-6 border-t border-line pt-4 text-xs text-zinc-500">
            <p>Server IP</p>
            <p className="mt-1 break-all text-zinc-300">{vpsIp || "checking"}</p>
            <p className="mt-3">Panel</p>
            <p className="mt-1 text-zinc-300">Auth protected</p>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="border-b border-line bg-[#050505]/95 px-4 py-3 md:px-6">
            <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-bold text-zinc-500">Projects / {currentProject.name}</p>
                <h1 className="mt-1 truncate text-2xl font-black tracking-normal text-ink">{currentProject.name}</h1>
                <p className="mt-1 max-w-3xl text-sm text-zinc-400">
                  {currentProject.description || "One focused place for this app: services, deploys, env, storage, domains, logs, firewall, and rollbacks."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button className="svp-button-primary" onClick={() => setTab("deployments")} disabled={Boolean(busy)}>
                  <Play size={15} />
                  New Deployment
                </button>
                {(activeApp?.domain || activePreviewUrl) && (
                  <a className="svp-button" href={activeApp?.domain ? `https://${activeApp.domain}` : activePreviewUrl} target="_blank" rel="noreferrer">
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

        {tab === "general" && (
          <div className="space-y-4">
            <Panel title="Project Actions" icon={Play}>
              <div className="flex flex-wrap items-center gap-2">
                <button className="svp-button-primary" onClick={() => setTab("deployments")} disabled={Boolean(busy)}>
                  <Play size={15} />
                  New Deployment
                </button>
                <button className="svp-button" onClick={() => void refresh()} disabled={Boolean(busy)}>
                  <RefreshCw size={15} />
                  Reload
                </button>
                <button className="svp-button" onClick={() => activeApp && void appAction(activeApp.id, "redeploy")} disabled={Boolean(busy) || !(activeApp?.source || activeApp?.sourceType === "docker-image")}>
                  <Wrench size={15} />
                  Rebuild
                </button>
                <button className="svp-button" onClick={() => activeApp && void appAction(activeApp.id, "restart")} disabled={Boolean(busy) || !activeApp}>
                  <RotateCcw size={15} />
                  Restart
                </button>
                {activeApp && (
                  <button className="svp-button" onClick={() => void loadLogs(activeApp.id)} disabled={Boolean(busy)}>
                    <Terminal size={15} />
                    Logs
                  </button>
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
                      <button className="svp-button-primary" onClick={() => setTab("deployments")}>
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
              <AppGrid apps={apps} projects={projects} databases={databases} vpsIp={vpsIp} onLogs={loadLogs} onStop={stop} onAction={appAction} />
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
                      {apps.map((app) => (
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

            <Panel title="Configured Keys" icon={Lock}>
              <div className="grid gap-2">
                {apps.length === 0 && <p className="text-sm text-zinc-500">No app environment keys yet.</p>}
                {apps.map((app) => (
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
            <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
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
              <DatabaseGrid databases={databases} projects={projects} onAction={databaseAction} />
            </Panel>
          </div>
        )}

        {tab === "monitoring" && (
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
                {apps.length === 0 && <p className="text-sm text-zinc-500">Deploy an app first, then logs appear here.</p>}
                {apps.map((app) => (
                  <button key={app.id} className="svp-button justify-start" onClick={() => void loadLogs(app.id)}>
                    <Terminal size={14} />
                    {app.name}
                  </button>
                ))}
              </div>
            </Panel>
            <Panel title="Runtime Logs" icon={Terminal}>
              <pre className="svp-code min-h-96 overflow-auto rounded-md p-4 text-xs">{logs || "Select a service to load recent logs."}</pre>
            </Panel>
          </div>
        )}

        {tab === "deployments" && (
          <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
              <Panel title="Provider" icon={GitBranch}>
                <div className="grid gap-3">
                  <div className="flex flex-wrap gap-2">
                    <button className={`svp-tab ${gitForm.mode === "node" ? "svp-tab-active" : ""}`} onClick={() => setGitForm({ ...gitForm, mode: "node" })}>Node/Next/Vite</button>
                    <button className={`svp-tab ${gitForm.mode === "dockerfile" ? "svp-tab-active" : ""}`} onClick={() => setGitForm({ ...gitForm, mode: "dockerfile" })}>Dockerfile</button>
                    <button className={`svp-tab ${gitForm.mode === "static" ? "svp-tab-active" : ""}`} onClick={() => setGitForm({ ...gitForm, mode: "static" })}>Static</button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Select label="Project" value={gitForm.projectId} onChange={(projectId) => setGitForm({ ...gitForm, projectId })} options={projects.map((project) => ({ value: project.id, label: project.name }))} />
                    <Select label="Service role" value={gitForm.serviceRole} onChange={(serviceRole) => setGitForm({ ...gitForm, serviceRole: serviceRole as ServiceRole })} options={roleOptions()} />
                  </div>
                  <Field label="App name" value={gitForm.name} onChange={(name) => setGitForm({ ...gitForm, name })} />
                  <Field label="Repository URL" value={gitForm.repoUrl} onChange={(repoUrl) => setGitForm({ ...gitForm, repoUrl })} placeholder="https://github.com/user/repo.git" />
                  <Field label="Branch" value={gitForm.branch} onChange={(branch) => setGitForm({ ...gitForm, branch })} />
                  <Field label="App directory" value={gitForm.appDirectory} onChange={(appDirectory) => setGitForm({ ...gitForm, appDirectory })} placeholder="apps/web or blank for repo root" />
                  <Select label="Database" value={gitForm.databaseId} onChange={(databaseId) => setGitForm({ ...gitForm, databaseId })} options={[{ value: "", label: "No database" }, ...databases.map((database) => ({ value: database.id, label: `${database.name} (${database.envKey})` }))]} />
                </div>
              </Panel>

              <Panel title="Build Type" icon={Wrench}>
                <div className="grid gap-3">
                  <label className="flex items-center gap-2 text-sm text-zinc-300">
                    <input type="radio" checked={gitForm.mode === "dockerfile"} onChange={() => setGitForm({ ...gitForm, mode: "dockerfile" })} />
                    Dockerfile
                  </label>
                  <label className="flex items-center gap-2 text-sm text-zinc-300">
                    <input type="radio" checked={gitForm.mode === "node"} onChange={() => setGitForm({ ...gitForm, mode: "node" })} />
                    Node/Next/Vite generated Dockerfile
                  </label>
                  <label className="flex items-center gap-2 text-sm text-zinc-300">
                    <input type="radio" checked={gitForm.mode === "static"} onChange={() => setGitForm({ ...gitForm, mode: "static" })} />
                    Static build
                  </label>
                  <div className="grid gap-3 border-t border-line pt-3 md:grid-cols-2">
                    <Field label="Build command" value={gitForm.buildCommand} onChange={(buildCommand) => setGitForm({ ...gitForm, buildCommand })} placeholder="auto: npm run build" />
                    <Field label="Start command" value={gitForm.startCommand} onChange={(startCommand) => setGitForm({ ...gitForm, startCommand })} placeholder="auto: npm run start" />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Container port" value={gitForm.containerPort} onChange={(containerPort) => setGitForm({ ...gitForm, containerPort })} placeholder="3000" />
                    <Field label="Health path" value={gitForm.healthPath} onChange={(healthPath) => setGitForm({ ...gitForm, healthPath })} placeholder="/" />
                  </div>
                  <label className="flex items-start gap-3 rounded-md border border-line bg-[#050505] p-3 text-sm text-zinc-300">
                    <input className="mt-1" type="checkbox" checked={gitForm.publicPreview} onChange={(event) => setGitForm({ ...gitForm, publicPreview: event.target.checked })} />
                    <span>
                      <span className="block font-bold text-ink">Create public port preview</span>
                      <span className="mt-1 block text-xs text-zinc-500">Publishes the service on a generated high port and opens that port in UFW. Disable this when you want domain-only access through Caddy.</span>
                    </span>
                  </label>
                  <button className="svp-button-primary w-fit" onClick={() => void deployGit()} disabled={Boolean(busy) || !gitForm.repoUrl}>
                    <GitBranch size={16} />
                    Deploy Git App
                  </button>
                </div>
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
              <Panel title="Docker Image" icon={Boxes}>
                <div className="grid gap-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Select label="Project" value={imageForm.projectId} onChange={(projectId) => setImageForm({ ...imageForm, projectId })} options={projects.map((project) => ({ value: project.id, label: project.name }))} />
                    <Select label="Service role" value={imageForm.serviceRole} onChange={(serviceRole) => setImageForm({ ...imageForm, serviceRole: serviceRole as ServiceRole })} options={roleOptions()} />
                  </div>
                  <Field label="App name" value={imageForm.name} onChange={(name) => setImageForm({ ...imageForm, name })} />
                  <Field label="Image" value={imageForm.image} onChange={(image) => setImageForm({ ...imageForm, image })} placeholder="nginx:1.27-alpine or ghcr.io/user/app:tag" />
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Container port" value={imageForm.containerPort} onChange={(containerPort) => setImageForm({ ...imageForm, containerPort })} placeholder="3000" />
                    <Field label="Health path" value={imageForm.healthPath} onChange={(healthPath) => setImageForm({ ...imageForm, healthPath })} placeholder="/" />
                  </div>
                  <label className="flex items-start gap-3 rounded-md border border-line bg-[#050505] p-3 text-sm text-zinc-300">
                    <input className="mt-1" type="checkbox" checked={imageForm.publicPreview} onChange={(event) => setImageForm({ ...imageForm, publicPreview: event.target.checked })} />
                    <span>
                      <span className="block font-bold text-ink">Create public port preview</span>
                      <span className="mt-1 block text-xs text-zinc-500">Useful for smoke tests. The panel opens the generated port in UFW.</span>
                    </span>
                  </label>
                  <TextArea label="Image env" value={imageForm.envText} onChange={(envText) => setImageForm({ ...imageForm, envText })} />
                  <button className="svp-button-primary w-fit" onClick={() => void deployImage()} disabled={Boolean(busy) || !imageForm.image.trim()}>
                    <Boxes size={16} />
                    Deploy Image
                  </button>
                </div>
              </Panel>

              <Panel title="Preview Port" icon={Globe2}>
                <div className="space-y-3 text-sm text-zinc-400">
                  <p>Public Git deploys can open a temporary VPS port for quick testing. For production, add a domain and let Caddy serve traffic on 80/443.</p>
                  <Info title="What the checkbox does" body="It publishes the app on 0.0.0.0 using a generated high port and adds an allow rule in UFW for that port." />
                  <Info title="Safer default" body="Turn preview off when you only want localhost plus Caddy/domain routing." />
                  <button className="svp-button w-fit" onClick={() => setTab("advanced")}>
                    <Shield size={16} />
                    Manage Firewall
                  </button>
                </div>
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
              <Panel title="Compose From Git" icon={Layers3}>
                <div className="grid gap-3">
                  <Select label="Project" value={composeForm.projectId} onChange={(projectId) => setComposeForm({ ...composeForm, projectId })} options={projects.map((project) => ({ value: project.id, label: project.name }))} />
                  <Field label="Stack name" value={composeForm.name} onChange={(name) => setComposeForm({ ...composeForm, name })} />
                  <Field label="Repository URL" value={composeForm.repoUrl} onChange={(repoUrl) => setComposeForm({ ...composeForm, repoUrl })} placeholder="https://github.com/user/compose-repo.git" />
                  <Field label="Branch" value={composeForm.branch} onChange={(branch) => setComposeForm({ ...composeForm, branch })} />
                  <TextArea label="Compose .env" value={composeForm.envText} onChange={(envText) => setComposeForm({ ...composeForm, envText })} />
                  <button className="svp-button w-fit" onClick={() => void deployCompose()} disabled={Boolean(busy) || !composeForm.repoUrl}>
                    <Boxes size={16} />
                    Deploy Compose
                  </button>
                </div>
              </Panel>

              <Panel title="Pasted Compose YAML" icon={Layers3}>
                <div className="grid gap-3">
                  <Select label="Project" value={composeYamlForm.projectId} onChange={(projectId) => setComposeYamlForm({ ...composeYamlForm, projectId })} options={projects.map((project) => ({ value: project.id, label: project.name }))} />
                  <Field label="Stack name" value={composeYamlForm.name} onChange={(name) => setComposeYamlForm({ ...composeYamlForm, name })} />
                  <TextArea label="compose.yaml" value={composeYamlForm.composeYaml} onChange={(composeYaml) => setComposeYamlForm({ ...composeYamlForm, composeYaml })} />
                  <TextArea label="Compose .env" value={composeYamlForm.envText} onChange={(envText) => setComposeYamlForm({ ...composeYamlForm, envText })} />
                  <button className="svp-button w-fit" onClick={() => void deployComposeYaml()} disabled={Boolean(busy) || !composeYamlForm.composeYaml.trim()}>
                    <Boxes size={16} />
                    Deploy Pasted Compose
                  </button>
                </div>
              </Panel>
            </div>

            <Panel title="Recent Deployments" icon={Activity}>
              <DeploymentList deployments={deployments} apps={apps} onLogs={loadDeploymentLogs} />
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
                    {apps.map((app) => (
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

        {tab === "advanced" && (
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
            </div>
            <p className="mt-4 text-xs text-zinc-500">
              {lastDeployment ? `${lastDeployment.action}: ${lastDeployment.message}` : "Open project to manage its services, storage, domains, and logs."}
            </p>
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
  onAction
}: {
  apps: ManagedApp[];
  projects: ProjectRecord[];
  databases: DatabaseResource[];
  vpsIp: string;
  onLogs: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onAction: (id: string, action: "restart" | "redeploy" | "health" | "delete") => Promise<void>;
}) {
  if (apps.length === 0) return <p className="text-sm text-zinc-500">No services yet. Deploy a public Git repository from the Deployments tab.</p>;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {apps.map((app) => {
        const appPreview = previewUrl(app, vpsIp);
        return (
        <article key={app.id} className="rounded-md border border-line bg-panel p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-bold text-ink">{app.name}</p>
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
            <button className="svp-button" onClick={() => void onAction(app.id, "health")}>
              <HeartPulse size={14} />
              Health
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

function DeploymentList({ deployments, apps, onLogs }: { deployments: DeploymentEvent[]; apps: ManagedApp[]; onLogs: (id: string) => Promise<void> }) {
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
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className="svp-button" onClick={() => void onLogs(event.id)}>
                <Terminal size={14} />
                Logs
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
  onAction
}: {
  databases: DatabaseResource[];
  projects: ProjectRecord[];
  onAction: (id: string, action: "test" | "connection") => Promise<void>;
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
          </div>
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

function mergeEnvText(existing: string, additions: string[]) {
  const current = existing.trim();
  const next = additions.filter(Boolean).join("\n");
  if (!current) return next;
  return `${current}\n${next}`;
}
