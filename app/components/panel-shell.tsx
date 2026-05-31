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
import { useEffect, useMemo, useState } from "react";

type Tab = "general" | "environment" | "monitoring" | "logs" | "deployments" | "domains" | "advanced";
type Strategy = "docker" | "systemd" | "static" | "compose";
type GitMode = "dockerfile" | "node" | "static";

interface AuthState {
  setupRequired: boolean;
  setupTokenRequired?: boolean;
  csrfToken?: string;
  user: { email: string; name: string } | null;
}

interface ManagedApp {
  id: string;
  name: string;
  strategy: Strategy;
  port: number;
  containerPort?: number;
  status: string;
  source?: "sample" | "git" | "compose";
  repoUrl?: string;
  branch?: string;
  commitSha?: string;
  deployMode?: GitMode | "compose";
  buildCommand?: string;
  startCommand?: string;
  healthPath?: string;
  envKeys?: string[];
  domain?: string;
  serviceName?: string;
  containerName?: string;
  imageTag?: string;
  rootDir?: string;
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
  appId: string;
  action: string;
  status: string;
  message: string;
  createdAt: string;
}

interface StatePayload {
  setupRequired: boolean;
  apps: ManagedApp[];
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
  { id: "general", label: "General", icon: Layers3 },
  { id: "environment", label: "Environment", icon: KeyRound },
  { id: "monitoring", label: "Monitoring", icon: HeartPulse },
  { id: "logs", label: "Logs", icon: Terminal },
  { id: "deployments", label: "Deployments", icon: Activity },
  { id: "domains", label: "Domains", icon: Globe2 },
  { id: "advanced", label: "Advanced", icon: Wrench }
];

export function PanelShell() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [state, setState] = useState<StatePayload | null>(null);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [tab, setTab] = useState<Tab>("general");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [csrfToken, setCsrfToken] = useState("");
  const [authForm, setAuthForm] = useState({ email: "", name: "", password: "", setupCode: "" });
  const [sampleForm, setSampleForm] = useState({ name: "Hello API", strategy: "docker" as Strategy });
  const [gitForm, setGitForm] = useState({
    name: "Git App",
    repoUrl: "",
    branch: "main",
    mode: "node" as GitMode,
    buildCommand: "",
    startCommand: "",
    containerPort: "3000",
    healthPath: "/",
    envText: ""
  });
  const [composeForm, setComposeForm] = useState({ name: "Compose Stack", repoUrl: "", branch: "main", envText: "" });
  const [domainForm, setDomainForm] = useState({ appId: "", domain: "" });
  const [firewallForm, setFirewallForm] = useState({ panelPort: "3099", trustedCidr: "100.64.0.0/10" });
  const [logs, setLogs] = useState("");

  const selectedDomainApp = useMemo(() => state?.apps.find((app) => app.id === domainForm.appId), [domainForm.appId, state]);

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
    setDomainForm((form) => ({ ...form, appId: form.appId || nextState.apps[0]?.id || "" }));
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

  async function deploySample() {
    await run("Deploying sample", async () => {
      const result = await api<{ app: ManagedApp }>("/api/apps/sample", {
        method: "POST",
        csrfToken,
        body: sampleForm
      });
      setDomainForm((form) => ({ ...form, appId: result.app.id }));
      setNotice(`${result.app.name} deployed with ${result.app.strategy}.`);
      await refresh();
    });
  }

  async function deployGit() {
    await run("Deploying Git app", async () => {
      const result = await api<{ app: ManagedApp }>("/api/apps/git", {
        method: "POST",
        csrfToken,
        body: gitForm
      });
      setDomainForm((form) => ({ ...form, appId: result.app.id }));
      setNotice(`${result.app.name} deployed from ${gitForm.branch}.`);
      await refresh();
    });
  }

  async function deployCompose() {
    await run("Deploying Compose stack", async () => {
      const result = await api<{ app: ManagedApp }>("/api/apps/compose", {
        method: "POST",
        csrfToken,
        body: composeForm
      });
      setNotice(`${result.app.name} compose stack deployed.`);
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

  const apps = state?.apps ?? [];
  const deployments = state?.deployments ?? [];
  const activeApp = apps.find((app) => app.id === domainForm.appId) || apps[0];
  const vpsIp = publicIp(status);

  return (
    <main className="min-h-screen bg-[#050505] text-zinc-100">
      <header className="border-b border-line bg-[#050505]/95 px-4 py-3 md:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <Brand compact />
          <div className="flex items-center gap-2">
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

      <section className="mx-auto max-w-7xl space-y-4 px-4 py-5 md:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold text-zinc-500">Projects &gt; Supavibe VPS &gt; Server</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-normal text-ink">Supavibe VPS</h1>
              <span className="text-sm font-semibold text-zinc-500">self-hosted-panel</span>
            </div>
            <p className="mt-1 text-sm text-zinc-400">
              Manage apps, deployments, domains, firewall, logs, and runtime health on this server.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="svp-badge">
              <Server size={13} />
              {vpsIp || "IP checking"}
            </span>
            <span className="svp-badge">
              <Shield size={13} />
              Auth protected
            </span>
          </div>
        </div>

        <nav className="svp-tabbar" aria-label="Project settings">
          {tabs.map((item) => (
            <button key={item.id} className={`svp-tab ${tab === item.id ? "svp-tab-active" : ""}`} onClick={() => setTab(item.id)}>
              <item.icon size={14} />
              {item.label}
            </button>
          ))}
        </nav>

        <SecurityBanner status={status} />
        {(notice || busy) && <Notice busy={busy} notice={notice} />}

        {tab === "general" && (
          <div className="space-y-4">
            <Panel title="Deploy Settings" icon={Play}>
              <div className="flex flex-wrap items-center gap-2">
                <button className="svp-button-primary" onClick={() => void (gitForm.repoUrl ? deployGit() : deploySample())} disabled={Boolean(busy)}>
                  <Play size={15} />
                  Deploy
                </button>
                <button className="svp-button" onClick={() => void refresh()} disabled={Boolean(busy)}>
                  <RefreshCw size={15} />
                  Reload
                </button>
                <span className="svp-badge">Autodeploy off</span>
                <button className="svp-button" onClick={() => activeApp && void appAction(activeApp.id, "redeploy")} disabled={Boolean(busy) || !activeApp?.source}>
                  <Wrench size={15} />
                  Rebuild
                </button>
                <button className="svp-button" onClick={() => activeApp && void appAction(activeApp.id, "restart")} disabled={Boolean(busy) || !activeApp}>
                  <RotateCcw size={15} />
                  Start
                </button>
                <button className="svp-button" onClick={() => setNotice("Terminal access is intentionally not exposed in the web panel yet. Use logs and safe lifecycle actions here, or SSH into the VPS for shell work.")}>
                  <Terminal size={15} />
                  Open Terminal
                </button>
              </div>
            </Panel>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Metric label="Apps" value={apps.length} detail="Managed by this panel" icon={Boxes} />
              <Metric label="Docker" value={isOk(status?.docker) ? 1 : 0} detail={outputLabel(status?.docker)} icon={Database} />
              <Metric label="Caddy" value={isActive(status?.caddy) ? 1 : 0} detail={outputLabel(status?.caddy)} icon={Globe2} />
              <Metric label="Data" value={1} detail={state?.dataDir || "-"} icon={HardDrive} />
            </div>

            <Panel title="Managed Apps" icon={Server}>
              <AppGrid apps={apps} onLogs={loadLogs} onStop={stop} onAction={appAction} />
            </Panel>
          </div>
        )}

        {tab === "environment" && (
          <div className="grid gap-4 xl:grid-cols-[440px_1fr]">
            <Panel title="Environment" icon={KeyRound}>
              <div className="grid gap-3">
                <TextArea label="Deploy-time environment variables" value={gitForm.envText} onChange={(envText) => setGitForm({ ...gitForm, envText })} placeholder={"DATABASE_URL=...\nNODE_ENV=production"} />
                <p className="rounded-md border border-line bg-panel p-3 text-xs text-zinc-400">
                  Values are written into the app .env file during deployment. The dashboard state stores only variable names for safety.
                </p>
              </div>
            </Panel>
            <Panel title="Configured Keys" icon={Lock}>
              <div className="grid gap-2">
                {apps.length === 0 && <p className="text-sm text-zinc-500">No app environment keys yet.</p>}
                {apps.map((app) => (
                  <div key={app.id} className="rounded-md border border-line bg-panel p-3">
                    <p className="font-bold text-ink">{app.name}</p>
                    <p className="mt-1 text-xs text-zinc-500">{app.envKeys?.length ? app.envKeys.join(", ") : "No keys captured"}</p>
                  </div>
                ))}
              </div>
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
                    <span className="svp-tab svp-tab-active">Git</span>
                    <span className="svp-tab">Docker</span>
                    <span className="svp-tab">Compose</span>
                  </div>
                  <Field label="App name" value={gitForm.name} onChange={(name) => setGitForm({ ...gitForm, name })} />
                  <Field label="Repository URL" value={gitForm.repoUrl} onChange={(repoUrl) => setGitForm({ ...gitForm, repoUrl })} placeholder="https://github.com/user/repo.git" />
                  <Field label="Branch" value={gitForm.branch} onChange={(branch) => setGitForm({ ...gitForm, branch })} />
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
                  <button className="svp-button-primary w-fit" onClick={() => void deployGit()} disabled={Boolean(busy) || !gitForm.repoUrl}>
                    <GitBranch size={16} />
                    Deploy Git App
                  </button>
                </div>
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
              <Panel title="Sample Deployment" icon={Play}>
                <div className="grid gap-3">
                  <Field label="App name" value={sampleForm.name} onChange={(name) => setSampleForm({ ...sampleForm, name })} />
                  <label className="grid gap-1">
                    <span className="svp-label">Strategy</span>
                    <select className="svp-input" value={sampleForm.strategy} onChange={(event) => setSampleForm({ ...sampleForm, strategy: event.target.value as Strategy })}>
                      <option value="docker">Docker container</option>
                      <option value="systemd">No Docker, systemd Node service</option>
                      <option value="static">Static files, Caddy file_server</option>
                    </select>
                  </label>
                  <button className="svp-button-primary" onClick={() => void deploySample()} disabled={Boolean(busy)}>
                    <Play size={16} />
                    Deploy Sample
                  </button>
                </div>
              </Panel>

              <Panel title="Docker Compose Stack" icon={Layers3}>
                <div className="grid gap-3">
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
            </div>

            <Panel title="Recent Deployments" icon={Activity}>
              <DeploymentList deployments={deployments} apps={apps} />
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
              <Panel title="Management Surface" icon={Shield}>
                <div className="grid gap-3 lg:grid-cols-2">
                  <Info title="Docker" body="Builds images, starts labelled containers, and binds app ports only to localhost." />
                  <Info title="No Docker" body="Creates systemd Node services for simple apps without exposing raw shell commands." />
                  <Info title="Static" body="Serves generated static assets through Caddy with rollback-friendly folders." />
                  <Info title="Safety" body="No arbitrary terminal endpoint is exposed. Use SSH for shell work and this panel for structured actions." />
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
      </section>
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

function AppGrid({
  apps,
  onLogs,
  onStop,
  onAction
}: {
  apps: ManagedApp[];
  onLogs: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onAction: (id: string, action: "restart" | "redeploy" | "health" | "delete") => Promise<void>;
}) {
  if (apps.length === 0) return <p className="text-sm text-zinc-500">No apps yet. Deploy a Docker, systemd, or static sample.</p>;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {apps.map((app) => (
        <article key={app.id} className="rounded-md border border-line bg-panel p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-bold text-ink">{app.name}</p>
              <p className="text-xs text-zinc-500">
                {app.deployMode || app.strategy} {app.source ? `- ${app.source}` : ""} {app.port ? `- 127.0.0.1:${app.port}` : ""}
                {app.containerPort ? ` -> :${app.containerPort}` : ""}
              </p>
              {app.repoUrl && <p className="mt-1 truncate text-xs text-zinc-600">{app.repoUrl} {app.branch ? `@ ${app.branch}` : ""}</p>}
              {app.commitSha && <p className="mt-1 text-xs text-zinc-600">commit {app.commitSha}</p>}
              {app.domain && <a className="mt-1 block break-all text-xs font-bold text-action" href={`https://${app.domain}`} target="_blank" rel="noreferrer">{app.domain}</a>}
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
            {app.source && (
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
      ))}
    </div>
  );
}

function DeploymentList({ deployments, apps }: { deployments: DeploymentEvent[]; apps: ManagedApp[] }) {
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
            </div>
            <StatusPill ok={event.status === "succeeded"} label={event.status} />
          </div>
        );
      })}
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
