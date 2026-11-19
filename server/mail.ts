// Email of screen 4 (template) and the sender: Brevo HTTP API (BREVO_API_KEY) or SMTP.
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { formatSgt } from "./time.ts";
import type { EmailSender } from "./verification/service.ts";

export interface SingpassEmail {
  to: string;
  name: string;
  role: string;
  ref: string;
  dealer: string;
  url: string;
  expiresAt: number;
  ttlHours: number;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);

export function renderEmail(m: SingpassEmail): { subject: string; html: string; text: string } {
  const subject = "Verify your identity for your car loan application";
  const role = m.role === "hirer" ? "Hirer" : "Guarantor";
  const expires = formatSgt(m.expiresAt);
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#F6F6F7;font-family:Inter,Arial,sans-serif;color:#1F1F24">
<div style="max-width:480px;margin:0 auto;background:#FFFFFF;padding:20px;font-size:15px;line-height:1.55">
  <div style="padding:10px 14px;background:#7A1C2E;color:#FFFFFF;border-radius:8px;font-weight:700;font-size:14px">&#9679; ValueMax AutoFinance</div>
  <p>Dear ${esc(m.name)},</p>
  <p>${esc(m.dealer)} has submitted a hire-purchase application (${esc(m.ref)}) for you as <b>${role}</b>. Please verify your details with Singpass MyInfo.</p>
  <p style="text-align:center;margin:22px 0"><a href="${esc(m.url)}" style="display:inline-block;padding:14px 28px;border-radius:8px;background:#A3203A;color:#FFFFFF;font-weight:600;text-decoration:none">Verify with Singpass</a></p>
  <div style="padding:12px 14px;border-radius:10px;background:#FBF1DE;color:#6B4A00;font-size:13px">This link expires on ${expires} (${m.ttlHours} hours). If a new link is sent, this one stops working.</div>
  <p style="font-size:13px;color:#6B6B76">You also received a message telling you this email was sent. ValueMax will never ask for your Singpass password.</p>
  <p style="font-size:11px;color:#8A8A94">DEMO ONLY · simulated Singpass flow.</p>
</div></body></html>`;
  const text = `Dear ${m.name},\n\n${m.dealer} has submitted a hire-purchase application (${m.ref}) for you as ${role}.\nVerify with Singpass: ${m.url}\n\nThis link expires on ${expires} (${m.ttlHours} hours).`;
  return { subject, html, text };
}

/** "Name <a@b.c>" or "a@b.c" -> { name?, email } */
export function parseAddress(from: string): { name?: string; email: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  if (!m) return { email: from.trim() };
  const name = m[1]?.trim();
  const email = (m[2] ?? "").trim();
  return name ? { name, email } : { email };
}

/**
 * Brevo transactional email over HTTPS (port 443). Hosts such as Render's free plan block outbound SMTP ports.
 * MAIL_FROM must be a sender verified in Brevo.
 */
async function sendViaBrevo(apiKey: string, from: string, m: { to: string; subject: string; html: string; text: string }): Promise<void> {
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: parseAddress(from), to: [{ email: m.to }], subject: m.subject, htmlContent: m.html, textContent: m.text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`Brevo ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

/** Which transport createEmailSender uses for this environment. */
export function emailTransport(env: Record<string, string | undefined>): "brevo" | "smtp" | "none" {
  return env.BREVO_API_KEY ? "brevo" : env.SMTP_HOST ? "smtp" : "none";
}

/**
 * Brevo HTTP API when BREVO_API_KEY is set, else SMTP when SMTP_HOST is set; with neither the email is only logged
 * (with its link) and kept in the outbox.
 */
export function createEmailSender(env: Record<string, string | undefined>): EmailSender {
  const transport = emailTransport(env);
  const brevoKey = env.BREVO_API_KEY ?? "";
  let transporter: Transporter | null = null;
  if (transport === "smtp") {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT || 587),
      secure: env.SMTP_SECURE === "true",
      ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" } } : {}),
    });
  }
  const from = env.MAIL_FROM || "ValueMax AutoFinance (Demo) <no-reply@example.com>";
  return {
    async send(m) {
      const link = /https?:\/\/\S+/.exec(m.text)?.[0] ?? "";
      console.log(`[mail] → ${m.to}${transport === "none" ? ` (email not configured) ${link}` : ` (${transport})`}`);
      if (transport === "none") return { delivered: false };
      try {
        if (transport === "brevo") await sendViaBrevo(brevoKey, from, m);
        else await transporter!.sendMail({ from, to: m.to, subject: m.subject, html: m.html, text: m.text });
        return { delivered: true };
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        console.error(`[mail] failed: ${error}`);
        return { delivered: false, error };
      }
    },
  };
}
