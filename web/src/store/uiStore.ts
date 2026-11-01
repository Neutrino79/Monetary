import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark";
export type Accent = "green" | "blue" | "violet" | "orange";
export type Density = "comfortable" | "compact";

export const ACCENTS: { value: Accent; label: string; swatch: string }[] = [
  { value: "green", label: "Green", swatch: "#1f6d4c" },
  { value: "blue", label: "Blue", swatch: "#2457a6" },
  { value: "violet", label: "Violet", swatch: "#6a45b0" },
  { value: "orange", label: "Orange", swatch: "#a24d14" },
];

interface UiState {
  theme: Theme;
  accent: Accent;
  density: Density;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  setTheme: (theme: Theme) => void;
  setAccent: (accent: Accent) => void;
  setDensity: (density: Density) => void;
  toggleTheme: () => void;
  toggleSidebarCollapsed: () => void;
  setMobileNavOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: "light",
      accent: "green",
      density: "comfortable",
      sidebarCollapsed: false,
      mobileNavOpen: false,
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setDensity: (density) => set({ density }),
      toggleTheme: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
      toggleSidebarCollapsed: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
    }),
    {
      name: "emx_ui",
      partialize: (state) => ({ theme: state.theme, accent: state.accent, density: state.density, sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
);
