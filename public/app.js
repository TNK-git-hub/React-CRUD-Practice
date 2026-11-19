// ValueMax Singpass demo — single-page frontend (dealer, Ops, customer phone, Demo Control).

const $app = document.getElementById("app");
const $toast = document.getElementById("toast");

// ---------------- utilities ----------------
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Outline icon from the sprite in index.html. Decorative by default (next to visible text): aria-hidden.
// For an icon-only button, put aria-label on the button itself.
const icon = (name, cls = "") => `<svg class="ic${cls ? ` ${cls}` : ""}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

let toastTimer;
// kind: true or "err" (error), "info", or "ok" (default). Shown top right, just below the header / demo banner, so it
// never covers the form's own buttons.
function toast(msg, kind = "ok") {
  const type = kind === true || kind === "err" ? "err" : kind === "info" ? "info" : "ok";
  const edge = Math.max(0, ...[".hdr", ".demo-time", ".phone-hdr", ".simbar"].map((sel) => document.querySelector(sel)?.getBoundingClientRect().bottom ?? 0));
  $toast.style.top = `${Math.round(edge) + 12}px`;
  $toast.innerHTML = `${icon(type === "err" ? "alert-circle" : type === "info" ? "info" : "check-circle", "lg")}<span>${esc(msg)}</span>`;
  $toast.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($toast.className = ""), 3200);
}

const sgt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
function fmt(ms) {
  if (!ms) return "—";
  const p = Object.fromEntries(sgt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}`;
}
const fmtDay = (ms) => new Date(ms).toLocaleDateString("en-GB", { timeZone: "Asia/Singapore", day: "2-digit", month: "short", year: "numeric" });
function hoursLeft(ms) {
  const h = Math.max(0, Math.ceil((ms - Date.now()) / 3_600_000));
  return `${h} h`;
}

// NRIC / FIN check (same rules as server/nric.ts)
function validNric(v) {
  const m = /^([STFGM])(\d{7})([A-Z])$/.exec(String(v).trim().toUpperCase());
  if (!m) return false;
  const w = [2, 7, 6, 5, 4, 3, 2];
  let s = { S: 0, T: 4, F: 0, G: 4, M: 3 }[m[1]];
  for (let i = 0; i < 7; i++) s += Number(m[2][i]) * w[i];
  const t = "ST".includes(m[1]) ? "JZIHGFEDCBA" : m[1] === "M" ? "XWUTRQPNJLK" : "XWUTRQPNMLK";
  return t[s % 11] === m[3];
}
const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
const validMobile = (v) => /^[89]\d{7}$/.test(String(v).replace(/\s+/g, ""));

function makeQr(el, text, size = 180) {
  el.innerHTML = "";
  if (window.QRCode) new window.QRCode(el, { text, width: size, height: size, correctLevel: window.QRCode.CorrectLevel.M });
  else el.textContent = "QR library not loaded";
}

// Small modal form (reason for resend, correction of details). Resolves with the values, or null if cancelled.
function openDialog({ title, intro = "", fields, submit }) {
  return new Promise((resolve) => {
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `<form class="modal card" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <h2 style="font-size:21px">${esc(title)}</h2>${intro ? `<p class="para" style="margin:0">${intro}</p>` : ""}
      ${fields.map((f) => `<label class="field">${esc(f.label)}<input class="input" name="${f.name}" value="${esc(f.value ?? "")}" placeholder="${esc(f.placeholder ?? "")}" autocomplete="off"></label>`).join("")}
      <div class="row" style="justify-content:flex-end"><button class="btn" type="button" data-cancel>Cancel</button><button class="btn primary" type="submit">${esc(submit)}</button></div>
    </form>`;
    const close = (v) => { bg.remove(); resolve(v); };
    bg.querySelector("[data-cancel]").addEventListener("click", () => close(null));
    bg.addEventListener("click", (e) => e.target === bg && close(null));
    bg.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      close(Object.fromEntries(new FormData(e.target).entries()));
    });
    document.body.appendChild(bg);
    bg.querySelector("input")?.focus();
  });
}

// D-41: NRICs are masked; "Show" asks the server for the full value, which is audited.
function nricWithReveal(ref, party, which, masked) {
  return `<span data-nric="${esc(party.id)}|${which}">${esc(masked)}</span> <button class="link-btn" type="button" data-reveal="${esc(ref)}|${esc(party.id)}|${which}">Show</button>`;
}
function bindReveal() {
  $app.querySelectorAll("[data-reveal]").forEach((b) => b.addEventListener("click", async () => {
    const [ref, partyId, which] = b.dataset.reveal.split("|");
    try {
      const r = await api("POST", `/api/applications/${ref}/parties/${partyId}/reveal-nric`, { which });
      const slot = $app.querySelector(`[data-nric="${partyId}|${which}"]`);
      if (slot) slot.textContent = r.nric;
      b.remove();
    } catch (e) { toast(e.message, true); }
  }));
}

// D-50: the design's "Demo: see …" buttons open a sample application in the matching state. ops-view / dealer-view
// switch the browser to that role first; hirer-view opens the customer page in a new tab.
function bindShortcuts() {
  document.querySelectorAll("[data-shortcut]").forEach((b) => b.addEventListener("click", async () => {
    const kind = b.dataset.shortcut;
    const tab = kind === "hirer-view" ? window.open("", "_blank") : null;
    try {
      if (kind === "dealer-view" && state.user?.kind !== "dealer") state.user = (await api("POST", "/api/session", { userId: "u-alex" })).user;
      const r = await api("GET", `/api/demo/shortcut/${kind}`);
      if (r.userId && state.user?.id !== r.userId) state.user = (await api("POST", "/api/session", { userId: r.userId })).user;
      if (tab) tab.location.href = r.url;
      else location.href = r.url;
    } catch (e) {
      tab?.close();
      toast(e.message, true);
    }
  }));
}

// ---------------- state ----------------
const state = { user: null, config: null, draft: null, refresh: null, demo: null };
const emptyParty = () => ({ name: "", nric: "", email: "", mobile: "" });
function loadDraft() {
  try {
    const d = JSON.parse(sessionStorage.getItem("draft") || "null");
    if (d) return { ...emptyDraft(), ...d };
  } catch {}
  return emptyDraft();
}
function emptyDraft() {
  return { hirer: emptyParty(), guarantorOn: false, guarantor: emptyParty(), guarantor2On: false, guarantor2: emptyParty(), ltaCode: "", c1: false, c2: false };
}
function saveDraft() {
  try { sessionStorage.setItem("draft", JSON.stringify(state.draft)); } catch {}
}

// ---------------- realtime ----------------
function connectEvents() {
  // SSE is the fast path. Behind a hosting proxy it can be delayed or silently dropped, so: refresh after every
  // (re)connect, when the tab becomes visible again, and fall back to polling while the stream looks dead.
  let es = null;
  let lastMsg = Date.now();
  let opened = false;
  const refresh = (data = {}) => { if (state.refresh) state.refresh(data); };
  const open = () => {
    es?.close();
    es = new EventSource("/api/events");
    es.onopen = () => {
      lastMsg = Date.now();
      if (opened) refresh(); // catch up on anything missed while disconnected
      opened = true;
    };
    es.addEventListener("ping", () => { lastMsg = Date.now(); });
    es.addEventListener("application", (e) => {
      lastMsg = Date.now();
      let data = {};
      try { data = JSON.parse(e.data); } catch {}
      refresh(data);
    });
    es.addEventListener("demo", async () => {
      lastMsg = Date.now();
      await loadDemoClock();
      if (state.refresh) state.refresh({});
      else if (state.user) render();
    });
  };
  open();
  setInterval(() => {
    if (document.hidden) return;
    if (Date.now() - lastMsg > 35_000) { // no ping for 2 intervals: stream is stuck
      refresh();
      open();
    }
  }, 5_000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
}

async function loadDemoClock() {
  if (!state.user) return (state.demo = null);
  try { state.demo = await api("GET", "/api/demo/state"); } catch { state.demo = null; }
}

// ---------------- router ----------------
function go(path) {
  $toast.className = ""; // a toast belongs to the page it was shown on
  history.pushState({}, "", path);
  render();
}
window.addEventListener("popstate", () => render());
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-go]");
  if (a && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    go(a.getAttribute("href"));
  }
});

async function render() {
  state.refresh = null;
  const path = location.pathname;
  let m;
  try {
    if ((m = path.match(/^\/verify\/([^/]+)$/))) return await portalPage(m[1]);
    if ((m = path.match(/^\/gateway\/([^/]+)$/))) return await gatewayFlow(decodeURIComponent(m[1]));
    if (!state.user) return signIn();
    if (path === "/" || path === "/login") return go(state.user.kind === "ops" ? "/ops" : "/dealer/apply");
    if (path === "/demo") return await demoPage();
    if (state.user.kind === "dealer") {
      if (path === "/dealer/apply") return dealerApply();
      if (path === "/dealer/review") return dealerReview();
      if ((m = path.match(/^\/dealer\/received\/([^/]+)$/))) return await dealerReceived(m[1]);
      if (path === "/dealer/applications") return await dealerList();
      if ((m = path.match(/^\/dealer\/applications\/([^/]+)$/))) return await dealerStatus(m[1]);
      return go("/dealer/apply");
    }
    if (path === "/ops") return await opsList();
    if (path === "/ops/expired") return await opsExpired();
    if ((m = path.match(/^\/ops\/applications\/([^/]+)$/))) return await opsDetail(m[1]);
    return go("/ops");
  } catch (e) {
    if (e.status === 401) {
      state.user = null;
      return signIn();
    }
    $app.innerHTML = `${header()}<main class="wrap"><div class="note-red" role="alert">${icon("alert-circle")}<span>${esc(e.message)}</span></div><div><a class="btn" href="/" data-go>Home</a></div></main>`;
  }
}

// ---------------- shells ----------------
function demoBanner() {
  const off = state.demo?.offsetMs ?? 0;
  if (!state.user || off <= 0) return "";
  const h = Math.round(off / 3_600_000);
  return `<div class="demo-time" role="status">${icon("clock")}<b>Demo time: +${h} h</b><span>The clock is moved forward for the demo (now <span class="num">${fmt(state.demo.now)}</span> SGT).</span><button class="btn sm" id="realtime" type="button">Back to real time</button></div>`;
}

function header() {
  const u = state.user;
  const area = u?.kind === "ops" ? "OPERATIONS" : "DEALER PORTAL";
  return `${demoBanner()}<header class="hdr">
    <a class="brand" href="/" data-go><span class="dot" aria-hidden="true"></span><span class="brand-text"><b>ValueMax AutoFinance</b><small>${area}</small></span></a>
    ${u ? `<div class="who"><span class="who-text"><b>${esc(u.name)}</b><small>${esc(u.org)}</small></span><span class="avatar" aria-hidden="true">${esc(u.initials)}</span>
      <button class="hdr-btn" id="signout" type="button">${icon("switch")}<span>Switch role</span></button></div>` : ""}
  </header>`;
}

function dealerShell(active, inner) {
  const item = (href, label, key) => `<a href="${href}" data-go${active === key ? ' class="on" aria-current="page"' : ""}>${label}</a>`;
  return `${header()}<div class="layout">
    <nav class="side" aria-label="Dealer menu">
      <span class="cap">FINANCE</span>
      ${item("/dealer/applications", "Home", "list")}
      ${item("/dealer/apply", "Application", "apply")}
      <span class="item off" aria-disabled="true">Account</span>
      <span class="cap">SUPPORT</span>
      <span class="item off" aria-disabled="true">Document Centre</span>
      <span class="item off" aria-disabled="true">Contact Us</span>
    </nav>
    <main class="main">${inner}</main>
  </div>`;
}

function bindCommon() {
  document.getElementById("realtime")?.addEventListener("click", async () => {
    try { state.demo = await api("POST", "/api/demo/clock/reset"); toast("Back to real time"); } catch (e) { toast(e.message, true); }
  });
  document.getElementById("signout")?.addEventListener("click", async () => {
    await api("DELETE", "/api/session");
    state.user = null;
    go("/login");
  });
}

// ---------------- sign-in (D-08) ----------------
async function signIn() {
  if (location.pathname !== "/login" && location.pathname !== "/demo") history.replaceState({}, "", "/login");
  const users = await api("GET", "/api/users");
  $app.innerHTML = `${header()}<main class="signin">
    <div><h1 class="page-title">Sign in to the demo</h1><p class="page-sub">Pick a role. No password in this demo.</p></div>
    <div class="stack-sm">${users.map((u) => `<button class="rolecard" data-user="${u.id}" type="button"><span class="avatar" aria-hidden="true">${esc(u.initials)}</span>
      <span class="rolecard-text"><b>${esc(u.name)} — ${esc(u.org)}</b><span class="muted small">${u.kind === "ops" ? "VMAF Ops · all applications, IPA / AA" : "Dealer user · Quick Apply, own applications"}</span></span>${icon("chevron-right", "lg")}</button>`).join("")}</div>
    <p class="small muted">${icon("info")} Customers do not sign in: they open the link from their email on their phone.</p>
  </main>`;
  $app.querySelectorAll("[data-user]").forEach((b) =>
    b.addEventListener("click", async () => {
      const { user } = await api("POST", "/api/session", { userId: b.dataset.user });
      state.user = user;
      await loadDemoClock();
      const target = sessionStorage.getItem("after-login");
      sessionStorage.removeItem("after-login");
      go(target || (user.kind === "ops" ? "/ops" : "/dealer/apply"));
    }),
  );
}

// ---------------- screen 1: Quick Apply ----------------
function stepsBar(n) {
  const names = ["Application Details", "Documents", "Review &amp; Submit"];
  return `<ol class="steps">${names
    .map((nm, i) => {
      const cls = i + 1 < n ? "done" : i + 1 === n ? "on" : "";
      return `<li class="${cls}"><i>${i + 1 < n ? "✓" : i + 1}</i>${nm}</li>`;
    })
    .join("")}</ol>`;
}

function partyFields(prefix, p, label, boxed) {
  const bg = boxed ? ' style="background:#fff"' : "";
  return `<div class="grid3">
    <label class="field span2">Name of ${label} *<input class="input" data-f="${prefix}.name" value="${esc(p.name)}" autocomplete="off"${bg}></label>
    <label class="field">NRIC of ${label} *<input class="input" data-f="${prefix}.nric" value="${esc(p.nric)}" autocomplete="off"${bg}><span class="hint" data-h="${prefix}.nric"></span></label>
    <label class="field">Email Address *${prefix === "hirer" ? " (to send Singpass request)" : ""}<input class="input" type="email" data-f="${prefix}.email" value="${esc(p.email)}"${bg}><span class="hint" data-h="${prefix}.email"></span></label>
    <label class="field">Phone Number *<input class="input" inputmode="numeric" data-f="${prefix}.mobile" value="${esc(p.mobile)}"${bg}><span class="hint" data-h="${prefix}.mobile"></span></label>
  </div>`;
}

function fieldState(prefix, key, value, others = []) {
  if (!value) return { cls: "", msg: "" };
  if (key === "nric") {
    if (!validNric(value)) return { cls: "err", msg: "✗ Invalid NRIC / FIN" };
    if (others.some((o) => o && value.trim().toUpperCase() === o.trim().toUpperCase())) return { cls: "err", msg: "✗ Each person needs a different NRIC" };
    return { cls: "ok", msg: "✓ Valid NRIC / FIN" };
  }
  if (key === "email") return validEmail(value) ? { cls: "ok", msg: "✓ Looks good" } : { cls: "err", msg: "✗ Invalid email" };
  if (key === "mobile") return validMobile(value) ? { cls: "ok", msg: "✓ Valid Singapore mobile number" } : { cls: "err", msg: "✗ 8 digits, starting with 8 or 9" };
  return { cls: "", msg: "" };
}

function partyValid(p, others = []) {
  return p.name.trim() && validNric(p.nric) && validEmail(p.email) && validMobile(p.mobile) && !others.some((o) => p.nric.trim().toUpperCase() === o.trim().toUpperCase());
}
const otherNrics = (d, prefix) => ({ hirer: [], guarantor: [d.hirer.nric], guarantor2: [d.hirer.nric, d.guarantor.nric] })[prefix];
function draftValid(d) {
  return partyValid(d.hirer) && (!d.guarantorOn || partyValid(d.guarantor, otherNrics(d, "guarantor"))) && (!d.guarantorOn || !d.guarantor2On || partyValid(d.guarantor2, otherNrics(d, "guarantor2"))) && d.ltaCode.trim();
}

function dealerApply() {
  state.draft ??= loadDraft();
  const d = state.draft;
  $app.innerHTML = dealerShell("apply", `
    ${stepsBar(1)}
    <section class="card">
      <div class="row between" style="align-items:flex-start">
        <div><h2>Section A — Applicant Details</h2><span class="muted" style="font-size:14px">Used to send the hirer their Singpass verification request.</span></div>
        <button class="btn sm" id="sample" type="button">Fill sample (test personas)</button>
      </div>
      ${partyFields("hirer", d.hirer, "Applicant", false)}
      <button class="toggle" id="gtoggle" type="button" aria-pressed="${d.guarantorOn}"><span class="sw"></span>
        <span><b>Add Guarantor Info</b><span class="muted">Optional — if added, the guarantor's NRIC and an income document will also be required</span></span></button>
      ${d.guarantorOn ? `<div class="gbox"><b style="font-size:16px">Guarantor Details</b>${partyFields("guarantor", d.guarantor, "Guarantor", true)}
        <button class="toggle" id="g2toggle" type="button" aria-pressed="${d.guarantor2On}"><span class="sw"></span>
          <span><b>Add a second guarantor</b><span class="muted">Optional — at most two guarantors per application</span></span></button>
        ${d.guarantor2On ? `<b style="font-size:16px">Second Guarantor Details</b>${partyFields("guarantor2", d.guarantor2, "Second Guarantor", true)}` : ""}</div>` : ""}
      <label class="field" style="max-width:360px">LTA Access Code *<input class="input" data-f="ltaCode" value="${esc(d.ltaCode)}"><span class="hint">The rest of the form unlocks once this is entered.</span></label>
    </section>
    <div class="row between">
      <button class="btn" id="clear" type="button">Cancel</button>
      <button class="btn primary" id="next" type="button">Next: Documents →</button>
    </div>`);
  bindCommon();

  const refreshHints = () => {
    for (const prefix of ["hirer", "guarantor", "guarantor2"]) {
      for (const key of ["nric", "email", "mobile"]) {
        const h = $app.querySelector(`[data-h="${prefix}.${key}"]`);
        if (!h) continue;
        const s = fieldState(prefix, key, d[prefix][key], otherNrics(d, prefix));
        h.className = `hint ${s.cls}`;
        h.textContent = s.msg;
        $app.querySelector(`[data-f="${prefix}.${key}"]`)?.classList.toggle("bad", s.cls === "err");
      }
    }
  };
  $app.querySelectorAll("[data-f]").forEach((inp) =>
    inp.addEventListener("input", () => {
      const [a, b] = inp.dataset.f.split(".");
      if (b) d[a][b] = inp.value;
      else d[a] = inp.value;
      saveDraft();
      refreshHints();
    }),
  );
  refreshHints();
  document.getElementById("gtoggle").addEventListener("click", () => {
    d.guarantorOn = !d.guarantorOn;
    saveDraft();
    dealerApply();
  });
  document.getElementById("g2toggle")?.addEventListener("click", () => {
    d.guarantor2On = !d.guarantor2On;
    saveDraft();
    dealerApply();
  });
  document.getElementById("sample").addEventListener("click", () => {
    const email = d.hirer.email || "";
    const sp = state.config.samples;
    d.hirer = { name: sp.hirer.name, nric: sp.hirer.nric, email, mobile: "9123 4567" };
    d.guarantorOn = true;
    d.guarantor = { name: sp.guarantor.name, nric: sp.guarantor.nric, email: d.guarantor.email || email, mobile: "9876 5432" };
    d.ltaCode = "A7K29Q";
    saveDraft();
    dealerApply();
    toast("Sample filled — type the email address(es) that should receive the Singpass link", "info");
  });
  document.getElementById("clear").addEventListener("click", () => {
    state.draft = emptyDraft();
    saveDraft();
    dealerApply();
  });
  document.getElementById("next").addEventListener("click", () => {
    if (!draftValid(d)) return toast("Please complete every required field with valid values", true);
    go("/dealer/review");
  });
}

// ---------------- screen 2: Review & Submit ----------------
function dealerReview() {
  state.draft ??= loadDraft();
  const d = state.draft;
  if (!draftValid(d)) return go("/dealer/apply");
  const box = (lbl, p) => `<div class="sumbox"><span class="lbl">${lbl}</span><b style="font-size:15px">${esc(p.name.toUpperCase())} · ${esc(p.nric.toUpperCase())}</b><span class="muted small">${esc(p.email)}</span></div>`;
  $app.innerHTML = dealerShell("apply", `
    ${stepsBar(3)}
    <section class="card" style="gap:16px">
      <h2>Singpass requests</h2>
      <div class="grid2">${box("HIRER", d.hirer)}${d.guarantorOn ? box(d.guarantor2On ? "GUARANTOR 1" : "GUARANTOR", d.guarantor) : ""}${d.guarantorOn && d.guarantor2On ? box("GUARANTOR 2", d.guarantor2) : ""}</div>
      <label class="check"><input type="checkbox" id="c1" ${d.c1 ? "checked" : ""}>I confirm that the Applicant and Guarantor(s) have been shown the declarations above, have read and understood them in a language they understand, and have agreed to them — including consent to identity, employment and credit bureau verification.</label>
      <div class="band">DEALER'S ATTESTATION</div>
      <p class="para">By submitting this application, I, as an authorised representative of the Dealer named in this application, confirm that: (a) all information was provided by the Applicant / Guarantor(s) and is accurate and complete; (b) I have verified the identity of the Applicant / Guarantor(s) against their original supporting documents; (c) the Applicant / Guarantor(s) have consented to … receiving a Singpass verification request to authorise MyInfo retrieval; and (d) I understand the Dealer is not an agent of VMAF.</p>
      <label class="check"><input type="checkbox" id="c2" ${d.c2 ? "checked" : ""}>I have explained the above (including the Privacy Policy) to the Applicant / Guarantor(s), and I make the Dealer's Attestation set out above.</label>
    </section>
    <div class="note-gold">On submit, a Singpass verification link is emailed to each person (one active link each, valid ${state.config.ttlHours} hours).</div>
    <div class="row between">
      <a class="btn" href="/dealer/apply" data-go>← Back</a>
      <div class="row"><a class="btn" href="/dealer/apply" data-go>Cancel</a><button class="btn primary" id="send" type="button">Send Singpass Request →</button></div>
    </div>`);
  bindCommon();
  const btn = document.getElementById("send");
  const sync = () => (btn.disabled = !(d.c1 && d.c2));
  for (const id of ["c1", "c2"])
    document.getElementById(id).addEventListener("change", (e) => {
      d[id] = e.target.checked;
      saveDraft();
      sync();
    });
  sync();
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Sending…";
    try {
      const app = await api("POST", "/api/applications", {
        hirer: d.hirer,
        guarantors: d.guarantorOn ? [d.guarantor, ...(d.guarantor2On ? [d.guarantor2] : [])] : [],
        ltaCode: d.ltaCode,
      });
      state.draft = emptyDraft();
      saveDraft();
      go(`/dealer/received/${app.ref}`);
    } catch (e) {
      toast(e.message, true);
      btn.textContent = "Send Singpass Request →";
      sync();
    }
  });
}

// ---------------- screen 3: Interest Received ----------------
async function dealerReceived(ref) {
  const app = await api("GET", `/api/applications/${ref}`);
  const hirer = app.parties.find((p) => p.role === "hirer");
  $app.innerHTML = `${header()}<main style="max-width:980px;margin:0 auto;padding:48px 16px">
    <section class="card hero">
      <div class="okcircle">${icon("check", "xl")}</div>
      <h1 style="font-size:28px;color:var(--red-deep)">Interest Received</h1>
      <p class="para" style="font-size:16px;max-width:560px">Thanks — we've received your interest for <b style="color:var(--text)">${esc(hirer.name)}</b>. We're now sending Singpass verification links to the ${app.parties.length > 2 ? "hirer and both guarantors" : app.parties.length > 1 ? "hirer and guarantor" : "hirer"}.</p>
      <span class="pill">Application Ref: ${esc(app.ref)}</span>
      <div class="grid2" style="width:100%;max-width:560px;text-align:left">
        ${app.parties.map((p) => `<div class="sumbox"><span class="muted small">${esc(p.label)} · ${p.linkStatus === "QUEUED" ? "queued — sent automatically once the Singpass gateway is reachable" : "link sent"}</span><b style="font-size:14px">${p.expiresAt ? `Expires ${fmt(p.expiresAt)}` : "Expiry starts when the link is sent"}</b></div>`).join("")}
      </div>
      <p class="para" style="font-size:15px">Keep an eye on the <b>My Applications</b> page for updates — this application now shows as <b>Pending</b>.</p>
      <div class="row center">
        <a class="btn" href="/dealer/apply" data-go>Submit Another</a>
        <a class="btn" href="/dealer/applications/${esc(app.ref)}" data-go>View Application Status</a>
        <button class="btn primary" type="button" data-shortcut="hirer-view">Demo: see what the hirer gets →</button>
      </div>
    </section>
  </main>`;
  bindCommon();
  bindShortcuts();
}

// ---------------- dealer: My Applications (minimal) ----------------
async function dealerList() {
  const load = async () => {
    const apps = await api("GET", "/api/applications");
    $app.innerHTML = dealerShell("list", `
      <div><h1 style="font-size:28px">My Applications</h1><span class="muted">Applications submitted by ${esc(state.user.org)}.</span></div>
      <div class="tablebox"><table class="list" style="min-width:720px"><thead><tr><th>APPLICATION NO.</th><th>HIRER</th><th>GUARANTOR</th><th>SINGPASS</th><th>SUBMITTED</th><th>STATUS</th><th></th></tr></thead><tbody>
      ${apps.length ? apps.map((a) => `<tr><td><b>${esc(a.ref)}</b></td><td>${esc(a.parties[0].name)}</td><td>${esc(a.parties[1]?.name ?? "—")}</td>
        <td>${singpassCount(a)}</td><td>${fmt(a.createdAt)}</td><td>${statusChip(a.opsStatus)}</td>
        <td><a href="/dealer/applications/${esc(a.ref)}" data-go style="font-weight:600">View</a></td></tr>`).join("") : `<tr><td colspan="7" class="muted">No applications yet. Use Quick Apply.</td></tr>`}
      </tbody></table></div>`);
    bindCommon();
  };
  await load();
  state.refresh = () => load();
}

// ---------------- screen 9: Application Status ----------------
function partyChip(p) {
  const r = esc(p.label);
  switch (p.status) {
    case "Fulfilled": return `<span class="chip ok">${r} · Fulfilled ${fmt(p.fulfilledAt)}</span>`;
    case "Pending": return `<span class="chip wait">${r} · Pending · link expires in ${hoursLeft(p.expiresAt)}</span>`;
    case "Expired": return `<span class="chip bad">${r} · Link expired</span>`;
    case "NRIC mismatch": return `<span class="chip bad">${r} · NRIC mismatch — Ops is following up</span>`;
    case "Queued": return `<span class="chip wait">${r} · Link queued · sent once the gateway is reachable</span>`;
    default: return `<span class="chip bad">${r} · ${esc(p.status)}</span>`;
  }
}

function trackerSteps(app) {
  const issued = Boolean(app.ipaAt || app.aaAt);
  const step = (cls, title, desc, extra = "") =>
    `<li class="${cls}"><span class="bullet">${cls === "done" ? "✓" : cls === "current" ? "…" : ""}</span><div><b>${title}</b><span class="desc">${desc}</span>${extra}</div></li>`;
  return [
    step("done", "Application Submitted", "Application details submitted by the dealer"),
    step(app.allFulfilled ? "done" : "current", "Pending Singpass Verification", app.allFulfilled ? "Every person has completed Singpass" : "An AA (final approval) needs every person to complete Singpass first.",
      `<div class="row" style="gap:8px">${app.parties.map(partyChip).join("")}</div>`),
    step(issued ? "done" : app.allFulfilled ? "current" : "todo", "Credit Review", issued ? "ValueMax Ops has completed its review" : "ValueMax Ops reviews the application"),
    step(app.ipaAt || app.aaAt ? "done" : "todo", "IPA Issued", app.ipaAt ? `In-Principle Approval issued ${fmt(app.ipaAt)}` : app.aaAt ? "No IPA — the AA was issued directly" : "In-Principle Approval"),
    step(app.aaAt ? "done" : "todo", "AA", app.aaAt ? `Approval Advice issued ${fmt(app.aaAt)}` : "Approval Advice (final approval)"),
  ].join("");
}

async function dealerStatus(ref) {
  let prev = null;
  const load = async () => {
    const app = await api("GET", `/api/applications/${ref}`);
    const sig = JSON.stringify(app.parties.map((p) => p.status)) + app.stage;
    $app.innerHTML = dealerShell("apply", `
      <div style="display:flex;flex-direction:column;gap:6px">
        <h1 style="font-size:30px"><a href="/dealer/applications" data-go style="text-decoration:none;color:inherit">← Application Details</a></h1>
        <span style="font-size:16px;color:var(--text-2)">${esc(app.ref)} · Submitted ${fmtDay(app.createdAt)} · Personal — Hire Purchase Loan (PARF / COE) — Quick Apply</span>
      </div>
      <div class="tabs"><span class="on">Status</span><span>Submitted Details</span></div>
      <section class="card hero" style="padding:36px 28px;gap:20px">
        <h2 style="font-size:26px">Application Status</h2>
        <span class="pill">Application Ref: ${esc(app.ref)}</span>
        <ol class="tracker ${prev && prev !== sig ? "flash" : ""}" style="text-align:left">${trackerSteps(app)}</ol>
        <div class="row center">
          ${app.ipaAt ? `<button class="btn primary" type="button" onclick="this.textContent='IPA notice is out of scope in this demo'">View IPA Notice</button>` : ""}
          <button class="btn" type="button" data-shortcut="ops-view">Demo: see the Ops view →</button>
        </div>
        ${app.createdById === state.user.id && app.stage !== "AA" && app.parties.some((p) => ["Pending", "Expired", "NRIC mismatch", "Queued"].includes(p.status))
          ? `<div class="row center" style="gap:8px">${app.parties.filter((p) => p.status !== "Fulfilled").map((p) => `<button class="btn sm" type="button" data-resend="${esc(p.id)}" data-label="${esc(p.label)}">Resend link (${esc(p.label)})</button>`).join("")}</div>`
          : ""}
        <span class="small muted">Updates live — no need to refresh.</span>
      </section>`);
    bindCommon();
    bindShortcuts();
    bindResend(ref); // D-04: the dealer agent who submitted may resend, with a reason
    prev = sig;
  };
  await load();
  state.refresh = (d) => (!d.ref || d.ref === ref) && load();
}

// ---------------- screen 10: Ops list ----------------
function statusChip(label) {
  const cls = { Pending: "wait", "Credit Review": "blue", "Approved — IPA": "wait", "Approved — AA": "ok", Declined: "bad" }[label] || "wait";
  return `<span class="chip xs ${cls}">${esc(label)}</span>`;
}
function singpassCount(a) {
  const n = a.parties.filter((p) => p.status === "Fulfilled").length;
  if (n === a.parties.length) return `<b class="t-ok">Yes</b>`;
  if (a.parties.some((p) => ["NRIC mismatch", "Expired"].includes(p.status))) return `<b class="t-bad">${n ? `${n} of ${a.parties.length}` : "No"}</b>`;
  return `<b class="${n ? "t-wait" : "t-bad"}">${n ? `${n} of ${a.parties.length}` : "No"}</b>`;
}
function partyStatusText(p) {
  const cls = p.status === "Fulfilled" ? "t-ok" : p.status === "Pending" ? "t-wait" : "t-bad";
  return `<b class="${cls}">${esc(p.status)}</b>`;
}

async function opsList() {
  let flashRef = null;
  const load = async () => {
    const [apps, expired] = await Promise.all([api("GET", "/api/applications"), api("GET", "/api/links/expired")]);
    $app.innerHTML = `${header()}<main class="wrap">
      <div class="row between" style="align-items:flex-start">
        <div><h1 style="font-size:28px">Ops — All Applications</h1><span style="font-size:15px;color:var(--text-2)">All loan applications across every dealer — Ops review queue.</span></div>
        <div class="row"><a class="btn${expired.length ? " danger" : ""}" href="/ops/expired" data-go>Expired links (${expired.length})</a><a class="btn" href="/demo" data-go>Demo Control</a></div>
      </div>
      <div class="tablebox"><table class="list"><thead><tr><th>APPLICATION NO.</th><th>DEALER</th><th>HIRER</th><th>GUARANTOR</th><th>CAR PLATE</th><th>SINGPASS FULFILLED</th><th>CREATED</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>
      ${apps.length ? apps.map((a) => {
        const h = a.parties.find((p) => p.role === "hirer");
        const gs = a.parties.filter((p) => p.role === "guarantor");
        return `<tr class="${a.ref === flashRef ? "flash" : ""}"><td><b>${esc(a.ref)}</b></td><td>${esc(a.dealer)}</td>
          <td>${esc(h.name)}<br><span class="sub">${esc(h.nricMasked)} · ${partyStatusText(h)}</span></td>
          <td>${gs.length ? gs.map((g) => `${esc(g.name)}<br><span class="sub">${esc(g.nricMasked)} · ${partyStatusText(g)}</span>`).join("<br>") : "—"}</td>
          <td>${esc(a.carPlate || "—")}</td><td>${singpassCount(a)}</td>
          <td>${esc(a.createdBy)}<br><span class="sub">${fmt(a.createdAt)}</span></td>
          <td>${statusChip(a.opsStatus)}</td>
          <td><a href="/ops/applications/${esc(a.ref)}" data-go style="font-weight:600">View</a></td></tr>`;
      }).join("") : `<tr><td colspan="9" class="muted">No applications. Submit one as the dealer, or create sample applications in Demo Control.</td></tr>`}
      </tbody></table></div>
      <p class="small muted" style="margin:0">The hirer and guarantor each show their own Singpass status, updated live.</p>
    </main>`;
    bindCommon();
  };
  await load();
  state.refresh = (d) => { flashRef = d.ref ?? null; return load(); };
}

// ---------------- screen 11: Ops detail ----------------
function opsPartyStatus(p, ref) {
  switch (p.status) {
    case "Fulfilled": return `<dd class="t-ok">Fulfilled · NRIC matched</dd>`;
    case "Pending": return `<dd class="t-wait">Pending${p.linkStatus === "OPENED" ? " · opened by the customer" : ""} · link expires in ${hoursLeft(p.expiresAt)}</dd>`;
    case "NRIC mismatch": return `<dd class="t-bad">NRIC mismatch · logged in as ${nricWithReveal(ref, p, "returned", p.mismatchUinfin)}</dd>`;
    case "Expired": return `<dd class="t-bad">Expired · resend to send a new link</dd>`;
    case "Queued": return `<dd class="t-wait">Queued · waiting for the Singpass gateway</dd>`;
    default: return `<dd class="t-bad">${esc(p.status)}</dd>`;
  }
}

function myinfoTable(p) {
  const mi = p.myinfo;
  if (p.status === "NRIC mismatch") {
    return `<h2 style="font-size:24px">MyInfo Data — ${esc(p.label)}</h2>
      <div style="overflow-x:auto"><table class="cmp"><thead><tr><th>FIELD</th><th>DEALER ENTERED</th><th>FROM MYINFO</th></tr></thead><tbody>
      <tr><td>NRIC</td><td>${esc(p.nricMasked)}</td><td class="t-bad" style="font-weight:600">${esc(p.mismatchUinfin)} ✗ mismatch</td></tr>
      </tbody></table></div><p class="small muted" style="margin:0">Only the returned NRIC is kept; the rest of the MyInfo data was discarded.</p>`;
  }
  if (!mi) return "";
  const noa = mi.noaHistory?.[0];
  const row = (f, dealer, myinfo, cls = "") => `<tr><td>${f}</td><td${dealer ? "" : ' style="color:var(--faint)"'}>${dealer ? esc(dealer) : "—"}</td><td class="${cls}">${myinfo}</td></tr>`;
  return `<h2 style="font-size:24px">MyInfo Data — ${esc(p.label)}</h2>
    <div style="overflow-x:auto"><table class="cmp"><thead><tr><th>FIELD</th><th>DEALER ENTERED</th><th>FROM MYINFO</th></tr></thead><tbody>
    ${row("NRIC", p.nricMasked, `${esc(mi.uinfin)} ✓ match`, "t-ok")}
    ${row("Name", p.name, esc(mi.name))}
    ${row("Date of birth", "", esc(mi.dob))}
    ${row("Registered address", "", esc(mi.regAddress))}
    ${row("Employer", "", esc(mi.employer))}
    ${row("Annual income (NOA)", "", noa ? `SGD ${noa.amount.toLocaleString("en-SG")} (${noa.year})` : "—")}
    ${row("CPF contributions", "", `${mi.cpfMonths} months`)}
    ${row("Housing", "", esc(mi.hdbType || mi.housingType))}
    </tbody></table></div>`;
}

// Activity log: the server writes the sentences (SGT, no internal codes, no full NRIC).
function activityLog(app) {
  if (!app.activity?.length) return "";
  return `<h2 style="font-size:24px">Activity</h2><div class="activity">${app.activity
    .slice(0, 40)
    .map((e) => `<div class="act ${e.tone}"><span class="when">${esc(e.time)}</span>${e.party ? `<b>${esc(e.party)}</b>` : ""}<span>${esc(e.text)}</span></div>`)
    .join("")}</div>`;
}

function linkHistory(p) {
  if (p.history.length < 2) return "";
  return `<div class="linkhist"><span class="muted small">Links sent to the ${esc(p.label.toLowerCase())}:</span>${p.history
    .map((l, i) => `<span class="small ${l.current ? "" : "old"}">#${i + 1}${l.sentAt ? ` · sent ${fmt(l.sentAt)}` : " · not sent"} · <b>${esc(l.label)}</b>${l.current ? " (current)" : ""}</span>`)
    .join("")}</div>`;
}

// Resend with a mandatory reason (D-39: the server enforces the limit and says when the next resend is possible).
function bindResend(ref, after) {
  $app.querySelectorAll("[data-resend]").forEach((b) => b.addEventListener("click", async () => {
    const refOf = b.dataset.ref || ref;
    const v = await openDialog({
      title: `Resend the Singpass link to the ${b.dataset.label.toLowerCase()}`,
      intro: "A new link is emailed and the current one stops working. At most 3 resends per person in 24 hours.",
      fields: [{ name: "reason", label: "Reason (required)", placeholder: "e.g. Customer did not receive the email" }],
      submit: "Resend link",
    });
    if (!v) return;
    b.disabled = true;
    try {
      await api("POST", `/api/applications/${refOf}/parties/${b.dataset.resend}/resend`, { reason: v.reason });
      toast(`New link sent to the ${b.dataset.label.toLowerCase()}; the old link no longer works`);
      if (after) after();
    } catch (e) { toast(e.message, true); b.disabled = false; }
  }));
}

// ---------------- Ops: expired links (flow item 9) ----------------
async function opsExpired() {
  const load = async () => {
    const rows = await api("GET", "/api/links/expired");
    $app.innerHTML = `${header()}<main class="wrap">
      <a href="/ops" data-go style="font-weight:600;text-decoration:none">← All Applications</a>
      <div><h1 style="font-size:28px">Expired Singpass links</h1><span style="font-size:15px;color:var(--text-2)">People whose current link expired without a result. Resend to issue a new link.</span></div>
      <div class="tablebox"><table class="list"><thead><tr><th>APPLICATION NO.</th><th>PERSON</th><th>EXPIRED</th><th>NEXT RESEND</th><th>ACTIONS</th></tr></thead><tbody>
      ${rows.length ? rows.map((r) => `<tr><td><a href="/ops/applications/${esc(r.ref)}" data-go><b>${esc(r.ref)}</b></a></td><td>${esc(r.label)} · ${esc(r.name)}</td><td>${fmt(r.expiredAt)}</td>
        <td>${r.resendRetryAt ? `<span class="t-wait">from ${fmt(r.resendRetryAt)}</span>` : '<span class="t-ok">now</span>'}</td>
        <td><button class="btn sm" type="button" data-resend="${esc(r.partyId)}" data-ref="${esc(r.ref)}" data-label="${esc(r.label)}" ${r.resendRetryAt ? "disabled" : ""}>Resend link</button></td></tr>`).join("") : `<tr><td colspan="5" class="muted">No expired links.</td></tr>`}
      </tbody></table></div>
    </main>`;
    bindCommon();
    bindResend(null, load);
  };
  await load();
  state.refresh = () => load();
}

async function opsDetail(ref) {
  let selected = "IPA";
  const load = async () => {
    const app = await api("GET", `/api/applications/${ref}`);
    const h = app.parties.find((p) => p.role === "hirer");
    const canIpa = app.stage === "Submitted";
    const canAaStage = app.stage === "Submitted" || app.stage === "IPA";
    if (selected === "IPA" && !canIpa && canAaStage) selected = "AA";
    const aaBlocked = !app.aaCheck.ready; // the server's own AA check
    const applyDisabled = selected === "IPA" ? !canIpa : !canAaStage || aaBlocked;
    $app.innerHTML = `${header()}<main class="wrap narrow">
      <a href="/ops" data-go style="font-weight:600;text-decoration:none">← All Applications</a>
      <section class="card" style="padding:32px;gap:22px">
        <div class="row" style="align-items:center;gap:14px"><h1 style="font-size:28px">Application Details</h1><span class="chip wait" style="font-size:14px">${esc(app.ref)}</span>${statusChip(app.opsStatus)}</div>
        <dl class="kv">
          <div><dt>Applicant Name</dt><dd>${esc(h.name)}</dd></div>
          <div><dt>Applicant NRIC</dt><dd>${nricWithReveal(app.ref, h, "entered", h.nricMasked)}</dd></div>
          <div><dt>Applicant Email</dt><dd>${esc(h.email)}</dd></div>
          <div><dt>Dealer</dt><dd>${esc(app.dealer)}</dd></div>
          <div><dt>Created by</dt><dd>${esc(app.createdBy)} · ${fmt(app.createdAt)}</dd></div>
          <div><dt>LTA Access Code</dt><dd>${esc(app.ltaCode)}</dd></div>
        </dl>
        <h2 style="font-size:24px">Singpass Status</h2>
        ${app.parties.map((p) => `<div class="partyblock">
          <dl class="kv">
            <div><dt>${esc(p.label)} — Status</dt>${opsPartyStatus(p, app.ref)}</div>
            <div><dt>${esc(p.label)} — Trigger Date</dt><dd>${fmt(p.triggerAt)}</dd></div>
            <div><dt>${esc(p.label)} — Fulfilled Date</dt><dd${p.fulfilledAt ? "" : ' style="color:var(--faint)"'}>${fmt(p.fulfilledAt)}</dd></div>
          </dl>
          <div class="row" style="gap:10px">
            <button class="btn sm" type="button" data-retrieve="${esc(p.id)}" ${["Pending", "Queued"].includes(p.status) ? "" : "disabled"}>Retrieve MyInfo (${esc(p.label)})</button>
            <button class="btn sm" type="button" data-resend="${esc(p.id)}" data-label="${esc(p.label)}" ${p.status === "Fulfilled" || app.stage === "AA" ? "disabled" : ""}>Resend Email (${esc(p.label)})</button>
            <button class="btn sm" type="button" data-correct="${esc(p.id)}" data-label="${esc(p.label)}" data-email="${esc(p.email)}" ${app.stage === "AA" ? "disabled" : ""}>Correct NRIC / email</button>
          </div>
          ${linkHistory(p)}
        </div>`).join("")}
        ${activityLog(app)}
        ${app.parties.map(myinfoTable).join("")}
        <h2 style="font-size:24px">Vehicle Info</h2>
        <dl class="kv"><div><dt>Car Plate</dt><dd>${esc(app.carPlate || "—")}</dd></div><div><dt>Make</dt><dd style="color:var(--faint)">—</dd></div><div><dt>Model</dt><dd style="color:var(--faint)">—</dd></div></dl>
      </section>
      <section class="card" style="gap:14px">
        <div class="row" style="align-items:center"><h2 style="font-size:21px">Change Status</h2><span class="ops-tag">OPS ONLY</span></div>
        <label class="field" style="font-size:15px">New Status
          <select class="select" id="newstatus">
            <option value="IPA" ${selected === "IPA" ? "selected" : ""} ${canIpa ? "" : "disabled"}>Issue IPA${app.ipaAt ? " (issued)" : ""}</option>
            <option value="AA" ${selected === "AA" ? "selected" : ""} ${canAaStage ? "" : "disabled"}>Issue AA${app.aaAt ? " (issued)" : ""}</option>
          </select></label>
        ${selected === "AA" && canAaStage ? `<div class="cond ${aaBlocked ? "" : "ok"}">
          <b style="color:${aaBlocked ? "var(--red-text)" : "var(--green-text)"}">${aaBlocked ? "Cannot issue AA yet" : "Ready to issue AA"}</b>
          ${app.parties.map((p) => {
            const miss = app.aaCheck.missing.find((m) => m.partyId === p.id);
            return miss ? `<span style="color:var(--red-text)">✗ ${esc(p.label)} Singpass ${esc(p.status.toLowerCase())}</span>` : `<span class="t-ok">✓ ${esc(p.label)} Singpass fulfilled</span>`;
          }).join("")}
        </div>` : ""}
        ${selected === "IPA" && canIpa && !app.allFulfilled ? `<div class="note-gold" style="padding:12px 16px">An IPA can be issued while Singpass is still pending.</div>` : ""}
        <div class="row" style="justify-content:flex-end"><button class="btn primary" id="apply" type="button" ${applyDisabled ? "disabled" : ""}>Apply Status Change</button></div>
      </section>
    </main>`;
    bindCommon();
    document.getElementById("newstatus").addEventListener("change", (e) => { selected = e.target.value; load(); });
    document.getElementById("apply").addEventListener("click", async () => {
      try {
        await api("POST", `/api/applications/${ref}/${selected === "IPA" ? "ipa" : "aa"}`);
        toast(selected === "IPA" ? "IPA issued" : "AA issued");
      } catch (e) { toast(e.message, true); }
    });
    bindResend(ref);
    bindReveal();
    $app.querySelectorAll("[data-correct]").forEach((b) => b.addEventListener("click", async () => {
      const v = await openDialog({
        title: `Correct the ${b.dataset.label.toLowerCase()}'s details`,
        intro: "Changing the NRIC issues a new Singpass link and the person verifies again. Changing only the email of a person already fulfilled keeps the result.",
        fields: [
          { name: "nric", label: "Correct NRIC / FIN (leave empty to keep)", placeholder: "e.g. S8812345Z" },
          { name: "email", label: "Email address", value: b.dataset.email },
          { name: "reason", label: "Reason (required)", placeholder: "e.g. Dealer typo, checked against the NRIC card" },
        ],
        submit: "Save correction",
      });
      if (!v) return;
      const body = { reason: v.reason, email: v.email };
      if (v.nric.trim()) body.nric = v.nric;
      try {
        await api("POST", `/api/applications/${ref}/parties/${b.dataset.correct}/correct`, body);
        toast("Details corrected");
      } catch (e) { toast(e.message, true); }
    }));
    $app.querySelectorAll("[data-retrieve]").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        const r = await api("POST", `/api/applications/${ref}/parties/${b.dataset.retrieve}/retrieve`);
        toast({ fulfilled: "MyInfo retrieved — NRIC matched", mismatch: "MyInfo retrieved — NRIC mismatch", expired: "The link has expired", sent: "Link sent", unchanged: "No MyInfo data yet — the customer has not shared it" }[r.outcome] || r.outcome, r.outcome === "fulfilled" ? "ok" : r.outcome === "mismatch" || r.outcome === "expired" ? "err" : "info");
      } catch (e) { toast(e.message, true); }
      b.disabled = false;
    }));
  };
  await load();
  state.refresh = (d) => (!d.ref || d.ref === ref) && load();
}

// ---------------- Demo Control ----------------
async function demoPage() {
  if (!state.user) {
    sessionStorage.setItem("after-login", "/demo");
    return signIn();
  }
  const load = async () => {
    const [apps, outbox, demo] = await Promise.all([api("GET", "/api/applications"), api("GET", "/api/demo/outbox"), api("GET", "/api/demo/state")]);
    const cfg = state.config;
    const hours = Math.round(demo.offsetMs / 3_600_000);
    $app.innerHTML = `${header()}<main class="wrap narrow">
      <div class="row between"><div><h1 style="font-size:28px">Demo Control</h1><span class="muted">Hidden page for the presenter. Phone links use <code>${esc(cfg.baseUrl)}</code> · email: ${cfg.smtp ? "SMTP configured" : "SMTP not configured (links only in the log and below)"}</span></div>
        <a class="btn" href="/" data-go>Back to portal</a></div>
      <section class="card" style="gap:14px">
        <h2>Data</h2>
        <div class="row">
          <button class="btn danger" id="reset" type="button">Reset all data</button>
          <button class="btn" id="seed" type="button">Create sample applications</button>
        </div>
        <p class="small muted" style="margin:0">Reset hard-deletes every application, link, MyInfo record and message, and puts the clock back. Sample applications are VMAF-2026-05114 to 05119.</p>
      </section>
      <section class="card" style="gap:14px">
        <h2>Gateway, job and clock</h2>
        <div class="row" style="align-items:center">
          <span>Simulated Myinfo gateway: ${demo.gatewayAvailable ? '<b class="t-ok">available</b>' : '<b class="t-bad">unavailable</b>'}</span>
          <button class="btn sm" id="gw" type="button">${demo.gatewayAvailable ? "Switch gateway off" : "Switch gateway on"}</button>
          <button class="btn sm" id="runjob" type="button">Run job now</button>
          <span class="small muted">The auto-verify job also runs every ${(demo.pollIntervalMs / 1000).toFixed(1)} s.</span>
        </div>
        <div class="row" style="align-items:center">
          <span>Clock: ${fmt(demo.now)}${hours ? ` <b class="t-wait">(+${hours} h)</b>` : ""}</span>
          <button class="btn sm" data-advance="1" type="button">+1 h</button>
          <button class="btn sm" data-advance="24" type="button">+24 h</button>
          <button class="btn sm" data-advance="73" type="button">+73 h (expire links)</button>
          ${demo.offsetMs ? '<button class="btn sm" id="realtime2" type="button">Back to real time</button>' : ""}
        </div>
      </section>
      <section class="card" style="gap:14px">
        <h2>Links</h2>
        ${apps.length ? `<div style="overflow-x:auto"><table class="cmp"><thead><tr><th>APPLICATION</th><th>PERSON</th><th>STATUS</th><th>LINK</th></tr></thead><tbody>
        ${apps.flatMap((a) => a.parties.map((p) => `<tr><td><b>${esc(a.ref)}</b></td><td>${esc(p.label)} · ${esc(p.name)}<br><span class="small muted">${esc(p.nricMasked)}</span></td><td>${partyStatusText(p)}</td>
          <td>${p.linkUrl ? `<a href="${esc(p.linkUrl)}" target="_blank" rel="noopener">Open</a> · <button class="link-btn" data-qr="${esc(p.linkUrl)}" type="button" title="Presenter fallback to open the link on a phone; showroom QR is an option after Release 1, not in scope">QR (presenter only)</button>` : '<span class="muted">queued</span>'}</td></tr>`)).join("")}
        </tbody></table></div>` : `<p class="muted" style="margin:0">No applications yet.</p>`}
        <div id="qrdemo" class="row center"></div>
      </section>
      <section class="card" style="gap:14px">
        <h2>Outbox (email + SMS)</h2>
        ${outbox.length ? outbox.slice(0, 30).map((m) => `<div class="sumbox"><span class="lbl">${fmt(m.at)} · ${esc(m.applicationRef)} · ${m.channel === "sms" ? "SMS" : "Email"} → ${esc(m.to)} · ${m.status === "sent" ? '<span class="t-ok">sent</span>' : m.status === "failed" ? `<span class="t-bad">${esc(m.error || "failed")}</span>` : '<span class="t-wait">outbox only</span>'}</span>${m.channel === "sms" ? `<span class="small">${esc(m.body)}</span>` : (() => { const u = /https?:\/\/\S+/.exec(m.body)?.[0] ?? ""; return `<a class="mono" href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`; })()}</div>`).join("") : `<p class="muted" style="margin:0">No messages yet.</p>`}
      </section>
      <section class="card" style="gap:14px">
        <h2>Gateway log (simulated gateway side)</h2>
        <p class="small muted" style="margin:0">What the gateway knows. AutoFinance never sees refusals (D-33).</p>
        ${demo.gatewayLog.length ? demo.gatewayLog.slice(0, 20).map((g) => `<div class="small">${fmt(g.at)} · ${esc(g.applicationRef)} · <code>${esc(g.linkId)}</code> · <b class="${g.event === "declined" ? "t-bad" : ""}">${esc(g.event)}</b>${g.who ? ` · ${esc(g.who)}` : ""}</div>`).join("") : `<p class="muted" style="margin:0">Nothing yet.</p>`}
      </section>
    </main>`;
    bindCommon();
    const act = async (fn, msg) => { try { await fn(); if (msg) toast(msg); } catch (e) { toast(e.message, true); } load(); };
    document.getElementById("reset").addEventListener("click", () => act(() => api("POST", "/api/demo/reset"), "All demo data deleted"));
    document.getElementById("seed").addEventListener("click", () => act(async () => toast(`${(await api("POST", "/api/demo/seed")).added} sample application(s) created`)));
    document.getElementById("gw").addEventListener("click", () => act(() => api("POST", "/api/demo/gateway", { available: !demo.gatewayAvailable })));
    document.getElementById("runjob").addEventListener("click", () => act(() => api("POST", "/api/demo/run-job"), "Job run"));
    document.getElementById("realtime2")?.addEventListener("click", () => act(() => api("POST", "/api/demo/clock/reset"), "Back to real time"));
    $app.querySelectorAll("[data-advance]").forEach((b) => b.addEventListener("click", () => act(() => api("POST", "/api/demo/clock", { advanceHours: Number(b.dataset.advance) }), `Clock +${b.dataset.advance} h`)));
    $app.querySelectorAll("[data-qr]").forEach((b) => b.addEventListener("click", () => {
      const box = document.getElementById("qrdemo");
      box.innerHTML = `<div class="qrbox"><div id="qrd"></div><code>${esc(b.dataset.qr)}</code></div>`;
      makeQr(document.getElementById("qrd"), b.dataset.qr);
    }));
  };
  await load();
  state.refresh = () => load();
}

// ---------------- customer: AutoFinance portal (screen 5) ----------------
const simbar = `<div class="simbar">SIMULATED GATEWAY · DEMO ONLY · NOT REAL SINGPASS</div>`;
const phoneHdr = `<div class="phone-hdr"><span class="dot" style="width:10px;height:10px"></span><div><b>ValueMax AutoFinance</b><small>IDENTITY VERIFICATION</small></div></div>`;

function invalidScreen() {
  $app.innerHTML = `<div class="phone grey">${phoneHdr}<div class="pbody"><div class="pcard">
    <span class="chip xs bad" style="align-self:flex-start">Link not valid</span>
    <h1 style="color:var(--red)">This link is no longer valid</h1>
    <p class="para">A newer link was sent, or this one expired. Please use the latest email, or ask your dealer to resend.</p>
  </div></div></div>`;
}

/** /verify/<token>: the server checks the link (current + not expired), marks it OPENED and gives the gateway URL. */
async function portalPage(token) {
  let info;
  try {
    info = await api("POST", `/api/verify/${encodeURIComponent(token)}/open`);
  } catch (e) {
    if (e.status === 410) return invalidScreen();
    throw e;
  }
  $app.innerHTML = `<div class="phone grey">${phoneHdr}<div class="pbody"><div class="pcard">
    <span class="chip xs ok" style="align-self:flex-start">✓ Link valid · expires in ${hoursLeft(info.expiresAt)}</span>
    <h1>Verify your identity</h1>
    <dl class="pdl"><dt>Application</dt><dd>${esc(info.ref)}</dd><dt>Dealer</dt><dd>${esc(info.dealer)}</dd><dt>Your role</dt><dd>${esc(info.role)}</dd></dl>
    <p class="para">You will log in with Singpass and choose to share your MyInfo details. Only the person this request was sent to can complete it.</p>
    <a class="pbtn" href="${esc(info.redirectUrl)}">Continue to Singpass →</a>
  </div></div></div>`;
}

// ---------------- customer: simulated ValueMax Myinfo gateway (screens 6–8) ----------------
async function gatewayFlow(linkId) {
  const gw = (method, sub = "", body) => api(method, `/gateway-api/${encodeURIComponent(linkId)}${sub}`, body);
  const unavailable = (msg) => {
    $app.innerHTML = `<div class="phone">${simbar}<div class="pbody sp" style="text-align:center;padding-top:64px">
      <h1>Myinfo is not available</h1><p style="margin:0;color:var(--sp-2)">${esc(msg)}</p></div></div>`;
  };
  let info;
  try {
    info = await gw("GET");
  } catch (e) {
    return unavailable(e.status === 404 ? "This Myinfo request is not recognised." : e.message);
  }
  if (info.submitted) return doneScreen(info.applicationRef);
  const ctx = { person: null, tab: "app" };
  const fail = (e) => (e.status === 503 ? unavailable(e.message) : toast(e.message, true));

  // Retrieve Myinfo (singpass-reference/1)
  const landing = () => {
    $app.innerHTML = `<div class="phone">${simbar}<div class="pbody sp">
      <div><span class="spsub">ValueMax Myinfo gateway</span><h1>Retrieve Myinfo with Singpass</h1></div>
      <p style="margin:0;color:var(--sp-2)">VM AutoFinance would like to retrieve your Myinfo details for car loan application ${esc(info.applicationRef)}. You will log in with Singpass and choose whether to share them.</p>
      <button class="spbtn" id="retrieve" type="button">Retrieve Myinfo with Singpass</button>
    </div></div>`;
    document.getElementById("retrieve").addEventListener("click", login);
  };

  // Simulated Singpass login
  const login = () => {
    const qrCells = "101101010110110011011001101110110101".split("").map((c) => `<i class="${c === "1" ? "f" : ""}"></i>`).join("");
    $app.innerHTML = `<div class="phone">${simbar}<div class="pbody sp">
      <div><span class="spsub">Step 1 of 3 · via ValueMax Myinfo gateway</span><h1>Log in with Singpass</h1></div>
      <div class="sptabs"><button type="button" data-tab="app" class="${ctx.tab === "app" ? "on" : ""}">Singpass app</button><button type="button" data-tab="pw" class="${ctx.tab === "pw" ? "on" : ""}">Password</button></div>
      ${ctx.tab === "app" ? `
        <div class="qr" role="img" aria-label="QR code (decorative)">${qrCells}</div>
        <p style="margin:0;text-align:center;font-size:14px;color:var(--sp-2)">Scan with the Singpass app on another device, or pick a test persona on this phone.</p>
        <div style="display:flex;flex-direction:column;gap:8px">${info.personas.map((p) => `<button class="persona" type="button" data-nric="${esc(p.uinfin)}"><b>${esc(p.name)}</b><code>${esc(p.uinfin)}</code></button>`).join("")}</div>`
      : `
        <label class="field">Singpass ID (test NRIC / FIN)<input class="input" id="nric" autocomplete="off" placeholder="e.g. F4440488P"></label>
        <label class="field">Password<input class="input" type="password" placeholder="Any value — not checked, not stored"></label>
        <button class="spbtn" id="pwlogin" type="button">Log in</button>`}
      <p style="margin:0;font-size:12px;color:var(--sp-3)">In this demo the ValueMax gateway and Singpass are simulated. With the real gateway, the customer sees the Singpass login.</p>
    </div></div>`;
    $app.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { ctx.tab = b.dataset.tab; login(); }));
    const doLogin = async (uinfin) => {
      try {
        ctx.person = (await gw("POST", "/login", { uinfin })).person;
        consent();
      } catch (e) { fail(e); }
    };
    $app.querySelectorAll("[data-nric]").forEach((b) => b.addEventListener("click", () => doLogin(b.dataset.nric)));
    document.getElementById("pwlogin")?.addEventListener("click", () => doLogin(document.getElementById("nric").value));
  };

  // Consent
  const consent = () => {
    // singpass-reference/3 and /4: only the names of the requested items; values appear on the review page
    const items = ["Alias Name", "Country/Place of Birth", "CPF Contribution History (up to 15 months)", "Date of Birth", "Email Address",
      "Name of Employer", "Employment Sector", "HDB Ownership - Address", "HDB Ownership - Date of Purchase", "HDB Ownership - Type of HDB Dwelling",
      "HDB Ownership - Lease Commencement Date", "HDB Ownership - Monthly Loan Instalment", "HDB Ownership - Number of Owners",
      "HDB Ownership - Outstanding HDB Loan Balance", "HDB Ownership - Term of Lease", "Type of HDB", "Type of Housing", "Marital Status",
      "Mobile Number", "Principal Name", "Nationality/Citizenship", "Notice of Assessment History", "Occupation",
      "Ownership of Private Residential Property", "Race", "Registered Address", "Residential Status", "Sex", "NRIC/FIN"];
    $app.innerHTML = `<div class="phone">${simbar}<div class="pbody sp" style="padding:24px;gap:16px">
      <div><span class="spsub">Step 2 of 3 · Myinfo consent</span><h1 style="font-size:22px">VM AutoFinance is requesting your details</h1>
        <p style="margin:6px 0 0;font-size:14px;color:var(--sp-2)">For: car loan application ${esc(info.applicationRef)} — credit assessment and loan approval</p></div>
      <ul class="splist names">${items.map((k) => `<li><span>› ${esc(k)}</span></li>`).join("")}</ul>
      <p style="margin:0;font-size:12px;color:var(--sp-3)">Clicking "I agree" permits this digital service to retrieve your data. The real list of items is set by the ValueMax gateway.</p>
      <button class="spbtn" id="agree" type="button">I agree, share my details</button>
      <button class="spbtn ghost" id="cancel" type="button">Cancel</button>
    </div></div>`;
    document.getElementById("agree").addEventListener("click", async () => {
      try {
        await gw("POST", "/agree");
        if (info.showReview) review();
        else await submit();
      } catch (e) { fail(e); }
    });
    document.getElementById("cancel").addEventListener("click", async () => {
      try { await gw("POST", "/decline"); declinedScreen(); } catch (e) { fail(e); }
    });
  };

  // Review and submit (singpass-reference/5)
  const review = (tab = "personal") => {
    const p = ctx.person;
    const rows = {
      personal: [["NRIC/FIN", p.uinfin], ["Full Name", p.name], ["Sex", p.sex], ["Race", p.race], ["Nationality/Citizenship", p.nationality], ["Date of Birth", p.dob], ["Country/Place of Birth", p.birthCountry], ["Marital Status", p.maritalStatus], ["Registered Address", p.regAddress], ["Email Address", p.email], ["Mobile Number", p.mobile]],
      employment: [["Name of Employer", p.employer], ["Employment Sector", p.employmentSector], ["Occupation", p.occupation], ["Highest Education", p.education], ...p.noaHistory.map((n) => [`NOA ${n.year}`, `SGD ${n.amount.toLocaleString("en-SG")}`]), ["CPF Contribution History", `${p.cpfMonths} months · latest SGD ${p.cpfLatestAmount.toLocaleString("en-SG")}`]],
      property: [["Type of Housing", p.housingType], ["Type of HDB", p.hdbType || "—"], ["HDB Ownership", p.hdbOwnership || "—"], ["Date of Purchase", p.hdbPurchaseDate || "—"], ["Monthly Loan Instalment", p.hdbMonthlyInstalment ? `SGD ${p.hdbMonthlyInstalment.toLocaleString("en-SG")}` : "—"], ["Outstanding HDB Loan", p.hdbOutstandingLoan ? `SGD ${p.hdbOutstandingLoan.toLocaleString("en-SG")}` : "—"]],
    };
    const titles = { personal: "Personal Information", employment: "Employment & Education", property: "Property" };
    $app.innerHTML = `<div class="phone">${simbar}<div class="pbody sp" style="padding:24px;gap:14px">
      <span class="spsub" style="text-align:center">Step 3 of 3 · Review</span>
      <h1 style="text-align:center;color:#E0702B;font-size:22px">Review</h1>
      <p style="margin:0;text-align:center;font-size:13px;color:var(--sp-2)">Review your details below and click "Submit Application".</p>
      <div class="rvtabs">${Object.keys(rows).map((k) => `<button type="button" data-rv="${k}" class="${k === tab ? "on" : ""}">${k === "personal" ? "Personal" : k === "employment" ? "Employment &amp; Education" : "Property"}</button>`).join("")}</div>
      <div class="rvhead">${titles[tab]}</div>
      <ul class="splist">${rows[tab].map(([k, v]) => `<li><span>${esc(k)}</span><b>${esc(v || "—")}</b></li>`).join("")}</ul>
      <button class="spbtn" id="submit" type="button" style="background:#E0702B">Submit Application</button>
    </div></div>`;
    $app.querySelectorAll("[data-rv]").forEach((b) => b.addEventListener("click", () => review(b.dataset.rv)));
    document.getElementById("submit").addEventListener("click", submit);
  };

  const submit = async () => {
    const b = document.getElementById("submit") || document.getElementById("agree");
    if (b) { b.disabled = true; b.textContent = "Submitting…"; }
    try {
      await gw("POST", "/submit");
      doneScreen(info.applicationRef);
    } catch (e) { fail(e); }
  };

  landing();
}

// Done — the gateway does not redirect back to AutoFinance
function doneScreen(ref) {
  $app.innerHTML = `<div class="phone">${simbar.replace("var(--sp-bar)", "#3A3A44")}
    <div style="flex:1;padding:32px 24px;display:flex;flex-direction:column;gap:18px;align-items:center;text-align:center;justify-content:center">
      <div class="okcircle">${icon("check", "xl")}</div>
      <h1 style="font-size:24px">Details shared</h1>
      <p class="para" style="font-size:15px;max-width:300px">Your MyInfo details were sent to ValueMax AutoFinance${ref ? ` for application ${esc(ref)}` : ""}. You can close this page.</p>
      <p class="small muted" style="margin:0;max-width:300px">Your dealer will contact you about the next step.</p>
      <button class="btn" type="button" data-shortcut="dealer-view">Demo: see the dealer's view →</button>
    </div>
    <div class="foot">Today the gateway does not send the customer back to AutoFinance, so this page is the end of the customer's journey.</div>
  </div>`;
  bindShortcuts();
}

function declinedScreen() {
  $app.innerHTML = `<div class="phone">${simbar}<div class="pbody sp" style="text-align:center;padding-top:64px">
    <h1>You cancelled</h1>
    <p style="margin:0;color:var(--sp-2)">No details were shared with ValueMax AutoFinance. You can open the link in your email again while it is valid.</p>
  </div></div>`;
}

// ---------------- boot ----------------
(async function boot() {
  [state.config, { user: state.user }] = await Promise.all([api("GET", "/api/config"), api("GET", "/api/session")]);
  await loadDemoClock();
  connectEvents();
  render();
})();
