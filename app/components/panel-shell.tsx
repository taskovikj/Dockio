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

type Tab = "overview" | "deploy" | "domains" | "firewall" | "logs" | "audit";
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
  { id: "overview", label: "Overview", icon: Layers3 },
  { id: "deploy", label: "Deploy", icon: Play },
  { id: "domains", label: "Domains", icon: Globe2 },
  { id: "firewall", label: "Firewall", icon: Shield },
  { id: "logs", label: "Logs", icon: Terminal },
  { id: "audit", label: "Audit", icon: Activity }
];

export function PanelShell() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [state, setState] = useState<StatePayload | null>(null);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
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
      <main className="flex min-h-screen items-center justify-center p-4">
        <section className="svp-panel w-full max-w-lg p-5">
          <Brand />
          <h1 className="text-2xl font-black text-ink">{auth.setupRequired ? "Create admin account" : "Sign in"}</h1>
          <p className="mt-2 text-sm text-neutral-600">
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
              <p className="rounded-md border border-line bg-panel p-3 text-xs text-neutral-600">
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

  return (
    <main className="min-h-screen">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-line bg-white p-4 lg:block">
          <Brand />
          <nav className="grid gap-1">
            {tabs.map((item) => (
              <TabButton key={item.id} item={item} active={tab === item.id} onClick={() => setTab(item.id)} />
            ))}
          </nav>
        </aside>
        <section className="min-w-0 flex-1">
          <header className="border-b border-line bg-white/80 px-4 py-4 md:px-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="svp-label">Single VPS self-hosted panel</p>
                <h1 className="text-2xl font-black text-ink">Supavibe VPS Panel</h1>
              </div>
              <div className="flex flex-wrap gap-2">
                {tabs.map((item) => (
                  <button key={item.id} className={`svp-button lg:hidden ${tab === item.id ? "border-action text-action" : ""}`} onClick={() => setTab(item.id)}>
                    <item.icon size={15} />
                    {item.label}
                  </button>
                ))}
                <button className="svp-button" onClick={() => void refresh()} disabled={Boolean(busy)}>
                  <RefreshCw size={16} />
                  Refresh
                </button>
                <button className="svp-button" onClick={() => void logout()}>
                  <Lock size={16} />
                  Logout
                </button>
              </div>
            </div>
          </header>

          <div className="space-y-4 p-4 md:p-6">
            <SecurityBanner status={status} />
            {(notice || busy) && <Notice busy={busy} notice={notice} />}

            {tab === "overview" && (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Metric label="Apps" value={state?.apps.length ?? 0} detail="Managed by this panel" icon={Boxes} />
                  <Metric label="Docker" value={isOk(status?.docker) ? 1 : 0} detail={outputLabel(status?.docker)} icon={Database} />
                  <Metric label="Caddy" value={isActive(status?.caddy) ? 1 : 0} detail={outputLabel(status?.caddy)} icon={Globe2} />
                  <Metric label="Data" value={1} detail={state?.dataDir || "-"} icon={HardDrive} />
                </div>
                <Panel title="Managed Apps" icon={Server}>
                  <AppGrid apps={state?.apps ?? []} onLogs={loadLogs} onStop={stop} onAction={appAction} />
                </Panel>
                <Panel title="Recent Deployments" icon={Activity}>
                  <DeploymentList deployments={state?.deployments ?? []} apps={state?.apps ?? []} />
                </Panel>
              </div>
            )}

            {tab === "deploy" && (
              <div className="grid gap-4 xl:grid-cols-[440px_1fr]">
                <Panel title="Deploy From Git" icon={GitBranch}>
                  <div className="grid gap-3">
                    <Field label="App name" value={gitForm.name} onChange={(name) => setGitForm({ ...gitForm, name })} />
                    <Field label="Repository URL" value={gitForm.repoUrl} onChange={(repoUrl) => setGitForm({ ...gitForm, repoUrl })} placeholder="https://github.com/user/repo.git" />
                    <Field label="Branch" value={gitForm.branch} onChange={(branch) => setGitForm({ ...gitForm, branch })} />
                    <label className="grid gap-1">
                      <span className="svp-label">Deploy mode</span>
                      <select className="svp-input" value={gitForm.mode} onChange={(event) => setGitForm({ ...gitForm, mode: event.target.value as GitMode })}>
                        <option value="dockerfile">Use repository Dockerfile</option>
                        <option value="node">Auto Node/Next/Vite Docker</option>
                        <option value="static">Static build served by nginx/Caddy</option>
                      </select>
                    </label>
                    <div className="grid gap-3 md:grid-cols-2">
                      <Field label="Build command" value={gitForm.buildCommand} onChange={(buildCommand) => setGitForm({ ...gitForm, buildCommand })} placeholder="auto: npm run build" />
                      <Field label="Start command" value={gitForm.startCommand} onChange={(startCommand) => setGitForm({ ...gitForm, startCommand })} placeholder="auto: npm run start" />
                    </div>
                    <Field label="Container port" value={gitForm.containerPort} onChange={(containerPort) => setGitForm({ ...gitForm, containerPort })} placeholder="3000" />
                    <Field label="Health path" value={gitForm.healthPath} onChange={(healthPath) => setGitForm({ ...gitForm, healthPath })} placeholder="/" />
                    <TextArea label="Environment variables" value={gitForm.envText} onChange={(envText) => setGitForm({ ...gitForm, envText })} placeholder={"DATABASE_URL=...\nNODE_ENV=production"} />
                    <button className="svp-button-primary" onClick={() => void deployGit()} disabled={Boolean(busy) || !gitForm.repoUrl}>
                      <GitBranch size={16} />
                      Deploy Git App
                    </button>
                    <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                      Deploy only repositories you trust. Build scripts run on this VPS while creating the app image.
                    </p>
                  </div>
                </Panel>
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
                    <p className="rounded-md border border-line bg-panel p-3 text-xs text-neutral-600">
                      Samples are real deployments on this VPS. Docker binds to 127.0.0.1, systemd runs as the panel user, and public traffic should go through Caddy.
                    </p>
                  </div>
                </Panel>
                <Panel title="Advanced Deployments" icon={Layers3}>
                  <div className="grid gap-3 lg:grid-cols-2">
                    <Info title="Docker" body="Builds an image, starts a labelled container, and binds only to localhost." />
                    <Info title="No Docker" body="Creates an immutable folder and a systemd service for simple Node apps." />
                    <Info title="Static" body="Writes static assets and serves them through Caddy after domain setup." />
                    <Info title="Lifecycle controls" body="Restart, stop, redeploy, delete, health check, logs, domains, and Docker prune actions are available from the dashboard." />
                  </div>
                  <div className="mt-4 grid gap-3 border-t border-line pt-4">
                    <h3 className="font-black text-ink">Docker Compose Stack</h3>
                    <Field label="Stack name" value={composeForm.name} onChange={(name) => setComposeForm({ ...composeForm, name })} />
                    <Field label="Repository URL" value={composeForm.repoUrl} onChange={(repoUrl) => setComposeForm({ ...composeForm, repoUrl })} placeholder="https://github.com/user/compose-repo.git" />
                    <Field label="Branch" value={composeForm.branch} onChange={(branch) => setComposeForm({ ...composeForm, branch })} />
                    <TextArea label="Compose .env" value={composeForm.envText} onChange={(envText) => setComposeForm({ ...composeForm, envText })} />
                    <button className="svp-button" onClick={() => void deployCompose()} disabled={Boolean(busy) || !composeForm.repoUrl}>
                      <Boxes size={16} />
                      Deploy Compose
                    </button>
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
                        {(state?.apps ?? []).map((app) => (
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
                  <div className="space-y-3 text-sm text-neutral-700">
                    <p>Point domains to this VPS public IP, then configure Caddy here. Caddy will request HTTPS certificates automatically.</p>
                    <pre className="overflow-auto rounded-md bg-ink p-3 text-xs text-green-100">{`A     ${domainForm.domain || "app.example.com"} -> ${publicIp(status) || "YOUR_VPS_PUBLIC_IP"}\nAAAA  optional if this VPS has IPv6`}</pre>
                    {selectedDomainApp && <Info title="Selected app" body={`${selectedDomainApp.name} via ${selectedDomainApp.strategy}${selectedDomainApp.port ? ` on 127.0.0.1:${selectedDomainApp.port}` : ""}`} />}
                  </div>
                </Panel>
              </div>
            )}

            {tab === "firewall" && (
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
                <Panel title="Current Server Status" icon={Activity}>
                  <pre className="max-h-[520px] overflow-auto rounded-md bg-ink p-4 text-xs text-green-100">{JSON.stringify(status, null, 2)}</pre>
                </Panel>
              </div>
            )}

            {tab === "logs" && (
              <Panel title="Logs" icon={Terminal}>
                <pre className="min-h-96 overflow-auto rounded-md bg-ink p-4 text-xs text-green-100">{logs || "Select an app and click Logs."}</pre>
              </Panel>
            )}

            {tab === "audit" && (
              <Panel title="Audit" icon={Activity}>
                <div className="grid gap-2">
                  {(state?.audit ?? []).map((event) => (
                    <div key={event.id} className="rounded-md border border-line bg-white p-3 text-sm">
                      <p className="font-bold text-ink">{event.action}</p>
                      <p className="text-neutral-700">{event.message}</p>
                      <p className="text-xs text-neutral-500">{new Date(event.createdAt).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Brand() {
  return (
    <div className="mb-6 flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-ink text-white">
        <Server size={20} />
      </div>
      <div>
        <p className="font-black text-ink">Supavibe VPS</p>
        <p className="text-xs text-neutral-500">Self-hosted panel</p>
      </div>
    </div>
  );
}

function SecurityBanner({ status }: { status: Record<string, unknown> | null }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-black">If this port is public, keep login enabled and restrict the panel port by firewall.</p>
          <p className="mt-1">Apps should be public through Caddy on 80/443. App runtimes should stay on localhost ports.</p>
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
  if (apps.length === 0) return <p className="text-sm text-neutral-600">No apps yet. Deploy a Docker, systemd, or static sample.</p>;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {apps.map((app) => (
        <article key={app.id} className="rounded-md border border-line bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-bold text-ink">{app.name}</p>
              <p className="text-xs text-neutral-600">
                {app.deployMode || app.strategy} {app.source ? `- ${app.source}` : ""} {app.port ? `- 127.0.0.1:${app.port}` : ""}
                {app.containerPort ? ` -> :${app.containerPort}` : ""}
              </p>
              {app.repoUrl && <p className="mt-1 truncate text-xs text-neutral-500">{app.repoUrl} {app.branch ? `@ ${app.branch}` : ""}</p>}
              {app.commitSha && <p className="mt-1 text-xs text-neutral-500">commit {app.commitSha}</p>}
              {app.domain && <a className="mt-1 block break-all text-xs font-bold text-action" href={`https://${app.domain}`} target="_blank" rel="noreferrer">{app.domain}</a>}
            </div>
            <StatusPill ok={app.status === "running"} label={app.status} />
          </div>
          {app.lastMessage && <p className="mt-2 text-xs text-neutral-600">{app.lastMessage}</p>}
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
            <button className="svp-button" onClick={() => void onAction(app.id, "delete")}>
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
  if (deployments.length === 0) return <p className="text-sm text-neutral-600">No deployment events yet.</p>;
  return (
    <div className="grid gap-2">
      {deployments.slice(0, 8).map((event) => {
        const app = apps.find((item) => item.id === event.appId);
        return (
          <div key={event.id} className="flex flex-col gap-1 rounded-md border border-line bg-white p-3 text-sm md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-bold text-ink">{app?.name || event.appId} - {event.action}</p>
              <p className="text-neutral-600">{event.message}</p>
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
        <Icon className="text-action" size={18} />
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
          <p className="mt-1 break-all text-xs text-neutral-600">{detail}</p>
        </div>
        <div className="rounded-md bg-panel p-2 text-action">
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
      <p className="mt-1 text-neutral-600">{body}</p>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  const Icon = ok ? CheckCircle2 : CircleAlert;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-bold ${ok ? "border-teal-200 bg-teal-50 text-teal-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
      <Icon size={13} />
      {label}
    </span>
  );
}

function TabButton({ item, active, onClick }: { item: { id: Tab; label: string; icon: LucideIcon }; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <button className={`flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-bold ${active ? "bg-panel text-action" : "text-neutral-600 hover:bg-panel"}`} onClick={onClick}>
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
        {notice && <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">{notice}</p>}
      </div>
    </div>
  );
}

function Loading() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <section className="svp-panel p-5">
        <Brand />
        <p className="text-sm text-neutral-600">Loading panel...</p>
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
