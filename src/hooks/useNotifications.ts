"use client";

import { useState, useEffect } from "react";

export function useNotifications() {
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("Notification" in window && "serviceWorker" in navigator) {
      setSupported(true);
      setPermission(Notification.permission);
      setEnabled(
        Notification.permission === "granted" &&
          localStorage.getItem("notifications_enabled") === "true",
      );
    }
  }, []);

  async function enable() {
    if (!supported) return false;
    try {
      await navigator.serviceWorker.register("/sw.js");
    } catch {}
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      localStorage.setItem("notifications_enabled", "true");
      setEnabled(true);
      new Notification("Observer OS", {
        body: "Reminders enabled. Use the test buttons to preview notifications.",
        icon: "/favicon.ico",
      });
      return true;
    }
    return false;
  }

  function disable() {
    localStorage.setItem("notifications_enabled", "false");
    setEnabled(false);
  }

  async function sendTestNotification(type: "checkin" | "session") {
    if (!supported || permission !== "granted") return;
    if (type === "checkin") {
      new Notification("Observer OS", {
        body: "☀ Morning check-in time. Log your sleep, mood, and energy.",
        icon: "/favicon.ico",
        tag: "checkin",
      });
    } else {
      new Notification("Observer OS", {
        body: "⚡ Evening session log. What did you train today?",
        icon: "/favicon.ico",
        tag: "session",
      });
    }
  }

  return {
    supported,
    permission,
    enabled,
    enable,
    disable,
    sendTestNotification,
  };
}
