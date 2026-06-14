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

    // Register service worker
    let reg: ServiceWorkerRegistration;
    try {
      reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
    } catch (err) {
      console.error("SW registration failed:", err);
      return false;
    }

    // Request permission
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result !== "granted") return false;

    // Subscribe to push
    try {
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        ),
      });

      // Save subscription to server
      await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          action: "subscribe",
        }),
      });

      localStorage.setItem("notifications_enabled", "true");
      setEnabled(true);

      // Send welcome notification
      await sendPushNotification(
        "Observer OS",
        "Notifications enabled. You'll be reminded to check in and log sessions.",
        "welcome",
      );

      return true;
    } catch (err) {
      console.error("Push subscription failed:", err);
      return false;
    }
  }

  async function disable() {
    await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "unsubscribe" }),
    });
    localStorage.setItem("notifications_enabled", "false");
    setEnabled(false);
  }

  async function sendPushNotification(
    title: string,
    message: string,
    type = "observer-os",
  ) {
    try {
      await fetch("/api/push-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, message, type }),
      });
    } catch (err) {
      console.error("Push send failed:", err);
    }
  }

  async function sendTestNotification(type: "checkin" | "session") {
    if (type === "checkin") {
      await sendPushNotification(
        "Observer OS",
        "☀ Morning check-in time. Log your sleep, mood, and energy.",
        "checkin",
      );
    } else {
      await sendPushNotification(
        "Observer OS",
        "⚡ Evening session log. What did you train today?",
        "session",
      );
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

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
