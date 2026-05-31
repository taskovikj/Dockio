import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { audit, deploymentEvent, getAppsDir, getDataDir, readState, updateState, type AppStrategy, type ManagedApp } from "./state";
import {
  assertManagedPath,
  assertSafeAppName,
  assertSafeCidr,
  assertSafeDockerName,
  assertSafeDomain,
  assertSafeGitRepo,
  assertSafeId,
  assertSafePort,
  assertSafeBranch,
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

export async function serverStatus() {
  const [hostname, osRelease, disk, docker, caddy, ufw, publicIp] = await Promise.all([
    safeRun("hostnamectl", []),
    safeRead("/etc/os-release"),
    safeRun("df", ["-h", "/"]),
    safeRun("docker", ["version", "--format", "{{.Server.Version}}"]),
    safeRun("systemctl", ["is-active", "caddy"]),
    safeRun("sudo", ["ufw", "status"]),
    fetchPublicIp()
  ]);

  return {
    time: new Date().toISOString(),
    hostname,
    osRelease,
    disk,
    memory: memoryStatus(),
    cpu: loadStatus(),
    docker,
    caddy,
    ufw,
    publicIp,
    dataDir: getDataDir(),
    node: process.version,
    platform: os.type() + " " + os.release() + " " + os.arch()
  };
}

export async function deploySampleApp(input: { name: string; strategy: AppStrategy }) {
  const name = assertSafeAppName(input.name || input.strategy + " sample");
  const id = slug(name) + "-" + crypto.randomBytes(3).toString("hex");
  const appDir = assertManagedPath(getAppsDir(), path.join(getAppsDir(), id));
  fs.mkdirSync(appDir, { recursive: true, mode: 0o750 });

  const now = new Date().toISOString();
  const app: ManagedApp = {
    id,
    name,
    strategy: input.strategy,
    port: input.strategy === "static" ? 0 : await findOpenPort(),
    status: "created",
    source: "sample",
    rootDir: appDir,
    createdAt: now,
    updatedAt: now
  };

  updateState((state) => {
    state.apps.unshift(app);
  });

  if (input.strategy === "docker") {
    await deployDockerSample(app);
  } else if (input.strategy === "systemd") {
    await deploySystemdSample(app);
  } else {
    await deployStaticSample(app);
  }

  audit("app.deploy_sample", "Sample " + input.strategy + " app deployed.", { appId: app.id, name: app.name });
  return readState().apps.find((item) => item.id === app.id) || app;
}

export async function deployGitApp(input: {
  name: string;
  repoUrl: string;
  branch?: string;
  mode: "dockerfile" | "node" | "static";
  buildCommand?: string;
  startCommand?: string;
  containerPort?: number;
  healthPath?: string;
  envText?: string;
}) {
  const name = assertSafeAppName(input.name);
  const repoUrl = assertSafeGitRepo(input.repoUrl);
  const branch = assertSafeBranch(input.branch || "main");
  const id = slug(name) + "-" + crypto.randomBytes(3).toString("hex");
  const appDir = assertManagedPath(getAppsDir(), path.join(getAppsDir(), id));
  const sourceDir = assertManagedPath(getAppsDir(), path.join(appDir, "source"));
  fs.mkdirSync(appDir, { recursive: true, mode: 0o750 });
  const now = new Date().toISOString();
  const port = await findOpenPort();
  const env = parseEnvText(input.envText || "");
  const envFile = writeEnvFile(appDir, env.env);
  const app: ManagedApp = {
    id,
    name,
    strategy: "docker",
    source: "git",
    repoUrl,
    branch,
    deployMode: input.mode,
    buildCommand: cleanCommand(input.buildCommand || ""),
    startCommand: cleanCommand(input.startCommand || ""),
    containerPort: input.mode === "static" ? 80 : assertContainerPort(input.containerPort || 3000),
    healthPath: cleanHealthPath(input.healthPath || "/"),
    envKeys: env.keys,
    port,
    status: "created",
    rootDir: appDir,
    createdAt: now,
    updatedAt: now
  };
  updateState((state) => {
    state.apps.unshift(app);
  });

  try {
    await safeRunOrThrow("git", ["clone", "--depth", "1", "--branch", branch, repoUrl, sourceDir]);
    const commit = await safeRun("git", ["rev-parse", "--short", "HEAD"], sourceDir);
    const image = "svp_" + app.id + ":" + Date.now();
    const dockerfile = prepareDockerfile(sourceDir, appDir, input.mode, app);
    await safeRunOrThrow("docker", ["build", "-t", image, "-f", dockerfile, sourceDir]);
    await replaceDockerContainer(app, image, envFile);
    markApp(app.id, {
      status: "running",
      imageTag: image,
      containerName: "svp_" + app.id,
      commitSha: commit.ok ? commit.stdout.trim() : undefined,
      lastMessage: `Git ${input.mode} app deployed from ${branch}.`
    });
    deploymentEvent(app.id, "deploy", "succeeded", `Deployed ${name} from ${branch}.`);
    audit("app.deploy_git", "Git app deployed.", { appId: app.id, name, repoUrl, branch, mode: input.mode, envKeys: env.keys });
    return readState().apps.find((item) => item.id === app.id) || app;
  } catch (error) {
    markApp(app.id, { status: "failed", lastMessage: error instanceof Error ? redact(error.message) : "Deploy failed." });
    deploymentEvent(app.id, "deploy", "failed", error instanceof Error ? redact(error.message) : "Deploy failed.");
    throw error;
  }
}

export async function deployComposeApp(input: { name: string; repoUrl: string; branch?: string; envText?: string }) {
  const name = assertSafeAppName(input.name);
  const repoUrl = assertSafeGitRepo(input.repoUrl);
  const branch = assertSafeBranch(input.branch || "main");
  const id = slug(name) + "-" + crypto.randomBytes(3).toString("hex");
  const appDir = assertManagedPath(getAppsDir(), path.join(getAppsDir(), id));
  const sourceDir = assertManagedPath(getAppsDir(), path.join(appDir, "source"));
  fs.mkdirSync(appDir, { recursive: true, mode: 0o750 });
  const env = parseEnvText(input.envText || "");
  const now = new Date().toISOString();
  const app: ManagedApp = {
    id,
    name,
    strategy: "compose",
    source: "compose",
    repoUrl,
    branch,
    deployMode: "compose",
    composeProject: "svp_" + id,
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
  try {
    await safeRunOrThrow("git", ["clone", "--depth", "1", "--branch", branch, repoUrl, sourceDir]);
    writeEnvFile(sourceDir, env.env);
    const composeFile = findComposeFile(sourceDir);
    if (!composeFile) throw new Error("No docker-compose.yml, docker-compose.yaml, compose.yml, or compose.yaml found.");
    const commit = await safeRun("git", ["rev-parse", "--short", "HEAD"], sourceDir);
    await safeRunOrThrow("docker", ["compose", "-p", app.composeProject!, "-f", composeFile, "up", "-d", "--build"], sourceDir);
    markApp(app.id, {
      status: "running",
      commitSha: commit.ok ? commit.stdout.trim() : undefined,
      lastMessage: "Docker Compose stack is running. Review compose ports before exposing publicly."
    });
    deploymentEvent(app.id, "compose_deploy", "succeeded", `Compose stack ${name} deployed.`);
    audit("app.deploy_compose", "Compose stack deployed.", { appId: app.id, name, repoUrl, branch, envKeys: env.keys });
    return readState().apps.find((item) => item.id === app.id) || app;
  } catch (error) {
    markApp(app.id, { status: "failed", lastMessage: error instanceof Error ? redact(error.message) : "Compose deploy failed." });
    deploymentEvent(app.id, "compose_deploy", "failed", error instanceof Error ? redact(error.message) : "Compose deploy failed.");
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
  if (app.strategy !== "static") assertSafePort(app.port);

  const caddyDir = "/etc/caddy/conf.d";
  const content =
    app.strategy === "static"
      ? domain + " {\n    encode gzip\n    root * " + rootDir + "\n    file_server\n}\n"
      : domain + " {\n    encode gzip\n    reverse_proxy 127.0.0.1:" + app.port + "\n}\n";
  const temp = await writeTemp("svp_" + app.id + ".caddy", content);
  await safeRunOrThrow("sudo", ["mkdir", "-p", caddyDir]);
  await safeRunOrThrow("sudo", ["install", "-m", "0644", "-o", "root", "-g", "root", temp, path.join(caddyDir, "svp_" + app.id + ".caddy")]);
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
  return { ok: true, command: "static", stdout: "Static app is served by Caddy after a domain is configured.", stderr: "" };
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
    const sourceDir = assertManagedPath(getAppsDir(), path.join(app.rootDir, "source"));
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
    const sourceDir = assertManagedPath(getAppsDir(), path.join(app.rootDir, "source"));
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

export async function redeployApp(appId: string) {
  const app = getManagedApp(appId);
  if (app.source === "git" && app.repoUrl && app.deployMode && app.deployMode !== "compose") {
    await stopApp(app.id);
    return deployGitApp({
      name: app.name,
      repoUrl: app.repoUrl,
      branch: app.branch,
      mode: app.deployMode,
      buildCommand: app.buildCommand,
      startCommand: app.startCommand,
      healthPath: app.healthPath
    });
  }
  if (app.source === "compose" && app.repoUrl) {
    await stopApp(app.id);
    return deployComposeApp({ name: app.name, repoUrl: app.repoUrl, branch: app.branch });
  }
  throw new Error("Redeploy is available for Git and Compose apps only.");
}

export async function deleteApp(appId: string) {
  const app = getManagedApp(appId);
  await stopApp(app.id);
  if (app.containerName) await safeRun("docker", ["rm", "-f", assertSafeDockerName(app.containerName)]);
  if (app.imageTag) await safeRun("docker", ["image", "rm", app.imageTag]);
  if (app.domain) {
    await safeRun("sudo", ["rm", "-f", path.join("/etc/caddy/conf.d", "svp_" + app.id + ".caddy")]);
    await safeRun("sudo", ["systemctl", "reload", "caddy"]);
  }
  updateState((state) => {
    state.apps = state.apps.filter((item) => item.id !== app.id);
  });
  audit("app.delete", "Deleted app.", { appId: app.id, name: app.name });
  return { ok: true };
}

export async function checkAppHealth(appId: string) {
  const app = getManagedApp(appId);
  if (!app.port) return { ok: false, message: "No localhost port is registered for this app." };
  const pathName = cleanHealthPath(app.healthPath || "/");
  try {
    const response = await fetch(`http://127.0.0.1:${app.port}${pathName}`, { signal: AbortSignal.timeout(5000) });
    const ok = response.status >= 200 && response.status < 500;
    const message = `HTTP ${response.status} from ${pathName}`;
    markApp(app.id, { lastMessage: message, status: ok ? "running" : "failed" });
    return { ok, status: response.status, message };
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

async function deployDockerSample(app: ManagedApp) {
  const serverJs = sampleNodeServer(app.name, app.port, "0.0.0.0");
  fs.writeFileSync(path.join(app.rootDir!, "server.js"), serverJs, { mode: 0o640 });
  const dockerfile = [
    "FROM node:22-alpine",
    "WORKDIR /app",
    "COPY server.js /app/server.js",
    "ENV NODE_ENV=production",
    "ENV HOST=0.0.0.0",
    "EXPOSE 3000",
    'CMD ["node", "server.js"]',
    ""
  ].join("\n");
  fs.writeFileSync(
    path.join(app.rootDir!, "Dockerfile"),
    dockerfile,
    { mode: 0o640 }
  );
  const image = "svp_" + app.id + ":latest";
  const container = "svp_" + app.id;
  await safeRunOrThrow("docker", ["build", "-t", image, app.rootDir!]);
  await safeRun("docker", ["rm", "-f", container]);
  await safeRunOrThrow("docker", [
    "run",
    "-d",
    "--name",
    container,
    "--restart",
    "unless-stopped",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--memory",
    "256m",
    "--cpus",
    "0.5",
    "--pids-limit",
    "128",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=64m",
    "--label",
    "supavibe=true",
    "--label",
    "svp.appId=" + app.id,
    "-p",
    "127.0.0.1:" + app.port + ":3000",
    image
  ]);
  markApp(app.id, { status: "running", containerName: container, imageTag: image, lastMessage: "Docker sample is running." });
}

async function replaceDockerContainer(app: ManagedApp, image: string, envFile?: string) {
  const container = "svp_" + app.id;
  const containerPort = app.deployMode === "static" ? 80 : assertContainerPort(app.containerPort || 3000);
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
    "--security-opt",
    "no-new-privileges",
    "--memory",
    "768m",
    "--cpus",
    "1.0",
    "--pids-limit",
    "256",
    "--label",
    "supavibe=true",
    "--label",
    "svp.appId=" + app.id,
    "-p",
    "127.0.0.1:" + app.port + ":" + containerPort
  ];
  if (envFile) args.push("--env-file", envFile);
  args.push(image);
  await safeRunOrThrow("docker", args);
}

async function deploySystemdSample(app: ManagedApp) {
  const appRoot = assertManagedPath(getAppsDir(), app.rootDir!);
  fs.writeFileSync(path.join(appRoot, "server.js"), sampleNodeServer(app.name, app.port, "127.0.0.1"), { mode: 0o640 });
  const serviceName = "svp-" + app.id + ".service";
  const service = [
    "[Unit]",
    "Description=Supavibe sample app " + app.id,
    "After=network-online.target",
    "Wants=network-online.target",
    "",
    "[Service]",
    "Type=simple",
    "User=" + (process.env.SVP_RUN_USER || os.userInfo().username),
    "WorkingDirectory=" + appRoot,
    "Environment=PORT=" + app.port,
    "Environment=HOST=127.0.0.1",
    "ExecStart=" + process.execPath + " " + path.join(appRoot, "server.js"),
    "Restart=on-failure",
    "RestartSec=3",
    "NoNewPrivileges=true",
    "PrivateTmp=true",
    "ProtectHome=true",
    "ProtectSystem=strict",
    "RestrictSUIDSGID=true",
    "LockPersonality=true",
    "",
    "[Install]",
    "WantedBy=multi-user.target",
    ""
  ].join("\n");
  const temp = await writeTemp(serviceName, service);
  await safeRunOrThrow("sudo", ["install", "-m", "0644", "-o", "root", "-g", "root", temp, path.join("/etc/systemd/system", serviceName)]);
  await safeRunOrThrow("sudo", ["systemctl", "daemon-reload"]);
  await safeRunOrThrow("sudo", ["systemctl", "enable", "--now", serviceName]);
  markApp(app.id, { status: "running", serviceName, lastMessage: "Systemd sample is running without Docker." });
}

async function deployStaticSample(app: ManagedApp) {
  const appRoot = assertManagedPath(getAppsDir(), app.rootDir!);
  const html = [
    "<!doctype html>",
    "<html>",
    "<head>",
    "<title>" + escapeHtml(app.name) + "</title>",
    "<style>body{font-family:system-ui;margin:48px;background:#f5f7f4;color:#111827}main{max-width:760px}code{background:white;padding:2px 6px;border:1px solid #d9e2d7}</style>",
    "</head>",
    "<body>",
    "<main>",
    "<h1>" + escapeHtml(app.name) + "</h1>",
    "<p>This static site is ready. Add a domain in Supavibe Panel and Caddy will serve this directory with HTTPS.</p>",
    "<code>" + app.id + "</code>",
    "</main>",
    "</body>",
    "</html>"
  ].join("");
  fs.writeFileSync(
    path.join(appRoot, "index.html"),
    html,
    { mode: 0o640 }
  );
  markApp(app.id, { status: "running", lastMessage: "Static files are ready. Configure a domain to publish through Caddy." });
}

function markApp(appId: string, patch: Partial<ManagedApp>) {
  updateState((state) => {
    const app = state.apps.find((item) => item.id === appId);
    if (app) Object.assign(app, patch, { updatedAt: new Date().toISOString() });
  });
}

async function safeRun(command: string, args: string[], cwd?: string): Promise<CommandOutput> {
  assertAllowedCommand(command, args);
  const printable = [command, ...args].join(" ");
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      timeout: 15 * 60 * 1000,
      maxBuffer: 5 * 1024 * 1024
    });
    return { ok: true, command: printable, stdout: redact(stdout), stderr: redact(stderr) };
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string; code?: number };
    return {
      ok: false,
      command: printable,
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
    return { ok: true, totalMb: Math.round(total / 1024), availableMb: Math.round(available / 1024), usedMb: Math.round((total - available) / 1024) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "memory check failed" };
  }
}

function loadStatus() {
  try {
    const [load1, load5, load15] = fs.readFileSync("/proc/loadavg", "utf8").trim().split(/\s+/);
    return { ok: true, load1, load5, load15 };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "load check failed" };
  }
}

async function findOpenPort() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const port = 32000 + crypto.randomInt(25000);
    if (await canListen(port)) return port;
  }
  throw new Error("Could not find an open local port.");
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

function sampleNodeServer(name: string, port: number, defaultHost: "127.0.0.1" | "0.0.0.0") {
  return [
    'const http = require("http");',
    "const port = Number(process.env.PORT || " + (port || 3000) + ");",
    "const host = process.env.HOST || " + JSON.stringify(defaultHost) + ";",
    "const name = " + JSON.stringify(name) + ";",
    "http.createServer((req, res) => {",
    '  res.setHeader("content-type", "application/json");',
    '  res.end(JSON.stringify({ ok: true, app: name, path: req.url, time: new Date().toISOString() }, null, 2));',
    '}).listen(port, host, () => console.log(name + " listening on " + host + ":" + port));',
    ""
  ].join("\n");
}

function assertAllowedCommand(command: string, args: string[]) {
  const allowed = new Set(["hostnamectl", "df", "docker", "systemctl", "sudo", "journalctl", "git"]);
  if (!allowed.has(command)) throw new Error("Command is not allowed.");
  if (args.some((arg) => arg.includes("\0") || arg.length > 500)) throw new Error("Command argument is invalid.");
  if (command === "sudo" && !["ufw", "mkdir", "install", "caddy", "systemctl", "rm"].includes(args[0] || "")) {
    throw new Error("sudo command is not allowed.");
  }
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

function prepareDockerfile(sourceDir: string, appDir: string, mode: "dockerfile" | "node" | "static", app: ManagedApp) {
  if (mode === "dockerfile") {
    const existing = path.join(sourceDir, "Dockerfile");
    if (!fs.existsSync(existing)) throw new Error("Dockerfile mode selected, but the repository has no Dockerfile at the root.");
    return existing;
  }
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
          "RUN mkdir -p /app/.svp-static && if [ -d dist ]; then cp -a dist/. /app/.svp-static/; elif [ -d build ]; then cp -a build/. /app/.svp-static/; elif [ -d out ]; then cp -a out/. /app/.svp-static/; else echo 'No dist, build, or out directory found after build' && exit 1; fi",
          "FROM nginx:1.27-alpine",
          "COPY --from=builder /app/.svp-static /usr/share/nginx/html",
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
          "ENV PORT=3000",
          "EXPOSE 3000",
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

function findComposeFile(sourceDir: string) {
  for (const name of ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]) {
    const file = path.join(sourceDir, name);
    if (fs.existsSync(file)) return file;
  }
  return "";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
}
