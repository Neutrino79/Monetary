import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { http } from "@/lib/api/http";
import { reportDeviceNetwork, retryDelayMs, useConnectionStore } from "@/lib/api/connection";

const RECOVERED_NOTICE_MS = 3000;
let probing = false;

/** Ask the server (`GET /meta`, public and cheap) whether it is reachable. The HTTP client records the outcome. */
export async function checkConnectionNow(): Promise<void> {
  if (probing || useConnectionStore.getState().status === "online") return;
  probing = true;
  useConnectionStore.setState({ checking: true });
  try {
    await http.get("/meta");
  } catch {
    // Still down (the client has already said how); wait longer before the next try.
    const { status, attempt } = useConnectionStore.getState();
    if (status !== "online") useConnectionStore.setState({ attempt: attempt + 1, checking: false, nextRetryAt: null });
  } finally {
    probing = false;
    useConnectionStore.setState({ checking: false });
  }
}

/**
 * Keeps the connection state honest while the app is open: follows the device's online/offline events,
 * re-checks the server with a growing delay while it is down (and straight away when the tab becomes visible
 * or "Retry now" is pressed), and refreshes the data once the connection is back.
 */
export function useConnectionMonitor(): void {
  const queryClient = useQueryClient();
  const status = useConnectionStore((s) => s.status);
  const attempt = useConnectionStore((s) => s.attempt);
  const previous = useRef(status);

  useEffect(() => {
    const online = () => {
      reportDeviceNetwork(true);
      void checkConnectionNow();
    };
    const offline = () => reportDeviceNetwork(false);
    const visible = () => {
      if (document.visibilityState === "visible") void checkConnectionNow();
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);

  // While the connection is down, check again after a growing wait.
  useEffect(() => {
    if (status === "online") return;
    const delay = retryDelayMs(attempt);
    useConnectionStore.setState({ nextRetryAt: Date.now() + delay });
    const timer = setTimeout(() => void checkConnectionNow(), delay);
    return () => clearTimeout(timer);
  }, [status, attempt]);

  // Back online: refresh what is on screen and drop the "back online" notice after a moment.
  useEffect(() => {
    const wasDown = previous.current !== "online";
    previous.current = status;
    if (status !== "online" || !wasDown) return;
    void queryClient.invalidateQueries();
    const timer = setTimeout(() => useConnectionStore.setState({ recovered: false }), RECOVERED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [status, queryClient]);
}
