/**
 * Bot protection for the public forms. The server says which kind it uses (`GET /auth/captcha`):
 * - `altcha`: a small proof of work solved here in the browser, no third party involved;
 * - `turnstile`: Cloudflare's widget;
 * - `none`: nothing to do.
 * The solution goes in the `X-Captcha` header and is good for one request.
 */
import { http } from "./http";
import { ApiError } from "./errors";

interface Challenge {
  algorithm: string;
  challenge: string;
  salt: string;
  maxnumber: number;
  signature: string;
}

export interface CaptchaConfig {
  provider: "none" | "altcha" | "turnstile";
  challenge: Challenge | null;
  siteKey: string | null;
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  let out = "";
  for (const byte of digest) out += HEX[byte];
  return out;
}

/** Find the number the server hid in the challenge. Yields now and then so the page stays responsive. */
export async function solveChallenge(c: Challenge): Promise<string> {
  for (let n = 0; n <= c.maxnumber; n++) {
    if ((await sha256Hex(c.salt + n)) === c.challenge) {
      return btoa(JSON.stringify({ algorithm: c.algorithm, challenge: c.challenge, number: n, salt: c.salt, signature: c.signature }));
    }
    if (n % 2000 === 1999) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new ApiError("Couldn't complete the security check. Please reload and try again.", 0, "CAPTCHA_UNSOLVED");
}

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
}

let turnstileScript: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  turnstileScript ??= new Promise<TurnstileApi>((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    tag.async = true;
    tag.onload = () => resolve((window as unknown as { turnstile: TurnstileApi }).turnstile);
    tag.onerror = () => {
      turnstileScript = null;
      reject(new ApiError("Couldn't load the security check. Check your connection and try again.", 0, "CAPTCHA_UNAVAILABLE"));
    };
    document.head.appendChild(tag);
  });
  return turnstileScript;
}

/** Run Cloudflare's widget in a corner of the page; it only becomes visible if it needs the person. */
async function turnstileToken(siteKey: string): Promise<string> {
  const api = await loadTurnstile();
  const holder = document.createElement("div");
  holder.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:200";
  document.body.appendChild(holder);
  return new Promise<string>((resolve, reject) => {
    const id = api.render(holder, {
      sitekey: siteKey,
      appearance: "interaction-only",
      callback: (token: string) => { api.remove(id); holder.remove(); resolve(token); },
      "error-callback": () => { api.remove(id); holder.remove(); reject(new ApiError("The security check failed. Please try again.", 0, "CAPTCHA_FAILED")); },
    });
  });
}

/** A solution for one request, or `undefined` when the server does not use a captcha. */
export async function captchaSolution(): Promise<string | undefined> {
  const cfg = await http.get<CaptchaConfig>("/auth/captcha");
  if (cfg.provider === "altcha" && cfg.challenge) return solveChallenge(cfg.challenge);
  if (cfg.provider === "turnstile" && cfg.siteKey) return turnstileToken(cfg.siteKey);
  return undefined;
}

/** Headers carrying a fresh solution (none when the captcha is off). */
export async function captchaHeaders(): Promise<Record<string, string>> {
  const solution = await captchaSolution();
  return solution ? { "X-Captcha": solution } : {};
}

export const CAPTCHA_REQUIRED = "CaptchaRequired";
