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
  Github,
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
import { useEffect, useRef, useState } from "react";

type Tab =
  | "dashboard"
  | "projects"
  | "general"
  | "services"
  | "environment"
  | "database"
  | "monitoring"
  | "logs"
  | "deployments"
  | "domains"
  | "advanced"
  | "docker"
  | "git"
  | "settings";
type Strategy = "docker" | "systemd" | "static" | "compose";
type GitMode = "dockerfile" | "node" | "static";
type ServiceRole = "frontend" | "backend" | "worker" | "fullstack";
type DeployProvider = "git" | "github" | "image" | "compose" | "compose-yaml";
type DeployStep = "source" | "details" | "build" | "runtime";
type PreviewDomainMode = "sslip" | "custom" | "disabled";

interface PanelSettings {
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
  gitProviderConnectionId?: string;
  gitInstallationId?: string;
  gitRepositoryId?: string;
  repoFullName?: string;
  githubRepoId?: number;
  autoDeployEnabled?: boolean;
  autoDeployBranch?: string;
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
  previewDomainStatus?: "disabled" | "pending" | "active" | "error";
  previewDomainError?: string;
  previewDomainMode?: "sslip" | "custom";
  previewCaddyFile?: string;
  previewCaddyReloadStatus?: string;
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
  trigger?: string;
  provider?: string;
  branch?: string;
  commitSha?: string;
  commitMessage?: string;
  pusher?: string;
  webhookDeliveryId?: string;
  repositoryFullName?: string;
  imageTag?: string;
  steps?: Array<{ at: string; step: string; status: string; message: string }>;
}

interface GitProviderConnection {
  id: string;
  provider: "github";
  name: string;
  appId: string;
  clientId?: string;
  appSlug?: string;
  appUrl?: string;
  installUrl?: string;
  status: "connected" | "needs_setup" | "error";
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  privateKeyConfigured?: boolean;
  webhookSecretConfigured?: boolean;
  clientSecretConfigured?: boolean;
}

interface GitInstallation {
  id: string;
  providerConnectionId: string;
  installationId: number;
  accountLogin: string;
  accountType: string;
  accountAvatarUrl?: string;
  repositorySelection?: string;
  permissions?: Record<string, unknown>;
  events?: string[];
  status: string;
  errorMessage?: string;
  lastSyncedAt?: string;
}

interface GitRepository {
  id: string;
  installationId: string;
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

interface GitWebhookEvent {
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

interface GitHubManifestStartResult {
  actionUrl: string;
  manifest: Record<string, unknown>;
  expiresAt: string;
  webhookUrl: string;
  redirectUrl: string;
  warning?: string;
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
  settings: PanelSettings;
  projects: ProjectRecord[];
  apps: ManagedApp[];
  databases: DatabaseResource[];
  audit: AuditEvent[];
  deployments: DeploymentEvent[];
  gitConnections: GitProviderConnection[];
  gitInstallations: GitInstallation[];
  gitRepositories: GitRepository[];
  gitWebhookEvents: GitWebhookEvent[];
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
  { id: "environment", label: "Environment", icon: KeyRound },
  { id: "domains", label: "Domains", icon: Globe2 },
  { id: "database", label: "Databases", icon: Database },
  { id: "advanced", label: "Settings", icon: Wrench }
];

const serviceTabs: Array<{ id: Tab; label: string; icon: LucideIcon }> = [
  { id: "general", label: "General", icon: Settings },
  { id: "environment", label: "Environment", icon: KeyRound },
  { id: "domains", label: "Domains", icon: Globe2 },
  { id: "deployments", label: "Deployments", icon: Activity },
  { id: "logs", label: "Logs", icon: Terminal },
  { id: "monitoring", label: "Monitoring", icon: HeartPulse },
  { id: "advanced", label: "Advanced", icon: Shield }
];

const globalSidebarGroups: Array<{ title: string; items: Array<{ id: Tab; label: string; icon: LucideIcon }> }> = [
  {
    title: "Overview",
    items: [
      { id: "dashboard", label: "Dashboard", icon: Home },
      { id: "projects", label: "Projects", icon: Layers3 },
      { id: "services", label: "Services", icon: Boxes },
      { id: "deployments", label: "Deployments", icon: Activity },
      { id: "logs", label: "Logs", icon: Terminal }
    ]
  },
  {
    title: "Infrastructure",
    items: [
      { id: "database", label: "Databases", icon: Database },
      { id: "domains", label: "Domains", icon: Globe2 },
      { id: "advanced", label: "Firewall", icon: Shield },
      { id: "docker", label: "Docker", icon: HardDrive }
    ]
  },
  {
    title: "Integrations",
    items: [
      { id: "git", label: "Git", icon: Github }
    ]
  },
  {
    title: "Server",
    items: [
      { id: "monitoring", label: "Server Status", icon: Server },
      { id: "settings", label: "Settings", icon: Wrench }
    ]
  }
];

const globalTabs = new Set<Tab>(globalSidebarGroups.flatMap((group) => group.items.map((item) => item.id)));
const routeTabs = new Set<Tab>([...globalTabs, ...projectTabs.map((item) => item.id), ...serviceTabs.map((item) => item.id)]);
const deployProviders = new Set<DeployProvider>(["git", "github", "image", "compose", "compose-yaml"]);
const deploySteps = new Set<DeployStep>(["source", "details", "build", "runtime"]);

export function PanelShell() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [state, setState] = useState<StatePayload | null>(null);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [projectCreateMode, setProjectCreateMode] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [csrfToken, setCsrfToken] = useState("");
  const [deployProvider, setDeployProvider] = useState<DeployProvider>("git");
  const [deployStep, setDeployStep] = useState<DeployStep>("source");
  const [routeHydrated, setRouteHydrated] = useState(false);
  const routeWriteCount = useRef(0);
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
    previewDomainEnabled: true,
    publicPreview: false
  });
  const [githubForm, setGithubForm] = useState({
    connectionId: "",
    installationId: "",
    repositoryId: "",
    repoSearch: "",
    branches: [] as Array<{ name: string; sha?: string; protected?: boolean }>,
    autoDeployEnabled: false
  });
  const [githubConnectionForm, setGithubConnectionForm] = useState({
    id: "",
    name: "GitHub",
    appId: "",
    clientId: "",
    clientSecret: "",
    appSlug: "",
    appUrl: "",
    installUrl: "",
    privateKey: "",
    webhookSecret: "",
    publicDockioUrl: ""
  });
  const [githubManifestForm, setGithubManifestForm] = useState({
    name: "Dockio GitHub",
    owner: "",
    publicDockioUrl: ""
  });
  const [imageForm, setImageForm] = useState({ name: "Docker Image App", projectId: "", serviceRole: "fullstack" as ServiceRole, image: "nginx:1.27-alpine", containerPort: "80", healthPath: "/", envText: "", previewDomainEnabled: true, publicPreview: false });
  const [composeForm, setComposeForm] = useState({ name: "Compose Stack", projectId: "", repoUrl: "", branch: "main", envText: "" });
  const [composeYamlForm, setComposeYamlForm] = useState({ name: "Pasted Compose Stack", projectId: "", composeYaml: "services:\n  web:\n    image: nginx:1.27-alpine\n    restart: unless-stopped\n", envText: "" });
  const [previewSettingsForm, setPreviewSettingsForm] = useState<PanelSettings>({
    publicServerIp: "",
    publicDockioUrl: "",
    previewDomainMode: "sslip",
    previewBaseDomain: "",
    autoPreviewDomainsEnabled: true,
    caddySitesDir: "/etc/caddy/dockio/sites",
    caddyMainConfig: "/etc/caddy/Caddyfile",
    localProxyPortRangeStart: 31000,
    localProxyPortRangeEnd: 39999
  });
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
  const [logsAppId, setLogsAppId] = useState("");
  const [logsDeploymentId, setLogsDeploymentId] = useState("");
  const [repoAnalysis, setRepoAnalysis] = useState<RepoAnalysis | null>(null);
  const [selectedDetectionId, setSelectedDetectionId] = useState("");
  const [editingAppId, setEditingAppId] = useState("");

  useEffect(() => {
    void boot();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const github = params.get("github");
    if (!github) return;
    if (github === "connected") {
      setNotice("GitHub App connected. Install it on repositories if needed, then refresh installations and repositories.");
    } else if (github === "error") {
      setNotice(params.get("message") || "GitHub connection failed.");
    }
    params.delete("github");
    params.delete("message");
    const nextSearch = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`);
  }, []);

  useEffect(() => {
    if (!auth?.user || !state || routeHydrated) return;
    applyRouteFromLocation(state);
    setRouteHydrated(true);
  }, [auth?.user, state, routeHydrated]);

  useEffect(() => {
    if (!routeHydrated || !auth?.user || !state) return;
    const handleRouteChange = () => applyRouteFromLocation(state);
    window.addEventListener("popstate", handleRouteChange);
    window.addEventListener("hashchange", handleRouteChange);
    return () => {
      window.removeEventListener("popstate", handleRouteChange);
      window.removeEventListener("hashchange", handleRouteChange);
    };
  }, [routeHydrated, auth?.user, state]);

  useEffect(() => {
    if (!routeHydrated || !auth?.user || !state) return;
    const nextHash = buildPanelRouteHash({ selectedProjectId, selectedServiceId, tab, deployProvider, deployStep });
    if (window.location.hash === nextHash) return;
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
    const write = routeWriteCount.current === 0 ? window.history.replaceState : window.history.pushState;
    write.call(window.history, { dockioPanel: true }, "", nextUrl);
    routeWriteCount.current += 1;
  }, [routeHydrated, auth?.user, state, selectedProjectId, selectedServiceId, tab, deployProvider, deployStep]);

  useEffect(() => {
    if (!state) return;
    if (selectedProjectId && !state.projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId("");
      setSelectedServiceId("");
      setTab("general");
      return;
    }
    if (selectedServiceId) {
      const service = state.apps.find((app) => app.id === selectedServiceId);
      if (!service || (selectedProjectId && service.projectId && service.projectId !== selectedProjectId)) {
        setSelectedServiceId("");
        setTab((current) => normalizeRouteTab(current, false, Boolean(selectedProjectId)));
      }
    }
  }, [state, selectedProjectId, selectedServiceId]);

  useEffect(() => {
    if (!auth?.user || tab !== "logs" || !selectedServiceId || logsAppId === selectedServiceId || busy) return;
    void loadLogs(selectedServiceId);
  }, [auth?.user, tab, selectedServiceId, logsAppId, busy]);

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
    setPreviewSettingsForm(nextState.settings);
    setGithubConnectionForm((form) => ({ ...form, publicDockioUrl: form.publicDockioUrl || nextState.settings.publicDockioUrl || "" }));
    setGithubManifestForm((form) => ({ ...form, publicDockioUrl: form.publicDockioUrl || nextState.settings.publicDockioUrl || "" }));
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
    setGithubForm((form) => ({
      ...form,
      connectionId: form.connectionId || nextState.gitConnections[0]?.id || "",
      installationId: form.installationId || nextState.gitInstallations[0]?.id || "",
      repositoryId: form.repositoryId || nextState.gitRepositories[0]?.id || ""
    }));
    setImageForm((form) => ({ ...form, projectId: form.projectId || nextState.projects[0]?.id || "" }));
    setComposeForm((form) => ({ ...form, projectId: form.projectId || nextState.projects[0]?.id || "" }));
    setComposeYamlForm((form) => ({ ...form, projectId: form.projectId || nextState.projects[0]?.id || "" }));
    setExternalDbForm((form) => ({ ...form, projectId: form.projectId || nextState.projects[0]?.id || "" }));
    setManagedDbForm((form) => ({ ...form, projectId: form.projectId || nextState.projects[0]?.id || "" }));
    setManagedRedisForm((form) => ({ ...form, projectId: form.projectId || nextState.projects[0]?.id || "" }));
    setSelectedProjectId((projectId) => (projectId && !nextState.projects.some((project) => project.id === projectId) ? "" : projectId));
  }

  function applyRouteFromLocation(nextState: StatePayload) {
    const route = parsePanelRouteHash(window.location.hash);
    let nextProjectId = route.projectId && nextState.projects.some((project) => project.id === route.projectId) ? route.projectId : "";
    const routeService = route.serviceId ? nextState.apps.find((app) => app.id === route.serviceId) : undefined;
    if (routeService) {
      const routeServiceProjectId = routeService.projectId || nextProjectId;
      if (routeServiceProjectId && nextState.projects.some((project) => project.id === routeServiceProjectId)) {
        nextProjectId = routeServiceProjectId;
      }
    }
    const nextServiceId = routeService && (!routeService.projectId || routeService.projectId === nextProjectId) ? routeService.id : "";
    setSelectedProjectId(nextProjectId);
    setSelectedServiceId(nextServiceId);
    setTab(normalizeRouteTab(route.tab, Boolean(nextServiceId), Boolean(nextProjectId)));
    if (route.deployProvider) setDeployProvider(route.deployProvider);
    if (route.deployStep) setDeployStep(route.deployStep);
    if (nextProjectId && nextProjectId !== selectedProjectId) syncProjectForms(nextProjectId);
    if (routeService && nextServiceId) syncServiceForms(routeService, nextProjectId);
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
      const url = previewUrl(result.app, publicIp(status));
      setNotice(url ? `${result.app.name} ${editingAppId ? "redeployed" : "deployed"}. Preview: ${url}` : `${result.app.name} ${editingAppId ? "redeployed" : "deployed"} from ${gitForm.branch}.`);
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

  async function saveGitHubConnection() {
    await run("Saving GitHub App", async () => {
      const result = await api<{ connection: GitProviderConnection }>("/api/git/github/connections", {
        method: "POST",
        csrfToken,
        body: githubConnectionForm
      });
      setGithubConnectionForm((form) => ({
        ...form,
        id: result.connection.id,
        privateKey: "",
        clientSecret: "",
        webhookSecret: "",
        publicDockioUrl: form.publicDockioUrl || state?.settings.publicDockioUrl || ""
      }));
      setGithubForm((form) => ({ ...form, connectionId: result.connection.id }));
      setNotice("GitHub App connection saved. Refresh installations next.");
      await refresh();
    });
  }

  async function startGitHubManifestConnection() {
    const publicDockioUrl = (githubManifestForm.publicDockioUrl || githubConnectionForm.publicDockioUrl || safeBrowserOrigin()).trim();
    if (!publicDockioUrl) {
      setNotice("Enter the real panel URL first, for example http://94.130.177.226:3099. Do not use 0.0.0.0.");
      return;
    }
    await run("Opening GitHub", async () => {
      const result = await api<GitHubManifestStartResult>("/api/git/github/manifest/start", {
        method: "POST",
        csrfToken,
        body: {
          ...githubManifestForm,
          publicDockioUrl
        }
      });
      setNotice(result.warning || "Opening GitHub to create the App. Choose the account and approve repository access there.");
      submitGitHubManifest(result.actionUrl, result.manifest);
    });
  }

  function submitGitHubManifest(actionUrl: string, manifest: Record<string, unknown>) {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = actionUrl;
    form.style.display = "none";
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "manifest";
    input.value = JSON.stringify(manifest);
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
  }

  async function disconnectGitHub(connectionId: string) {
    if (!window.confirm("Disconnect this GitHub App connection from Dockio? Existing services stay, but private redeploys will fail until reconnected.")) return;
    await run("Disconnecting GitHub", async () => {
      await api(`/api/git/github/connections/${connectionId}/disconnect`, { method: "POST", csrfToken });
      setGithubForm((form) => ({ ...form, connectionId: "", installationId: "", repositoryId: "", branches: [] }));
      setNotice("GitHub connection removed.");
      await refresh();
    });
  }

  async function syncGitHubInstallations(connectionId = githubForm.connectionId) {
    if (!connectionId) return;
    await run("Refreshing GitHub installations", async () => {
      const result = await api<{ installations: GitInstallation[] }>(`/api/git/github/connections/${connectionId}/sync-installations`, { method: "POST", csrfToken });
      const first = result.installations[0];
      setGithubForm((form) => ({ ...form, connectionId, installationId: first?.id || form.installationId }));
      setNotice(result.installations.length ? `Found ${result.installations.length} GitHub installation(s). Refresh repositories next.` : "No installations found yet. Click Install App, choose the repositories Dockio can deploy, then refresh installations.");
      await refresh();
    });
  }

  async function syncGitHubRepositories(installationId = githubForm.installationId) {
    if (!installationId) return;
    await run("Refreshing GitHub repositories", async () => {
      const result = await api<{ repositories: GitRepository[] }>(`/api/git/github/installations/${installationId}/sync-repositories`, { method: "POST", csrfToken });
      const first = result.repositories[0];
      setGithubForm((form) => ({ ...form, installationId, repositoryId: first?.id || form.repositoryId }));
      setNotice(result.repositories.length ? `Synced ${result.repositories.length} repositories.` : "No repositories are available. Open the GitHub App installation and allow at least one repository.");
      await refresh();
    });
  }

  async function loadGitHubBranches(repositoryId = githubForm.repositoryId) {
    const repo = state?.gitRepositories.find((item) => item.id === repositoryId);
    const installationId = githubForm.installationId || repo?.installationId || "";
    if (!installationId || !repositoryId) return;
    await run("Loading branches", async () => {
      const result = await api<{ branches: Array<{ name: string; sha?: string; protected?: boolean }> }>("/api/git/github/branches", {
        method: "POST",
        csrfToken,
        body: { installationId, repositoryId }
      });
      setGithubForm((form) => ({ ...form, installationId, repositoryId, branches: result.branches }));
      setGitForm((form) => ({ ...form, branch: repo?.defaultBranch || result.branches[0]?.name || form.branch }));
      setNotice(`Loaded ${result.branches.length} branches.`);
    });
  }

  async function detectGitHubStack() {
    const repo = state?.gitRepositories.find((item) => item.id === githubForm.repositoryId);
    const installationId = githubForm.installationId || repo?.installationId || "";
    if (!installationId || !githubForm.repositoryId) return;
    await run("Detecting GitHub stack", async () => {
      const result = await api<{ analysis: RepoAnalysis }>("/api/git/github/detect", {
        method: "POST",
        csrfToken,
        body: {
          installationId,
          repositoryId: githubForm.repositoryId,
          branch: gitForm.branch,
          appDirectory: gitForm.appDirectory
        }
      });
      setGithubForm((form) => ({ ...form, installationId }));
      setRepoAnalysis(result.analysis);
      const detected = result.analysis.services.find((service) => service.id === result.analysis.recommendedServiceId) || result.analysis.services[0];
      if (detected) applyDetectedService(detected, result.analysis.branch);
      setDeployStep("build");
      setNotice("Private repository stack detected. Confirm build settings, then deploy.");
    });
  }

  async function deployGitHub() {
    const repo = state?.gitRepositories.find((item) => item.id === githubForm.repositoryId);
    const installationId = githubForm.installationId || repo?.installationId || "";
    await run(editingAppId ? "Redeploying GitHub App service" : "Deploying GitHub App service", async () => {
      const result = await api<{ app: ManagedApp }>(editingAppId ? `/api/apps/${editingAppId}/github` : "/api/apps/github", {
        method: "POST",
        csrfToken,
        body: {
          ...gitForm,
          projectId: selectedProjectId || gitForm.projectId,
          gitInstallationId: installationId,
          gitRepositoryId: githubForm.repositoryId,
          autoDeployEnabled: githubForm.autoDeployEnabled
        }
      });
      setDomainForm((form) => ({ ...form, appId: result.app.id }));
      const url = previewUrl(result.app, publicIp(status));
      setNotice(url ? `${result.app.name} deployed from GitHub App. Preview: ${url}` : `${result.app.name} deployed from GitHub App.`);
      setEditingAppId("");
      await refresh();
      setDeployStep("runtime");
    });
  }

  async function saveAutoDeploy(app: ManagedApp, enabled: boolean) {
    await run(enabled ? "Enabling auto-deploy" : "Disabling auto-deploy", async () => {
      const result = await api<{ app: ManagedApp }>(`/api/apps/${app.id}/autodeploy`, {
        method: "POST",
        csrfToken,
        body: { enabled, branch: app.autoDeployBranch || app.branch || "main" }
      });
      setNotice(result.app?.lastMessage || "Auto-deploy setting saved.");
      await refresh();
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
      const url = previewUrl(result.app, publicIp(status));
      setNotice(url ? `${result.app.name} deployed. Preview: ${url}` : `${result.app.name} deployed from ${imageForm.image}.`);
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

  function syncProjectForms(projectId: string) {
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
  }

  function openProject(projectId: string) {
    setSelectedProjectId(projectId);
    setSelectedServiceId("");
    setProjectCreateMode(false);
    setTab("general");
    syncProjectForms(projectId);
    clearLogs();
  }

  function openGlobalTab(nextTab: Tab) {
    setSelectedProjectId("");
    setSelectedServiceId("");
    setProjectCreateMode(false);
    setTab(globalTabs.has(nextTab) ? nextTab : "dashboard");
    clearLogs();
  }

  function openCreateProject() {
    setSelectedProjectId("");
    setSelectedServiceId("");
    setProjectCreateMode(true);
    setTab("projects");
    clearLogs();
  }

  function showAllProjects(nextTab: Tab = "dashboard") {
    setSelectedProjectId("");
    setSelectedServiceId("");
    setProjectCreateMode(false);
    setTab(globalTabs.has(nextTab) ? nextTab : "dashboard");
    clearLogs();
  }

  function syncServiceForms(app: ManagedApp, projectId: string = app.projectId || selectedProjectId || "") {
    setDomainForm((form) => ({ ...form, appId: app.id }));
    setAppSettingsForm({
      appId: app.id,
      projectId,
      serviceRole: app.serviceRole || "fullstack",
      corsText: (app.corsOrigins || []).join("\n"),
      databaseId: app.databaseId || ""
    });
    setAppEnvForm((form) => ({ ...form, appId: app.id, deleteKey: "" }));
  }

  function openService(app: ManagedApp, nextTab: Tab = "general") {
    const projectId = app.projectId || selectedProjectId || "";
    if (projectId && projectId !== selectedProjectId) setSelectedProjectId(projectId);
    if (app.id !== selectedServiceId) clearLogs();
    setSelectedServiceId(app.id);
    syncServiceForms(app, projectId);
    setTab(nextTab);
  }

  function clearLogs() {
    setLogs("");
    setLogsAppId("");
    setLogsDeploymentId("");
  }

  function startDeployment(provider: DeployProvider = deployProvider, projectIdOverride = "") {
    const projectId = projectIdOverride || selectedProjectId || gitForm.projectId || allProjects[0]?.id || "";
    if (!projectId) {
      openCreateProject();
      setNotice("Create a project first. After that, Dockio opens the deploy flow inside that project.");
      return;
    }
    setSelectedProjectId(projectId);
    setSelectedServiceId("");
    setProjectCreateMode(false);
    syncProjectForms(projectId);
    setEditingAppId("");
    setRepoAnalysis(null);
    setSelectedDetectionId("");
    setDeployProvider(provider);
    setDeployStep("source");
    setTab("deployments");
  }

  function startGlobalDeployment(provider: DeployProvider = deployProvider) {
    const projectId = allProjects.length === 1 ? allProjects[0]?.id : "";
    if (!projectId) {
      if (allProjects.length === 0) {
        openCreateProject();
        setNotice("Create a project first, then Dockio will open the guided deploy flow inside that project.");
      } else {
        openGlobalTab("projects");
        setNotice("Open the project you want, then click Create Service. Dockio will keep the deploy flow scoped to that project.");
      }
      return;
    }
    startDeployment(provider, projectId);
  }

  function editGitDeployment(app: ManagedApp) {
    if (app.source !== "git" && !["git-url", "github-app"].includes(app.sourceType || "")) {
      setNotice("Only Git services can be edited in the deploy wizard right now.");
      return;
    }
    const projectId = app.projectId || selectedProjectId || gitForm.projectId || "";
    if (projectId) {
      setSelectedProjectId(projectId);
      syncProjectForms(projectId);
    }
    setSelectedServiceId("");
    setProjectCreateMode(false);
    setEditingAppId(app.id);
    setRepoAnalysis(null);
    setSelectedDetectionId("");
    setDeployProvider(app.sourceType === "github-app" ? "github" : "git");
    setDeployStep("details");
    setTab("deployments");
    setGitForm((form) => ({
      ...form,
      name: app.name,
      projectId: projectId || form.projectId,
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
      previewDomainEnabled: app.previewDomainEnabled !== false,
      publicPreview: Boolean(app.publicPreview)
    }));
    if (app.sourceType === "github-app") {
      setGithubForm((form) => ({
        ...form,
        connectionId: app.gitProviderConnectionId || form.connectionId,
        installationId: app.gitInstallationId || form.installationId,
        repositoryId: app.gitRepositoryId || form.repositoryId,
        autoDeployEnabled: Boolean(app.autoDeployEnabled)
      }));
    }
    setNotice(`Editing ${app.name}. Existing saved env is preserved unless you paste replacement env values.`);
  }

  async function createProject() {
    await run("Creating project", async () => {
      const result = await api<{ project: ProjectRecord }>("/api/projects", { method: "POST", csrfToken, body: projectForm });
      setProjectForm({ name: "New Project", description: "" });
      setProjectCreateMode(false);
      setCreatedProjectId(result.project.id);
      openProject(result.project.id);
      setNotice(`${result.project.name} created. Add the first service from this project workspace.`);
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
        setLogsAppId("");
        setLogsDeploymentId("");
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

  async function savePreviewSettings() {
    await run("Saving preview settings", async () => {
      const result = await api<{ settings: PanelSettings }>("/api/settings/preview", {
        method: "POST",
        csrfToken,
        body: previewSettingsForm
      });
      setPreviewSettingsForm(result.settings);
      setNotice("Auto preview domain settings saved.");
      await refresh();
    });
  }

  async function regeneratePreview(appId: string) {
    await run("Regenerating preview domain", async () => {
      const result = await api<{ app: ManagedApp }>(`/api/apps/${appId}/preview/regenerate`, { method: "POST", csrfToken });
      const url = previewUrl(result.app, publicIp(status));
      setNotice(url ? `Preview URL ready: ${url}` : result.app.previewDomainError || "Preview domain updated.");
      await refresh();
    });
  }

  async function disablePreview(appId: string) {
    await run("Disabling preview domain", async () => {
      await api<{ app: ManagedApp }>(`/api/apps/${appId}/preview/disable`, { method: "POST", csrfToken });
      setNotice("Auto preview domain disabled for this service.");
      await refresh();
    });
  }

  async function loadLogs(appId: string) {
    setLogsAppId(appId);
    setLogsDeploymentId("");
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
      setLogsAppId("");
      setLogsDeploymentId("");
      setLogs(result.results.map((item) => `$ ${item.command}\n${item.stdout || item.stderr || (item.ok ? "ok" : "failed")}`).join("\n\n"));
      setNotice("Firewall baseline applied.");
    });
  }

  async function loadDeploymentLogs(deploymentId: string) {
    const deployment = state?.deployments.find((item) => item.id === deploymentId);
    setLogsDeploymentId(deploymentId);
    setLogsAppId(deployment?.appId || "");
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
      setLogsAppId("");
      setLogsDeploymentId("");
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
      setLogsAppId("");
      setLogsDeploymentId("");
      setLogs([result.result.command, result.result.stdout, result.result.stderr].filter(Boolean).join("\n\n"));
      setNotice(`Firewall rule #${firewallDeleteForm.ruleNumber} deleted.`);
      await refresh();
    });
  }

  async function pruneSystem() {
    await run("Pruning Docker", async () => {
      const result = await api<{ result: CommandOutput }>("/api/system/prune", { method: "POST", csrfToken });
      setLogsAppId("");
      setLogsDeploymentId("");
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
        <section className="dio-panel w-full max-w-lg p-5">
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
                Passwords must be at least 12 characters and include uppercase, lowercase, and a number. On installed servers, the setup code is printed by the installer and stored in `/etc/dockio-panel/panel.env`.
              </p>
            )}
            <button className="dio-button-primary" onClick={() => void submitAuth()} disabled={Boolean(busy)}>
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
  const gitConnections = state?.gitConnections ?? [];
  const gitInstallations = state?.gitInstallations ?? [];
  const gitRepositories = state?.gitRepositories ?? [];
  const gitWebhookEvents = state?.gitWebhookEvents ?? [];
  const selectedGitConnection = gitConnections.find((connection) => connection.id === githubForm.connectionId) || gitConnections[0];
  const selectedGitInstallation = gitInstallations.find((installation) => installation.id === githubForm.installationId) || gitInstallations.find((installation) => installation.providerConnectionId === selectedGitConnection?.id);
  const installationRepos = gitRepositories.filter((repo) => !selectedGitInstallation || repo.installationId === selectedGitInstallation.id);
  const filteredGitRepositories = installationRepos.filter((repo) => {
    const query = githubForm.repoSearch.trim().toLowerCase();
    return !query || repo.fullName.toLowerCase().includes(query);
  });
  const selectedGitRepository = gitRepositories.find((repo) => repo.id === githubForm.repositoryId);
  const webhookUrl = webhookUrlFromSettings(state?.settings.publicDockioUrl || "");
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
  const projectPreviewItems = apps
    .map((app) => ({ app, url: app.domain ? `https://${app.domain}` : previewUrl(app, vpsIp) }))
    .filter((item) => Boolean(item.url));
  const logsContext = describeLogsContext(allProjects, allApps, allDeployments, logsAppId, logsDeploymentId);
  const logsSelectedApp = allApps.find((app) => app.id === logsAppId);
  const logRefreshApp = logsSelectedApp || activeApp;
  const runningApps = allApps.filter((app) => app.status === "running");
  const failedApps = allApps.filter((app) => ["failed", "error", "stopped"].includes(app.status));
  const serverHealthy = isOk(status?.docker) && isActive(status?.caddy);
  const globalPage = globalPageMeta(tab);

  if (!currentProject) {
    return (
      <main className="min-h-screen bg-[#050505] text-zinc-100">
        <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
          <GlobalSidebar activeTab={tab} email={auth.user?.email || ""} vpsIp={vpsIp} onNavigate={openGlobalTab} onLogout={() => void logout()} />

          <section className="min-w-0">
            <GlobalPageHeader title={globalPage.title} subtitle={globalPage.subtitle}>
              <div className="flex flex-wrap gap-2">
                <button className="dio-button-primary" onClick={openCreateProject}>
                  <Layers3 size={15} />
                  New Project
                </button>
                <button className="dio-button" onClick={() => startGlobalDeployment()} disabled={Boolean(busy)}>
                  <PackagePlus size={15} />
                  Deploy App
                </button>
                <button className="dio-button" onClick={() => void refresh()} disabled={Boolean(busy)}>
                  <RefreshCw size={15} />
                  Refresh
                </button>
                <button className="dio-button" onClick={() => void logout()}>
                  <Lock size={15} />
                  Logout
                </button>
              </div>
            </GlobalPageHeader>

            <div className="mx-auto max-w-7xl space-y-5 px-4 py-5 md:px-6">
              {(notice || busy) && <Notice busy={busy} notice={notice} />}

              {tab === "dashboard" && (
                <div className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                    <Metric label="Projects" value={allProjects.length} detail="Grouped workspaces" icon={Layers3} />
                    <Metric label="Services" value={allApps.length} detail="Apps and workers" icon={Boxes} />
                    <Metric label="Running" value={runningApps.length} detail={failedApps.length ? `${failedApps.length} need attention` : "Healthy services"} icon={CheckCircle2} />
                    <Metric label="Databases" value={allDatabases.length} detail="Postgres, Redis, external" icon={Database} />
                    <Metric label="Deployments" value={allDeployments.length} detail="Recent activity" icon={Activity} />
                    <Metric label="Server" value={serverHealthy ? 1 : 0} detail={serverHealthy ? "Docker and Caddy active" : "Check server status"} icon={Server} />
                  </div>

                  <Panel title={allProjects.length ? "Workspace Snapshot" : "Start by deploying your first app"} icon={Play}>
                    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
                      <div>
                        <p className="text-sm text-zinc-400">
                          {allProjects.length
                            ? `${allProjects.length} project${allProjects.length === 1 ? "" : "s"} active, ${runningApps.length} service${runningApps.length === 1 ? "" : "s"} running, and ${allDeployments[0] ? `last deployment ${allDeployments[0].status}` : "no deployments recorded yet"}.`
                            : "Create a project, connect a public Git repo, confirm the detected stack, add env vars, and Dockio will give you a preview URL."}
                        </p>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                          <ActionCard title="Deploy from Public Git" body="Paste a repo URL and let Dockio detect the stack." icon={GitBranch} onClick={() => startGlobalDeployment("git")} />
                          <ActionCard title="Deploy from GitHub App" body="Pick a connected private or public GitHub repo." icon={Github} onClick={() => startGlobalDeployment("github")} />
                          <ActionCard title="Create Project" body="Group a frontend, API, databases, domains, and logs." icon={Layers3} onClick={openCreateProject} />
                          <ActionCard title="Add Database" body="Create Postgres/Redis or save an external URL." icon={Database} onClick={() => openGlobalTab("database")} />
                          <ActionCard title="Add Domain" body="Route a custom domain through Caddy HTTPS." icon={Globe2} onClick={() => openGlobalTab("domains")} />
                        </div>
                      </div>
                      <ServerSnapshot status={status} vpsIp={vpsIp} dataDir={state?.dataDir || ""} />
                    </div>
                  </Panel>

                  <div className="grid gap-5 xl:grid-cols-[1fr_0.95fr]">
                    <Panel title="Recent Deployments" icon={Activity}>
                      {allDeployments.length ? (
                        <DeploymentList deployments={allDeployments} apps={allApps} onLogs={loadDeploymentLogs} onDelete={deleteDeploymentEvent} />
                      ) : (
                        <EmptyState title="No deployments yet" body="Deploy your first app from a public Git repo, Docker image, or Compose stack." actionLabel="Deploy App" onAction={() => startGlobalDeployment()} icon={PackagePlus} />
                      )}
                    </Panel>
                    <Panel title="Running Services" icon={Boxes}>
                      {runningApps.length ? (
                        <AppGrid apps={runningApps.slice(0, 6)} projects={allProjects} databases={allDatabases} vpsIp={vpsIp} onLogs={loadLogs} onStop={stop} onAction={appAction} onPreview={regeneratePreview} onEdit={editGitDeployment} onOpen={openService} />
                      ) : (
                        <EmptyState title="No running services" body="Deploy an app, then restart, redeploy, preview, and inspect logs from here." actionLabel="Deploy App" onAction={() => startGlobalDeployment()} icon={Play} />
                      )}
                    </Panel>
                  </div>

                  <Panel title="Projects Overview" icon={Layers3}>
                    {allProjects.length ? (
                      <ProjectCards projects={allProjects.slice(0, 6)} apps={allApps} databases={allDatabases} deployments={allDeployments} vpsIp={vpsIp} onOpen={openProject} onDeploy={(projectId) => startDeployment("git", projectId)} />
                    ) : (
                      <EmptyState title="No projects yet" body="Create one project to hold your app services, env vars, databases, domains, and deployment history." actionLabel="Create Project" onAction={openCreateProject} icon={Layers3} />
                    )}
                  </Panel>
                </div>
              )}

              {tab === "git" && (
                <div className="space-y-5">
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <Panel title="Connect GitHub" icon={Github}>
                      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                        <div className="grid gap-4">
                          <div className="rounded-md border border-action/50 bg-action/10 p-4">
                            <p className="text-sm font-black text-ink">Recommended: guided GitHub App setup</p>
                            <p className="mt-1 text-sm text-zinc-400">
                              Dockio creates a private GitHub App with read-only repository access, then you choose which repositories it can deploy.
                            </p>
                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                              <Field label="Dockio public URL" value={githubManifestForm.publicDockioUrl || state?.settings.publicDockioUrl || ""} onChange={(publicDockioUrl) => setGithubManifestForm({ ...githubManifestForm, publicDockioUrl })} placeholder={safeBrowserOrigin() || "http://SERVER_IP:3099"} />
                              <Field label="GitHub App name" value={githubManifestForm.name} onChange={(name) => setGithubManifestForm({ ...githubManifestForm, name })} />
                              <Field label="Organization optional" value={githubManifestForm.owner} onChange={(owner) => setGithubManifestForm({ ...githubManifestForm, owner })} placeholder="leave blank for personal account" />
                            </div>
                            {isWildcardPanelUrl(githubManifestForm.publicDockioUrl || state?.settings.publicDockioUrl || "") && (
                              <p className="mt-3 rounded-md border border-red-900/70 bg-red-950/20 p-3 text-xs text-red-100">
                                Use the real server IP or domain, for example http://94.130.177.226:3099. GitHub cannot redirect a browser to 0.0.0.0.
                              </p>
                            )}
                            {(githubManifestForm.publicDockioUrl || state?.settings.publicDockioUrl || "").startsWith("http://") && (
                              <p className="mt-3 rounded-md border border-yellow-900/70 bg-yellow-950/20 p-3 text-xs text-yellow-100">
                                HTTP is okay for a quick private test. Use HTTPS before relying on webhooks or exposing the panel publicly.
                              </p>
                            )}
                            <div className="mt-4 flex flex-wrap items-center gap-2">
                              <button className="dio-button-primary" onClick={() => void startGitHubManifestConnection()} disabled={Boolean(busy)}>
                                <Github size={16} />
                                Connect GitHub
                              </button>
                              <span className="text-xs text-zinc-500">GitHub will ask where to install the App and which repositories to allow.</span>
                            </div>
                          </div>

                          <details className="rounded-md border border-line bg-panel p-4">
                            <summary className="cursor-pointer text-sm font-bold text-ink">Manual GitHub App setup fallback</summary>
                            <div className="mt-4 grid gap-3">
                              <div className="grid gap-3 md:grid-cols-2">
                                <Field label="Connection name" value={githubConnectionForm.name} onChange={(name) => setGithubConnectionForm({ ...githubConnectionForm, name })} />
                                <Field label="GitHub App ID" value={githubConnectionForm.appId} onChange={(appId) => setGithubConnectionForm({ ...githubConnectionForm, appId })} placeholder="123456" />
                                <Field label="Client ID optional" value={githubConnectionForm.clientId} onChange={(clientId) => setGithubConnectionForm({ ...githubConnectionForm, clientId })} placeholder="Iv1..." />
                                <Field label="App slug optional" value={githubConnectionForm.appSlug} onChange={(appSlug) => setGithubConnectionForm({ ...githubConnectionForm, appSlug })} placeholder="dockio-panel" />
                                <Field label="App URL optional" value={githubConnectionForm.appUrl} onChange={(appUrl) => setGithubConnectionForm({ ...githubConnectionForm, appUrl })} placeholder="https://github.com/apps/your-app" />
                                <Field label="Install URL optional" value={githubConnectionForm.installUrl} onChange={(installUrl) => setGithubConnectionForm({ ...githubConnectionForm, installUrl })} placeholder="https://github.com/apps/your-app/installations/new" />
                              </div>
                              <Field label="Public Dockio URL for webhooks" value={githubConnectionForm.publicDockioUrl || state?.settings.publicDockioUrl || ""} onChange={(publicDockioUrl) => setGithubConnectionForm({ ...githubConnectionForm, publicDockioUrl })} placeholder="https://panel.example.com" />
                              <TextArea label="Private key PEM" value={githubConnectionForm.privateKey} onChange={(privateKey) => setGithubConnectionForm({ ...githubConnectionForm, privateKey })} placeholder={"-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"} />
                              <div className="grid gap-3 md:grid-cols-2">
                                <Field label="Webhook secret" value={githubConnectionForm.webhookSecret} onChange={(webhookSecret) => setGithubConnectionForm({ ...githubConnectionForm, webhookSecret })} placeholder="long random secret" />
                                <Field label="Client secret optional" value={githubConnectionForm.clientSecret} onChange={(clientSecret) => setGithubConnectionForm({ ...githubConnectionForm, clientSecret })} type="password" />
                              </div>
                              <button className="dio-button w-fit" onClick={() => void saveGitHubConnection()} disabled={Boolean(busy) || !githubConnectionForm.appId.trim() || !githubConnectionForm.privateKey.trim() || !githubConnectionForm.webhookSecret.trim()}>
                                <KeyRound size={16} />
                                Save Manual App
                              </button>
                            </div>
                          </details>
                        </div>
                        <div className="grid content-start gap-3">
                          <Info title="What Dockio requests" body="Repository contents read-only and metadata read-only. Push events are used only when you enable auto-deploy for a service." />
                          <Info title="Webhook URL" body={webhookUrl || "Set the Dockio public URL above to generate the webhook endpoint."} />
                          {webhookUrl && (
                            <button className="dio-button w-fit" onClick={() => void navigator.clipboard?.writeText(webhookUrl)}>
                              <Copy size={14} />
                              Copy Webhook URL
                            </button>
                          )}
                          <Info title="Security" body="Private keys, webhook secrets, and optional client secrets are encrypted locally. Clone tokens are short-lived and passed through temporary askpass files." />
                        </div>
                      </div>
                    </Panel>
                    <Panel title="Connected GitHub" icon={Github}>
                      <div className="grid gap-3">
                        {gitConnections.length === 0 && <p className="text-sm text-zinc-500">No GitHub App connection yet. Use Connect GitHub above, then install it on selected repositories.</p>}
                        {gitConnections.map((connection) => (
                          <div key={connection.id} className="rounded-md border border-line bg-panel p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-bold text-ink">{connection.name}</p>
                                <p className="text-xs text-zinc-500">App ID {connection.appId} - {connection.status}</p>
                                <p className="text-xs text-zinc-600">Secrets configured: {connection.privateKeyConfigured && connection.webhookSecretConfigured ? "yes" : "needs setup"}</p>
                                {connection.errorMessage && <p className="mt-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-2 text-xs text-yellow-100">{connection.errorMessage}</p>}
                              </div>
                              <StatusPill ok={connection.status === "connected"} label={connection.status} />
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button className="dio-button" onClick={() => setGithubForm((form) => ({ ...form, connectionId: connection.id }))}>Select</button>
                              {connection.installUrl && (
                                <a className="dio-button" href={connection.installUrl} target="_blank" rel="noreferrer">
                                  <ExternalLink size={14} />
                                  Install App
                                </a>
                              )}
                              {connection.appUrl && (
                                <a className="dio-button" href={connection.appUrl} target="_blank" rel="noreferrer">
                                  <Settings size={14} />
                                  Configure
                                </a>
                              )}
                              <button className="dio-button" onClick={() => void syncGitHubInstallations(connection.id)} disabled={Boolean(busy)}>
                                <RefreshCw size={14} />
                                Refresh Installations
                              </button>
                              <button className="dio-button-danger" onClick={() => void disconnectGitHub(connection.id)} disabled={Boolean(busy)}>
                                <Trash2 size={14} />
                                Disconnect
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Panel>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
                    <Panel title="Installations" icon={Layers3}>
                      <div className="grid gap-2">
                        {gitInstallations.length === 0 && <p className="text-sm text-zinc-500">No installations synced yet. Use Install App on the connected GitHub card, select repositories, then click Refresh Installations.</p>}
                        {gitInstallations.filter((installation) => !selectedGitConnection || installation.providerConnectionId === selectedGitConnection.id).map((installation) => (
                          <button key={installation.id} className={`rounded-md border p-3 text-left ${githubForm.installationId === installation.id ? "border-action bg-action/10" : "border-line bg-panel"}`} onClick={() => setGithubForm((form) => ({ ...form, installationId: installation.id, repositoryId: "" }))}>
                            <p className="font-bold text-ink">{installation.accountLogin}</p>
                            <p className="text-xs text-zinc-500">{installation.accountType} - repositories {installation.repositorySelection || "selected"}</p>
                            <p className="text-xs text-zinc-600">Last sync {installation.lastSyncedAt ? new Date(installation.lastSyncedAt).toLocaleString() : "never"}</p>
                            {installation.errorMessage && <p className="mt-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-2 text-xs text-yellow-100">{installation.errorMessage}</p>}
                          </button>
                        ))}
                        {selectedGitInstallation && (
                          <button className="dio-button-primary mt-2" onClick={() => void syncGitHubRepositories(selectedGitInstallation.id)} disabled={Boolean(busy)}>
                            <RefreshCw size={14} />
                            Refresh Repositories
                          </button>
                        )}
                      </div>
                    </Panel>
                    <Panel title="Repositories" icon={GitBranch}>
                      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center">
                        <input className="dio-input md:max-w-md" value={githubForm.repoSearch} onChange={(event) => setGithubForm({ ...githubForm, repoSearch: event.target.value })} placeholder="Search repositories..." />
                        <span className="dio-badge">{filteredGitRepositories.length} shown</span>
                      </div>
                      <div className="grid gap-3 lg:grid-cols-2">
                        {filteredGitRepositories.length === 0 && <p className="text-sm text-zinc-500">No repositories synced yet, or none match the search.</p>}
                        {filteredGitRepositories.map((repo) => (
                          <article key={repo.id} className="rounded-md border border-line bg-panel p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-bold text-ink">{repo.fullName}</p>
                                <p className="text-xs text-zinc-500">{repo.private ? "private" : "public"} - default branch {repo.defaultBranch}</p>
                                {repo.archived || repo.disabled ? <p className="mt-1 text-xs text-yellow-300">Archived or disabled repositories cannot deploy.</p> : null}
                              </div>
                              <span className="dio-badge">{repo.private ? "private" : "public"}</span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <a className="dio-button" href={repo.htmlUrl} target="_blank" rel="noreferrer">
                                <ExternalLink size={14} />
                                GitHub
                              </a>
                              <button className="dio-button" onClick={() => void loadGitHubBranches(repo.id)} disabled={Boolean(busy) || repo.archived || repo.disabled}>
                                <GitBranch size={14} />
                                Branches
                              </button>
                              <button
                                className="dio-button-primary"
                                onClick={() => {
                                  const installation = gitInstallations.find((item) => item.id === repo.installationId);
                                  setGithubForm((form) => ({ ...form, installationId: installation?.id || form.installationId, repositoryId: repo.id }));
                                  setGitForm((form) => ({ ...form, repoUrl: repo.cloneUrl, branch: repo.defaultBranch || "main", name: repo.name }));
                                  startGlobalDeployment("github");
                                }}
                                disabled={repo.archived || repo.disabled}
                              >
                                <PackagePlus size={14} />
                                Deploy
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </Panel>
                  </div>

                  <Panel title="Webhook Health" icon={Shield}>
                    <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
                      <div className="grid gap-2">
                        <Info title="Public URL" body={state?.settings.publicDockioUrl || "Not configured. Manual deploy works; auto-deploy needs a public HTTPS panel URL."} />
                        <Info title="Webhook URL" body={webhookUrl || "Configure public Dockio URL in Git or Settings."} />
                      </div>
                      <div className="grid max-h-64 gap-2 overflow-auto pr-1">
                        {gitWebhookEvents.length === 0 && <p className="text-sm text-zinc-500">No GitHub webhooks received yet.</p>}
                        {gitWebhookEvents.map((event) => (
                          <div key={event.id} className="rounded-md border border-line bg-panel p-3 text-sm">
                            <div className="flex items-start justify-between gap-3">
                              <p className="font-bold text-ink">{event.repositoryFullName || event.event}</p>
                              <StatusPill ok={event.status === "accepted"} label={event.status} />
                            </div>
                            <p className="mt-1 text-xs text-zinc-500">{event.branch || "no branch"} - {new Date(event.createdAt).toLocaleString()}</p>
                            <p className="mt-1 text-xs text-zinc-400">{event.message}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Panel>
                </div>
              )}

              {tab === "projects" && (
                projectCreateMode ? (
                  <div className="mx-auto max-w-3xl">
                    <Panel title="Create Project" icon={Layers3}>
                      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
                        <div className="grid gap-3">
                          <Field label="Project name" value={projectForm.name} onChange={(name) => setProjectForm({ ...projectForm, name })} placeholder="marketing-site" />
                          <TextArea label="Description optional" value={projectForm.description} onChange={(description) => setProjectForm({ ...projectForm, description })} placeholder="Frontend, API, database, domains, and logs for one product." />
                          <div className="flex flex-wrap gap-2">
                            <button className="dio-button-primary" onClick={() => void createProject()} disabled={Boolean(busy) || !projectForm.name.trim()}>
                              <Layers3 size={16} />
                              Create Project
                            </button>
                            <button className="dio-button" onClick={() => setProjectCreateMode(false)} disabled={Boolean(busy)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                        <div className="grid content-start gap-3">
                          <Info title="Slug preview" body={uiSlug(projectForm.name)} />
                          <Info title="Next step" body="After creation, Dockio opens the project workspace. Add a service there; you do not need to go back to the projects list." />
                        </div>
                      </div>
                    </Panel>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <input className="dio-input md:max-w-lg" value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Search projects..." />
                      <button className="dio-button-primary w-fit" onClick={openCreateProject}>
                        <Layers3 size={15} />
                        New Project
                      </button>
                    </div>
                    <ProjectCards projects={filteredProjects} apps={allApps} databases={allDatabases} deployments={allDeployments} vpsIp={vpsIp} onOpen={openProject} onDeploy={(projectId) => startDeployment("git", projectId)} />
                  </div>
                )
              )}

              {tab === "services" && (
                <Panel title="All Services" icon={Boxes}>
                  <AppGrid apps={allApps} projects={allProjects} databases={allDatabases} vpsIp={vpsIp} onLogs={loadLogs} onStop={stop} onAction={appAction} onPreview={regeneratePreview} onEdit={editGitDeployment} onOpen={openService} />
                </Panel>
              )}

              {tab === "deployments" && (
                <Panel title="Deployments" icon={Activity}>
                  <div className="mb-4 flex flex-wrap gap-2">
                    <button className="dio-button-primary" onClick={() => startGlobalDeployment("git")} disabled={Boolean(busy)}>
                      <GitBranch size={15} />
                      Deploy from Public Git
                    </button>
                    <button className="dio-button" onClick={() => startGlobalDeployment("github")} disabled={Boolean(busy)}>
                      <Github size={15} />
                      Deploy GitHub App Repo
                    </button>
                    <button className="dio-button" onClick={() => startGlobalDeployment("image")} disabled={Boolean(busy)}>
                      <Boxes size={15} />
                      Deploy Docker Image
                    </button>
                    <button className="dio-button" onClick={() => startGlobalDeployment("compose")} disabled={Boolean(busy)}>
                      <Layers3 size={15} />
                      Deploy Compose
                    </button>
                  </div>
                  {allDeployments.length ? (
                    <DeploymentList deployments={allDeployments} apps={allApps} onLogs={loadDeploymentLogs} onDelete={deleteDeploymentEvent} />
                  ) : (
                    <EmptyState title="No deployments yet" body="Choose a project and deploy an app. Build logs and deployment records appear here." actionLabel="Deploy App" onAction={() => startGlobalDeployment()} icon={PackagePlus} />
                  )}
                </Panel>
              )}

              {tab === "logs" && (
                <div className="grid gap-4 xl:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
                  <Panel title="Choose Service" icon={Server}>
                    <div className="grid max-h-[calc(100vh-250px)] gap-2 overflow-auto pr-1">
                      {allApps.length === 0 && <EmptyState title="No services yet" body="Deploy an app first, then runtime logs will be available here." actionLabel="Deploy App" onAction={() => startGlobalDeployment()} icon={Terminal} />}
                      {allApps.map((app) => (
                        <button key={app.id} className={`dio-button min-w-0 justify-start ${logsAppId === app.id ? "border-action bg-action/10 text-ink" : ""}`} onClick={() => void loadLogs(app.id)}>
                          <Terminal size={14} />
                          <span className="min-w-0 truncate">{projectName(allProjects, app.projectId)} / {app.name}</span>
                        </button>
                      ))}
                    </div>
                  </Panel>
                  <Panel title="Logs" icon={Terminal}>
                    <div className="mb-3 rounded-md border border-line bg-panel p-3">
                      <p className="dio-label">Selected log stream</p>
                      <p className="mt-1 font-black text-ink">{logsContext.title}</p>
                      <p className="mt-1 text-xs text-zinc-500">{logsContext.subtitle}</p>
                    </div>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {logRefreshApp && (
                        <button className="dio-button" onClick={() => void loadLogs(logRefreshApp.id)} disabled={Boolean(busy)}>
                          <RefreshCw size={14} />
                          Refresh Logs
                        </button>
                      )}
                      <button className="dio-button" onClick={() => void navigator.clipboard?.writeText(logs)} disabled={!logs}>
                        <Copy size={14} />
                        Copy
                      </button>
                      <button className="dio-button" onClick={clearLogs} disabled={!logs}>
                        Clear
                      </button>
                    </div>
                    <pre className="dio-code h-[calc(100vh-295px)] min-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-md p-4 text-xs">{logs || "Choose a service to view runtime logs or open a deployment record to view build logs."}</pre>
                  </Panel>
                </div>
              )}

              {tab === "database" && (
                <div className="space-y-4">
                  <div className="grid gap-4 xl:grid-cols-3">
                    <Panel title="Create Postgres" icon={Database}>
                      <div className="grid gap-3">
                        <Select label="Project" value={managedDbForm.projectId} onChange={(projectId) => setManagedDbForm({ ...managedDbForm, projectId })} options={allProjects.map((project) => ({ value: project.id, label: project.name }))} />
                        <Field label="Database name" value={managedDbForm.name} onChange={(name) => setManagedDbForm({ ...managedDbForm, name })} />
                        <Field label="Env key" value={managedDbForm.envKey} onChange={(envKey) => setManagedDbForm({ ...managedDbForm, envKey })} placeholder="DATABASE_URL" />
                        <button className="dio-button-primary justify-center" onClick={() => void createManagedDatabase()} disabled={Boolean(busy) || !managedDbForm.projectId}>
                          <Database size={16} />
                          Create Postgres
                        </button>
                      </div>
                    </Panel>
                    <Panel title="Create Redis" icon={HardDrive}>
                      <div className="grid gap-3">
                        <Select label="Project" value={managedRedisForm.projectId} onChange={(projectId) => setManagedRedisForm({ ...managedRedisForm, projectId })} options={allProjects.map((project) => ({ value: project.id, label: project.name }))} />
                        <Field label="Redis name" value={managedRedisForm.name} onChange={(name) => setManagedRedisForm({ ...managedRedisForm, name })} />
                        <Field label="Env key" value={managedRedisForm.envKey} onChange={(envKey) => setManagedRedisForm({ ...managedRedisForm, envKey })} placeholder="REDIS_URL" />
                        <button className="dio-button-primary justify-center" onClick={() => void createManagedRedis()} disabled={Boolean(busy) || !managedRedisForm.projectId}>
                          <HardDrive size={16} />
                          Create Redis
                        </button>
                      </div>
                    </Panel>
                    <Panel title="External Postgres" icon={Globe2}>
                      <div className="grid gap-3">
                        <Select label="Project" value={externalDbForm.projectId} onChange={(projectId) => setExternalDbForm({ ...externalDbForm, projectId })} options={allProjects.map((project) => ({ value: project.id, label: project.name }))} />
                        <Field label="Name" value={externalDbForm.name} onChange={(name) => setExternalDbForm({ ...externalDbForm, name })} />
                        <Field label="Env key" value={externalDbForm.envKey} onChange={(envKey) => setExternalDbForm({ ...externalDbForm, envKey })} placeholder="DATABASE_URL" />
                        <TextArea label="Postgres URL" value={externalDbForm.url} onChange={(url) => setExternalDbForm({ ...externalDbForm, url })} placeholder="postgres://user:password@host:5432/db?sslmode=require" />
                        <button className="dio-button-primary justify-center" onClick={() => void createExternalDatabase()} disabled={Boolean(busy) || !externalDbForm.projectId || !externalDbForm.url.trim()}>
                          <KeyRound size={16} />
                          Save External DB
                        </button>
                      </div>
                    </Panel>
                  </div>
                  <Panel title="Database Resources" icon={Database}>
                    <DatabaseGrid databases={allDatabases} projects={allProjects} apps={allApps} onAction={databaseAction} onAttach={attachDatabase} onDelete={deleteDatabaseResource} />
                  </Panel>
                </div>
              )}

              {tab === "domains" && (
                <div className="space-y-4">
                  <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
                    <Panel title="Add Domain" icon={Globe2}>
                      <div className="grid gap-3">
                        <label className="grid gap-1">
                          <span className="dio-label">Service</span>
                          <select className="dio-input" value={domainForm.appId} onChange={(event) => setDomainForm({ ...domainForm, appId: event.target.value })}>
                            <option value="">Select service</option>
                            {allApps.map((app) => (
                              <option key={app.id} value={app.id}>{projectName(allProjects, app.projectId)} / {app.name}</option>
                            ))}
                          </select>
                        </label>
                        <Field label="Domain" value={domainForm.domain} onChange={(domain) => setDomainForm({ ...domainForm, domain })} placeholder="app.example.com" />
                        <button className="dio-button-primary justify-center" onClick={() => void configureAppDomain()} disabled={!domainForm.appId || !domainForm.domain || Boolean(busy)}>
                          <Globe2 size={16} />
                          Configure Caddy
                        </button>
                      </div>
                    </Panel>
                    <Panel title="DNS Requirement" icon={Shield}>
                      <div className="space-y-3 text-sm text-zinc-400">
                        <p>Point the domain to this VPS public IP, then configure Caddy. Caddy requests HTTPS automatically when DNS resolves.</p>
                        <pre className="dio-code overflow-auto rounded-md p-3 text-xs">{`A     ${domainForm.domain || "app.example.com"} -> ${vpsIp || "YOUR_VPS_PUBLIC_IP"}\nAAAA  optional if this VPS has IPv6`}</pre>
                      </div>
                    </Panel>
                  </div>
                  <Panel title="Domains & Preview URLs" icon={Globe2}>
                    <DomainGrid apps={allApps} projects={allProjects} vpsIp={vpsIp} onOpen={openService} onPreview={regeneratePreview} />
                  </Panel>
                </div>
              )}

              {tab === "advanced" && (
                <div className="space-y-4">
                  <Panel title="Firewall" icon={Shield}>
                    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
                      <pre className="dio-code max-h-96 overflow-auto rounded-md p-3 text-xs">{commandOutputText(status?.ufw) || "UFW status is not available yet. Click Refresh after install."}</pre>
                      <div className="grid content-start gap-3">
                        <Info title="Safe default" body="Keep 80/443 public for apps. Restrict the panel port to your IP, VPN, or Tailscale CIDR whenever possible." />
                        <button className="dio-button" onClick={() => void refresh()} disabled={Boolean(busy)}>
                          <RefreshCw size={16} />
                          Refresh Firewall
                        </button>
                      </div>
                    </div>
                  </Panel>
                  <div className="grid gap-4 xl:grid-cols-2">
                    <Panel title="Apply Baseline" icon={Shield}>
                      <div className="grid gap-3">
                        <Field label="Panel port" value={firewallForm.panelPort} onChange={(panelPort) => setFirewallForm({ ...firewallForm, panelPort })} />
                        <Field label="Trusted CIDR" value={firewallForm.trustedCidr} onChange={(trustedCidr) => setFirewallForm({ ...firewallForm, trustedCidr })} placeholder="100.64.0.0/10 or your IP/32" />
                        <button className="dio-button-primary w-fit" onClick={() => void applyFirewall()} disabled={Boolean(busy)}>
                          <Flame size={16} />
                          Apply Baseline
                        </button>
                      </div>
                    </Panel>
                    <Panel title="Expose or Block Port" icon={Flame}>
                      <div className="grid gap-3">
                        <div className="grid gap-3 md:grid-cols-3">
                          <Select label="Action" value={firewallRuleForm.action} onChange={(action) => setFirewallRuleForm({ ...firewallRuleForm, action: action as "allow" | "deny" })} options={[{ value: "allow", label: "Allow" }, { value: "deny", label: "Deny" }]} />
                          <Field label="Port" value={firewallRuleForm.port} onChange={(port) => setFirewallRuleForm({ ...firewallRuleForm, port })} placeholder="8080" />
                          <Select label="Protocol" value={firewallRuleForm.protocol} onChange={(protocol) => setFirewallRuleForm({ ...firewallRuleForm, protocol: protocol as "tcp" | "udp" })} options={[{ value: "tcp", label: "TCP" }, { value: "udp", label: "UDP" }]} />
                        </div>
                        <Field label="Source CIDR optional" value={firewallRuleForm.sourceCidr} onChange={(sourceCidr) => setFirewallRuleForm({ ...firewallRuleForm, sourceCidr })} placeholder="100.64.0.0/10 or blank for public" />
                        <button className={firewallRuleForm.action === "deny" ? "dio-button-danger w-fit" : "dio-button-primary w-fit"} onClick={() => void applyFirewallRule()} disabled={Boolean(busy)}>
                          <Flame size={16} />
                          Apply Rule
                        </button>
                        <div className="border-t border-line pt-3">
                          <Field label="Delete numbered UFW rule" value={firewallDeleteForm.ruleNumber} onChange={(ruleNumber) => setFirewallDeleteForm({ ...firewallDeleteForm, ruleNumber })} placeholder="Run UFW status, then enter the number" />
                          <button className="dio-button-danger mt-3 w-fit" onClick={() => void deleteFirewallRule()} disabled={Boolean(busy) || !firewallDeleteForm.ruleNumber.trim()}>
                            <Trash2 size={16} />
                            Delete Rule
                          </button>
                        </div>
                      </div>
                    </Panel>
                  </div>
                  <Panel title="Preview Domain Settings" icon={Eye}>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <Select label="Preview mode" value={previewSettingsForm.previewDomainMode} onChange={(previewDomainMode) => setPreviewSettingsForm({ ...previewSettingsForm, previewDomainMode: previewDomainMode as PreviewDomainMode })} options={[{ value: "sslip", label: "sslip.io zero-config" }, { value: "custom", label: "Custom wildcard domain" }, { value: "disabled", label: "Disabled" }]} />
                      <Field label="Public server IPv4" value={previewSettingsForm.publicServerIp || ""} onChange={(publicServerIp) => setPreviewSettingsForm({ ...previewSettingsForm, publicServerIp })} placeholder={vpsIp || "95.217.10.20"} />
                      <Field label="Custom preview base domain" value={previewSettingsForm.previewBaseDomain || ""} onChange={(previewBaseDomain) => setPreviewSettingsForm({ ...previewSettingsForm, previewBaseDomain })} placeholder="preview.example.com" />
                      <button className="dio-button-primary self-end" onClick={() => void savePreviewSettings()} disabled={Boolean(busy)}>
                        <Wrench size={16} />
                        Save Preview
                      </button>
                    </div>
                  </Panel>
                </div>
              )}

              {tab === "docker" && (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-3">
                    <Metric label="Docker" value={isOk(status?.docker) ? 1 : 0} detail={outputLabel(status?.docker)} icon={HardDrive} />
                    <Metric label="Managed containers" value={allApps.filter((app) => app.containerName || app.composeProject).length + allDatabases.filter((database) => database.dockerContainer).length} detail="Dockio-labelled runtime resources" icon={Boxes} />
                    <Metric label="Data dir" value={1} detail={state?.dataDir || "-"} icon={HardDrive} />
                  </div>
                  <Panel title="Managed Docker Resources" icon={Boxes}>
                    <DockerResourceGrid apps={allApps} databases={allDatabases} projects={allProjects} />
                  </Panel>
                  <Panel title="Cleanup" icon={Trash2}>
                    <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                      <p className="text-sm text-zinc-400">Prune unused Docker images and stopped containers. Running services and databases are not intentionally stopped by this action.</p>
                      <button className="dio-button-danger" onClick={() => void pruneSystem()} disabled={Boolean(busy)}>
                        <Trash2 size={16} />
                        Docker Prune
                      </button>
                    </div>
                  </Panel>
                </div>
              )}

              {tab === "monitoring" && (
                <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
                  <ServerSnapshot status={status} vpsIp={vpsIp} dataDir={state?.dataDir || ""} />
                  <Panel title="Raw Server Status" icon={Activity}>
                    <pre className="dio-code max-h-[620px] overflow-auto rounded-md p-4 text-xs">{JSON.stringify(status, null, 2)}</pre>
                  </Panel>
                </div>
              )}

              {tab === "settings" && (
                <div className="space-y-4">
                  <div className="grid gap-4 xl:grid-cols-2">
                    <Panel title="Panel Runtime" icon={Settings}>
                      <div className="grid gap-3">
                        <Info title="Product" body="Dockio self-hosted VPS dashboard" />
                        <Info title="Data directory" body={state?.dataDir || "Not loaded yet"} />
                        <Info title="Signed in as" body={auth.user?.email || "Unknown"} />
                        <Info title="Public IP" body={vpsIp || "Detecting"} />
                      </div>
                    </Panel>
                    <Panel title="Security Defaults" icon={Shield}>
                      <div className="grid gap-3">
                        <Info title="Panel auth" body="Admin login, CSRF checks, rate limits, secure headers, and same-origin checks are enabled." />
                        <Info title="Public panel" body="If port 3099 is public, restrict it by firewall to your IP, VPN, or Tailscale CIDR." />
                        <Info title="App ingress" body="Production apps should use Caddy on 80/443. Debug preview ports are explicit and optional." />
                        <Info title="Secrets" body="Env values and database URLs are not exposed in normal dashboard state responses." />
                      </div>
                    </Panel>
                  </div>
                  <Panel title="Preview URL Defaults" icon={Eye}>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <Select label="Preview mode" value={previewSettingsForm.previewDomainMode} onChange={(previewDomainMode) => setPreviewSettingsForm({ ...previewSettingsForm, previewDomainMode: previewDomainMode as PreviewDomainMode })} options={[{ value: "sslip", label: "sslip.io zero-config" }, { value: "custom", label: "Custom wildcard domain" }, { value: "disabled", label: "Disabled" }]} />
                      <Field label="Public server IPv4" value={previewSettingsForm.publicServerIp || ""} onChange={(publicServerIp) => setPreviewSettingsForm({ ...previewSettingsForm, publicServerIp })} placeholder={vpsIp || "95.217.10.20"} />
                      <Field label="Custom preview base domain" value={previewSettingsForm.previewBaseDomain || ""} onChange={(previewBaseDomain) => setPreviewSettingsForm({ ...previewSettingsForm, previewBaseDomain })} placeholder="preview.example.com" />
                      <button className="dio-button-primary self-end" onClick={() => void savePreviewSettings()} disabled={Boolean(busy)}>
                        <Wrench size={16} />
                        Save Preview
                      </button>
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

  return (
    <main className="min-h-screen bg-[#050505] text-zinc-100">
      <div className="grid min-h-screen lg:grid-cols-[240px_1fr]">
        <aside className="overflow-x-hidden border-b border-line bg-[#050505] p-3 lg:border-b-0 lg:border-r">
          <Brand compact />
          <button className="dio-button mt-5 w-full justify-start" onClick={() => showAllProjects()}>
            <Home size={15} />
            Projects Home
          </button>
          <div className="mt-5 rounded-md border border-line bg-panel p-3">
            <p className="dio-label">Current project</p>
            <p className="mt-2 truncate font-black text-ink">{currentProject.name}</p>
            <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{currentProject.description || "Services, deploys, env, domains, storage."}</p>
          </div>
          {selectedService && (
            <button className="dio-button mt-3 w-full justify-start" onClick={() => { setSelectedServiceId(""); setTab("services"); }}>
              <ArrowLeft size={15} />
              Back to Project
            </button>
          )}
          <nav className="mt-5 grid gap-4" aria-label={selectedService ? "Service navigation" : "Project navigation"}>
            <SidebarGroup title={selectedService ? "Service" : "Project"}>
              {currentTabs.filter((item) => ["general", "services", "deployments", "logs", "monitoring"].includes(item.id)).map((item) => (
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
              <p className="dio-label">Services</p>
              <div className="mt-2 grid gap-1">
                {apps.slice(0, 6).map((app) => (
                  <button key={app.id} className="w-full min-w-0 rounded-md px-3 py-2 text-left text-sm font-bold text-zinc-400 hover:bg-panel hover:text-ink" onClick={() => openService(app)}>
                    <span className="block max-w-full truncate">{app.name}</span>
                    <span className="block max-w-full truncate text-xs font-medium text-zinc-600">{app.serviceRole || "fullstack"} - {app.status}</span>
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
                    ? `${selectedService.serviceRole || "fullstack"} service - ${selectedService.sourceType || selectedService.source || selectedService.strategy} - ${selectedService.slug}`
                    : currentProject.description || "Project workspace for services, deploys, env, storage, domains, logs, firewall, and rollbacks."}
                </p>
                {selectedService && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusPill ok={selectedService.status === "running"} label={selectedService.status} />
                    <span className="dio-badge">{selectedService.serviceRole || "fullstack"}</span>
                    <span className="dio-badge">{selectedService.deployMode || selectedService.strategy}</span>
                    {selectedService.previewDomainStatus && <span className="dio-badge">preview {selectedService.previewDomainStatus}</span>}
                    {selectedService.portBind === "public" && <span className="dio-badge">public preview</span>}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedService ? (
                  <>
                    {(selectedService.domain || activePreviewUrl) && (
                      <a className="dio-button-primary" href={selectedService.domain ? `https://${selectedService.domain}` : activePreviewUrl} target="_blank" rel="noreferrer">
                        <ExternalLink size={15} />
                        Open URL
                      </a>
                    )}
                    {!activePreviewUrl && selectedService.status === "running" && (
                      <button className="dio-button-primary" onClick={() => void regeneratePreview(selectedService.id)} disabled={Boolean(busy)}>
                        <RefreshCw size={15} />
                        {selectedService.previewDomainStatus === "error" ? "Fix Preview" : "Generate Preview URL"}
                      </button>
                    )}
                    <button className="dio-button" onClick={() => void appAction(selectedService.id, "redeploy")} disabled={Boolean(busy) || !(selectedService.source || selectedService.sourceType === "docker-image")}>
                      <RefreshCw size={15} />
                      Redeploy
                    </button>
                    <button className="dio-button" onClick={() => void appAction(selectedService.id, selectedService.status === "running" ? "restart" : "start")} disabled={Boolean(busy)}>
                      <RotateCcw size={15} />
                      {selectedService.status === "running" ? "Restart" : "Start"}
                    </button>
                  </>
                ) : (
                  <>
                    <button className="dio-button-primary" onClick={() => startDeployment()} disabled={Boolean(busy)}>
                      <PackagePlus size={15} />
                      Create Service
                    </button>
                    <button className="dio-button" onClick={() => setTab("database")} disabled={Boolean(busy)}>
                      <Database size={15} />
                      Create Database
                    </button>
                  </>
                )}
                {(activeApp?.domain || activePreviewUrl) && (
                  !selectedService && <a className="dio-button" href={activeApp?.domain ? `https://${activeApp.domain}` : activePreviewUrl} target="_blank" rel="noreferrer">
                    <Globe2 size={15} />
                    {activeApp?.domain ? "Visit" : "Preview"}
                  </a>
                )}
                <button className="dio-button" onClick={() => void refresh()} disabled={Boolean(busy)}>
                  <RefreshCw size={15} />
                  Refresh
                </button>
                <button className="dio-button" onClick={() => void logout()}>
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
                  <button className="dio-button-primary" onClick={() => void appAction(selectedService.id, "redeploy")} disabled={Boolean(busy) || !(selectedService.source || selectedService.sourceType === "docker-image")}>
                    <Play size={15} />
                    Redeploy
                  </button>
                  <button className="dio-button" onClick={() => isGitManagedService(selectedService) ? editGitDeployment(selectedService) : setNotice("Edit settings are currently available for Git services.")}>
                    <Wrench size={15} />
                    Edit Build Settings
                  </button>
                  <button className="dio-button" onClick={() => void appAction(selectedService.id, "restart")} disabled={Boolean(busy)}>
                    <RotateCcw size={15} />
                    Restart
                  </button>
                  <button className="dio-button" onClick={() => selectedService.status === "running" ? void stop(selectedService.id) : void appAction(selectedService.id, "start")} disabled={Boolean(busy)}>
                    <Square size={15} />
                    {selectedService.status === "running" ? "Stop" : "Start"}
                  </button>
                  <button className="dio-button" onClick={() => void loadLogs(selectedService.id)} disabled={Boolean(busy)}>
                    <Terminal size={15} />
                    Logs
                  </button>
                </div>
                {selectedService.sourceType === "github-app" ? (
                  <AutoDeployCard
                    app={selectedService}
                    webhookUrl={webhookUrl}
                    publicDockioUrl={state?.settings.publicDockioUrl || ""}
                    busy={busy}
                    onToggle={saveAutoDeploy}
                  />
                ) : (
                  <Info title="Manual deploy" body="Use Redeploy when you want latest source. Connect a GitHub App on the Git page to enable verified push-to-deploy for a service." />
                )}
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
                <UrlCard
                  title="Auto preview domain"
                  url={previewUrl(selectedService, vpsIp)}
                  help={previewHelp(selectedService)}
                  actionLabel={selectedService.previewDomainStatus === "error" ? "Fix Preview" : "Generate Preview URL"}
                  onAction={() => void regeneratePreview(selectedService.id)}
                  actionDisabled={Boolean(busy) || selectedService.status !== "running"}
                />
                <UrlCard title="Domain" url={selectedService.domain ? `https://${selectedService.domain}` : ""} help="Production URL through Caddy on ports 80/443." />
                <Info title="Internal route" body={selectedService.localProxyPort || selectedService.port ? `127.0.0.1:${selectedService.localProxyPort || selectedService.port} -> :${selectedService.internalPort || selectedService.containerPort || selectedService.port}` : "No runtime port"} />
              </div>
              {(selectedService.previewDomainError || selectedService.previewCaddyReloadStatus || selectedService.previewCaddyFile || previewPortUrl(selectedService, vpsIp)) && (
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {selectedService.previewDomainError && (
                    <div className="rounded-md border border-yellow-900 bg-yellow-950/30 p-3 text-sm text-yellow-100 md:col-span-2">
                      <p className="font-bold">Preview domain error</p>
                      <p className="mt-1 break-words text-yellow-200/80">{selectedService.previewDomainError}</p>
                    </div>
                  )}
                  <Info title="Caddy reload" body={selectedService.previewCaddyReloadStatus || "not run"} />
                  <Info title="Caddy file" body={selectedService.previewCaddyFile || "not written"} />
                  <Info title="Public debug port" body={previewPortUrl(selectedService, vpsIp) || "disabled"} />
                  <Info title="Caddy import" body={previewImportMessage(status)} />
                </div>
              )}
            </Panel>
          </div>
        )}

        {tab === "general" && !selectedService && (
          <div className="space-y-4">
            {createdProjectId === currentProject.id && apps.length === 0 && (
              <Panel title="Project Created" icon={CheckCircle2}>
                <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <p className="font-black text-ink">{currentProject.name} is ready.</p>
                    <p className="mt-1 text-sm text-zinc-400">Next, add the first service. The deploy wizard will stay inside this project and come back here with the preview link when it is done.</p>
                  </div>
                  <button className="dio-button-primary w-fit" onClick={() => startDeployment("git", currentProject.id)}>
                    <PackagePlus size={15} />
                    Add First Service
                  </button>
                </div>
              </Panel>
            )}

            {projectPreviewItems.length > 0 && (
              <Panel title="Previews" icon={Globe2}>
                <ProjectPreviewLinks items={projectPreviewItems} onOpen={openService} />
              </Panel>
            )}

            <Panel title="Project Actions" icon={Play}>
              <div className="flex flex-wrap items-center gap-2">
                <button className="dio-button-primary" onClick={() => startDeployment()} disabled={Boolean(busy)}>
                  <PackagePlus size={15} />
                  Create Service
                </button>
                <button className="dio-button" onClick={() => setTab("database")} disabled={Boolean(busy)}>
                  <Database size={15} />
                  Create Database
                </button>
                <button className="dio-button" onClick={() => void refresh()} disabled={Boolean(busy)}>
                  <RefreshCw size={15} />
                  Reload
                </button>
                {activeApp && (
                  <>
                    <button className="dio-button" onClick={() => void appAction(activeApp.id, "redeploy")} disabled={Boolean(busy) || !(activeApp.source || activeApp.sourceType === "docker-image")}>
                      <Wrench size={15} />
                      Rebuild
                    </button>
                    <button className="dio-button" onClick={() => void appAction(activeApp.id, "restart")} disabled={Boolean(busy)}>
                      <RotateCcw size={15} />
                      Restart
                    </button>
                    <button className="dio-button" onClick={() => void loadLogs(activeApp.id)} disabled={Boolean(busy)}>
                      <Terminal size={15} />
                      Logs
                    </button>
                    {isGitManagedService(activeApp) && (
                      <button className="dio-button" onClick={() => editGitDeployment(activeApp)} disabled={Boolean(busy)}>
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
                        <p className="dio-label">Primary service</p>
                        <h2 className="mt-2 truncate text-xl font-black text-ink">{activeApp.name}</h2>
                        <p className="mt-1 text-sm text-zinc-500">
                          {activeApp.serviceRole || "fullstack"} - {activeApp.strategy} - {activeApp.source || "manual"}
                        </p>
                      </div>
                      <StatusPill ok={activeApp.status === "running"} label={activeApp.status} />
                    </div>
                    <div className="mt-4 grid gap-2 text-sm text-zinc-400">
                      <p>Source: {activeApp.repoUrl ? `${activeApp.repoUrl} @ ${activeApp.branch || "main"}` : activeApp.source || activeApp.sourceType || "manual"}</p>
                      <p>Route: {activeApp.domain ? activeApp.domain : activePreviewUrl || `127.0.0.1:${activeApp.localProxyPort || activeApp.port}`}</p>
                      <p>Database: {activeApp.databaseId ? databaseName(databases, activeApp.databaseId) : "No database bound"}</p>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button className="dio-button-primary" onClick={() => startDeployment()}>
                        <Play size={15} />
                        Deploy
                      </button>
                      <button className="dio-button" onClick={() => void appAction(activeApp.id, "health")}>
                        <HeartPulse size={15} />
                        Health
                      </button>
                      <button className="dio-button" onClick={() => void loadLogs(activeApp.id)}>
                        <Terminal size={15} />
                        Logs
                      </button>
                      {activeApp.source && (
                        <button className="dio-button" onClick={() => void appAction(activeApp.id, "redeploy")}>
                          <GitBranch size={15} />
                          Redeploy
                        </button>
                      )}
                      {isGitManagedService(activeApp) && (
                        <button className="dio-button" onClick={() => editGitDeployment(activeApp)}>
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
                        <button className="dio-button" onClick={() => setTab("environment")}>
                          <KeyRound size={14} />
                          Env
                        </button>
                        <button className="dio-button" onClick={() => setTab("database")}>
                          <Database size={14} />
                          Storage
                        </button>
                        <button className="dio-button" onClick={() => setTab("domains")}>
                          <Globe2 size={14} />
                          Domains
                        </button>
                        <button className="dio-button" onClick={() => setTab("advanced")}>
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
                      <button className="dio-button-primary" onClick={() => startDeployment("git", currentProject.id)}>
                        <Play size={15} />
                        Deploy Service
                      </button>
                      <button className="dio-button" onClick={() => setTab("environment")}>
                        <KeyRound size={15} />
                        Prepare Env
                      </button>
                      <button className="dio-button" onClick={() => setTab("database")}>
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
              <AppGrid apps={apps} projects={projects} databases={databases} vpsIp={vpsIp} onLogs={loadLogs} onStop={stop} onAction={appAction} onPreview={regeneratePreview} onEdit={editGitDeployment} onOpen={openService} />
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
                  <button className="dio-button w-fit" onClick={applyCorsPreset}>
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
                    <span className="dio-label">App</span>
                    <select
                      className="dio-input"
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
                  <button className="dio-button-primary w-fit" onClick={() => void saveAppSettings()} disabled={Boolean(busy) || !appSettingsForm.appId}>
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
                    <span className="dio-label">Service</span>
                    <select className="dio-input" value={appEnvForm.appId} onChange={(event) => setAppEnvForm({ ...appEnvForm, appId: event.target.value })}>
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
                  <button className="dio-button-primary w-fit" onClick={() => void saveAppEnvironment()} disabled={Boolean(busy) || !appEnvForm.appId || !appEnvForm.envText.trim()}>
                    <KeyRound size={15} />
                    Save Env
                  </button>
                </div>
                <div className="grid content-start gap-3">
                  <Info title="Secrets stay server-side" body="Values are written to this VPS data directory and only env key names are shown in the dashboard state." />
                  <Field label="Delete one env key" value={appEnvForm.deleteKey} onChange={(deleteKey) => setAppEnvForm({ ...appEnvForm, deleteKey })} placeholder="JWT_SECRET" />
                  <button className="dio-button-danger w-fit" onClick={() => void deleteAppEnvKey()} disabled={Boolean(busy) || !appEnvForm.appId || !appEnvForm.deleteKey.trim()}>
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
                      <span className="dio-badge">{app.serviceRole || "fullstack"}</span>
                      <span className="dio-badge">{projectName(projects, app.projectId)}</span>
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
                  <button className="dio-button-primary w-fit" onClick={() => void createManagedDatabase()} disabled={Boolean(busy)}>
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
                  <button className="dio-button-primary w-fit" onClick={() => void createManagedRedis()} disabled={Boolean(busy)}>
                    <HardDrive size={16} />
                    Create Redis
                  </button>
                  <Info title="Internal network" body="Redis joins the Dockio Docker network and is injected into services as REDIS_URL when attached." />
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
                  <button className="dio-button-primary w-fit" onClick={() => void createExternalDatabase()} disabled={Boolean(busy) || !externalDbForm.url.trim()}>
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
                <button className="dio-button-primary w-fit" onClick={() => void appAction(selectedService.id, "health")} disabled={Boolean(busy)}>
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
              <pre className="dio-code max-h-[520px] overflow-auto rounded-md p-4 text-xs">{JSON.stringify(status, null, 2)}</pre>
            </Panel>
          </div>
        )}

        {tab === "logs" && (
          <div className="grid gap-4 xl:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
            <Panel title="Services" icon={Server}>
              <div className="grid max-h-[calc(100vh-250px)] gap-2 overflow-auto pr-1">
                {visibleApps.length === 0 && <p className="text-sm text-zinc-500">Deploy an app first, then logs appear here.</p>}
                {visibleApps.map((app) => (
                  <button key={app.id} className={`dio-button min-w-0 justify-start ${logsAppId === app.id ? "border-action bg-action/10 text-ink" : ""}`} onClick={() => void loadLogs(app.id)}>
                    <Terminal size={14} />
                    <span className="min-w-0">
                      <span className="block truncate">{app.name}</span>
                      <span className="block truncate text-xs font-medium text-zinc-500">{currentProject.name} - {app.serviceRole || "fullstack"} - {app.status}</span>
                    </span>
                  </button>
                ))}
              </div>
            </Panel>
            <Panel title="Runtime Logs" icon={Terminal}>
              <div className="mb-3 rounded-md border border-line bg-panel p-3">
                <p className="dio-label">Selected log stream</p>
                <p className="mt-1 font-black text-ink">{logsContext.title}</p>
                <p className="mt-1 text-xs text-zinc-500">{logsContext.subtitle}</p>
              </div>
              <div className="mb-3 flex flex-wrap gap-2">
                {logRefreshApp && (
                  <button className="dio-button" onClick={() => void loadLogs(logRefreshApp.id)} disabled={Boolean(busy)}>
                    <RefreshCw size={14} />
                    Refresh Logs
                  </button>
                )}
                <button className="dio-button" onClick={() => void navigator.clipboard?.writeText(logs)} disabled={!logs}>
                  <Copy size={14} />
                  Copy
                </button>
                <button className="dio-button" onClick={clearLogs} disabled={!logs}>
                  Clear
                </button>
              </div>
              <pre className="dio-code h-[calc(100vh-295px)] min-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-md p-4 text-xs">{logs || (selectedService ? "Loading recent logs for this service..." : "Select a service to load recent logs.")}</pre>
            </Panel>
          </div>
        )}

        {tab === "deployments" && selectedService && (
          <div className="space-y-4">
            <Panel title="Service Deployments" icon={Activity}>
              <div className="mb-4 flex flex-wrap gap-2">
                <button className="dio-button-primary" onClick={() => void appAction(selectedService.id, "redeploy")} disabled={Boolean(busy) || !(selectedService.source || selectedService.sourceType === "docker-image")}>
                  <RefreshCw size={15} />
                  Redeploy Latest
                </button>
                {isGitManagedService(selectedService) && (
                  <button className="dio-button" onClick={() => editGitDeployment(selectedService)} disabled={Boolean(busy)}>
                    <Wrench size={15} />
                    Edit Source & Build
                  </button>
                )}
                <button className="dio-button" onClick={() => void loadLogs(selectedService.id)} disabled={Boolean(busy)}>
                  <Terminal size={15} />
                  Runtime Logs
                </button>
              </div>
              <DeploymentList deployments={visibleDeployments} apps={apps} onLogs={loadDeploymentLogs} onDelete={deleteDeploymentEvent} />
              {selectedService.sourceType === "github-app" && (
                <div className="mt-4">
                  <AutoDeployCard
                    app={selectedService}
                    webhookUrl={webhookUrl}
                    publicDockioUrl={state?.settings.publicDockioUrl || ""}
                    busy={busy}
                    onToggle={saveAutoDeploy}
                  />
                </div>
              )}
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
                    { id: "git" as DeployProvider, title: "Public Git URL", body: "Deploy a public Git repository with Node, Next, Vite, static, or Dockerfile settings.", icon: GitBranch },
                    { id: "github" as DeployProvider, title: "GitHub App", body: "Deploy a selected public or private repository from a connected GitHub App.", icon: Github },
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
                    <button className="dio-button-primary w-fit" onClick={() => void detectGitStack()} disabled={Boolean(busy) || !gitForm.repoUrl.trim()}>
                      <Activity size={16} />
                      Detect Stack
                    </button>
                  </div>
                  <Info title="What happens next" body="Detection clones the repo temporarily, finds deployable services, and fills build/start/port/health defaults. You confirm before deploy." />
                </div>
              )}

              {deployStep === "details" && deployProvider === "github" && (
                <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
                  <div className="grid gap-3">
                    {gitConnections.length === 0 ? (
                      <div className="rounded-md border border-yellow-900/70 bg-yellow-950/20 p-4 text-sm text-yellow-100">
                        <p className="font-bold">GitHub App is not connected yet.</p>
                        <p className="mt-1 text-yellow-200/80">Open Git, click Connect GitHub, install the App on your repositories, then come back here to pick repo and branch.</p>
                        <button className="dio-button mt-3" onClick={() => openGlobalTab("git")}>Connect GitHub</button>
                      </div>
                    ) : (
                      <>
                        <div className="grid gap-3 md:grid-cols-2">
                          <Select label="Connection" value={githubForm.connectionId} onChange={(connectionId) => setGithubForm({ ...githubForm, connectionId, installationId: "", repositoryId: "" })} options={gitConnections.map((connection) => ({ value: connection.id, label: `${connection.name} (${connection.status})` }))} />
                          <Select label="Installation / account" value={githubForm.installationId} onChange={(installationId) => setGithubForm({ ...githubForm, installationId, repositoryId: "" })} options={gitInstallations.filter((installation) => !githubForm.connectionId || installation.providerConnectionId === githubForm.connectionId).map((installation) => ({ value: installation.id, label: installation.accountLogin }))} />
                        </div>
                        {githubForm.installationId && (
                          <button className="dio-button w-fit" onClick={() => void syncGitHubRepositories(githubForm.installationId)} disabled={Boolean(busy)}>
                            <RefreshCw size={14} />
                            Refresh Repositories
                          </button>
                        )}
                        <input className="dio-input" value={githubForm.repoSearch} onChange={(event) => setGithubForm({ ...githubForm, repoSearch: event.target.value })} placeholder="Search synced repositories..." />
                        <div className="grid max-h-64 gap-2 overflow-auto pr-1">
                          {filteredGitRepositories.map((repo) => (
                            <button
                              key={repo.id}
                              className={`rounded-md border p-3 text-left ${githubForm.repositoryId === repo.id ? "border-action bg-action/10" : "border-line bg-panel"}`}
                              onClick={() => {
                                setGithubForm({ ...githubForm, repositoryId: repo.id });
                                setGitForm({ ...gitForm, repoUrl: repo.cloneUrl, branch: repo.defaultBranch, name: gitForm.name === "Git App" ? repo.name : gitForm.name });
                              }}
                              disabled={repo.archived || repo.disabled}
                            >
                              <p className="truncate font-bold text-ink">{repo.fullName}</p>
                              <p className="text-xs text-zinc-500">{repo.private ? "private" : "public"} - default {repo.defaultBranch}</p>
                            </button>
                          ))}
                          {filteredGitRepositories.length === 0 && <p className="text-sm text-zinc-500">No repositories. Refresh repositories on the Git page or above.</p>}
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <Field label="App name" value={gitForm.name} onChange={(name) => setGitForm({ ...gitForm, name })} />
                          <Select label="Service role" value={gitForm.serviceRole} onChange={(serviceRole) => setGitForm({ ...gitForm, serviceRole: serviceRole as ServiceRole })} options={roleOptions()} />
                          <label className="grid gap-1">
                            <span className="dio-label">Branch</span>
                            <input className="dio-input" list="github-branches" value={gitForm.branch} onChange={(event) => setGitForm({ ...gitForm, branch: event.target.value })} />
                            <datalist id="github-branches">
                              {githubForm.branches.map((branch) => <option key={branch.name} value={branch.name} />)}
                            </datalist>
                          </label>
                          <Field label="Root directory optional" value={gitForm.appDirectory} onChange={(appDirectory) => { setGitForm({ ...gitForm, appDirectory }); setRepoAnalysis(null); }} placeholder="apps/web or blank" />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button className="dio-button" onClick={() => void loadGitHubBranches()} disabled={Boolean(busy) || !githubForm.repositoryId}>
                            <GitBranch size={14} />
                            Load Branches
                          </button>
                          <button className="dio-button-primary" onClick={() => void detectGitHubStack()} disabled={Boolean(busy) || !githubForm.repositoryId}>
                            <Activity size={16} />
                            Detect Stack
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="grid content-start gap-3">
                    <Info title="Selected repository" body={selectedGitRepository ? `${selectedGitRepository.fullName} (${selectedGitRepository.private ? "private" : "public"})` : "Choose a synced GitHub repository."} />
                    <Info title="Private clone" body="Dockio generates a short-lived installation token during deploy and feeds it to Git through a temporary askpass helper." />
                  </div>
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

              {deployStep === "build" && (deployProvider === "git" || deployProvider === "github") && (
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
                      <button className={`dio-tab ${gitForm.mode === "node" ? "dio-tab-active" : ""}`} onClick={() => setGitForm({ ...gitForm, mode: "node" })}>Generated Dockerfile</button>
                      <button className={`dio-tab ${gitForm.mode === "dockerfile" ? "dio-tab-active" : ""}`} onClick={() => setGitForm({ ...gitForm, mode: "dockerfile" })}>Repo Dockerfile</button>
                      <button className={`dio-tab ${gitForm.mode === "static" ? "dio-tab-active" : ""}`} onClick={() => setGitForm({ ...gitForm, mode: "static" })}>Static build</button>
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
                    {(deployProvider === "git" || deployProvider === "github") && (
                      <>
                        <Select label="Database" value={gitForm.databaseId} onChange={(databaseId) => setGitForm({ ...gitForm, databaseId })} options={[{ value: "", label: "No database" }, ...databases.map((database) => ({ value: database.id, label: `${database.name} (${database.envKey})` }))]} />
                        <TextArea label="Environment variables" value={gitForm.envText} onChange={(envText) => setGitForm({ ...gitForm, envText })} placeholder={"DATABASE_URL=...\nJWT_SECRET=..."} />
                        <label className="flex items-start gap-3 rounded-md border border-line bg-[#050505] p-3 text-sm text-zinc-300">
                          <input className="mt-1" type="checkbox" checked={gitForm.previewDomainEnabled} onChange={(event) => setGitForm({ ...gitForm, previewDomainEnabled: event.target.checked })} />
                          <span><span className="block font-bold text-ink">Create auto preview domain</span><span className="mt-1 block text-xs text-zinc-500">Recommended. Dockio creates an sslip.io or custom wildcard hostname through Caddy on 80/443.</span></span>
                        </label>
                        <label className="flex items-start gap-3 rounded-md border border-line bg-[#050505] p-3 text-sm text-zinc-300">
                          <input className="mt-1" type="checkbox" checked={gitForm.publicPreview} onChange={(event) => setGitForm({ ...gitForm, publicPreview: event.target.checked })} />
                          <span><span className="block font-bold text-ink">Also open public debug port</span><span className="mt-1 block text-xs text-zinc-500">Fallback only. This opens a generated high port in UFW; leave off for Caddy/domain-only access.</span></span>
                        </label>
                        {deployProvider === "github" && (
                          <label className="flex items-start gap-3 rounded-md border border-line bg-[#050505] p-3 text-sm text-zinc-300">
                            <input className="mt-1" type="checkbox" checked={githubForm.autoDeployEnabled} onChange={(event) => setGithubForm({ ...githubForm, autoDeployEnabled: event.target.checked })} />
                            <span><span className="block font-bold text-ink">Auto-deploy on push</span><span className="mt-1 block text-xs text-zinc-500">Requires a public HTTPS Dockio URL configured in Git settings and the GitHub App push webhook.</span></span>
                          </label>
                        )}
                      </>
                    )}
                    {deployProvider === "image" && (
                      <>
                        <TextArea label="Image env" value={imageForm.envText} onChange={(envText) => setImageForm({ ...imageForm, envText })} />
                        <label className="flex items-start gap-3 rounded-md border border-line bg-[#050505] p-3 text-sm text-zinc-300">
                          <input className="mt-1" type="checkbox" checked={imageForm.previewDomainEnabled} onChange={(event) => setImageForm({ ...imageForm, previewDomainEnabled: event.target.checked })} />
                          <span><span className="block font-bold text-ink">Create auto preview domain</span><span className="mt-1 block text-xs text-zinc-500">Routes through Caddy to the private localhost service port.</span></span>
                        </label>
                        <label className="flex items-start gap-3 rounded-md border border-line bg-[#050505] p-3 text-sm text-zinc-300">
                          <input className="mt-1" type="checkbox" checked={imageForm.publicPreview} onChange={(event) => setImageForm({ ...imageForm, publicPreview: event.target.checked })} />
                          <span><span className="block font-bold text-ink">Also open public debug port</span><span className="mt-1 block text-xs text-zinc-500">Useful for smoke tests only. The panel opens the generated port in UFW.</span></span>
                        </label>
                      </>
                    )}
                    {deployProvider === "compose" && <TextArea label="Compose .env" value={composeForm.envText} onChange={(envText) => setComposeForm({ ...composeForm, envText })} />}
                    {deployProvider === "compose-yaml" && <TextArea label="Compose .env" value={composeYamlForm.envText} onChange={(envText) => setComposeYamlForm({ ...composeYamlForm, envText })} />}
                  </div>
                  <div className="space-y-3">
                    <Info title="Project" body={`Deploying into ${currentProject.name}. Other projects are hidden while you work here.`} />
                    <Info title="Routing" body="Auto preview domains and custom domains go through Caddy on 80/443. Public debug ports are optional." />
                    <button
                      className="dio-button-primary w-full justify-center"
                      onClick={() => {
                        if (deployProvider === "git") void deployGit();
                        if (deployProvider === "github") void deployGitHub();
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
                <button className="dio-button" onClick={() => setDeployStep(previousDeployStep(deployStep, deployProvider))} disabled={deployStep === "source" || Boolean(busy)}>Back</button>
                {deployStep !== "runtime" && (
                  <button className="dio-button-primary" onClick={() => setDeployStep(nextDeployStep(deployStep, deployProvider))} disabled={Boolean(busy) || !canContinueDeploy(deployStep, deployProvider, gitForm, githubForm, imageForm, composeForm, composeYamlForm)}>
                    Continue
                  </button>
                )}
                {editingAppId && (
                  <button className="dio-button" onClick={() => { setEditingAppId(""); setRepoAnalysis(null); setSelectedDetectionId(""); }} disabled={Boolean(busy)}>
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

        {tab === "domains" && (
          <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
            <Panel title="Add Domain" icon={Globe2}>
              <div className="grid gap-3">
                <label className="grid gap-1">
                  <span className="dio-label">App</span>
                  <select className="dio-input" value={domainForm.appId} onChange={(event) => setDomainForm({ ...domainForm, appId: event.target.value })}>
                    <option value="">Select app</option>
                    {visibleApps.map((app) => (
                      <option key={app.id} value={app.id}>
                        {app.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Field label="Domain" value={domainForm.domain} onChange={(domain) => setDomainForm({ ...domainForm, domain })} placeholder="app.example.com" />
                <button className="dio-button-primary" onClick={() => void configureAppDomain()} disabled={!domainForm.appId || !domainForm.domain || Boolean(busy)}>
                  <Globe2 size={16} />
                  Configure Caddy
                </button>
              </div>
            </Panel>
            <Panel title="DNS Requirement" icon={Shield}>
              <div className="space-y-3 text-sm text-zinc-400">
                <p>Point domains to this VPS public IP, then configure Caddy here. Caddy will request HTTPS certificates automatically.</p>
                <pre className="dio-code overflow-auto rounded-md p-3 text-xs">{`A     ${domainForm.domain || "app.example.com"} -> ${vpsIp || "YOUR_VPS_PUBLIC_IP"}\nAAAA  optional if this VPS has IPv6`}</pre>
                {selectedDomainApp && <Info title="Selected app" body={`${selectedDomainApp.name} via ${selectedDomainApp.strategy}${selectedDomainApp.localProxyPort || selectedDomainApp.port ? ` on 127.0.0.1:${selectedDomainApp.localProxyPort || selectedDomainApp.port}` : ""}`} />}
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
                <Info title="Root directory" body={selectedService.rootDir || "Managed by Dockio"} />
                <Info title="Public exposure" body={selectedService.previewDomainHostname ? `Caddy preview ${selectedService.previewDomainHostname}` : selectedService.publicPreview ? `Public debug port ${selectedService.publicPreviewPort || selectedService.port}` : selectedService.domain ? "Public only through Caddy domain" : "No public route configured"} />
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
                <button className="dio-button-danger" onClick={() => void appAction(selectedService.id, "delete")} disabled={Boolean(busy)}>
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
                <pre className="dio-code max-h-80 overflow-auto rounded-md p-3 text-xs">{commandOutputText(status?.ufw) || "UFW status is not available yet. Click Refresh after install."}</pre>
                <div className="space-y-3 text-sm text-zinc-400">
                  <Info title="Real VPS firewall" body="These actions call UFW on this server through a restricted sudoers allowlist installed by Dockio." />
                  <button className="dio-button w-full justify-center" onClick={() => void refresh()} disabled={Boolean(busy)}>
                    <RefreshCw size={16} />
                    Refresh Status
                  </button>
                </div>
              </div>
            </Panel>
            <Panel title="Auto Preview Domains" icon={Globe2}>
              <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
                <div className="grid gap-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Select
                      label="Preview mode"
                      value={previewSettingsForm.previewDomainMode}
                      onChange={(previewDomainMode) => setPreviewSettingsForm({ ...previewSettingsForm, previewDomainMode: previewDomainMode as PreviewDomainMode })}
                      options={[
                        { value: "sslip", label: "sslip.io zero-config" },
                        { value: "custom", label: "Custom wildcard domain" },
                        { value: "disabled", label: "Disabled" }
                      ]}
                    />
                    <Field label="Public server IPv4" value={previewSettingsForm.publicServerIp || ""} onChange={(publicServerIp) => setPreviewSettingsForm({ ...previewSettingsForm, publicServerIp })} placeholder={vpsIp || "95.217.10.20"} />
                    <Field label="Custom preview base domain" value={previewSettingsForm.previewBaseDomain || ""} onChange={(previewBaseDomain) => setPreviewSettingsForm({ ...previewSettingsForm, previewBaseDomain })} placeholder="preview.example.com" />
                    <label className="flex items-start gap-3 rounded-md border border-line bg-[#050505] p-3 text-sm text-zinc-300">
                      <input className="mt-1" type="checkbox" checked={previewSettingsForm.autoPreviewDomainsEnabled} onChange={(event) => setPreviewSettingsForm({ ...previewSettingsForm, autoPreviewDomainsEnabled: event.target.checked })} />
                      <span><span className="block font-bold text-ink">Enable by default for new services</span><span className="mt-1 block text-xs text-zinc-500">Each Git/Image deploy gets a Caddy preview hostname unless disabled in the deploy wizard.</span></span>
                    </label>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Local proxy port start" value={String(previewSettingsForm.localProxyPortRangeStart)} onChange={(value) => setPreviewSettingsForm({ ...previewSettingsForm, localProxyPortRangeStart: Number(value) || 31000 })} />
                    <Field label="Local proxy port end" value={String(previewSettingsForm.localProxyPortRangeEnd)} onChange={(value) => setPreviewSettingsForm({ ...previewSettingsForm, localProxyPortRangeEnd: Number(value) || 39999 })} />
                    <Field label="Caddy sites directory" value={previewSettingsForm.caddySitesDir} onChange={(caddySitesDir) => setPreviewSettingsForm({ ...previewSettingsForm, caddySitesDir })} />
                    <Field label="Caddy main config" value={previewSettingsForm.caddyMainConfig} onChange={(caddyMainConfig) => setPreviewSettingsForm({ ...previewSettingsForm, caddyMainConfig })} />
                  </div>
                  <button className="dio-button-primary w-fit" onClick={() => void savePreviewSettings()} disabled={Boolean(busy)}>
                    <Wrench size={16} />
                    Save Preview Settings
                  </button>
                </div>
                <div className="grid content-start gap-3">
                  <Info title="Hostname format" body={previewSettingsForm.previewDomainMode === "custom" ? "service-project-id.preview.example.com. Configure wildcard DNS once: *.preview.example.com -> this VPS IP." : "service-project-id.95-217-10-20.sslip.io. No DNS setup needed when the public IPv4 is correct."} />
                  <Info title="Caddy import" body={previewImportMessage(status)} />
                  <Info title="Caddy sites dir" body={String((status?.previewDomains as { caddySitesDir?: string } | undefined)?.caddySitesDir || previewSettingsForm.caddySitesDir)} />
                </div>
              </div>
            </Panel>
            <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
              <Panel title="Firewall Baseline" icon={Shield}>
                <div className="grid gap-3">
                  <Field label="Panel port" value={firewallForm.panelPort} onChange={(panelPort) => setFirewallForm({ ...firewallForm, panelPort })} />
                  <Field label="Trusted CIDR" value={firewallForm.trustedCidr} onChange={(trustedCidr) => setFirewallForm({ ...firewallForm, trustedCidr })} placeholder="100.64.0.0/10" />
                  <button className="dio-button-primary" onClick={() => void applyFirewall()} disabled={Boolean(busy)}>
                    <Flame size={16} />
                    Apply Baseline
                  </button>
                  <button className="dio-button" onClick={() => void pruneSystem()} disabled={Boolean(busy)}>
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
                  <button className={firewallRuleForm.action === "deny" ? "dio-button-danger w-fit" : "dio-button-primary w-fit"} onClick={() => void applyFirewallRule()} disabled={Boolean(busy)}>
                    <Flame size={16} />
                    Apply Rule
                  </button>
                  <div className="border-t border-line pt-3">
                    <Field label="Delete numbered UFW rule" value={firewallDeleteForm.ruleNumber} onChange={(ruleNumber) => setFirewallDeleteForm({ ...firewallDeleteForm, ruleNumber })} placeholder="Run ufw status numbered, then enter number" />
                    <button className="dio-button-danger mt-3 w-fit" onClick={() => void deleteFirewallRule()} disabled={Boolean(busy) || !firewallDeleteForm.ruleNumber.trim()}>
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
                  <button className="dio-button-danger justify-center" onClick={() => void deleteCurrentProject()} disabled={Boolean(busy) || projectDeleteConfirm !== currentProject.slug}>
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
      <div className="flex h-11 w-11 items-center justify-center rounded-md border border-line bg-white p-1 shadow-sm shadow-action/20">
        <img src="/logo.svg" alt="Dockio" className="h-full w-full" />
      </div>
      <div>
        <p className="font-black text-ink">Dockio</p>
        <p className="text-xs text-zinc-500">Self-hosted panel</p>
      </div>
    </div>
  );
}

function GlobalSidebar({
  activeTab,
  email,
  vpsIp,
  onNavigate,
  onLogout
}: {
  activeTab: Tab;
  email: string;
  vpsIp: string;
  onNavigate: (tab: Tab) => void;
  onLogout: () => void;
}) {
  return (
    <aside className="border-b border-line bg-[#050505] p-3 lg:border-b-0 lg:border-r">
      <Brand compact />
      <nav className="mt-6 grid gap-5" aria-label="Main navigation">
        {globalSidebarGroups.map((group) => (
          <SidebarGroup key={group.title} title={group.title}>
            {group.items.map((item) => (
              <TabButton key={`${group.title}-${item.id}-${item.label}`} item={item} active={activeTab === item.id} onClick={() => onNavigate(item.id)} />
            ))}
          </SidebarGroup>
        ))}
      </nav>
      <div className="mt-6 border-t border-line pt-4 text-xs text-zinc-500">
        <p className="dio-label">Server</p>
        <p className="mt-1 break-all text-zinc-300">{vpsIp || "detecting public IP"}</p>
        <p className="dio-label mt-4">Account</p>
        <p className="mt-1 truncate text-zinc-300">{email}</p>
        <button className="dio-button mt-3 w-full justify-start" onClick={onLogout}>
          <Lock size={15} />
          Logout
        </button>
      </div>
    </aside>
  );
}

function GlobalPageHeader({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <header className="border-b border-line bg-[#050505]/95 px-4 py-4 md:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="dio-label">Dockio</p>
          <h1 className="mt-1 text-2xl font-black tracking-normal text-ink">{title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-400">{subtitle}</p>
        </div>
        {children}
      </div>
    </header>
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

function ActionCard({ title, body, icon: Icon, onClick }: { title: string; body: string; icon: LucideIcon; onClick: () => void }) {
  return (
    <button className="group min-h-32 rounded-md border border-line bg-panel p-3 text-left transition hover:border-action hover:bg-action/10" onClick={onClick}>
      <Icon className="text-action" size={18} />
      <p className="mt-3 font-black text-ink">{title}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-500">{body}</p>
    </button>
  );
}

function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
  icon: Icon
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-md border border-dashed border-line bg-[#050505] p-5 text-center">
      <Icon className="mx-auto text-action" size={22} />
      <p className="mt-3 font-black text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-xl text-sm text-zinc-500">{body}</p>
      <button className="dio-button-primary mt-4" onClick={onAction}>
        <Icon size={15} />
        {actionLabel}
      </button>
    </div>
  );
}

function ServerSnapshot({ status, vpsIp, dataDir }: { status: Record<string, unknown> | null; vpsIp: string; dataDir: string }) {
  return (
    <Panel title="Server Snapshot" icon={Server}>
      <div className="grid gap-3">
        <Info title="VPS IP" body={vpsIp || "Detecting"} />
        <Info title="Docker" body={outputLabel(status?.docker)} />
        <Info title="Caddy" body={outputLabel(status?.caddy)} />
        <Info title="Firewall" body={commandOutputText(status?.ufw) ? "UFW status available" : "Refresh to check UFW"} />
        <Info title="Preview routes" body={previewImportMessage(status)} />
        <Info title="Data directory" body={dataDir || "Not loaded yet"} />
      </div>
    </Panel>
  );
}

function DomainGrid({
  apps,
  projects,
  vpsIp,
  onOpen,
  onPreview
}: {
  apps: ManagedApp[];
  projects: ProjectRecord[];
  vpsIp: string;
  onOpen: (app: ManagedApp, tab?: Tab) => void;
  onPreview: (id: string) => Promise<void>;
}) {
  if (apps.length === 0) {
    return <p className="text-sm text-zinc-500">Deploy an app first, then add a custom domain or generate an automatic preview URL.</p>;
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {apps.map((app) => {
        const appPreview = previewUrl(app, vpsIp);
        return (
          <article key={app.id} className="rounded-md border border-line bg-panel p-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <p className="font-bold text-ink">{app.name}</p>
                <p className="text-xs text-zinc-500">{projectName(projects, app.projectId)} - {app.serviceRole || "fullstack"}</p>
                {app.domain ? <a className="mt-2 block break-all text-sm font-bold text-action" href={`https://${app.domain}`} target="_blank" rel="noreferrer">https://{app.domain}</a> : <p className="mt-2 text-sm text-zinc-500">No custom domain</p>}
                {appPreview ? <a className="mt-1 block break-all text-sm font-bold text-action" href={appPreview} target="_blank" rel="noreferrer">{appPreview}</a> : <p className="mt-1 text-sm text-zinc-500">No preview URL</p>}
              </div>
              <StatusPill ok={app.previewDomainStatus === "active" || Boolean(app.domain)} label={app.domain ? "custom" : app.previewDomainStatus || "no route"} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="dio-button" onClick={() => onOpen(app, "domains")}>
                <Settings size={14} />
                Manage
              </button>
              {appPreview ? (
                <a className="dio-button-primary" href={appPreview} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} />
                  Open Preview
                </a>
              ) : app.status === "running" ? (
                <button className="dio-button-primary" onClick={() => void onPreview(app.id)}>
                  <RefreshCw size={14} />
                  Generate Preview
                </button>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function DockerResourceGrid({ apps, databases, projects }: { apps: ManagedApp[]; databases: DatabaseResource[]; projects: ProjectRecord[] }) {
  const appResources = apps.filter((app) => app.containerName || app.composeProject || app.imageTag);
  const databaseResources = databases.filter((database) => database.dockerContainer || database.dockerVolume);
  if (appResources.length === 0 && databaseResources.length === 0) {
    return <p className="text-sm text-zinc-500">No managed Docker resources yet. Deploy a service or create a database to see containers here.</p>;
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {appResources.map((app) => (
        <article key={app.id} className="rounded-md border border-line bg-panel p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-bold text-ink">{app.name}</p>
              <p className="text-xs text-zinc-500">{projectName(projects, app.projectId)} - {app.strategy}</p>
              <p className="mt-1 break-all text-xs text-zinc-600">{app.containerName || app.composeProject || "no container name"}</p>
              {app.imageTag && <p className="mt-1 break-all text-xs text-zinc-600">image {app.imageTag}</p>}
            </div>
            <StatusPill ok={app.status === "running"} label={app.status} />
          </div>
        </article>
      ))}
      {databaseResources.map((database) => (
        <article key={database.id} className="rounded-md border border-line bg-panel p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-bold text-ink">{database.name}</p>
              <p className="text-xs text-zinc-500">{projectName(projects, database.projectId)} - {database.kind}</p>
              <p className="mt-1 break-all text-xs text-zinc-600">{database.dockerContainer || "no container"} / {database.dockerVolume || "no volume"}</p>
            </div>
            <StatusPill ok={["running", "reachable"].includes(database.status)} label={database.status} />
          </div>
        </article>
      ))}
    </div>
  );
}

function UrlCard({
  title,
  url,
  help,
  actionLabel,
  onAction,
  actionDisabled
}: {
  title: string;
  url: string;
  help: string;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
}) {
  return (
    <div className="rounded-md border border-line bg-panel p-3">
      <p className="font-black text-ink">{title}</p>
      {url ? (
        <>
          <a className="mt-2 block break-all text-sm font-bold text-action" href={url} target="_blank" rel="noreferrer">{url}</a>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="dio-button" href={url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} />
              Open
            </a>
            <button className="dio-button" onClick={() => void navigator.clipboard?.writeText(url)}>
              <Copy size={14} />
              Copy
            </button>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-zinc-500">Not configured</p>
      )}
      {actionLabel && onAction && (
        <button className="dio-button-primary mt-3" onClick={onAction} disabled={actionDisabled}>
          <RefreshCw size={14} />
          {actionLabel}
        </button>
      )}
      <p className="mt-3 text-xs text-zinc-500">{help}</p>
    </div>
  );
}

function DeploymentSteps({ active }: { active: DeployStep }) {
  const items: Array<{ id: DeployStep; label: string }> = [
    { id: "source", label: "Type" },
    { id: "details", label: "Basics" },
    { id: "details", label: "Source" },
    { id: "build", label: "Build" },
    { id: "runtime", label: "Env & Preview" },
    { id: "runtime", label: "Deploy" }
  ];
  return (
    <div className="mb-5 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
      {items.map((item, index) => (
        <div key={`${item.id}-${item.label}`} className={`rounded-md border p-3 text-sm ${active === item.id ? "border-action bg-action/10 text-ink" : "border-line bg-panel text-zinc-500"}`}>
          <span className="dio-badge mr-2">{index + 1}</span>
          {item.label}
        </div>
      ))}
    </div>
  );
}

function nextDeployStep(step: DeployStep, provider: DeployProvider): DeployStep {
  if (step === "source") return "details";
  if (step === "details") return isGitBuildProvider(provider) ? "build" : "runtime";
  if (step === "build") return "runtime";
  return "runtime";
}

function previousDeployStep(step: DeployStep, provider: DeployProvider): DeployStep {
  if (step === "runtime") return isGitBuildProvider(provider) ? "build" : "details";
  if (step === "build") return "details";
  if (step === "details") return "source";
  return "source";
}

function canContinueDeploy(
  step: DeployStep,
  provider: DeployProvider,
  gitForm: { repoUrl: string },
  githubForm: { repositoryId: string },
  imageForm: { image: string },
  composeForm: { repoUrl: string },
  composeYamlForm: { composeYaml: string }
) {
  if (step === "source") return true;
  if (step === "build") return true;
  if (provider === "git") return Boolean(gitForm.repoUrl.trim());
  if (provider === "github") return Boolean(githubForm.repositoryId.trim());
  if (provider === "image") return Boolean(imageForm.image.trim());
  if (provider === "compose") return Boolean(composeForm.repoUrl.trim());
  return Boolean(composeYamlForm.composeYaml.trim());
}

function isGitBuildProvider(provider: DeployProvider) {
  return provider === "git" || provider === "github";
}

function isGitManagedService(app?: ManagedApp) {
  if (!app) return false;
  return app.source === "git" || ["git-url", "public_git", "github-app"].includes(app.sourceType || "");
}

function safeBrowserOrigin() {
  if (typeof window === "undefined") return "";
  try {
    const url = new URL(window.location.href);
    return isWildcardHostname(url.hostname) ? "" : url.origin;
  } catch {
    return "";
  }
}

function isWildcardPanelUrl(value: string) {
  const raw = value.trim();
  if (!raw) return false;
  try {
    return isWildcardHostname(new URL(raw).hostname);
  } catch {
    return false;
  }
}

function isWildcardHostname(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "0.0.0.0" || host === "::" || host === "[::]" || host === "0:0:0:0:0:0:0:0";
}

function webhookUrlFromSettings(publicDockioUrl: string) {
  const value = publicDockioUrl.trim().replace(/\/+$/, "");
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    if (isWildcardHostname(parsed.hostname)) return "";
    return `${value}/api/webhooks/github`;
  } catch {
    return "";
  }
}

function AutoDeployCard({
  app,
  webhookUrl,
  publicDockioUrl,
  busy,
  onToggle
}: {
  app: ManagedApp;
  webhookUrl: string;
  publicDockioUrl: string;
  busy: string;
  onToggle: (app: ManagedApp, enabled: boolean) => Promise<void>;
}) {
  const enabled = Boolean(app.autoDeployEnabled);
  const publicUrlReady = Boolean(publicDockioUrl && publicDockioUrl.startsWith("https://") && webhookUrl);
  return (
    <div className="rounded-md border border-line bg-panel p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="font-black text-ink">GitHub Auto Deploy</p>
          <p className="mt-1 text-sm text-zinc-500">
            {app.repoFullName || app.repoUrl || "GitHub repository"} on branch {app.autoDeployBranch || app.branch || "main"}.
          </p>
          <div className="mt-3 grid gap-2 text-xs text-zinc-500">
            <p className="break-all">Webhook: {webhookUrl || "Configure a public Dockio URL first."}</p>
            <p>Last webhook: {app.lastWebhookAt ? `${new Date(app.lastWebhookAt).toLocaleString()} - ${app.lastWebhookStatus || "received"}` : "none received yet"}</p>
            {app.lastWebhookMessage && <p className="break-words">{app.lastWebhookMessage}</p>}
            {!publicUrlReady && <p className="text-yellow-300">Auto-deploy needs a public HTTPS Dockio URL on the Git page. Manual deploy still works.</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {webhookUrl && (
            <button className="dio-button" onClick={() => void navigator.clipboard?.writeText(webhookUrl)}>
              <Copy size={14} />
              Copy Webhook
            </button>
          )}
          <button className={enabled ? "dio-button-danger" : "dio-button-primary"} onClick={() => void onToggle(app, !enabled)} disabled={Boolean(busy) || (!enabled && !publicUrlReady)}>
            <RefreshCw size={14} />
            {enabled ? "Disable Auto Deploy" : "Enable Auto Deploy"}
          </button>
        </div>
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
        <span className="dio-badge">Public IP: {publicIp(status) || "checking"}</span>
      </div>
    </div>
  );
}

function ProjectPreviewLinks({ items, onOpen }: { items: Array<{ app: ManagedApp; url: string }>; onOpen: (app: ManagedApp, tab?: Tab) => void }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {items.map(({ app, url }) => (
        <div key={app.id} className="grid gap-3 rounded-md border border-line bg-[#171322] p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="max-w-full truncate font-black text-ink">{app.name}</p>
              <StatusPill ok={app.status === "running"} label={app.status} />
            </div>
            <a className="mt-1 block max-w-full truncate text-sm font-bold text-action hover:underline" href={url} target="_blank" rel="noreferrer">{url}</a>
          </div>
          <div className="flex flex-wrap gap-2 md:justify-end">
            <a className="dio-button-primary" href={url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} />
              Open
            </a>
            <button className="dio-button" onClick={() => onOpen(app, "general")}>
              <Settings size={14} />
              Manage
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProjectCards({
  projects,
  apps,
  databases,
  deployments,
  vpsIp,
  onOpen,
  onDeploy
}: {
  projects: ProjectRecord[];
  apps: ManagedApp[];
  databases: DatabaseResource[];
  deployments: DeploymentEvent[];
  vpsIp: string;
  onOpen: (projectId: string) => void;
  onDeploy?: (projectId: string) => void;
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
        const previewItems = projectApps
          .map((app) => ({ app, url: app.domain ? `https://${app.domain}` : previewUrl(app, vpsIp) }))
          .filter((item) => Boolean(item.url));
        const primaryPreview = previewItems[0];
        const runningCount = projectApps.filter((app) => app.status === "running").length;
        return (
          <article
            key={project.id}
            className="cursor-pointer rounded-md border border-line bg-panel p-4 text-left transition hover:border-zinc-600 hover:bg-[#161618]"
            onClick={() => onOpen(project.id)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-base font-black text-ink">{project.name}</p>
                <p className="mt-1 truncate text-sm text-zinc-500">{primaryDomain || project.description || "No domain connected yet"}</p>
              </div>
              <StatusPill ok={runningCount > 0 || projectApps.length === 0} label={projectApps.length ? `${runningCount}/${projectApps.length} running` : "new"} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="dio-badge">{projectApps.length} services</span>
              <span className="dio-badge">{projectApps.filter((app) => app.serviceRole === "frontend").length} frontend</span>
              <span className="dio-badge">{projectApps.filter((app) => app.serviceRole === "backend").length} backend</span>
              <span className="dio-badge">{projectDbs.length} db</span>
              <span className="dio-badge">slug {project.slug}</span>
            </div>
            <div className="mt-4 grid gap-1 text-xs text-zinc-500">
              {primaryPreview ? (
                <a className="block max-w-full truncate font-bold text-action hover:underline" href={primaryPreview.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                  Preview {primaryPreview.url}
                </a>
              ) : (
                <p>No preview URL yet.</p>
              )}
              {previewItems.length > 1 && <p>{previewItems.length} active preview/domain links in this project.</p>}
              <p className="line-clamp-2 break-words">{lastDeployment ? `${lastDeployment.action}: ${lastDeployment.message}` : "Open project to manage its services, storage, domains, and logs."}</p>
              <p>Created {new Date(project.createdAt).toLocaleDateString()} - Updated {new Date(project.updatedAt).toLocaleDateString()}</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="dio-button-primary" onClick={(event) => { event.stopPropagation(); onOpen(project.id); }}>
                <ExternalLink size={14} />
                Open
              </button>
              {primaryPreview && (
                <a className="dio-button" href={primaryPreview.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                  <Globe2 size={14} />
                  Preview
                </a>
              )}
              {onDeploy && (
                <button className="dio-button" onClick={(event) => { event.stopPropagation(); onDeploy(project.id); }}>
                  <PackagePlus size={14} />
                  Deploy App
                </button>
              )}
            </div>
          </article>
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
              <span className="dio-badge">{projectApps.length} services</span>
              <span className="dio-badge">{projectApps.filter((app) => app.serviceRole === "frontend").length} frontend</span>
              <span className="dio-badge">{projectApps.filter((app) => app.serviceRole === "backend").length} backend</span>
              <span className="dio-badge">{projectDbs.length} db</span>
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
  onPreview,
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
  onPreview: (id: string) => Promise<void>;
  onEdit: (app: ManagedApp) => void;
  onOpen: (app: ManagedApp) => void;
}) {
  if (apps.length === 0) return <p className="text-sm text-zinc-500">No services yet. Deploy a public Git repository from the Deployments tab.</p>;
  return (
    <div className="grid gap-3 2xl:grid-cols-2">
      {apps.map((app) => {
        const appPreview = previewUrl(app, vpsIp);
        return (
        <article key={app.id} className="rounded-md border border-line bg-panel p-3 transition hover:border-zinc-600">
          <div className="grid gap-2">
            <div className="min-w-0">
              <button className="block max-w-full truncate text-left font-bold text-ink hover:underline" onClick={() => onOpen(app)}>{app.name}</button>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusPill ok={app.status === "running"} label={app.status} />
                <span className="dio-badge">{app.serviceRole || "fullstack"}</span>
                <span className="dio-badge">{app.deployMode || app.strategy}</span>
              </div>
              <p className="mt-2 line-clamp-2 break-words text-xs text-zinc-500">
                {projectName(projects, app.projectId)} - {app.sourceType || app.source || "manual"}
                {app.localProxyPort || app.port ? ` - 127.0.0.1:${app.localProxyPort || app.port}` : ""}
                {app.internalPort || app.containerPort ? ` -> :${app.internalPort || app.containerPort}` : ""}
              </p>
              {app.repoUrl && <p className="mt-1 max-w-full truncate text-xs text-zinc-600">{app.repoUrl} {app.branch ? `@ ${app.branch}` : ""}</p>}
              {app.appDirectory && <p className="mt-1 max-w-full truncate text-xs text-zinc-600">directory {app.appDirectory}</p>}
              {app.dockerImage && <p className="mt-1 max-w-full truncate text-xs text-zinc-600">image {app.dockerImage}</p>}
              {app.commitSha && <p className="mt-1 text-xs text-zinc-600">commit {app.commitSha}</p>}
              {app.domain && <a className="mt-2 block max-w-full truncate text-xs font-bold text-action hover:underline" href={`https://${app.domain}`} target="_blank" rel="noreferrer">{app.domain}</a>}
              {appPreview && <a className="mt-1 block max-w-full truncate text-xs font-bold text-action hover:underline" href={appPreview} target="_blank" rel="noreferrer">Preview {appPreview}</a>}
              {app.previewDomainStatus === "error" && <p className="mt-2 line-clamp-3 break-words text-xs text-yellow-300">Preview error: {app.previewDomainError}</p>}
              {app.databaseId && <p className="mt-1 text-xs text-zinc-600">db {databaseName(databases, app.databaseId)}</p>}
            </div>
          </div>
          {app.lastMessage && <p className="mt-2 line-clamp-3 break-words text-xs text-zinc-500">{app.lastMessage}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="dio-button" onClick={() => void onLogs(app.id)}>
              <Terminal size={14} />
              Logs
            </button>
            {appPreview ? (
              <a className="dio-button-primary" href={appPreview} target="_blank" rel="noreferrer">
                <ExternalLink size={14} />
                Open Preview
              </a>
            ) : app.status === "running" ? (
              <button className="dio-button-primary" onClick={() => void onPreview(app.id)}>
                <RefreshCw size={14} />
                {app.previewDomainStatus === "error" ? "Fix Preview" : "Generate Preview"}
              </button>
            ) : null}
            <button className="dio-button" onClick={() => onOpen(app)}>
              <Settings size={14} />
              Manage
            </button>
            <button className="dio-button" onClick={() => void onAction(app.id, "health")}>
              <HeartPulse size={14} />
              Health
            </button>
            <button className="dio-button" onClick={() => void onAction(app.id, "start")}>
              <Play size={14} />
              Start
            </button>
            <button className="dio-button" onClick={() => void onAction(app.id, "restart")}>
              <RotateCcw size={14} />
              Restart
            </button>
            {(app.source || app.sourceType === "docker-image") && (
              <button className="dio-button" onClick={() => void onAction(app.id, "redeploy")}>
                <GitBranch size={14} />
                Redeploy
              </button>
            )}
            {isGitManagedService(app) && (
              <button className="dio-button" onClick={() => onEdit(app)}>
                <Wrench size={14} />
                Edit
              </button>
            )}
            <button className="dio-button" onClick={() => void onStop(app.id)}>
              <Square size={14} />
              Stop
            </button>
            <button className="dio-button-danger" onClick={() => void onAction(app.id, "delete")}>
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
              <span className="dio-badge">{service.serviceRole}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="dio-badge">{service.packageManager}</span>
              {service.hasDockerfile && <span className="dio-badge">Dockerfile</span>}
              {service.requiredEnv.length > 0 && <span className="dio-badge">{service.requiredEnv.length} env keys</span>}
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
          <div key={event.id} className="grid gap-3 rounded-md border border-line bg-panel p-3 text-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="min-w-0">
              <p className="truncate font-bold text-ink">{app?.name || event.appId} - {event.action}</p>
              <p className="mt-1 line-clamp-2 break-words text-zinc-400">{event.message}</p>
              <p className="text-xs text-zinc-600">
                {[event.sourceType, event.strategy, event.branch ? `branch ${event.branch}` : "", event.commitSha ? `commit ${event.commitSha}` : ""].filter(Boolean).join(" - ")}
              </p>
              <p className="text-xs text-zinc-600">
                Started {new Date(event.startedAt || event.createdAt).toLocaleString()}
                {event.finishedAt ? ` - Finished ${new Date(event.finishedAt).toLocaleString()}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <button className="dio-button" onClick={() => void onLogs(event.id)}>
                <Terminal size={14} />
                Logs
              </button>
              <button className="dio-button-danger" onClick={() => void onDelete(event.id)}>
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
            <button className="dio-button" onClick={() => void onAction(database.id, "test")}>
              <HeartPulse size={14} />
              Test
            </button>
            <button className="dio-button" onClick={() => void onAction(database.id, "connection")}>
              <KeyRound size={14} />
              Reveal URL
            </button>
            <button className="dio-button-danger" onClick={() => void onDelete(database.id, false)}>
              <Trash2 size={14} />
              Delete
            </button>
            {database.kind === "managed-postgres" && (
              <button className="dio-button-danger" onClick={() => void onDelete(database.id, true)}>
                <Trash2 size={14} />
                Delete + Volume
              </button>
            )}
          </div>
          <label className="mt-3 grid gap-1">
            <span className="dio-label">Attach to service</span>
            <select className="dio-input" value="" onChange={(event) => event.target.value && void onAttach(database.id, event.target.value)}>
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
      <span className="dio-label">{label}</span>
      <input className="dio-input" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type={type} />
    </label>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label className="grid gap-1">
      <span className="dio-label">{label}</span>
      <select className="dio-input" value={value} onChange={(event) => onChange(event.target.value)}>
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
      <span className="dio-label">{label}</span>
      <textarea className="dio-input min-h-28 resize-y font-mono text-xs" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="dio-panel p-4">
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
    <section className="dio-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="dio-label">{label}</p>
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
    <span className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[0.7rem] font-bold uppercase ${ok ? "border-emerald-900 bg-emerald-950/40 text-emerald-300" : "border-yellow-900 bg-yellow-950/40 text-yellow-300"}`}>
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
    <div className="dio-panel flex items-start gap-3 p-3">
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
      <section className="dio-panel p-5">
        <Brand />
        <p className="text-sm text-zinc-500">Loading panel...</p>
      </section>
    </main>
  );
}

async function api<T>(url: string, options: { method?: string; body?: unknown; csrfToken?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body) headers["Content-Type"] = "application/json";
  if (options.csrfToken) headers["X-Dockio-CSRF"] = options.csrfToken;
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
  if (app.previewUrl && !app.previewUrl.includes("SERVER_IP")) return app.previewUrl;
  if (app.previewDomainHostname) return `https://${app.previewDomainHostname}`;
  return previewPortUrl(app, vpsIp);
}

function previewPortUrl(app: ManagedApp, vpsIp: string) {
  if (!app.publicPreview || !(app.publicPreviewPort || app.port)) return "";
  if (app.previewUrl && app.previewUrl.startsWith("http://") && !app.previewUrl.includes("SERVER_IP")) return app.previewUrl;
  const host = vpsIp || "SERVER_IP";
  return `http://${host}:${app.publicPreviewPort || app.port}`;
}

function previewHelp(app: ManagedApp) {
  if (app.previewDomainStatus === "active") return "Generated Caddy hostname on ports 80/443. Caddy handles HTTPS automatically when DNS resolves.";
  if (app.previewDomainStatus === "error") return app.publicPreview ? "Generated domain failed, but a public debug port fallback is available." : "Generated domain failed. The service page shows the Caddy error and a fix action.";
  if (app.previewDomainStatus === "pending") return "Preview domain will be written during the next deploy or regenerate action.";
  if (app.publicPreview) return "Auto preview domain is disabled; this is the public debug port fallback.";
  return "Preview is disabled for this service.";
}

function previewImportMessage(status: Record<string, unknown> | null) {
  const preview = status?.previewDomains as { importConfigured?: boolean; message?: string; importLine?: string } | undefined;
  if (!preview) return "Refresh server status to check whether Caddy imports generated preview routes.";
  if (preview.importConfigured) return preview.message || "Caddy imports generated preview routes.";
  return preview.message || `Missing Caddy import: ${preview.importLine || "import /etc/caddy/dockio/sites/*.caddy"}`;
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

function describeLogsContext(projects: ProjectRecord[], apps: ManagedApp[], deployments: DeploymentEvent[], appId: string, deploymentId: string) {
  const deployment = deploymentId ? deployments.find((item) => item.id === deploymentId) : undefined;
  const app = (deployment?.appId ? apps.find((item) => item.id === deployment.appId) : undefined) || apps.find((item) => item.id === appId);
  const project = app?.projectId ? projects.find((item) => item.id === app.projectId) : undefined;
  if (deployment && app) {
    return {
      title: `${project?.name || "Unassigned"} / ${app.name}`,
      subtitle: `Deployment log - ${deployment.action} - ${deployment.status}`,
      kind: "deployment"
    };
  }
  if (app) {
    return {
      title: `${project?.name || "Unassigned"} / ${app.name}`,
      subtitle: `Runtime logs - ${app.serviceRole || "fullstack"} - ${app.status}`,
      kind: "runtime"
    };
  }
  return {
    title: "No log stream selected",
    subtitle: "Choose a service for runtime logs, or open a deployment record for build logs.",
    kind: "empty"
  };
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

function globalPageMeta(tab: Tab) {
  if (tab === "projects") return { title: "Projects", subtitle: "Apps grouped by product or workspace. Open a project to manage its services, databases, domains, and logs." };
  if (tab === "services") return { title: "Services", subtitle: "All deployed services across projects, with quick access to logs, previews, restart, redeploy, and settings." };
  if (tab === "deployments") return { title: "Deployments", subtitle: "Manual deploy history and build logs for public Git, Docker image, and Compose deployments." };
  if (tab === "logs") return { title: "Logs", subtitle: "Choose a service to view recent runtime logs or open a deployment record for build logs." };
  if (tab === "database") return { title: "Databases", subtitle: "Create managed Postgres or Redis, save external Postgres connections, and attach resources to services." };
  if (tab === "domains") return { title: "Domains", subtitle: "Manage custom domains and automatic preview URLs served by Caddy on this VPS." };
  if (tab === "advanced") return { title: "Firewall", subtitle: "Review UFW, apply a safe baseline, expose or block ports, and configure preview-domain routing." };
  if (tab === "docker") return { title: "Docker", subtitle: "Inspect Dockio-managed containers, images, database volumes, and run safe cleanup." };
  if (tab === "git") return { title: "Git", subtitle: "Connect a GitHub App, sync installations, pick repositories, and enable verified push-to-deploy." };
  if (tab === "monitoring") return { title: "Server Status", subtitle: "Docker, Caddy, firewall, preview routing, and raw VPS status checks." };
  if (tab === "settings") return { title: "Settings", subtitle: "Panel runtime, security defaults, install paths, and preview URL defaults." };
  return { title: "Dashboard", subtitle: "Manage apps, databases, domains, deployments, logs, and firewall settings on this VPS." };
}

function buildPanelRouteHash(route: {
  selectedProjectId: string;
  selectedServiceId: string;
  tab: Tab;
  deployProvider: DeployProvider;
  deployStep: DeployStep;
}) {
  const params = new URLSearchParams();
  if (route.selectedProjectId) params.set("project", route.selectedProjectId);
  if (route.selectedServiceId) params.set("service", route.selectedServiceId);
  if (route.tab !== "general") params.set("tab", route.tab);
  if (route.tab === "deployments") {
    params.set("provider", route.deployProvider);
    params.set("step", route.deployStep);
  }
  const serialized = params.toString();
  return serialized ? `#${serialized}` : "";
}

function parsePanelRouteHash(hash: string) {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  const tab = safeTab(params.get("tab"));
  return {
    projectId: cleanRouteId(params.get("project")),
    serviceId: cleanRouteId(params.get("service")),
    tab,
    deployProvider: safeDeployProvider(params.get("provider")),
    deployStep: safeDeployStep(params.get("step"))
  };
}

function normalizeRouteTab(tab: Tab | undefined, serviceSelected: boolean, projectSelected: boolean): Tab {
  if (!tab) return projectSelected ? "general" : "dashboard";
  if (!projectSelected) return globalTabs.has(tab) ? tab : "dashboard";
  const allowedTabs = serviceSelected ? serviceTabs : projectTabs;
  return allowedTabs.some((item) => item.id === tab) ? tab : "general";
}

function cleanRouteId(value: string | null) {
  if (!value) return "";
  return /^[a-zA-Z0-9_.:-]{1,120}$/.test(value) ? value : "";
}

function safeTab(value: string | null): Tab | undefined {
  return value && routeTabs.has(value as Tab) ? value as Tab : undefined;
}

function safeDeployProvider(value: string | null): DeployProvider | undefined {
  return value && deployProviders.has(value as DeployProvider) ? value as DeployProvider : undefined;
}

function safeDeployStep(value: string | null): DeployStep | undefined {
  return value && deploySteps.has(value as DeployStep) ? value as DeployStep : undefined;
}
