import path from "node:path";

export class UserFacingError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "UserFacingError";
    this.status = status;
  }
}

export function assertSafeId(value: string, label = "id") {
  if (!/^[a-zA-Z0-9_-]{2,80}$/.test(value)) {
    throw new Error(`${label} must use only letters, numbers, underscores, and hyphens.`);
  }
  return value;
}

export function assertSafePort(value: number) {
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    throw new Error("Port must be between 1024 and 65535.");
  }
  return value;
}

export function assertSafeDomain(value: string) {
  const domain = value.trim().toLowerCase();
  if (domain.length > 253 || domain.includes("..") || /[^a-z0-9.-]/.test(domain) || !domain.includes(".")) {
    throw new Error("Domain must be a valid hostname.");
  }
  if (domain.startsWith("-") || domain.endsWith("-") || domain.startsWith(".") || domain.endsWith(".")) {
    throw new Error("Domain has invalid leading or trailing characters.");
  }
  const labels = domain.split(".");
  if (labels.some((label) => label.length < 1 || label.length > 63 || label.startsWith("-") || label.endsWith("-"))) {
    throw new Error("Domain labels must be 1-63 characters and cannot start or end with a hyphen.");
  }
  if (labels.every((label) => /^\d+$/.test(label))) {
    throw new Error("Use a hostname, not a raw IP address.");
  }
  return domain;
}

export function assertSafeCidr(value: string) {
  const cidr = value.trim();
  if (!cidr) return "";
  if (!/^(\d{1,3}\.){3}\d{1,3}\/([0-9]|[12][0-9]|3[0-2])$/.test(cidr)) {
    throw new Error("Trusted CIDR must look like 100.64.0.0/10.");
  }
  const [ip = ""] = cidr.split("/");
  const octets = ip.split(".").map(Number);
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    throw new Error("Trusted CIDR has an invalid IPv4 address.");
  }
  return cidr;
}

export function assertSafeAppName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 80) throw new Error("App name must be 1-80 characters.");
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(name)) throw new Error("App name contains invalid characters.");
  return name;
}

export function assertManagedPath(baseDir: string, candidate: string) {
  const base = path.resolve(baseDir);
  const resolved = path.resolve(candidate);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error("Managed path is outside the Supavibe data directory.");
  }
  return resolved;
}

export function assertSafeDockerName(value: string) {
  if (!/^svp_[a-z0-9-]{2,80}$/.test(value)) throw new Error("Docker resource name is invalid.");
  return value;
}

export function assertSafeSystemdService(value: string) {
  if (!/^svp-[a-z0-9-]{2,80}\.service$/.test(value)) throw new Error("Systemd service name is invalid.");
  return value;
}

export function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "app";
}

export function redact(value: string) {
  return value
    .replace(/Authorization:\s*Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Authorization: Bearer [redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, "[redacted-github-token]")
    .replace(/https:\/\/[^:\s/@]+:[^@\s]+@/gi, "https://[redacted]@")
    .replace(/DATABASE_URL=[^\s]+/gi, "DATABASE_URL=[redacted]")
    .replace(/(token|secret|password|private[_-]?key)=([^\s]+)/gi, "$1=[redacted]")
    .replace(/password=[^\s]+/gi, "password=[redacted]")
    .replace(/postgres(ql)?:\/\/[^\s]+/gi, "postgres://[redacted]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[redacted-private-key]");
}

export function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        /token|secret|password|authorization|privateKey|databaseUrl/i.test(key) ? "[redacted]" : redactValue(item)
      ])
    );
  }
  return value;
}
