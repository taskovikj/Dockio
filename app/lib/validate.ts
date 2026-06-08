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

export function assertNetworkPort(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error("Port must be between 1 and 65535.");
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

export function assertSafeOrigin(value: string) {
  const origin = value.trim();
  if (!origin) return "";
  if (origin === "*") return "*";
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error("CORS origin must be a valid URL, for example https://app.example.com.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("CORS origin must use http or https.");
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
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

export function assertSafeEnvKey(value: string) {
  const key = value.trim();
  if (!/^[A-Z_][A-Z0-9_]*$/i.test(key) || key.length > 80) throw new Error(`Invalid environment key: ${key}`);
  return key;
}

export function assertSafeAppName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 80) throw new Error("App name must be 1-80 characters.");
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(name)) throw new Error("App name contains invalid characters.");
  return name;
}

export function assertSafeGitRepo(value: string) {
  const repo = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(repo);
  } catch {
    throw new Error("Repository URL must be a valid HTTPS Git URL.");
  }
  if (parsed.protocol !== "https:") throw new Error("Only HTTPS Git URLs are supported.");
  if (!["github.com", "gitlab.com", "bitbucket.org"].includes(parsed.hostname.toLowerCase())) {
    throw new Error("Repository host must be GitHub, GitLab, or Bitbucket for this prototype.");
  }
  parsed.username = "";
  parsed.password = "";
  parsed.hash = "";
  parsed.search = "";
  if (!parsed.pathname.endsWith(".git")) parsed.pathname = parsed.pathname.replace(/\/$/, "") + ".git";
  return parsed.toString();
}

export function assertSafeRelativePath(value: string, label = "path") {
  const item = value.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!item) return "";
  if (item.length > 220 || item.includes("\0") || item.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`${label} must be a relative path inside the project.`);
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(item)) throw new Error(`${label} contains unsupported characters.`);
  return item;
}

export function assertSafeDockerImage(value: string) {
  const image = value.trim();
  if (image.length < 2 || image.length > 240) throw new Error("Docker image must be 2-240 characters.");
  if (image.includes("\0") || image.includes(" ") || image.includes("://")) throw new Error("Docker image format is invalid.");
  if (!/^[a-z0-9][a-z0-9._/-]*(?::[A-Za-z0-9._-]{1,128})?$/.test(image)) {
    throw new Error("Docker image must look like nginx:1.27, ghcr.io/user/app:tag, or user/app:tag.");
  }
  return image;
}

export function assertSafeComposeYaml(value: string) {
  const yaml = value.trim();
  if (yaml.length < 12) throw new Error("Compose YAML is too short.");
  if (yaml.length > 120_000) throw new Error("Compose YAML is too large for this panel.");
  if (yaml.includes("\0")) throw new Error("Compose YAML contains invalid characters.");
  if (!/(^|\n)\s*services\s*:/i.test(yaml)) throw new Error("Compose YAML must contain a services: section.");
  return yaml.endsWith("\n") ? yaml : yaml + "\n";
}

export function assertSafeBranch(value: string) {
  const branch = (value.trim() || "main").slice(0, 120);
  if (!/^[A-Za-z0-9._/-]+$/.test(branch) || branch.includes("..") || branch.startsWith("/") || branch.endsWith("/")) {
    throw new Error("Branch name contains unsupported characters.");
  }
  return branch;
}

export function parseEnvText(value: string) {
  const env: Record<string, string> = {};
  const keys: string[] = [];
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) throw new Error("Environment variables must use KEY=value lines.");
    const key = line.slice(0, index).trim();
    const val = line.slice(index + 1);
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key) || key.length > 80) throw new Error(`Invalid environment key: ${key}`);
    env[key] = val;
    keys.push(key);
  }
  return { env, keys };
}

export function assertManagedPath(baseDir: string, candidate: string) {
  const base = path.resolve(baseDir);
  const resolved = path.resolve(candidate);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error("Managed path is outside the Dockio data directory.");
  }
  return resolved;
}

export function assertSafeDockerName(value: string) {
  if (!/^dio_[a-z0-9-]{2,80}$/.test(value)) throw new Error("Docker resource name is invalid.");
  return value;
}

export function assertSafeSystemdService(value: string) {
  if (!/^dio-[a-z0-9-]{2,80}\.service$/.test(value)) throw new Error("Systemd service name is invalid.");
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
