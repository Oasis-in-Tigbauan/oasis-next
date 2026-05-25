"use client";

import { useEffect } from "react";
import { useSWRConfig } from "swr";

export default function NotificationStreamBridge() {
  const { mutate } = useSWRConfig();

  useEffect(() => {
    const source = new EventSource("/api/notifications/stream");

    const refreshNotifications = () => {
      void mutate(
        (key) => typeof key === "string" && key.startsWith("/api/notifications"),
        undefined,
        { revalidate: true },
      );
    };

    source.addEventListener("notification", refreshNotifications);
    source.addEventListener("ready", refreshNotifications);
    source.onerror = () => {
      // EventSource handles reconnection automatically.
    };

    return () => {
      source.removeEventListener("notification", refreshNotifications);
      source.removeEventListener("ready", refreshNotifications);
      source.close();
    };
  }, [mutate]);

  return null;
}
