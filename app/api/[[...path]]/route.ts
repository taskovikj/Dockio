import crypto from "node:crypto";
import { z } from "zod";
import { ZodError } from "zod";
import { authState, createAdmin, login, logout, requireAuth, requireCsrf } from "../../lib/auth";
import { ensureSameOrigin, rateLimit, requireSetupCode, requireTrustedNetwork, securityHeaders } from "../../lib/security";
import { publicState } from "../../lib/state";
import { applyFirewallBaseline, configureDomain, deploySampleApp, readAppLogs, serverStatus, stopApp } from "../../lib/system";
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

const sampleSchema = z.object({
  name: z.string().min(1).max(80).regex(/^[^\x00-\x08\x0b\x0c\x0e-\x1f\x7f]+$/, "App name contains invalid characters."),
  strategy: z.enum(["docker", "systemd", "static"])
});

const domainSchema = z.object({
  domain: z.string().min(1).max(253)
});

const firewallSchema = z.object({
  panelPort: z.coerce.number().int(),
  trustedCidr: z.string().optional().default("")
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
    if (segments[0] === "apps" && segments[1] === "sample" && request.method === "POST") {
      rateLimit(request, { key: "deploy-sample", limit: 10, windowMs: 60_000 });
      return ok({ app: await deploySampleApp(sampleSchema.parse(await request.json())) }, 201, requestId);
    }
    if (segments[0] === "apps" && segments[1] && segments[2] === "domain" && request.method === "POST") {
      const body = domainSchema.parse(await request.json());
      return ok({ app: await configureDomain({ appId: segments[1], domain: body.domain }) }, 200, requestId);
    }
    if (segments[0] === "apps" && segments[1] && segments[2] === "logs" && request.method === "GET") {
      return ok({ logs: await readAppLogs(segments[1]) }, 200, requestId);
    }
    if (segments[0] === "apps" && segments[1] && segments[2] === "stop" && request.method === "POST") {
      return ok({ app: await stopApp(segments[1]) }, 200, requestId);
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
    return ok({ user: { email: admin.email, name: admin.name }, setupRequired: false }, 201, requestId);
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
