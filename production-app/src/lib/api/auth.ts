import type { User, Session } from "@/types";
import { appConfig } from "@/config/app";
import { MOCK_TODAY } from "@/lib/db/store";

const USERS_KEY = "emx_users";
const SESSION_KEY = "emx_session";

// Not real cryptography — there's no backend here to keep a secret from.
// This just keeps the *_hash naming from the schema honest about intent
// (nothing is stored as plain, readable text) rather than providing actual
// security. Replace with real bcrypt/argon2 server-side in production.
function simpleHash(str: string): string {
  let h = 5381;
  const s = String(str).trim().toLowerCase();
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return "h_" + (h >>> 0).toString(16);
}

function seedUsers(): User[] {
  return [
    {
      id: 1,
      name: "Ananya Kulkarni",
      email: "ananya.kulkarni@example.com",
      isSuperuser: false,
      timezone: appConfig.defaultTimezone,
      homeCurrencyCode: appConfig.currencyCode,
      ledgerMode: "DIRECT",
      passwordHash: simpleHash("demo1234"),
      securityQuestionId: 2,
      securityAnswerHash: simpleHash("bengaluru"),
      createdAt: "2025-01-04",
      updatedAt: "2025-01-04",
    },
  ];
}

function getUsers(): User[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) throw new Error("no users yet");
    return JSON.parse(raw) as User[];
  } catch {
    const seeded = seedUsers();
    localStorage.setItem(USERS_KEY, JSON.stringify(seeded));
    return seeded;
  }
}
function saveUsers(list: User[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(list));
}

function findByEmail(email: string): User | undefined {
  return getUsers().find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
}

function createSession(userId: number): Session {
  const session: Session = {
    tokenHash: simpleHash(userId + ":" + Date.now() + ":" + Math.random()),
    userId,
    createdAt: MOCK_TODAY,
    expiresAt: "2026-10-23", // illustrative fixed expiry, 30 days past the mock "today"
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    if (session.expiresAt < MOCK_TODAY) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function currentUser(): User | null {
  const session = getSession();
  if (!session) return null;
  return getUsers().find((u) => u.id === session.userId) ?? null;
}

export function login(email: string, password: string): User {
  const user = findByEmail(email);
  if (!user || user.passwordHash !== simpleHash(password)) {
    throw new Error("That email and password don't match any account.");
  }
  createSession(user.id);
  return user;
}

export interface SignupPayload {
  name: string;
  email: string;
  password: string;
  timezone?: string;
  homeCurrencyCode?: string;
  securityQuestionId: number;
  securityAnswer: string;
}

export function signup(payload: SignupPayload): User {
  if (findByEmail(payload.email)) throw new Error("An account with that email already exists.");
  const users = getUsers();
  const user: User = {
    id: Math.max(0, ...users.map((u) => u.id)) + 1,
    name: payload.name,
    email: payload.email,
    isSuperuser: false,
    timezone: payload.timezone || appConfig.defaultTimezone,
    homeCurrencyCode: payload.homeCurrencyCode || appConfig.currencyCode,
    ledgerMode: "DIRECT",
    passwordHash: simpleHash(payload.password),
    securityQuestionId: payload.securityQuestionId,
    securityAnswerHash: simpleHash(payload.securityAnswer),
    createdAt: MOCK_TODAY,
    updatedAt: MOCK_TODAY,
  };
  users.push(user);
  saveUsers(users);
  createSession(user.id);
  return user;
}

export function updateCurrentUser(patch: Partial<User>): User | null {
  const session = getSession();
  if (!session) return null;
  const users = getUsers();
  const user = users.find((u) => u.id === session.userId);
  if (!user) return null;
  Object.assign(user, patch, { updatedAt: MOCK_TODAY });
  saveUsers(users);
  return user;
}

export function requestReset(email: string): { email: string; questionId: number } {
  const user = findByEmail(email);
  if (!user) throw new Error("No account found with that email.");
  return { email: user.email, questionId: user.securityQuestionId };
}

export function resetPassword(email: string, answer: string, newPassword: string): true {
  const user = findByEmail(email);
  if (!user || user.securityAnswerHash !== simpleHash(answer)) {
    throw new Error("That answer doesn't match what we have on file.");
  }
  const users = getUsers();
  const u = users.find((x) => x.id === user.id)!;
  u.passwordHash = simpleHash(newPassword);
  u.updatedAt = MOCK_TODAY;
  saveUsers(users);
  return true;
}

export function logout(): void {
  localStorage.removeItem(SESSION_KEY);
}
