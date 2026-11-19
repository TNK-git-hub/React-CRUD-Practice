// The SMTP sender (nodemailer) against a minimal local SMTP server: delivery, and a clear failure when SMTP is down.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import type { AddressInfo, Server } from "node:net";
import { createEmailSender, emailTransport, parseAddress, renderEmail } from "../server/mail.ts";

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

test("parseAddress splits a display name from the address", () => {
  assert.deepEqual(parseAddress("VMAF Demo <no-reply@example.com>"), { name: "VMAF Demo", email: "no-reply@example.com" });
  assert.deepEqual(parseAddress('"VMAF Demo" <no-reply@example.com>'), { name: "VMAF Demo", email: "no-reply@example.com" });
  assert.deepEqual(parseAddress("<no-reply@example.com>"), { email: "no-reply@example.com" });
  assert.deepEqual(parseAddress(" no-reply@example.com "), { email: "no-reply@example.com" });
});

test("BREVO_API_KEY takes priority over SMTP_HOST", () => {
  assert.equal(emailTransport({ BREVO_API_KEY: "k", SMTP_HOST: "smtp.example.com" }), "brevo");
  assert.equal(emailTransport({ SMTP_HOST: "smtp.example.com" }), "smtp");
  assert.equal(emailTransport({}), "none");
});

async function withFetch<T>(fake: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  globalThis.fetch = fake;
  try {
    return await fn();
  } finally {
    globalThis.fetch = real;
  }
}

test("Brevo sender posts the Singpass email to the Brevo HTTP API", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const r = await withFetch(
    (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ messageId: "<m1>" }), { status: 201 });
    }) as typeof fetch,
    () =>
      createEmailSender({ BREVO_API_KEY: "test-key", SMTP_HOST: "127.0.0.1", MAIL_FROM: "VMAF Demo <sender@example.com>" }).send({
        to: "hirer@example.com",
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
  );
  assert.deepEqual(r, { delivered: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "https://api.brevo.com/v3/smtp/email");
  assert.equal(calls[0]!.init.method, "POST");
  assert.equal((calls[0]!.init.headers as Record<string, string>)["api-key"], "test-key");
  const body = JSON.parse(String(calls[0]!.init.body));
  assert.deepEqual(body.sender, { name: "VMAF Demo", email: "sender@example.com" });
  assert.deepEqual(body.to, [{ email: "hirer@example.com" }]);
  assert.equal(body.subject, "Verify your identity for your car loan application");
  assert.match(body.htmlContent, /demo\.test\/verify\/abc/);
  assert.match(body.textContent, /demo\.test\/verify\/abc/);
});

test("Brevo sender reports an API error or network failure instead of throwing", async () => {
  const msg = { to: "hirer@example.com", subject: mail.subject, html: mail.html, text: mail.text };
  const rejected = await withFetch(
    (async () => new Response('{"code":"unauthorized","message":"Key not found"}', { status: 401 })) as typeof fetch,
    () => createEmailSender({ BREVO_API_KEY: "bad" }).send(msg),
  );
  assert.equal(rejected.delivered, false);
  assert.match(rejected.error ?? "", /Brevo 401: .*Key not found/);

  const down = await withFetch(
    (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch,
    () => createEmailSender({ BREVO_API_KEY: "k" }).send(msg),
  );
  assert.deepEqual(down, { delivered: false, error: "fetch failed" });
});
