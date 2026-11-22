/**
 * What the app knows about its connection to the server, kept apart from the HTTP client's code paths so any
 * part of the UI can show it. The HTTP client reports what it sees (`reportReachable`, `reportProblem`);
 * `useConnectionMonitor` re-checks while it is down and `ConnectionBanner` tells the person what is going on.
 */
import { create } from "zustand";
import { appConfig } from "@/config/app";

export type ConnectionStatus =
  | "online"
  | "offline" // the device has no network
  | "unreachable" // the device is online but the server does not answer (down, timeout, bad signal)
  | "server_error"; // a gateway answered that the app behind it is unavailable (502/503/504)

interface ConnectionState {
  status: ConnectionStatus;
  /** Failed re-checks in a row; drives the growing wait between them. */
  attempt: number;
  /** When the next automatic re-check happens (epoch ms), or null. */
  nextRetryAt: number | null;
  /** A re-check is running right now. */
  checking: boolean;
  /** True for a moment after the connection came back, so the banner can say so. */
  recovered: boolean;
}

const deviceOnline = () => typeof navigator === "undefined" || navigator.onLine !== false;

export const useConnectionStore = create<ConnectionState>(() => ({
  status: deviceOnline() ? "online" : "offline",
  attempt: 0,
  nextRetryAt: null,
  checking: false,
  recovered: false,
}));

const set = useConnectionStore.setState;

/** The server answered: whatever the connection was, it works. */
export function reportReachable(): void {
  if (useConnectionStore.getState().status === "online") return;
  set({ status: "online", attempt: 0, nextRetryAt: null, checking: false, recovered: true });
}

/** A request failed because of the connection (`network`) or the server's availability (`server`). */
export function reportProblem(kind: "network" | "server"): void {
  const status: ConnectionStatus = kind === "server" ? "server_error" : deviceOnline() ? "unreachable" : "offline";
  const current = useConnectionStore.getState();
  if (current.status === status) return;
  set({ status, recovered: false, nextRetryAt: null, attempt: current.status === "online" ? 0 : current.attempt });
}

/** The device's own network state changed (the browser's online/offline events). */
export function reportDeviceNetwork(online: boolean): void {
  if (!online) reportProblem("network");
  else if (useConnectionStore.getState().status === "offline") set({ status: "unreachable", nextRetryAt: null });
}

/** How long to wait before the re-check after `attempt` failed ones: base, doubling, up to the maximum. */
export function retryDelayMs(attempt: number): number {
  const seconds = Math.min(appConfig.connectionRetryBaseSeconds * 2 ** attempt, appConfig.connectionRetryMaxSeconds);
  return seconds * 1000;
}
