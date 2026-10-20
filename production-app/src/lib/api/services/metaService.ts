import type { Branding } from "@/types";
import { http } from "@/lib/api/http";

interface MetaDto { appName: string; tagline: string; version: string; apiVersion: string }

export const metaService = {
  /** Public. The product name is owned by the backend (MONETARY_APP_NAME). */
  async getBranding(): Promise<Branding> {
    const m = await http.get<MetaDto>("/meta");
    return { name: m.appName, tagline: m.tagline };
  },

  /** Public. True once first-run setup has created the owner. */
  async isSetupComplete(): Promise<boolean> {
    const s = await http.get<{ initialized: boolean }>("/setup/status");
    return s.initialized;
  },
};
