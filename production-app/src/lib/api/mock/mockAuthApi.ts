/**
 * The mock backend's auth endpoints. Mirrors what a real API would expose
 * (POST /auth/login, /auth/signup, /auth/reset-password, etc. — see
 * `lib/api/services/authService.ts`) using localStorage instead of a
 * server + database. Nothing outside `lib/api/mock` and the service layer
 * should import this directly.
 */
import type { User } from "@/types";
import type { AuthResponse, PasswordResetQuestion, SignupInput } from "@/types/api";
import { appConfig } from "@/config/app";
import { MOCK_ANCHOR_DATE } from "./mockSeedData";

const USERS_KEY = "mock_users";
const SESSIONS_KEY = "mock_sessions";

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

interface StoredUser extends User {
  passwordHash: string;
  securityAnswerHash: string;
}
interface StoredSession {
  tokenHash: string;
  userId: number;
  createdAt: string;
  expiresAt: string;
}

function seedUsers(): StoredUser[] {
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

function getUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) throw new Error("no users yet");
    return JSON.parse(raw) as StoredUser[];
  } catch {
    const seeded = seedUsers();
    localStorage.setItem(USERS_KEY, JSON.stringify(seeded));
    return seeded;
  }
}
function saveUsers(list: StoredUser[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(list));
}
function toPublicUser(u: StoredUser): User {
  const { passwordHash: _ph, securityAnswerHash: _sah, ...pub } = u;
  return pub;
}

function findByEmail(email: string): StoredUser | undefined {
  return getUsers().find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
}

function createSession(userId: number): StoredSession {
  const tokenHash = simpleHash(userId + ":" + Date.now() + ":" + Math.random());
  const session: StoredSession = {
    tokenHash,
    userId,
    createdAt: MOCK_ANCHOR_DATE,
    expiresAt: "2026-10-23", // illustrative fixed expiry, 30 days past the mock "today"
  };
  const sessions = getSessions().filter((s) => s.userId !== userId);
  sessions.push(session);
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  return session;
}

function getSessions(): StoredSession[] {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? "[]") as StoredSession[];
  } catch {
    return [];
  }
}

function sessionForToken(token: string): StoredSession | null {
  const session = getSessions().find((s) => s.tokenHash === token);
  if (!session) return null;
  if (session.expiresAt < MOCK_ANCHOR_DATE) return null;
  return session;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const mockAuthApi = {
  async currentUser(token: string): Promise<User | null> {
    await delay(appConfig.mockLatencyMs);
    const session = sessionForToken(token);
    if (!session) return null;
    const user = getUsers().find((u) => u.id === session.userId);
    return user ? toPublicUser(user) : null;
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    await delay(appConfig.mockLatencyMs);
    const user = findByEmail(email);
    if (!user || user.passwordHash !== simpleHash(password)) {
      throw new Error("That email and password don't match any account.");
    }
    const session = createSession(user.id);
    return { user: toPublicUser(user), token: session.tokenHash };
  },

  async signup(payload: SignupInput): Promise<AuthResponse> {
    await delay(appConfig.mockLatencyMs);
    if (findByEmail(payload.email)) throw new Error("An account with that email already exists.");
    const users = getUsers();
    const user: StoredUser = {
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
      createdAt: MOCK_ANCHOR_DATE,
      updatedAt: MOCK_ANCHOR_DATE,
    };
    users.push(user);
    saveUsers(users);
    const session = createSession(user.id);
    return { user: toPublicUser(user), token: session.tokenHash };
  },

  async updateCurrentUser(token: string, patch: Partial<User>): Promise<User | null> {
    await delay(appConfig.mockLatencyMs);
    const session = sessionForToken(token);
    if (!session) return null;
    const users = getUsers();
    const user = users.find((u) => u.id === session.userId);
    if (!user) return null;
    Object.assign(user, patch, { updatedAt: MOCK_ANCHOR_DATE });
    saveUsers(users);
    return toPublicUser(user);
  },

  async requestReset(email: string): Promise<PasswordResetQuestion> {
    await delay(appConfig.mockLatencyMs);
    const user = findByEmail(email);
    if (!user) throw new Error("No account found with that email.");
    return { email: user.email, questionId: user.securityQuestionId };
  },

  async resetPassword(email: string, answer: string, newPassword: string): Promise<true> {
    await delay(appConfig.mockLatencyMs);
    const user = findByEmail(email);
    if (!user || user.securityAnswerHash !== simpleHash(answer)) {
      throw new Error("That answer doesn't match what we have on file.");
    }
    const users = getUsers();
    const u = users.find((x) => x.id === user.id)!;
    u.passwordHash = simpleHash(newPassword);
    u.updatedAt = MOCK_ANCHOR_DATE;
    saveUsers(users);
    return true;
  },

  async logout(): Promise<void> {
    // Stateless on the client beyond clearing the token, which the caller
    // (authService) does via tokenStorage. Nothing to await here, but kept
    // async so swapping to a real "POST /auth/logout" call is a one-liner.
  },
};
