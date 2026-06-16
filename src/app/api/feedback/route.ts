// src/app/api/feedback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const RESEND_URL = "https://api.resend.com/emails";

const CATEGORY_LABEL: Record<string, string> = {
  bug: "Bug report",
  feature: "Feature request",
  feedback: "General feedback",
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/\n/g, "<br>");
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { message, category, screenshot } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 },
      );
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const toEmail = process.env.BUG_REPORT_TO_EMAIL;
    if (!resendApiKey || !toEmail) {
      return NextResponse.json(
        { error: "Feedback isn't configured on the server yet" },
        { status: 500 },
      );
    }

    const categoryLabel = CATEGORY_LABEL[category] ?? CATEGORY_LABEL.bug;
    const userAgent = req.headers.get("user-agent") ?? "Unknown device";
    const timestamp = new Date().toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });

    const html = `
      <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #111; margin-bottom: 4px;">${categoryLabel}</h2>
        <p style="color: #666; font-size: 13px; margin: 0 0 16px;">Observer OS</p>
        <table style="width: 100%; font-size: 13px; color: #444; margin-bottom: 16px;">
          <tr><td style="padding: 4px 0; width: 100px;">From</td><td>${user.email}</td></tr>
          <tr><td style="padding: 4px 0;">When</td><td>${timestamp}</td></tr>
          <tr><td style="padding: 4px 0;">Device</td><td>${userAgent}</td></tr>
        </table>
        <div style="background: #f4f4f0; border-radius: 8px; padding: 16px; font-size: 14px; line-height: 1.6; color: #222;">${escapeHtml(message.trim())}</div>
      </div>
    `;

    const text = `${categoryLabel}\n\nFrom: ${user.email}\nWhen: ${timestamp}\nDevice: ${userAgent}\n\n${message.trim()}`;

    const payload: Record<string, unknown> = {
      from: "Observer OS <onboarding@resend.dev>",
      to: [toEmail],
      reply_to: user.email,
      subject: `[Observer OS] ${categoryLabel}`,
      html,
      text,
    };

    if (screenshot && typeof screenshot === "string") {
      const base64Data = screenshot.split(",")[1] ?? screenshot;
      payload.attachments = [
        { filename: "screenshot.png", content: base64Data },
      ];
    }

    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json(
        { error: `Failed to send: ${err}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
