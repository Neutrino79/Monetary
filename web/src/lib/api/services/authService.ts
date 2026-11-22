import type { MyAccountInfo, MySession, PlatformAccount, SecurityQuestion, User } from "@/types";
import type { OwnerDto, PasswordResetQuestion, ProfilePatch, RegisterInput, SetupInput } from "@/types/api";
import { saveBlob } from "@/lib/utils/saveBlob";
import { http } from "@/lib/api/http";
import { tokenStorage } from "@/lib/api/tokenStorage";
import { ApiError } from "@/lib/api/errors";
import { CAPTCHA_REQUIRED, captchaHeaders } from "@/lib/api/captcha";
import { toUser } from "@/lib/api/mappers";
import { metaService } from "./metaService";

interface TokenDto { access_token: string; token_type: string }
interface InitDto { owner: OwnerDto; accessToken: string }

export interface AuthResult {
  /** The owner row of the user's own ledger. `null` while a temporary password must still be replaced. */
  user: User | null;
  account: PlatformAccount;
  token: string;
}

/** Login refusals that mean "your account exists but is not usable": shown as a status notice, not as a form error. */
export const ACCOUNT_STATE_CODES = [
  "AccountPendingApproval", "AccountRejected", "AccountRejectedFinal", "AccountSuspended", "AccountPendingDelete", "TemporaryPasswordExpired",
] as const;
export type AccountStateCode = (typeof ACCOUNT_STATE_CODES)[number];

export function accountStateCode(err: unknown): AccountStateCode | null {
  return ApiError.isApiError(err) && (ACCOUNT_STATE_CODES as readonly string[]).includes(err.code ?? "")
    ? (err.code as AccountStateCode)
    : null;
}

export const authService = {
  /** The login endpoint is OAuth2 form-encoded (`username` carries the email). */
  async login(email: string, password: string): Promise<AuthResult> {
    const form = { username: email, password };
    let t: TokenDto;
    try {
      t = await http.postForm<TokenDto>("/auth/login", form, { skipUnauthorizedHandler: true });
    } catch (err) {
      // After a few failures from this address the server wants a captcha too: solve it and try once more.
      if (!ApiError.isApiError(err) || err.code !== CAPTCHA_REQUIRED) throw err;
      t = await http.postForm<TokenDto>("/auth/login", form, { skipUnauthorizedHandler: true, headers: await captchaHeaders() });
    }
    // The HTTP client reads the bearer token from storage, so it has to be stored *before* the
    // follow-up request that loads the owner -- otherwise that request goes out unauthenticated.
    tokenStorage.set(t.access_token);
    return authService.completeSignIn(t.access_token);
  },

  /** Loads who just signed in. A forced password change leaves the ledger locked, so only the account is read then. */
  async completeSignIn(token: string): Promise<AuthResult> {
    try {
      const account = await authService.fetchAccount();
      const user = account.mustChangePassword ? null : await authService.fetchOwner();
      return { token, account, user };
    } catch (err) {
      tokenStorage.clear();
      throw err;
    }
  },

  /** Demo mode only: open the sample ledger without credentials (`POST /auth/demo`; 404 otherwise). */
  async demoLogin(): Promise<AuthResult> {
    const t = await http.post<TokenDto>("/auth/demo");
    tokenStorage.set(t.access_token);
    return authService.completeSignIn(t.access_token);
  },

  /**
   * Ask for an account. The answer is the same whether or not the email is already known, so the
   * caller shows one neutral confirmation either way. An administrator approves the request.
   */
  async register(input: RegisterInput): Promise<void> {
    await http.post("/auth/register", {
      name: input.name, email: input.email, password: input.password, timezone: input.timezone,
      currency: input.homeCurrencyCode, securityQuestionId: input.securityQuestionId,
      securityAnswer: input.securityAnswer, website: input.website || undefined,
    }, { headers: await captchaHeaders() });
  },

  /** The signed-in user's own ledger as a SQLite file, handed to the browser as a download. */
  async downloadMyData(): Promise<string> {
    const { blob, filename } = await http.download("/me/export", `ledger-${new Date().toISOString().slice(0, 10)}.db`);
    saveBlob(blob, filename);
    return filename;
  },

  async fetchAccount(): Promise<PlatformAccount> {
    return http.get<PlatformAccount>("/me");
  },

  /**
   * First-run setup. Checks `GET /setup/status` first so an already-initialised
   * instance is rejected with a clear message *before* any data is submitted
   * (the server independently answers 409 if it races).
   */
  async setup(input: SetupInput): Promise<AuthResult> {
    if (await metaService.isSetupComplete()) throw alreadySetUp();
    try {
      const r = await http.post<InitDto>("/setup/init", {
        name: input.name, email: input.email, password: input.password, timezone: input.timezone,
        currency: input.homeCurrencyCode, securityQuestionId: input.securityQuestionId,
        securityAnswer: input.securityAnswer, seedDefaults: input.seedDefaults ?? true,
      });
      tokenStorage.set(r.accessToken);
      return { token: r.accessToken, user: toUser(r.owner), account: await authService.fetchAccount() };
    } catch (err) {
      if (ApiError.isApiError(err) && err.status === 409) throw alreadySetUp();
      throw err;
    }
  },

  async fetchOwner(): Promise<User> {
    return toUser(await http.get<OwnerDto>("/owner"));
  },

  async logout(): Promise<void> {
    try {
      await http.post("/auth/logout");
    } catch {
      /* the local session is cleared regardless */
    }
  },

  async updateProfile(patch: ProfilePatch): Promise<User> {
    return toUser(await http.patch<OwnerDto>("/owner", patch));
  },

  async securityQuestions(): Promise<SecurityQuestion[]> {
    return http.get<SecurityQuestion[]>("/auth/security-questions");
  },

  async getResetQuestion(email: string): Promise<PasswordResetQuestion> {
    const r = await http.get<{ securityQuestionId: number; question: string }>(
      "/auth/security-question", { email }, undefined, await captchaHeaders());
    return { email, questionId: r.securityQuestionId, question: r.question };
  },

  async resetPassword(email: string, answer: string, newPassword: string): Promise<void> {
    await http.post("/auth/reset-password", { email, securityAnswer: answer, newPassword }, { headers: await captchaHeaders() });
  },

  mySessions: () => http.get<MySession[]>("/me/sessions"),
  revokeMySession: (id: number) => http.delete<{ detail: string }>(`/me/sessions/${id}`),
  revokeOtherSessions: () => http.post<{ ended: number }>("/me/sessions/revoke-others"),
  myAccount: () => http.get<MyAccountInfo>("/me/account"),
  changeSecurityQuestion: (currentPassword: string, securityQuestionId: number, securityAnswer: string) =>
    http.put<{ detail: string }>("/me/security-question", { currentPassword, securityQuestionId, securityAnswer }),
  deleteMyAccount: (password: string) => http.post<{ detail: string }>("/me/delete", { password }),

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await http.post("/auth/change-password", { currentPassword, newPassword });
  },
};

export function alreadySetUp(): ApiError {
  return new ApiError("This instance has already been set up. Sign in with your account, or reset your password if you've forgotten it.", 409, "ALREADY_SETUP");
}
