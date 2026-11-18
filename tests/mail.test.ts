// The SMTP sender (nodemailer) against a minimal local SMTP server: delivery, and a clear failure when SMTP is down.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import type { AddressInfo, Server } from "node:net";
import { createEmailSender, renderEmail } from "../server/mail.ts";

function smtpSink(): Promise<{ server: Server; port: number; received: Array<{ from: string; to: string[]; data: string }> }> {
  const received: Array<{ from: string; to: string[]; data: string }> = [];
  const server = createServer((sock) => {
    let from = "";
    let to: string[] = [];
    let inData = false;
    let data = "";
    let buf = "";
    sock.write("220 sink ESMTP\r\n");
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let i;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            received.push({ from, to, data });
            sock.write("250 OK queued\r\n");
          } else data += line + "\n";
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "QUIT") {
          sock.end("221 bye\r\n");
          continue;
        }
        if (cmd === "MAIL") from = line;
        if (cmd === "RCPT") to.push(line);
        if (cmd === "RSET") to = [];
        if (cmd === "DATA") inData = true;
        sock.write(cmd === "EHLO" || cmd === "HELO" ? "250-sink\r\n250 8BITMIME\r\n" : cmd === "DATA" ? "354 go ahead\r\n" : "250 OK\r\n");
      }
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: (server.address() as AddressInfo).port, received })));
}

const mail = renderEmail({ to: "hirer@example.com", name: "HENG SHI ZHENG", role: "hirer", ref: "VMAF-2026-05121", dealer: "Demo Motors Pte Ltd", url: "https://demo.test/verify/abc", expiresAt: Date.UTC(2026, 10, 21), ttlHours: 72 });

test("SMTP sender delivers the Singpass email through the configured server", async () => {
  const sink = await smtpSink();
  try {
    const sender = createEmailSender({ SMTP_HOST: "127.0.0.1", SMTP_PORT: String(sink.port), SMTP_SECURE: "false", MAIL_FROM: "VMAF Demo <no-reply@example.com>" });
    const r = await sender.send({ to: "hirer@example.com", subject: mail.subject, html: mail.html, text: mail.text });
    assert.deepEqual(r, { delivered: true });
    assert.equal(sink.received.length, 1);
    assert.match(sink.received[0]!.to[0]!, /hirer@example\.com/);
    assert.match(sink.received[0]!.from, /no-reply@example\.com/);
    assert.match(sink.received[0]!.data, /Subject: Verify your identity for your car loan application/);
    assert.match(sink.received[0]!.data, /demo\.test\/verify\/abc/);
  } finally {
    sink.server.close();
  }
});

test("SMTP sender reports a failure instead of throwing when the server is unreachable; no SMTP_HOST = log only", async () => {
  const closed = await smtpSink();
  const port = closed.port;
  await new Promise<void>((r) => closed.server.close(() => r()));
  const down = createEmailSender({ SMTP_HOST: "127.0.0.1", SMTP_PORT: String(port) });
  const r = await down.send({ to: "hirer@example.com", subject: mail.subject, html: mail.html, text: mail.text });
  assert.equal(r.delivered, false);
  assert.ok(r.error);

  assert.deepEqual(await createEmailSender({}).send({ to: "x@example.com", subject: "s", html: "h", text: "t" }), { delivered: false });
});
