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
  deploymentEvent,
  finishDeployment,
  getAppsDir,
  getDataDir,
  getLogsDir,
  getSecretsDir,
  readState,
  startDeployment,
  updateState,
  type AppStrategy,
  type DatabaseResource,
  type ManagedApp,
  type ServiceRole
} from "./state";
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

export async function createProject(input: { name: string; description?: string }) {
  const name = assertSafeAppName(input.name);
  const now = new Date().toISOString();
  const project = {
    id: slug(name) + "-" + crypto.randomBytes(3).toString("hex"),
    name,
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

export async function deleteProject(input: { projectId: string; confirmation: string }) {
  const projectId = assertSafeId(input.projectId, "projectId");
  const state = readState();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) throw new Error("Project not found.");
  if (input.confirmation !== project.name) throw new UserFacingError(`Type ${project.name} to confirm project deletion.`, 400);

  const projectApps = state.apps.filter((app) => app.projectId === projectId);
  const projectDatabases = state.databases.filter((database) => database.projectId === projectId);
  for (const app of projectApps) {
    await cleanupAppResources(app);
  }
  for (const database of projectDatabases) {
    await cleanupDatabaseResource(database);
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
      next.projects.push({ id: "default", name: "Default Project", description: "First project workspace", createdAt: now, updatedAt: now });
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
      // Temp cleanup is best effort; managed temp files are under SVP_DATA_DIR/tmp.
    }
  }
}

export async function serverStatus() {
  const [hostname, osRelease, disk, docker, caddy, ufw, publicIp] = await Promise.all([
    safeRun("hostnamectl", []),
    safeRead("/etc/os-release"),
    safeRun("df", ["-h", "/"]),
    safeRun("docker", ["version", "--format", "{{.Server.Version}}"]),
    safeRun("systemctl", ["is-active", "caddy"]),
    safeRun("sudo", ["ufw", "status", "numbered"]),
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

export async function deploySampleApp(input: { name: string; strategy: AppStrategy; projectId?: string; serviceRole?: ServiceRole }) {
  const name = assertSafeAppName(input.name || input.strategy + " sample");
  const projectId = input.projectId ? assertSafeId(input.projectId, "projectId") : "";
  if (projectId && !readState().projects.some((project) => project.id === projectId)) throw new Error("Project not found.");
  const id = slug(name) + "-" + crypto.randomBytes(3).toString("hex");
  const appDir = assertManagedPath(getAppsDir(), path.join(getAppsDir(), id));
  fs.mkdirSync(appDir, { recursive: true, mode: 0o750 });

  const now = new Date().toISOString();
  const app: ManagedApp = {
    id,
    projectId: projectId || undefined,
    name,
    serviceRole: input.serviceRole || "fullstack",
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
}) {
  const name = assertSafeAppName(input.name);
  const projectId = input.projectId ? assertSafeId(input.projectId, "projectId") : "";
  const databaseId = input.databaseId ? assertSafeId(input.databaseId, "databaseId") : "";
  const corsOrigins = (input.corsOrigins || []).map(assertSafeOrigin).filter(Boolean).slice(0, 20);
  const state = readState();
  if (projectId && !state.projects.some((project) => project.id === projectId)) throw new Error("Project not found.");
  if (databaseId && !state.databases.some((database) => database.id === databaseId)) throw new Error("Database not found.");
  const repoUrl = assertSafeGitRepo(input.repoUrl);
  const branch = assertSafeBranch(input.branch || "main");
  const appDirectory = assertSafeRelativePath(input.appDirectory || "", "App directory");
  const id = slug(name) + "-" + crypto.randomBytes(3).toString("hex");
  const appDir = assertManagedPath(getAppsDir(), path.join(getAppsDir(), id));
  const sourceDir = assertManagedPath(getAppsDir(), path.join(appDir, "source"));
  fs.mkdirSync(appDir, { recursive: true, mode: 0o750 });
  const now = new Date().toISOString();
  const port = await findOpenPort();
  const publicPreview = Boolean(input.publicPreview);
  const env = parseEnvText(input.envText || "");
  const envFile = writeEnvFile(appDir, env.env);
  const app: ManagedApp = {
    id,
    projectId: projectId || undefined,
    name,
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
    containerPort: input.mode === "static" ? 80 : assertContainerPort(input.containerPort || 3000),
    healthPath: cleanHealthPath(input.healthPath || "/"),
    envKeys: env.keys,
    corsOrigins,
    databaseId: databaseId || undefined,
    port,
    publicPreview,
    portBind: publicPreview ? "public" : "localhost",
    previewUrl: publicPreview ? await previewUrlForPort(port) : undefined,
    status: "created",
    rootDir: appDir,
    createdAt: now,
    updatedAt: now
  };
  updateState((state) => {
    state.apps.unshift(app);
  });

  const deploymentId = startDeployment({
    appId: app.id,
    action: "deploy",
    message: `Deploying ${name} from ${branch}.`,
    sourceType: "git-url",
    strategy: input.mode,
    branch
  });
  try {
    appendDeploymentLog(deploymentId, "preparing workspace", `Workspace ready for ${app.id}.`);
    appendDeploymentLog(deploymentId, "cloning repository", `${repoUrl} @ ${branch}`);
    await safeRunOrThrow("git", ["clone", "--depth", "1", "--branch", branch, repoUrl, sourceDir]);
    appendDeploymentLog(deploymentId, "checking branch", "Repository cloned.");
    const commit = await safeRun("git", ["rev-parse", "--short", "HEAD"], sourceDir);
    const image = "svp_" + app.id + ":" + Date.now();
    const buildDir = appDirectory ? assertManagedPath(sourceDir, path.join(sourceDir, appDirectory)) : sourceDir;
    if (!fs.existsSync(buildDir)) throw new Error(`App directory ${appDirectory} was not found in the repository.`);
    appendDeploymentLog(deploymentId, "detecting app", appDirectory ? `Using app directory ${appDirectory}.` : "Using repository root.");
    const dockerfile = prepareDockerfile(buildDir, appDir, input.mode, app);
    appendDeploymentLog(deploymentId, "building image", `Building ${image}.`);
    await safeRunOrThrow("docker", ["build", "-t", image, "-f", dockerfile, buildDir]);
    appendDeploymentLog(deploymentId, "starting service", `Starting container on ${app.publicPreview ? "0.0.0.0" : "127.0.0.1"}:${app.port}.`);
    await replaceDockerContainer(app, image, envFile);
    await waitForAppHealth(app, deploymentId);
    if (app.publicPreview) {
      await openPreviewFirewallPort(app.port, deploymentId);
    }
    markApp(app.id, {
      status: "running",
      imageTag: image,
      containerName: "svp_" + app.id,
      commitSha: commit.ok ? commit.stdout.trim() : undefined,
      lastMessage: app.publicPreview
        ? `Git ${input.mode} app deployed from ${branch}. Preview: ${app.previewUrl || `port ${app.port}`}`
        : `Git ${input.mode} app deployed from ${branch}. Add a domain or enable public preview to expose it.`
    });
    finishDeployment(deploymentId, "succeeded", app.publicPreview ? `Deployed ${name}. Preview: ${app.previewUrl || `port ${app.port}`}` : `Deployed ${name} from ${branch}.`, { commitSha: commit.ok ? commit.stdout.trim() : undefined, imageTag: image });
    audit("app.deploy_git", "Git app deployed.", { appId: app.id, name, repoUrl, branch, appDirectory, mode: input.mode, publicPreview, envKeys: env.keys });
    return readState().apps.find((item) => item.id === app.id) || app;
  } catch (error) {
    const message = error instanceof Error ? redact(error.message) : "Deploy failed.";
    markApp(app.id, { status: "failed", lastMessage: message });
    finishDeployment(deploymentId, "failed", message);
    throw error;
  }
}

export async function deployComposeApp(input: { name: string; projectId?: string; repoUrl: string; branch?: string; envText?: string }) {
  const name = assertSafeAppName(input.name);
  const projectId = input.projectId ? assertSafeId(input.projectId, "projectId") : "";
  if (projectId && !readState().projects.some((project) => project.id === projectId)) throw new Error("Project not found.");
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
    projectId: projectId || undefined,
    name,
    serviceRole: "fullstack",
    strategy: "compose",
    source: "compose",
    sourceType: "git-url",
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
  const deploymentId = startDeployment({
    appId: app.id,
    action: "compose_deploy",
    message: `Deploying Compose stack ${name}.`,
    sourceType: "git-url",
    strategy: "compose",
    branch
  });
  try {
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
    finishDeployment(deploymentId, "succeeded", `Compose stack ${name} deployed.`, { commitSha: commit.ok ? commit.stdout.trim() : undefined });
    audit("app.deploy_compose", "Compose stack deployed.", { appId: app.id, name, repoUrl, branch, envKeys: env.keys });
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
  if (projectId && !readState().projects.some((project) => project.id === projectId)) throw new Error("Project not found.");
  const composeYaml = assertSafeComposeYaml(input.composeYaml);
  const id = slug(name) + "-" + crypto.randomBytes(3).toString("hex");
  const appDir = assertManagedPath(getAppsDir(), path.join(getAppsDir(), id));
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
    serviceRole: "fullstack",
    strategy: "compose",
    source: "compose",
    sourceType: "compose-yaml",
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
}) {
  const name = assertSafeAppName(input.name);
  const projectId = input.projectId ? assertSafeId(input.projectId, "projectId") : "";
  if (projectId && !readState().projects.some((project) => project.id === projectId)) throw new Error("Project not found.");
  const image = assertSafeDockerImage(input.image);
  const containerPort = assertContainerPort(input.containerPort || 3000);
  const publicPreview = Boolean(input.publicPreview);
  const env = parseEnvText(input.envText || "");
  const id = slug(name) + "-" + crypto.randomBytes(3).toString("hex");
  const appDir = assertManagedPath(getAppsDir(), path.join(getAppsDir(), id));
  fs.mkdirSync(appDir, { recursive: true, mode: 0o750 });
  const envFile = writeEnvFile(appDir, env.env);
  const now = new Date().toISOString();
  const app: ManagedApp = {
    id,
    projectId: projectId || undefined,
    name,
    serviceRole: input.serviceRole || "fullstack",
    strategy: "docker",
    sourceType: "docker-image",
    dockerImage: image,
    containerPort,
    healthPath: cleanHealthPath(input.healthPath || "/"),
    envKeys: env.keys,
    port: await findOpenPort(),
    publicPreview,
    portBind: publicPreview ? "public" : "localhost",
    status: "created",
    rootDir: appDir,
    createdAt: now,
    updatedAt: now
  };
  app.previewUrl = publicPreview ? await previewUrlForPort(app.port) : undefined;
  updateState((state) => {
    state.apps.unshift(app);
  });
  const deploymentId = startDeployment({ appId: app.id, action: "deploy_image", message: `Deploying Docker image ${image}.`, sourceType: "docker-image", strategy: "docker" });
  try {
    appendDeploymentLog(deploymentId, "pulling image", image);
    await safeRunOrThrow("docker", ["pull", image]);
    appendDeploymentLog(deploymentId, "starting service", `Starting container on ${app.publicPreview ? "0.0.0.0" : "127.0.0.1"}:${app.port}.`);
    await replaceDockerContainer(app, image, envFile);
    await waitForAppHealth(app, deploymentId);
    if (app.publicPreview) {
      await openPreviewFirewallPort(app.port, deploymentId);
    }
    markApp(app.id, {
      status: "running",
      containerName: "svp_" + app.id,
      imageTag: image,
      lastMessage: app.publicPreview ? `Docker image is running. Preview: ${app.previewUrl || `port ${app.port}`}` : "Docker image is running on a localhost port."
    });
    finishDeployment(deploymentId, "succeeded", app.publicPreview ? `Docker image ${image} deployed. Preview: ${app.previewUrl || `port ${app.port}`}` : `Docker image ${image} deployed.`, { imageTag: image });
    audit("app.deploy_image", "Docker image deployed.", { appId: app.id, name, image, publicPreview, envKeys: env.keys });
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

export async function redeployApp(appId: string) {
  const app = getManagedApp(appId);
  if (app.source === "git" && app.repoUrl && app.deployMode && app.deployMode !== "compose") {
    await stopApp(app.id);
    return deployGitApp({
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
      corsOrigins: app.corsOrigins,
      databaseId: app.databaseId
    });
  }
  if (app.source === "compose" && app.repoUrl) {
    await stopApp(app.id);
    return deployComposeApp({ name: app.name, projectId: app.projectId, repoUrl: app.repoUrl, branch: app.branch });
  }
  if (app.sourceType === "docker-image" && app.dockerImage) {
    await stopApp(app.id);
    return deployDockerImageApp({
      name: app.name,
      projectId: app.projectId,
      serviceRole: app.serviceRole,
      image: app.dockerImage,
      containerPort: app.containerPort || 3000,
      healthPath: app.healthPath
    });
  }
  throw new Error("Redeploy is available for Git, Compose repository, and Docker image apps only.");
}

export async function deleteApp(appId: string) {
  const app = getManagedApp(appId);
  await cleanupAppResources(app);
  updateState((state) => {
    removeDeploymentFiles(state.deployments.filter((deployment) => deployment.appId === app.id));
    state.deployments = state.deployments.filter((deployment) => deployment.appId !== app.id);
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
    const result = await fetchLocalHealth(app.port, pathName);
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
  if (projectId && !readState().projects.some((project) => project.id === projectId)) throw new Error("Project not found.");
  const id = slug(name) + "-" + crypto.randomBytes(3).toString("hex");
  const localPort = await findOpenPort();
  const username = "svp_" + crypto.randomBytes(3).toString("hex");
  const database = "svp_" + crypto.randomBytes(3).toString("hex");
  const password = crypto.randomBytes(24).toString("base64url");
  const volume = "svp_pg_" + id;
  const container = "svp_pg_" + id;
  const postgresEnvFile = writeSecretFile(
    id + "-postgres-env",
    [`POSTGRES_USER=${username}`, `POSTGRES_PASSWORD=${password}`, `POSTGRES_DB=${database}`].join("\n") + "\n"
  );
  await safeRunOrThrow("docker", ["volume", "create", "--label", "supavibe=true", volume]);
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
      "supavibe=true",
      "--label",
      "svp.databaseId=" + id,
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
  const connectionUrl = `postgres://${encodeURIComponent(username)}:${encodeURIComponent(password)}@127.0.0.1:${localPort}/${encodeURIComponent(database)}`;
  const secretPath = writeSecretFile(id, connectionUrl);
  const now = new Date().toISOString();
  const resource: DatabaseResource = {
    id,
    projectId: projectId || undefined,
    name,
    kind: "managed-postgres",
    provider: "Docker Postgres 16",
    envKey,
    status: "running",
    host: "127.0.0.1",
    port: localPort,
    database,
    username,
    maskedUrl: maskDatabaseUrl(connectionUrl),
    secretPath,
    dockerContainer: container,
    dockerVolume: volume,
    localPort,
    createdAt: now,
    updatedAt: now,
    lastMessage: "Managed Postgres is running on localhost only."
  };
  updateState((state) => {
    state.databases.unshift(resource);
  });
  audit("database.create_managed", "Created managed Postgres.", { databaseId: id, projectId, envKey });
  return { ...resource, secretPath: undefined };
}

export async function createExternalDatabase(input: { projectId?: string; name: string; url: string; provider?: string; envKey?: string }) {
  const name = assertSafeAppName(input.name || "External Postgres");
  const projectId = input.projectId ? assertSafeId(input.projectId, "projectId") : "";
  const envKey = assertSafeEnvKey(input.envKey || "DATABASE_URL");
  if (projectId && !readState().projects.some((project) => project.id === projectId)) throw new Error("Project not found.");
  const parsed = parsePostgresUrl(input.url);
  const id = slug(name) + "-" + crypto.randomBytes(3).toString("hex");
  const secretPath = writeSecretFile(id, parsed.url);
  const tcp = await testTcp(parsed.host, parsed.port);
  const now = new Date().toISOString();
  const resource: DatabaseResource = {
    id,
    projectId: projectId || undefined,
    name,
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

async function waitForAppHealth(app: ManagedApp, deploymentId: string) {
  const safePort = assertSafePort(app.port);
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
  appendDeploymentLog(deploymentId, "health check failed", lastMessage);
  throw new UserFacingError(`Service started, but health check failed at ${pathName} on port ${safePort}: ${redact(lastMessage)}`, 500);
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
  const hostBind = app.publicPreview ? "0.0.0.0" : "127.0.0.1";
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
    hostBind + ":" + app.port + ":" + containerPort
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
    await safeRun("sudo", ["rm", "-f", path.join("/etc/caddy/conf.d", "svp_" + app.id + ".caddy")]);
    await safeRun("sudo", ["systemctl", "reload", "caddy"]);
  }
  if (app.rootDir) {
    try {
      fs.rmSync(assertManagedPath(getAppsDir(), app.rootDir), { recursive: true, force: true });
    } catch {
      // Managed files are best-effort cleanup; state removal below is authoritative.
    }
  }
}

async function cleanupDatabaseResource(database: DatabaseResource) {
  if (database.kind === "managed-postgres") {
    if (database.dockerContainer) await safeRun("docker", ["rm", "-f", assertSupavibeDockerResource(database.dockerContainer)]);
    if (database.dockerVolume) await safeRun("docker", ["volume", "rm", assertSupavibeDockerResource(database.dockerVolume)]);
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

function assertSupavibeDockerResource(value: string) {
  if (!/^svp_[a-z0-9_-]{2,120}$/.test(value)) throw new Error("Managed Docker resource name is invalid.");
  return value;
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
