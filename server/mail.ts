// Email of screen 4 (template) and the SMTP sender.
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
  const html = `<!doctype html><html><body style="margin:0;background:#F6F6F7;font-family:Inter,Arial,sans-serif;color:#1F1F24">
<div style="max-width:480px;margin:0 auto;background:#FFFFFF;padding:20px;font-size:15px;line-height:1.55">
  <div style="padding:10px 14px;background:#7A1C2E;color:#FFFFFF;border-radius:8px;font-weight:700;font-size:14px">&#9679; ValueMax AutoFinance</div>
  <p>Dear ${esc(m.name)},</p>
  <p>${esc(m.dealer)} has submitted a hire-purchase application (${esc(m.ref)}) for you as <b>${role}</b>. Please verify your details with Singpass MyInfo.</p>
  <p style="text-align:center;margin:22px 0"><a href="${esc(m.url)}" style="display:inline-block;padding:14px 28px;border-radius:8px;background:#A3203A;color:#FFFFFF;font-weight:600;text-decoration:none">Verify with Singpass</a></p>
  <div style="padding:12px 14px;border-radius:10px;background:#FBF1DE;color:#6B4A00;font-size:13px">This link expires on ${expires} (${m.ttlHours} hours). If a new link is sent, this one stops working.</div>
  <p style="font-size:13px;color:#6B6B76">ValueMax will never ask for your Singpass password.</p>
  <p style="font-size:11px;color:#8A8A94">DEMO ONLY · simulated Singpass flow.</p>
</div></body></html>`;
  const text = `Dear ${m.name},\n\n${m.dealer} has submitted a hire-purchase application (${m.ref}) for you as ${role}.\nVerify with Singpass: ${m.url}\n\nThis link expires on ${expires} (${m.ttlHours} hours).`;
  return { subject, html, text };
}

/** SMTP from the environment; without SMTP_HOST the email is only logged (with its link) and kept in the outbox. */
export function createEmailSender(env: Record<string, string | undefined>): EmailSender {
  const host = env.SMTP_HOST;
  let transporter: Transporter | null = null;
  if (host) {
    transporter = nodemailer.createTransport({
      host,
      port: Number(env.SMTP_PORT || 587),
      secure: env.SMTP_SECURE === "true",
      ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" } } : {}),
    });
  }
  const from = env.MAIL_FROM || "ValueMax AutoFinance (Demo) <no-reply@example.com>";
  return {
    async send(m) {
      const link = /https?:\/\/\S+/.exec(m.text)?.[0] ?? "";
      console.log(`[mail] → ${m.to}${transporter ? "" : ` (SMTP not configured) ${link}`}`);
      if (!transporter) return { delivered: false };
      try {
        await transporter.sendMail({ from, to: m.to, subject: m.subject, html: m.html, text: m.text });
        return { delivered: true };
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        console.error(`[mail] failed: ${error}`);
        return { delivered: false, error };
      }
    },
  };
}
