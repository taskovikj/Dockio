import crypto from "node:crypto";
import { cookies } from "next/headers";
import { setupTokenRequired } from "./security";
import { audit, readState, updateState, type AdminAccount, type SessionRecord } from "./state";

const COOKIE = "dio_session";
const ITERATIONS = 210_000;
const KEYLEN = 32;

export function hashPassword(password: string, salt = crypto.randomBytes(16).toString("hex"), iterations = ITERATIONS) {
  const hash = crypto.pbkdf2Sync(password, salt, iterations, KEYLEN, "sha256").toString("hex");
  return { hash, salt, iterations };
}

export function verifyPassword(password: string, account: AdminAccount) {
  const hash = crypto.pbkdf2Sync(password, account.salt, account.iterations, KEYLEN, "sha256").toString("hex");
  if (hash.length !== account.passwordHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(account.passwordHash, "hex"));
}

export function tokenHash(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createAdmin(input: { email: string; name: string; password: string }) {
  assertStrongPassword(input.password);
  const password = hashPassword(input.password);
  const admin = updateState((state) => {
    if (state.admin) throw new Error("Admin account already exists.");
    state.admin = {
      email: input.email.toLowerCase(),
      name: input.name,
      passwordHash: password.hash,
      salt: password.salt,
      iterations: password.iterations,
      createdAt: new Date().toISOString()
    };
    return state.admin;
  });
  audit("auth.setup", "First admin account created.", { email: admin.email });
  return admin;
}

export async function login(email: string, password: string) {
  const state = readState();
  if (!state.admin || state.admin.email !== email.toLowerCase() || !verifyPassword(password, state.admin)) {
    audit("auth.failed", "Failed login attempt.", { email });
    throw new Error("Invalid email or password.");
  }
  const token = crypto.randomBytes(32).toString("hex");
  const csrfToken = crypto.randomBytes(32).toString("base64url");
  const session: SessionRecord = {
    id: crypto.randomUUID(),
    tokenHash: tokenHash(token),
    csrfToken,
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString()
  };
  updateState((next) => {
    next.sessions.push(session);
  });
  audit("auth.login", "Admin signed in.");
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: shouldUseSecureCookie(),
    path: "/",
    expires: new Date(session.expiresAt)
  });
  return { email: state.admin.email, name: state.admin.name, csrfToken };
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value || "";
  if (token) {
    updateState((state) => {
      state.sessions = state.sessions.filter((session) => session.tokenHash !== tokenHash(token));
    });
  }
  jar.delete(COOKIE);
  audit("auth.logout", "Admin signed out.");
}

export async function requireAuth() {
  const state = readState();
  if (!state.admin) return { setupRequired: true, user: null };
  const token = (await cookies()).get(COOKIE)?.value || "";
  const hash = tokenHash(token);
  const session = state.sessions.find((item) => item.tokenHash === hash && new Date(item.expiresAt).getTime() > Date.now());
  if (!session) throw new Error("Authentication required.");
  if (!session.csrfToken) {
    session.csrfToken = crypto.randomBytes(32).toString("base64url");
    updateState((next) => {
      const current = next.sessions.find((item) => item.id === session.id);
      if (current) current.csrfToken = session.csrfToken;
    });
  }
  return { setupRequired: false, user: { email: state.admin.email, name: state.admin.name }, csrfToken: session.csrfToken };
}

export async function authState() {
  const state = readState();
  if (!state.admin) return { setupRequired: true, setupTokenRequired: setupTokenRequired(), user: null };
  try {
    const auth = await requireAuth();
    return auth;
  } catch {
    return { setupRequired: false, setupTokenRequired: false, user: null };
  }
}

export async function requireCsrf(request: Request) {
  const auth = await requireAuth();
  if (auth.setupRequired || !auth.csrfToken) throw new Error("Authentication required.");
  const provided = request.headers.get("x-dockio-csrf") || "";
  if (!provided || !crypto.timingSafeEqual(Buffer.from(tokenHash(provided)), Buffer.from(tokenHash(auth.csrfToken)))) {
    throw new Error("CSRF validation failed.");
  }
  return auth;
}

function assertStrongPassword(password: string) {
  if (password.length < 12) throw new Error("Password must be at least 12 characters.");
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw new Error("Password must include uppercase, lowercase, and a number.");
  }
}

function shouldUseSecureCookie() {
  const explicit = process.env.DIO_COOKIE_SECURE?.trim().toLowerCase();
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  const publicUrl = process.env.DIO_PUBLIC_ORIGIN || process.env.DIO_PUBLIC_BASE_URL || "";
  return publicUrl.startsWith("https://");
}
