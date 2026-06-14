"use client";

import { useState, useEffect } from "react";

export function useNotifications() {
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator
    ) {
      setSupported(true);
      setPermission(Notification.permission);
    }
  }, []);

  async function requestPermission() {
    if (!supported) return false;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result === "granted";
  }

  async function registerServiceWorker() {
    if (!supported) return null;
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      return reg;
    } catch (err) {
      console.error("SW registration failed:", err);
      return null;
    }
  }

  async function scheduleNotifications() {
    const granted = await requestPermission();
    if (!granted) return false;

    await registerServiceWorker();

    // Store preference
    localStorage.setItem("notifications_enabled", "true");

    // Show immediate confirmation
    new Notification("Observer OS", {
      body: "Notifications enabled. You'll be reminded to check in at 8 AM and log sessions at 8 PM.",
      icon: "/favicon.ico",
    });

    return true;
  }

  function disableNotifications() {
    localStorage.setItem("notifications_enabled", "false");
  }

  function isEnabled() {
    if (typeof window === "undefined") return false;
    return (
      localStorage.getItem("notifications_enabled") === "true" &&
      permission === "granted"
    );
  }

  async function sendTestNotification(type: "checkin" | "session") {
    if (!supported || permission !== "granted") return;
    const reg = await navigator.serviceWorker.ready;
    if (type === "checkin") {
      reg.showNotification("Observer OS", {
        body: "☀ Morning check-in time. Log your sleep, mood, and energy.",
        icon: "/favicon.ico",
        tag: "checkin",
      });
    } else {
      reg.showNotification("Observer OS", {
        body: "⚡ Evening session log. What did you train today?",
        icon: "/favicon.ico",
        tag: "session",
      });
    }
  }

  return {
    supported,
    permission,
    isEnabled,
    scheduleNotifications,
    disableNotifications,
    sendTestNotification,
  };
}
