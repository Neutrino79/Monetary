(function (global) {
  "use strict";

  // Matches user.security_question_id (1-5) from the schema.
  const SECURITY_QUESTIONS = [
    { id: 1, text: "What was the name of your first pet?" },
    { id: 2, text: "What city were you born in?" },
    { id: 3, text: "What was your childhood nickname?" },
    { id: 4, text: "What is the name of your favorite teacher?" },
    { id: 5, text: "What was the make of your first car?" },
  ];

  const USERS_KEY = "emx_users";
  const SESSION_KEY = "emx_session";
  const TODAY = "2026-09-23";

  // Not real cryptography — there's no backend here to keep a secret from,
  // this just keeps the *_hash naming from the schema honest about intent
  // (nothing is stored as plain, readable text) rather than providing
  // actual security.
  function simpleHash(str) {
    let h = 5381;
    const s = String(str).trim().toLowerCase();
    for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
    return "h_" + (h >>> 0).toString(16);
  }

  function seedUsers() {
    return [{
      id: 1,
      name: "Ananya Kulkarni",
      email: "ananya.kulkarni@example.com",
      isSuperuser: false,
      timezone: "Asia/Kolkata",
      homeCurrencyCode: "INR",
      ledgerMode: "DIRECT",
      passwordHash: simpleHash("demo1234"),
      securityQuestionId: 2,
      securityAnswerHash: simpleHash("bengaluru"),
      createdAt: "2025-01-04",
      updatedAt: "2025-01-04",
    }];
  }

  function getUsers() {
    try {
      const raw = localStorage.getItem(USERS_KEY);
      if (!raw) throw new Error("no users yet");
      return JSON.parse(raw);
    } catch (e) {
      const seeded = seedUsers();
      localStorage.setItem(USERS_KEY, JSON.stringify(seeded));
      return seeded;
    }
  }
  function saveUsers(list) { localStorage.setItem(USERS_KEY, JSON.stringify(list)); }

  function findByEmail(email) {
    return getUsers().find((u) => u.email.toLowerCase() === String(email).trim().toLowerCase());
  }

  function createSession(userId) {
    const session = {
      tokenHash: simpleHash(userId + ":" + Date.now() + ":" + Math.random()),
      userId,
      createdAt: TODAY,
      expiresAt: "2026-10-23", // 30 days out, illustrative
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (session.expiresAt < TODAY) { localStorage.removeItem(SESSION_KEY); return null; }
      return session;
    } catch (e) { return null; }
  }

  function currentUser() {
    const session = getSession();
    if (!session) return null;
    return getUsers().find((u) => u.id === session.userId) || null;
  }

  function login(email, password) {
    const user = findByEmail(email);
    if (!user || user.passwordHash !== simpleHash(password)) {
      throw new Error("That email and password don't match any account.");
    }
    createSession(user.id);
    return user;
  }

  function signup({ name, email, password, timezone, homeCurrencyCode, securityQuestionId, securityAnswer }) {
    if (findByEmail(email)) throw new Error("An account with that email already exists.");
    const users = getUsers();
    const user = {
      id: Math.max(0, ...users.map((u) => u.id)) + 1,
      name, email,
      isSuperuser: false,
      timezone: timezone || "Asia/Kolkata",
      homeCurrencyCode: homeCurrencyCode || "INR",
      ledgerMode: "DIRECT",
      passwordHash: simpleHash(password),
      securityQuestionId,
      securityAnswerHash: simpleHash(securityAnswer),
      createdAt: TODAY, updatedAt: TODAY,
    };
    users.push(user);
    saveUsers(users);
    createSession(user.id);
    return user;
  }

  function updateCurrentUser(patch) {
    const session = getSession();
    if (!session) return null;
    const users = getUsers();
    const user = users.find((u) => u.id === session.userId);
    if (!user) return null;
    Object.assign(user, patch, { updatedAt: TODAY });
    saveUsers(users);
    return user;
  }

  function requestReset(email) {
    const user = findByEmail(email);
    if (!user) throw new Error("No account found with that email.");
    return { email: user.email, question: SECURITY_QUESTIONS.find((q) => q.id === user.securityQuestionId) };
  }

  function resetPassword(email, answer, newPassword) {
    const user = findByEmail(email);
    if (!user || user.securityAnswerHash !== simpleHash(answer)) {
      throw new Error("That answer doesn't match what we have on file.");
    }
    const users = getUsers();
    const u = users.find((x) => x.id === user.id);
    u.passwordHash = simpleHash(newPassword);
    u.updatedAt = TODAY;
    saveUsers(users);
    return true;
  }

  function logout() { localStorage.removeItem(SESSION_KEY); }

  global.Auth = {
    SECURITY_QUESTIONS, login, signup, logout, getSession, currentUser,
    updateCurrentUser, requestReset, resetPassword,
  };
})(window);
