import type { SecurityQuestion, User } from "@/types";
import type { OwnerDto, PasswordResetQuestion, ProfilePatch, SetupInput } from "@/types/api";
import { http } from "@/lib/api/http";
import { tokenStorage } from "@/lib/api/tokenStorage";
import { ApiError } from "@/lib/api/errors";
import { toUser } from "@/lib/api/mappers";
import { metaService } from "./metaService";

interface TokenDto { access_token: string; token_type: string }
interface InitDto { owner: OwnerDto; accessToken: string }

export interface AuthResult {
  user: User;
  token: string;
}

export const authService = {
  /** The login endpoint is OAuth2 form-encoded (`username` carries the email). */
  async login(email: string, password: string): Promise<AuthResult> {
    const t = await http.postForm<TokenDto>("/auth/login", { username: email, password }, { skipUnauthorizedHandler: true });
    // The HTTP client reads the bearer token from storage, so it has to be stored *before* the
    // follow-up request that loads the owner -- otherwise that request goes out unauthenticated.
    tokenStorage.set(t.access_token);
    try {
      return { token: t.access_token, user: await authService.fetchOwner() };
    } catch (err) {
      tokenStorage.clear();
      throw err;
    }
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
      return { token: r.accessToken, user: toUser(r.owner) };
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
    const r = await http.get<{ securityQuestionId: number; question: string }>("/auth/security-question", { email });
    return { email, questionId: r.securityQuestionId, question: r.question };
  },

  async resetPassword(email: string, answer: string, newPassword: string): Promise<void> {
    await http.post("/auth/reset-password", { email, securityAnswer: answer, newPassword });
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await http.post("/auth/change-password", { currentPassword, newPassword });
  },
};

export function alreadySetUp(): ApiError {
  return new ApiError("This instance has already been set up. Sign in with your account, or reset your password if you've forgotten it.", 409, "ALREADY_SETUP");
}
