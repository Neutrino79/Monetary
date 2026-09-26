(function (global) {
  "use strict";
  const S = global.Store;
  const { uid } = global.fmt;

  function delay(ms) { return new Promise((res) => setTimeout(res, ms)); }
  const LATENCY = 260;

  function today() { return "2026-09-23"; }

  const mockApi = {
    // ---------------------------------------------------------- read side
    async getAccounts() { await delay(LATENCY); return S.state.accounts; },
    async getCategories() { await delay(LATENCY); return S.state.categories; },
    async getIncomeSources() { await delay(LATENCY); return S.state.incomeSources; },
    async getFriends() { await delay(LATENCY); return S.state.friends; },
    async getTransactions() { await delay(LATENCY); return S.state.transactions; },

    // ------------------------------------------------------- transactions
    async createTransaction(payload) {
      await delay(LATENCY);
      const txn = Object.assign({ id: uid("txn"), status: "posted", createdAt: today(), updatedAt: today() }, payload);
      S.state.transactions.unshift(txn);
      S.emit({ type: "transaction:create", txn });
      return txn;
    },
    async updateTransaction(id, patch) {
      await delay(LATENCY);
      const idx = S.state.transactions.findIndex((t) => t.id === id);
      if (idx === -1) throw new Error("Transaction not found");
      if (S.state.settings.ledgerMode === "STRICT") {
        // reverse + repost, exactly like the architecture's StrictEditPolicy
        const original = S.state.transactions[idx];
        original.status = "reversed";
        original.updatedAt = today();
        const reposted = Object.assign({}, original, patch, {
          id: uid("txn"), status: "posted", createdAt: today(), updatedAt: today(),
          reversalOf: undefined, correctionOf: original.id,
        });
        S.state.transactions.unshift(reposted);
        S.emit({ type: "transaction:correct", original, reposted });
        return reposted;
      }
      // DIRECT mode — genuine in-place mutation
      const updated = Object.assign(S.state.transactions[idx], patch, { updatedAt: today() });
      S.emit({ type: "transaction:update", txn: updated });
      return updated;
    },
    async deleteTransaction(id) {
      await delay(LATENCY);
      const idx = S.state.transactions.findIndex((t) => t.id === id);
      if (idx === -1) throw new Error("Transaction not found");
      if (S.state.settings.ledgerMode === "STRICT") {
        S.state.transactions[idx].status = "reversed";
        S.state.transactions[idx].updatedAt = today();
      } else {
        S.state.transactions.splice(idx, 1);
      }
      S.emit({ type: "transaction:delete", id });
      return true;
    },
    async settleFriend({ friendId, accountId, amount, direction, memo, date }) {
      return this.createTransaction({
        type: "settlement",
        description: `Settlement — ${S.getFriend(friendId).name}`,
        memo: memo || null, date: date || today(), currency: "INR", accountId, friendId, amount, direction,
      });
    },

    // ------------------------------------------------------------ accounts
    async createAccount(payload) {
      await delay(LATENCY);
      const acc = Object.assign({ id: uid("acc"), isActive: true, isSystem: false, createdAt: today() }, payload);
      S.state.accounts.push(acc);
      S.emit({ type: "account:create", acc });
      return acc;
    },
    async updateAccount(id, patch) {
      await delay(LATENCY);
      const acc = S.getAccount(id);
      if (!acc) throw new Error("Account not found");
      Object.assign(acc, patch);
      S.emit({ type: "account:update", acc });
      return acc;
    },
    async archiveAccount(id) {
      await delay(LATENCY);
      const acc = S.getAccount(id);
      if (!acc) throw new Error("Account not found");
      acc.isActive = false;
      acc.archivedAt = today();
      S.emit({ type: "account:archive", acc });
      return acc;
    },
    async restoreAccount(id) {
      await delay(LATENCY);
      const acc = S.getAccount(id);
      acc.isActive = true;
      delete acc.archivedAt;
      S.emit({ type: "account:restore", acc });
      return acc;
    },

    // ---------------------------------------------------------- categories
    async createCategory(payload) {
      await delay(LATENCY);
      const cat = Object.assign({ id: uid("cat"), parentId: null, budgetLimit: null }, payload);
      S.state.categories.push(cat);
      S.emit({ type: "category:create", cat });
      return cat;
    },
    async updateCategory(id, patch) {
      await delay(LATENCY);
      const cat = S.state.categories.find((c) => c.id === id);
      Object.assign(cat, patch);
      S.emit({ type: "category:update", cat });
      return cat;
    },
    async deleteCategory(id) {
      await delay(LATENCY);
      S.state.categories = S.state.categories.filter((c) => c.id !== id && c.parentId !== id);
      S.emit({ type: "category:delete", id });
      return true;
    },

    // ------------------------------------------------------------- friends
    async createFriend(payload) {
      await delay(LATENCY);
      const f = Object.assign({ id: uid("frnd"), createdAt: today() }, payload);
      S.state.friends.push(f);
      S.emit({ type: "friend:create", f });
      return f;
    },
    async updateFriend(id, patch) {
      await delay(LATENCY);
      const f = S.getFriend(id);
      Object.assign(f, patch);
      S.emit({ type: "friend:update", f });
      return f;
    },
    async deleteFriend(id) {
      await delay(LATENCY);
      const hasHistory = S.state.transactions.some((t) => t.friendId === id || (t.splits || []).some((s) => s.friendId === id));
      if (hasHistory) throw new Error("This friend has ledger history and can't be deleted — archive instead.");
      S.state.friends = S.state.friends.filter((f) => f.id !== id);
      S.emit({ type: "friend:delete", id });
      return true;
    },

    // ----------------------------------------------------------- settings
    async updateSettings(patch) {
      await delay(120);
      Object.assign(S.state.settings, patch);
      if (patch.theme) localStorage.setItem("emx_theme", patch.theme);
      if (patch.ledgerMode) localStorage.setItem("emx_ledger_mode", patch.ledgerMode);
      S.emit({ type: "settings:update" });
      return S.state.settings;
    },
  };

  global.mockApi = mockApi;
})(window);
