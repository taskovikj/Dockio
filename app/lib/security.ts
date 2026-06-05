import crypto from "node:crypto";
import { assertSafeCidr, UserFacingError } from "./validate";

const buckets = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

export function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

export function rateLimit(request: Request, options: RateLimitOptions) {
  const now = Date.now();
  const key = `${options.key}:${getClientIp(request)}`;
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return;
  }
  current.count += 1;
  if (current.count > options.limit) {
    const seconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    throw new UserFacingError(`Too many attempts. Try again in ${seconds}s.`, 429);
  }
}

export function securityHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra);
  headers.set("Cache-Control", "no-store");
  headers.set("Referrer-Policy", "same-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return headers;
}

export function ensureSameOrigin(request: Request) {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return;
  const origin = request.headers.get("origin");
  if (!origin) return;
  const allowed = allowedOrigins(request);
  let actual: string;
  try {
    actual = new URL(origin).origin;
  } catch {
    throw new UserFacingError("Request origin is not allowed.", 403);
  }
  if (!allowed.has(actual)) throw new UserFacingError("Request origin is not allowed.", 403);
}

export function requireSetupCode(input: string | undefined) {
  const expected = process.env.DIO_SETUP_TOKEN?.trim();
  if (!expected) return;
  const provided = (input || "").trim();
  if (!provided || !timingSafeTextEqual(provided, expected)) {
    throw new UserFacingError("Setup code is required for first admin creation.", 403);
  }
}

export function setupTokenRequired() {
  return Boolean(process.env.DIO_SETUP_TOKEN?.trim());
}

export function requireTrustedNetwork(request: Request) {
  const enabled = String(process.env.DIO_TRUSTED_NETWORK_ONLY || "").toLowerCase() === "true";
  const cidrs = (process.env.DIO_TRUSTED_CIDRS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!enabled || cidrs.length === 0) return;

  const ip = normalizeIp(getClientIp(request));
  if (!ip || !cidrs.some((cidr) => ipv4InCidr(ip, assertSafeCidr(cidr)))) {
    throw new UserFacingError("This panel only allows requests from trusted networks.", 403);
  }
}

function timingSafeTextEqual(a: string, b: string) {
  const left = crypto.createHash("sha256").update(a).digest();
  const right = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(left, right);
}

function allowedOrigins(request: Request) {
  const requestUrl = new URL(request.url);
  const origins = new Set<string>([requestUrl.origin]);
  const host = firstHeaderValue(request.headers.get("host"));
  if (host) origins.add(`${requestUrl.protocol}//${host}`);

  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto")) || requestUrl.protocol.replace(":", "");
  if (forwardedHost) origins.add(`${forwardedProto}://${forwardedHost}`);

  for (const value of [process.env.DIO_PUBLIC_ORIGIN, process.env.DIO_PUBLIC_BASE_URL]) {
    if (!value) continue;
    try {
      origins.add(new URL(value).origin);
    } catch {
      // Ignore invalid optional config. The request host still protects normal installs.
    }
  }
  return origins;
}

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || "";
}

function normalizeIp(value: string) {
  const ip = value.replace(/^::ffff:/, "");
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return ip;
  return "";
}

function ipv4InCidr(ip: string, cidr: string) {
  const [range, bitsText] = cidr.split("/");
  if (!range || !bitsText) return false;
  const bits = Number(bitsText);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(range) & mask);
}

function ipv4ToInt(ip: string) {
  return ip.split(".").reduce((acc, octet) => ((acc << 8) + Number(octet)) >>> 0, 0);
}
