import crypto from "node:crypto";
import { z } from "zod";
import { ZodError } from "zod";
import { authState, createAdmin, login, logout, requireAuth, requireCsrf } from "../../lib/auth";
import { ensureSameOrigin, rateLimit, requireSetupCode, requireTrustedNetwork, securityHeaders } from "../../lib/security";
import { publicState } from "../../lib/state";
import {
  analyzeGitRepo,
  applyFirewallBaseline,
  applyFirewallRule,
  attachDatabaseToApp,
  checkAppHealth,
  configureDomain,
  createExternalDatabase,
  createManagedPostgres,
  createManagedRedis,
  deleteAppEnvironmentKey,
  deleteDatabase,
  deleteDeployment,
  createProject,
  deleteProject,
  deleteApp,
  deleteFirewallRule,
  disablePreviewDomain,
  deployComposeApp,
  deployComposeYamlApp,
  deployDockerImageApp,
  deployGitApp,
  getDatabaseConnection,
  readAppLogs,
  readDeploymentLogs,
  redeployApp,
  regeneratePreviewDomain,
  restartApp,
  setAppEnvironment,
  serverStatus,
  startApp,
  stopApp,
  systemPrune,
  testDatabase,
  updateGitAppDeployment,
  updateAppSettings,
  updatePreviewSettings
} from "../../lib/system";
import { redact, UserFacingError } from "../../lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path?: string[] }> };

const setupSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  password: z.string().min(12),
  setupCode: z.string().optional().default("")
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const gitDeploySchema = z.object({
  name: z.string().min(1).max(80),
  projectId: z.string().optional().default(""),
  serviceRole: z.enum(["frontend", "backend", "worker", "fullstack"]).optional().default("fullstack"),
  repoUrl: z.string().url(),
  branch: z.string().optional().default("main"),
  appDirectory: z.string().max(220).optional().default(""),
  mode: z.enum(["dockerfile", "node", "static"]),
  buildCommand: z.string().max(160).optional().default(""),
  startCommand: z.string().max(160).optional().default(""),
  containerPort: z.coerce.number().int().min(1).max(65535).optional().default(3000),
  healthPath: z.string().max(120).optional().default("/"),
  envText: z.string().max(20_000).optional().default(""),
  corsOrigins: z.array(z.string().max(220)).optional().default([]),
  databaseId: z.string().optional().default(""),
  publicPreview: z.boolean().optional().default(false),
  previewDomainEnabled: z.boolean().optional().default(true)
});

const repoDetectSchema = z.object({
  repoUrl: z.string().url(),
  branch: z.string().optional().default("main"),
  appDirectory: z.string().max(220).optional().default("")
});

const composeDeploySchema = z.object({
  name: z.string().min(1).max(80),
  projectId: z.string().optional().default(""),
  repoUrl: z.string().url(),
  branch: z.string().optional().default("main"),
  envText: z.string().max(20_000).optional().default("")
});

const composeYamlDeploySchema = z.object({
  name: z.string().min(1).max(80),
  projectId: z.string().optional().default(""),
  composeYaml: z.string().min(1).max(120_000),
  envText: z.string().max(20_000).optional().default("")
});

const imageDeploySchema = z.object({
  name: z.string().min(1).max(80),
  projectId: z.string().optional().default(""),
  serviceRole: z.enum(["frontend", "backend", "worker", "fullstack"]).optional().default("fullstack"),
  image: z.string().min(1).max(240),
  containerPort: z.coerce.number().int().min(1).max(65535).optional().default(3000),
  healthPath: z.string().max(120).optional().default("/"),
  envText: z.string().max(20_000).optional().default(""),
  publicPreview: z.boolean().optional().default(false),
  previewDomainEnabled: z.boolean().optional().default(true)
});

const previewSettingsSchema = z.object({
  publicServerIp: z.string().max(64).optional().default(""),
  previewDomainMode: z.enum(["sslip", "custom", "disabled"]).optional().default("sslip"),
  previewBaseDomain: z.string().max(253).optional().default(""),
  autoPreviewDomainsEnabled: z.boolean().optional().default(true),
  caddySitesDir: z.string().max(220).optional().default("/etc/caddy/supavibe/sites"),
  caddyMainConfig: z.string().max(220).optional().default("/etc/caddy/Caddyfile"),
  localProxyPortRangeStart: z.coerce.number().int().min(1024).max(65535).optional().default(31000),
  localProxyPortRangeEnd: z.coerce.number().int().min(1024).max(65535).optional().default(39999)
});

const domainSchema = z.object({
  domain: z.string().min(1).max(253)
});

const firewallSchema = z.object({
  panelPort: z.coerce.number().int(),
  trustedCidr: z.string().optional().default("")
});

const firewallRuleSchema = z.object({
  action: z.enum(["allow", "deny"]),
  port: z.coerce.number().int(),
  protocol: z.enum(["tcp", "udp"]).optional().default("tcp"),
  sourceCidr: z.string().optional().default("")
});

const firewallDeleteSchema = z.object({
  ruleNumber: z.coerce.number().int().min(1).max(999)
});

const projectSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(280).optional().default("")
});

const projectDeleteSchema = z.object({
  confirmation: z.string().min(1).max(80),
  deleteVolumes: z.boolean().optional().default(false)
});

const appSettingsSchema = z.object({
  projectId: z.string().optional().default(""),
  serviceRole: z.enum(["frontend", "backend", "worker", "fullstack"]).optional().default("fullstack"),
  corsOrigins: z.array(z.string().max(220)).optional().default([]),
  databaseId: z.string().optional().default("")
});

const externalDatabaseSchema = z.object({
  projectId: z.string().optional().default(""),
  name: z.string().min(1).max(80),
  url: z.string().min(1).max(1200),
  provider: z.string().max(80).optional().default("External Postgres"),
  envKey: z.string().max(80).optional().default("DATABASE_URL")
});

const managedDatabaseSchema = z.object({
  projectId: z.string().optional().default(""),
  name: z.string().min(1).max(80),
  envKey: z.string().max(80).optional().default("DATABASE_URL")
});

const managedRedisSchema = z.object({
  projectId: z.string().optional().default(""),
  name: z.string().min(1).max(80),
  envKey: z.string().max(80).optional().default("REDIS_URL")
});

const appEnvSchema = z.object({
  envText: z.string().max(20_000),
  replace: z.boolean().optional().default(false)
});

const appEnvDeleteSchema = z.object({
  key: z.string().min(1).max(80)
});

const databaseAttachSchema = z.object({
  appId: z.string().min(1).max(80)
});

const databaseDeleteSchema = z.object({
  deleteVolume: z.boolean().optional().default(false)
});

export async function GET(request: Request, context: RouteContext) {
  return route(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return route(request, context);
}

async function route(request: Request, context: RouteContext) {
  const requestId = cryptoRandomId();
  try {
    requireTrustedNetwork(request);
    ensureSameOrigin(request);
    const segments = (await context.params).path || [];

    if (segments[0] === "auth") return await authRoute(request, segments, requestId);

    if (request.method === "GET") {
      await requireAuth();
    } else {
      await requireCsrf(request);
    }

    if (segments.length === 0) return ok({ app: "Supavibe VPS Panel", mode: "single-vps" }, 200, requestId);
    if (segments[0] === "state" && request.method === "GET") return ok(publicState(), 200, requestId);
    if (segments[0] === "system" && segments[1] === "status" && request.method === "GET") {
      return ok(await serverStatus(), 200, requestId);
    }
    if (segments[0] === "settings" && segments[1] === "preview" && request.method === "POST") {
      rateLimit(request, { key: "preview-settings", limit: 10, windowMs: 60_000 });
      return ok({ settings: await updatePreviewSettings(previewSettingsSchema.parse(await request.json())) }, 200, requestId);
    }
    if (segments[0] === "system" && segments[1] === "prune" && request.method === "POST") {
      rateLimit(request, { key: "system-prune", limit: 3, windowMs: 60_000 });
      return ok({ result: await systemPrune() }, 200, requestId);
    }
    if (segments[0] === "projects" && segments.length === 1 && request.method === "POST") {
      rateLimit(request, { key: "project-create", limit: 20, windowMs: 60_000 });
      return ok({ project: await createProject(projectSchema.parse(await request.json())) }, 201, requestId);
    }
    if (segments[0] === "projects" && segments[1] && segments[2] === "delete" && request.method === "POST") {
      rateLimit(request, { key: "project-delete", limit: 5, windowMs: 60_000 });
      const body = projectDeleteSchema.parse(await request.json());
      return ok(await deleteProject({ projectId: segments[1], confirmation: body.confirmation, deleteVolumes: body.deleteVolumes }), 200, requestId);
    }
    if (segments[0] === "repos" && segments[1] === "detect" && request.method === "POST") {
      rateLimit(request, { key: "repo-detect", limit: 12, windowMs: 60_000 });
      return ok({ analysis: await analyzeGitRepo(repoDetectSchema.parse(await request.json())) }, 200, requestId);
    }
    if (segments[0] === "firewall" && segments[1] === "plan" && request.method === "GET") {
      const panelPort = Number(process.env.SVP_PORT || process.env.PORT || 3099);
      return ok({
        commands: [
          "sudo ufw allow OpenSSH",
          "sudo ufw allow 80/tcp",
          "sudo ufw allow 443/tcp",
          `sudo ufw allow from <trusted-cidr> to any port ${panelPort} proto tcp`,
          "sudo ufw --force enable"
        ],
        note: "Use a trusted CIDR such as Tailscale 100.64.0.0/10 if the panel port should not be public."
      }, 200, requestId);
    }
    if (segments[0] === "firewall" && segments[1] === "apply" && request.method === "POST") {
      rateLimit(request, { key: "firewall", limit: 8, windowMs: 60_000 });
      return ok({ results: await applyFirewallBaseline(firewallSchema.parse(await request.json())) }, 200, requestId);
    }
    if (segments[0] === "firewall" && segments[1] === "rule" && request.method === "POST") {
      rateLimit(request, { key: "firewall-rule", limit: 20, windowMs: 60_000 });
      return ok({ result: await applyFirewallRule(firewallRuleSchema.parse(await request.json())) }, 200, requestId);
    }
    if (segments[0] === "firewall" && segments[1] === "delete-rule" && request.method === "POST") {
      rateLimit(request, { key: "firewall-delete-rule", limit: 20, windowMs: 60_000 });
      return ok({ result: await deleteFirewallRule(firewallDeleteSchema.parse(await request.json())) }, 200, requestId);
    }
    if (segments[0] === "apps" && segments[1] === "git" && request.method === "POST") {
      rateLimit(request, { key: "deploy-git", limit: 8, windowMs: 60_000 });
      return ok({ app: await deployGitApp(gitDeploySchema.parse(await request.json())) }, 201, requestId);
    }
    if (segments[0] === "apps" && segments[1] && segments[2] === "git" && request.method === "POST") {
      rateLimit(request, { key: "update-git-deploy", limit: 10, windowMs: 60_000 });
      return ok({ app: await updateGitAppDeployment(segments[1], gitDeploySchema.parse(await request.json())) }, 200, requestId);
    }
    if (segments[0] === "apps" && segments[1] === "compose" && request.method === "POST") {
      rateLimit(request, { key: "deploy-compose", limit: 5, windowMs: 60_000 });
      return ok({ app: await deployComposeApp(composeDeploySchema.parse(await request.json())) }, 201, requestId);
    }
    if (segments[0] === "apps" && segments[1] === "compose-yaml" && request.method === "POST") {
      rateLimit(request, { key: "deploy-compose-yaml", limit: 5, windowMs: 60_000 });
      return ok({ app: await deployComposeYamlApp(composeYamlDeploySchema.parse(await request.json())) }, 201, requestId);
    }
    if (segments[0] === "apps" && segments[1] === "image" && request.method === "POST") {
      rateLimit(request, { key: "deploy-image", limit: 8, windowMs: 60_000 });
      return ok({ app: await deployDockerImageApp(imageDeploySchema.parse(await request.json())) }, 201, requestId);
    }
    if (segments[0] === "deployments" && segments[1] && segments[2] === "logs" && request.method === "GET") {
      return ok({ logs: await readDeploymentLogs(segments[1]) }, 200, requestId);
    }
    if (segments[0] === "deployments" && segments[1] && segments[2] === "delete" && request.method === "POST") {
      rateLimit(request, { key: "deployment-delete", limit: 30, windowMs: 60_000 });
      return ok(await deleteDeployment(segments[1]), 200, requestId);
    }
    if (segments[0] === "apps" && segments[1] && segments[2] === "domain" && request.method === "POST") {
      const body = domainSchema.parse(await request.json());
      return ok({ app: await configureDomain({ appId: segments[1], domain: body.domain }) }, 200, requestId);
    }
    if (segments[0] === "apps" && segments[1] && segments[2] === "preview" && segments[3] === "regenerate" && request.method === "POST") {
      rateLimit(request, { key: "preview-regenerate", limit: 20, windowMs: 60_000 });
      return ok({ app: await regeneratePreviewDomain(segments[1]) }, 200, requestId);
    }
    if (segments[0] === "apps" && segments[1] && segments[2] === "preview" && segments[3] === "disable" && request.method === "POST") {
      rateLimit(request, { key: "preview-disable", limit: 20, windowMs: 60_000 });
      return ok({ app: await disablePreviewDomain(segments[1]) }, 200, requestId);
    }
    if (segments[0] === "apps" && segments[1] && segments[2] === "settings" && request.method === "POST") {
      const body = appSettingsSchema.parse(await request.json());
      return ok({ app: await updateAppSettings({ appId: segments[1], ...body }) }, 200, requestId);
    }
    if (segments[0] === "apps" && segments[1] && segments[2] === "env" && request.method === "POST") {
      const body = appEnvSchema.parse(await request.json());
      return ok({ app: await setAppEnvironment({ appId: segments[1], ...body }) }, 200, requestId);
    }
    if (segments[0] === "apps" && segments[1] && segments[2] === "env-delete" && request.method === "POST") {
      const body = appEnvDeleteSchema.parse(await request.json());
      return ok({ app: await deleteAppEnvironmentKey({ appId: segments[1], key: body.key }) }, 200, requestId);
    }
    if (segments[0] === "apps" && segments[1] && segments[2] === "logs" && request.method === "GET") {
      return ok({ logs: await readAppLogs(segments[1]) }, 200, requestId);
    }
    if (segments[0] === "apps" && segments[1] && segments[2] === "start" && request.method === "POST") {
      return ok({ app: await startApp(segments[1]) }, 200, requestId);
    }
    if (segments[0] === "apps" && segments[1] && segments[2] === "stop" && request.method === "POST") {
      return ok({ app: await stopApp(segments[1]) }, 200, requestId);
    }
    if (segments[0] === "apps" && segments[1] && segments[2] === "restart" && request.method === "POST") {
      return ok({ app: await restartApp(segments[1]) }, 200, requestId);
    }
    if (segments[0] === "apps" && segments[1] && segments[2] === "redeploy" && request.method === "POST") {
      return ok({ app: await redeployApp(segments[1]) }, 200, requestId);
    }
    if (segments[0] === "apps" && segments[1] && segments[2] === "health" && request.method === "POST") {
      return ok({ health: await checkAppHealth(segments[1]) }, 200, requestId);
    }
    if (segments[0] === "apps" && segments[1] && segments[2] === "delete" && request.method === "POST") {
      return ok(await deleteApp(segments[1]), 200, requestId);
    }
    if (segments[0] === "databases" && segments[1] === "managed-postgres" && request.method === "POST") {
      rateLimit(request, { key: "db-managed", limit: 8, windowMs: 60_000 });
      return ok({ database: await createManagedPostgres(managedDatabaseSchema.parse(await request.json())) }, 201, requestId);
    }
    if (segments[0] === "databases" && segments[1] === "managed-redis" && request.method === "POST") {
      rateLimit(request, { key: "db-managed-redis", limit: 8, windowMs: 60_000 });
      return ok({ database: await createManagedRedis(managedRedisSchema.parse(await request.json())) }, 201, requestId);
    }
    if (segments[0] === "databases" && segments[1] === "external-postgres" && request.method === "POST") {
      rateLimit(request, { key: "db-external", limit: 12, windowMs: 60_000 });
      return ok({ database: await createExternalDatabase(externalDatabaseSchema.parse(await request.json())) }, 201, requestId);
    }
    if (segments[0] === "databases" && segments[1] && segments[2] === "test" && request.method === "POST") {
      return ok({ result: await testDatabase(segments[1]) }, 200, requestId);
    }
    if (segments[0] === "databases" && segments[1] && segments[2] === "connection" && request.method === "POST") {
      return ok({ connection: await getDatabaseConnection(segments[1]) }, 200, requestId);
    }
    if (segments[0] === "databases" && segments[1] && segments[2] === "attach" && request.method === "POST") {
      const body = databaseAttachSchema.parse(await request.json());
      return ok({ app: await attachDatabaseToApp({ databaseId: segments[1], appId: body.appId }) }, 200, requestId);
    }
    if (segments[0] === "databases" && segments[1] && segments[2] === "delete" && request.method === "POST") {
      const body = databaseDeleteSchema.parse(await request.json());
      return ok(await deleteDatabase({ databaseId: segments[1], deleteVolume: body.deleteVolume }), 200, requestId);
    }

    return fail("Not found", 404, requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

async function authRoute(request: Request, segments: string[], requestId: string) {
  if (segments[1] === "state" && request.method === "GET") return ok(await authState(), 200, requestId);
  if (segments[1] === "setup" && request.method === "POST") {
    rateLimit(request, { key: "setup", limit: 5, windowMs: 10 * 60_000 });
    const body = setupSchema.parse(await request.json());
    requireSetupCode(body.setupCode);
    const admin = await createAdmin(body);
    const session = await login(body.email, body.password);
    return ok({ user: { email: admin.email, name: admin.name }, csrfToken: session.csrfToken, setupRequired: false }, 201, requestId);
  }
  if (segments[1] === "login" && request.method === "POST") {
    rateLimit(request, { key: "login", limit: 8, windowMs: 10 * 60_000 });
    const user = await login(...loginTuple(loginSchema.parse(await request.json())));
    return ok({ user: { email: user.email, name: user.name }, csrfToken: user.csrfToken, setupRequired: false }, 200, requestId);
  }
  if (segments[1] === "logout" && request.method === "POST") {
    await requireCsrf(request);
    await logout();
    return ok({ ok: true }, 200, requestId);
  }
  return fail("Unsupported auth action", 404, requestId);
}

function loginTuple(input: { email: string; password: string }): [string, string] {
  return [input.email, input.password];
}

function ok(data: unknown, status = 200, requestId: string = cryptoRandomId()) {
  return Response.json(data, { status, headers: securityHeaders({ "X-Request-Id": requestId }) });
}

function fail(error: string, status = 400, requestId: string = cryptoRandomId()) {
  return Response.json({ error: redact(error), requestId }, { status, headers: securityHeaders({ "X-Request-Id": requestId }) });
}

function errorResponse(error: unknown, requestId: string) {
  if (error instanceof ZodError) {
    return fail(error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; "), 400, requestId);
  }
  if (error instanceof UserFacingError) return fail(error.message, error.status, requestId);
  const message = error instanceof Error ? error.message : "Request failed";
  if (message === "Authentication required.") return fail(message, 401, requestId);
  if (message === "CSRF validation failed.") return fail("Security check failed. Refresh the page and try again.", 403, requestId);
  console.error("Supavibe API request failed", { requestId, error });
  return fail(redact(message || "Request failed"), 500, requestId);
}

function cryptoRandomId(): string {
  return crypto.randomUUID();
}
