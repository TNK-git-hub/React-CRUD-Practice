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
      <h2>${esc(title)}</h2>${intro ? `<p class="para">${intro}</p>` : ""}
      ${fields.map((f) => `<label class="field">${esc(f.label)}<input class="input" name="${f.name}" value="${esc(f.value ?? "")}" placeholder="${esc(f.placeholder ?? "")}" autocomplete="off"></label>`).join("")}
      <div class="row end"><button class="btn" type="button" data-cancel>Cancel</button><button class="btn primary" type="submit">${esc(submit)}</button></div>
    </form>`;
    const close = (v) => { bg.remove(); resolve(v); };
    bg.addEventListener("keydown", (e) => e.key === "Escape" && close(null));
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
  return `<ol class="steps" aria-label="Application steps">${names
    .map((nm, i) => {
      const cls = i + 1 < n ? "done" : i + 1 === n ? "on" : "";
      return `<li class="${cls}"${i + 1 === n ? ' aria-current="step"' : ""}><span class="step-mark">${i + 1 < n ? `${icon("check")}<span class="visually-hidden">Done:</span>` : i + 1}</span><span class="step-name">${nm}</span></li>`;
    })
    .join("")}</ol>`;
}

function partyFields(prefix, p, label) {
  const hint = (key) => `<span class="hint" id="h-${prefix}-${key}" data-h="${prefix}.${key}"></span>`;
  return `<div class="fgrid">
    <label class="field c-name">Name of ${label} *<input class="input" data-f="${prefix}.name" value="${esc(p.name)}" autocomplete="off"></label>
    <label class="field c-nric">NRIC of ${label} *<input class="input num" data-f="${prefix}.nric" value="${esc(p.nric)}" autocomplete="off" aria-describedby="h-${prefix}-nric">${hint("nric")}</label>
    <label class="field c-email">Email Address *${prefix === "hirer" ? " (to send Singpass request)" : ""}<input class="input" type="email" data-f="${prefix}.email" value="${esc(p.email)}" aria-describedby="h-${prefix}-email">${hint("email")}</label>
    <label class="field c-phone">Phone Number *<input class="input num" inputmode="numeric" data-f="${prefix}.mobile" value="${esc(p.mobile)}" aria-describedby="h-${prefix}-mobile">${hint("mobile")}</label>
  </div>`;
}

function fieldState(prefix, key, value, others = []) {
  if (!value) return { cls: "", msg: "" };
  if (key === "nric") {
    if (!validNric(value)) return { cls: "err", msg: "Invalid NRIC / FIN" };
    if (others.some((o) => o && value.trim().toUpperCase() === o.trim().toUpperCase())) return { cls: "err", msg: "Each person needs a different NRIC" };
    return { cls: "ok", msg: "Valid NRIC / FIN" };
  }
  if (key === "email") return validEmail(value) ? { cls: "ok", msg: "Looks good" } : { cls: "err", msg: "Invalid email" };
  if (key === "mobile") return validMobile(value) ? { cls: "ok", msg: "Valid Singapore mobile number" } : { cls: "err", msg: "8 digits, starting with 8 or 9" };
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
    <section class="card form-card">
      <div class="card-head">
        <div><h2>Section A — Applicant Details</h2><p class="muted">Used to send the hirer their Singpass verification request.</p></div>
        <button class="btn sm" id="sample" type="button">${icon("file")}Fill sample (test personas)</button>
      </div>
      ${partyFields("hirer", d.hirer, "Applicant")}
      <hr class="divider">
      <button class="toggle" id="gtoggle" type="button" aria-pressed="${d.guarantorOn}"><span class="sw"></span>
        <span><b>Add Guarantor Info</b><span class="muted">Optional — if added, the guarantor's NRIC and an income document will also be required</span></span></button>
      ${d.guarantorOn ? `<div class="subcard">
        <h3 class="subcard-title">Guarantor Details</h3>
        ${partyFields("guarantor", d.guarantor, "Guarantor")}
        <hr class="divider">
        <button class="toggle" id="g2toggle" type="button" aria-pressed="${d.guarantor2On}"><span class="sw"></span>
          <span><b>Add a second guarantor</b><span class="muted">Optional — at most two guarantors per application</span></span></button>
      </div>
      ${d.guarantor2On ? `<div class="subcard"><h3 class="subcard-title">Second Guarantor Details</h3>${partyFields("guarantor2", d.guarantor2, "Second Guarantor")}</div>` : ""}` : ""}
      <hr class="divider">
      <div class="fgrid"><label class="field c-lta">LTA Access Code *<input class="input" data-f="ltaCode" value="${esc(d.ltaCode)}" aria-describedby="h-lta"><span class="hint" id="h-lta">The rest of the form unlocks once this is entered.</span></label></div>
    </section>
    <div class="actionbar">
      <button class="btn" id="clear" type="button">Cancel</button>
      <button class="btn primary" id="next" type="button">Next: Documents${icon("arrow-right")}</button>
    </div>`);
  bindCommon();

  const refreshHints = () => {
    for (const prefix of ["hirer", "guarantor", "guarantor2"]) {
      for (const key of ["nric", "email", "mobile"]) {
        const h = $app.querySelector(`[data-h="${prefix}.${key}"]`);
        if (!h) continue;
        const s = fieldState(prefix, key, d[prefix][key], otherNrics(d, prefix));
        h.className = `hint ${s.cls}`;
        h.innerHTML = s.msg ? `${icon(s.cls === "ok" ? "check-circle" : "alert-circle")}<span>${esc(s.msg)}</span>` : "";
        const inp = $app.querySelector(`[data-f="${prefix}.${key}"]`);
        inp?.classList.toggle("bad", s.cls === "err");
        if (s.cls === "err") inp?.setAttribute("aria-invalid", "true");
        else inp?.removeAttribute("aria-invalid");
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
  const box = (lbl, p) => `<div class="sumbox"><span class="overline">${lbl}</span><b class="num">${esc(p.name.toUpperCase())} · ${esc(p.nric.toUpperCase())}</b><span class="muted small">${icon("mail")} ${esc(p.email)}</span></div>`;
  const sendLabel = `Send Singpass Request${icon("arrow-right")}`;
  $app.innerHTML = dealerShell("apply", `
    ${stepsBar(3)}
    <section class="card">
      <h2>Singpass requests</h2>
      <div class="sumgrid">${box("HIRER", d.hirer)}${d.guarantorOn ? box(d.guarantor2On ? "GUARANTOR 1" : "GUARANTOR", d.guarantor) : ""}${d.guarantorOn && d.guarantor2On ? box("GUARANTOR 2", d.guarantor2) : ""}</div>
      <label class="check"><input type="checkbox" id="c1" ${d.c1 ? "checked" : ""}><span>I confirm that the Applicant and Guarantor(s) have been shown the declarations above, have read and understood them in a language they understand, and have agreed to them — including consent to identity, employment and credit bureau verification.</span></label>
      <hr class="divider">
      <h3 class="overline-title">DEALER'S ATTESTATION</h3>
      <p class="para">By submitting this application, I, as an authorised representative of the Dealer named in this application, confirm that: (a) all information was provided by the Applicant / Guarantor(s) and is accurate and complete; (b) I have verified the identity of the Applicant / Guarantor(s) against their original supporting documents; (c) the Applicant / Guarantor(s) have consented to … receiving a Singpass verification request to authorise MyInfo retrieval; and (d) I understand the Dealer is not an agent of VMAF.</p>
      <label class="check"><input type="checkbox" id="c2" ${d.c2 ? "checked" : ""}><span>I have explained the above (including the Privacy Policy) to the Applicant / Guarantor(s), and I make the Dealer's Attestation set out above.</span></label>
    </section>
    <div class="note">${icon("mail")}<span>On submit, a Singpass verification link is emailed to each person (one active link each, valid ${state.config.ttlHours} hours).</span></div>
    <div class="actionbar">
      <a class="btn" href="/dealer/apply" data-go>${icon("arrow-left")}Back</a>
      <div class="row"><a class="btn" href="/dealer/apply" data-go>Cancel</a><button class="btn primary" id="send" type="button">${sendLabel}</button></div>
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
      btn.innerHTML = sendLabel;
      sync();
    }
  });
}

// ---------------- screen 3: Interest Received ----------------
async function dealerReceived(ref) {
  const app = await api("GET", `/api/applications/${ref}`);
  const hirer = app.parties.find((p) => p.role === "hirer");
  $app.innerHTML = dealerShell("apply", `
    <section class="card hero">
      <div class="okcircle">${icon("check", "xl")}</div>
      <h1 class="page-title">Interest Received</h1>
      <p class="para hero-text">Thanks — we've received your interest for <b>${esc(hirer.name)}</b>. We're now sending Singpass verification links to the ${app.parties.length > 2 ? "hirer and both guarantors" : app.parties.length > 1 ? "hirer and guarantor" : "hirer"}.</p>
      <span class="ref-badge">Application Ref: <b class="num">${esc(app.ref)}</b></span>
      <ul class="linklist">
        ${app.parties.map((p) => `<li>
          <span class="linklist-icon">${icon(p.linkStatus === "QUEUED" ? "clock" : "mail")}</span>
          <span class="linklist-main"><b>${esc(p.label)}</b><span class="chip ${p.linkStatus === "QUEUED" ? "wait" : "neutral"}">${p.linkStatus === "QUEUED" ? "queued — sent automatically once the Singpass gateway is reachable" : "link sent"}</span></span>
          <span class="linklist-meta num">${icon("clock")} ${p.expiresAt ? `Expires ${fmt(p.expiresAt)}` : "Expiry starts when the link is sent"}</span>
        </li>`).join("")}
      </ul>
      <p class="para">Keep an eye on the <b>My Applications</b> page for updates — this application now shows as <b>Pending</b>.</p>
      <div class="row center">
        <a class="btn" href="/dealer/apply" data-go>Submit Another</a>
        <a class="btn" href="/dealer/applications/${esc(app.ref)}" data-go>View Application Status</a>
        <button class="btn primary" type="button" data-shortcut="hirer-view">Demo: see what the hirer gets${icon("external")}</button>
      </div>
    </section>`);
  bindCommon();
  bindShortcuts();
}

// ---------------- dealer: My Applications (minimal) ----------------
async function dealerList() {
  const load = async () => {
    const apps = await api("GET", "/api/applications");
    $app.innerHTML = dealerShell("list", `
      <div><h1 class="page-title">My Applications</h1><p class="page-sub">Applications submitted by ${esc(state.user.org)}.</p></div>
      <div class="tablebox"><table class="list list-dealer"><thead><tr><th>APPLICATION NO.</th><th>HIRER</th><th>GUARANTOR</th><th>SINGPASS</th><th>SUBMITTED</th><th>STATUS</th><th><span class="visually-hidden">Actions</span></th></tr></thead><tbody>
      ${apps.length ? apps.map((a) => `<tr><td class="ref">${esc(a.ref)}</td><td>${esc(a.parties[0].name)}</td><td>${esc(a.parties[1]?.name ?? "—")}</td>
        <td>${singpassCount(a)}</td><td class="nowrap num">${fmt(a.createdAt)}</td><td>${statusChip(a.opsStatus)}</td>
        <td class="actions"><a class="btn sm" href="/dealer/applications/${esc(a.ref)}" data-go aria-label="View ${esc(a.ref)}">${icon("eye")}View</a></td></tr>`).join("") : `<tr><td colspan="7" class="empty">No applications yet. Use Quick Apply.</td></tr>`}
      </tbody></table></div>`);
    bindCommon();
  };
  await load();
  state.refresh = () => load();
}

// ---------------- screen 9: Application Status ----------------
function partyChip(p, flash = false) {
  const r = esc(p.label);
  const f = flash ? " flash" : "";
  switch (p.status) {
    case "Fulfilled": return `<span class="chip ok${f}">${icon("check-circle")}${r} · Fulfilled ${fmt(p.fulfilledAt)}</span>`;
    case "Pending": return `<span class="chip wait${f}">${icon("clock")}${r} · Pending · link expires in ${hoursLeft(p.expiresAt)}</span>`;
    case "Expired": return `<span class="chip bad${f}">${icon("alert-circle")}${r} · Link expired</span>`;
    case "NRIC mismatch": return `<span class="chip bad${f}">${icon("alert-circle")}${r} · NRIC mismatch — Ops is following up</span>`;
    case "Queued": return `<span class="chip wait${f}">${icon("clock")}${r} · Link queued · sent once the gateway is reachable</span>`;
    default: return `<span class="chip bad${f}">${icon("alert-circle")}${r} · ${esc(p.status)}</span>`;
  }
}

function trackerSteps(app, changed = new Set()) {
  const issued = Boolean(app.ipaAt || app.aaAt);
  const mark = { done: icon("check"), current: icon("clock"), todo: "" };
  const said = { done: "Done", current: "In progress", todo: "Not started" };
  const step = (cls, title, desc, extra = "") =>
    `<li class="${cls}"${cls === "current" ? ' aria-current="step"' : ""}><span class="bullet">${mark[cls]}</span><div class="tk-body"><b><span class="visually-hidden">${said[cls]}: </span>${title}</b><span class="desc">${desc}</span>${extra}</div></li>`;
  return [
    step("done", "Application Submitted", "Application details submitted by the dealer"),
    step(app.allFulfilled ? "done" : "current", "Pending Singpass Verification", app.allFulfilled ? "Every person has completed Singpass" : "An AA (final approval) needs every person to complete Singpass first.",
      `<div class="chips">${app.parties.map((p) => partyChip(p, changed.has(p.id))).join("")}</div>`),
    step(issued ? "done" : app.allFulfilled ? "current" : "todo", "Credit Review", issued ? "ValueMax Ops has completed its review" : "ValueMax Ops reviews the application"),
    step(app.ipaAt || app.aaAt ? "done" : "todo", "IPA Issued", app.ipaAt ? `In-Principle Approval issued <span class="num">${fmt(app.ipaAt)}</span>` : app.aaAt ? "No IPA — the AA was issued directly" : "In-Principle Approval"),
    step(app.aaAt ? "done" : "todo", "AA", app.aaAt ? `Approval Advice issued <span class="num">${fmt(app.aaAt)}</span>` : "Approval Advice (final approval)"),
  ].join("");
}

async function dealerStatus(ref) {
  let prev = null; // status of each person at the last render, to flash the chips that changed
  const load = async () => {
    const app = await api("GET", `/api/applications/${ref}`);
    const changed = new Set(prev ? app.parties.filter((p) => prev[p.id] !== undefined && prev[p.id] !== p.status).map((p) => p.id) : []);
    const resendable = app.createdById === state.user.id && app.stage !== "AA" && app.parties.some((p) => ["Pending", "Expired", "NRIC mismatch", "Queued"].includes(p.status));
    $app.innerHTML = dealerShell("apply", `
      <div>
        <h1 class="page-title"><a class="title-link" href="/dealer/applications" data-go>${icon("arrow-left", "lg")}Application Details</a></h1>
        <p class="page-sub num">${esc(app.ref)} · Submitted ${fmtDay(app.createdAt)} · Personal — Hire Purchase Loan (PARF / COE) — Quick Apply</p>
      </div>
      <div class="tabs"><span class="on">Status</span><span>Submitted Details</span></div>
      <section class="card">
        <div class="card-head"><h2>Application Status</h2><span class="ref-badge">Application Ref: <b class="num">${esc(app.ref)}</b></span></div>
        <ol class="tracker">${trackerSteps(app, changed)}</ol>
        <div class="card-foot">
          <div class="row">
            ${app.ipaAt ? `<button class="btn primary" type="button" onclick="this.textContent='IPA notice is out of scope in this demo'">View IPA Notice</button>` : ""}
            ${resendable ? app.parties.filter((p) => p.status !== "Fulfilled").map((p) => `<button class="btn sm" type="button" data-resend="${esc(p.id)}" data-label="${esc(p.label)}">${icon("refresh")}Resend link (${esc(p.label)})</button>`).join("") : ""}
            <button class="btn sm quiet" type="button" data-shortcut="ops-view">Demo: see the Ops view${icon("arrow-right")}</button>
          </div>
          <span class="live small">Updates live — no need to refresh.</span>
        </div>
      </section>`);
    bindCommon();
    bindShortcuts();
    bindResend(ref); // D-04: the dealer agent who submitted may resend, with a reason
    prev = Object.fromEntries(app.parties.map((p) => [p.id, p.status]));
  };
  await load();
  state.refresh = (d) => (!d.ref || d.ref === ref) && load();
}

// ---------------- screen 10: Ops list ----------------
function statusChip(label) {
  const cls = { Pending: "wait", "Credit Review": "blue", "Approved — IPA": "wait", "Approved — AA": "ok", Declined: "bad" }[label] || "wait";
  return `<span class="chip ${cls}">${esc(label)}</span>`;
}
// "Yes" / "1 of 2" / "No": dot + text, never colour alone
function singpassCount(a) {
  const n = a.parties.filter((p) => p.status === "Fulfilled").length;
  if (n === a.parties.length) return `<span class="st ok">Yes</span>`;
  if (a.parties.some((p) => ["NRIC mismatch", "Expired"].includes(p.status))) return `<span class="st bad">${n ? `${n} of ${a.parties.length}` : "No"}</span>`;
  return `<span class="st ${n ? "wait" : "bad"}">${n ? `${n} of ${a.parties.length}` : "No"}</span>`;
}
function partyStatusText(p) {
  const cls = p.status === "Fulfilled" ? "ok" : p.status === "Pending" ? "wait" : "bad";
  return `<span class="st ${cls}">${esc(p.status)}</span>`;
}
// a person in a list cell: name, then masked NRIC and Singpass status (each kept on one line)
const partyCell = (p) => `<div class="pcell"><span class="pname">${esc(p.name)}</span><span class="pmeta"><span class="num nowrap">${esc(p.nricMasked)}</span>${partyStatusText(p)}</span></div>`;

async function opsList() {
  let flashRef = null;
  const load = async () => {
    const [apps, expired] = await Promise.all([api("GET", "/api/applications"), api("GET", "/api/links/expired")]);
    $app.innerHTML = `${header()}<main class="wrap">
      <div class="page-head">
        <div><h1 class="page-title">Ops — All Applications</h1><p class="page-sub">All loan applications across every dealer — Ops review queue.</p></div>
        <div class="row"><a class="btn" href="/ops/expired" data-go>${expired.length ? icon("alert-triangle", "t-bad") : icon("clock")}Expired links (${expired.length})</a><a class="btn quiet" href="/demo" data-go>${icon("play")}Demo Control</a></div>
      </div>
      <div class="tablebox"><table class="list list-ops"><thead><tr><th>APPLICATION NO.</th><th>DEALER</th><th>HIRER</th><th>GUARANTOR</th><th>CAR PLATE</th><th class="wrap-th">SINGPASS FULFILLED</th><th>CREATED</th><th>STATUS</th><th class="actions">ACTIONS</th></tr></thead><tbody>
      ${apps.length ? apps.map((a) => {
        const h = a.parties.find((p) => p.role === "hirer");
        const gs = a.parties.filter((p) => p.role === "guarantor");
        return `<tr class="${a.ref === flashRef ? "flash" : ""}"><td class="ref">${esc(a.ref)}</td><td class="dealer">${esc(a.dealer)}</td>
          <td>${partyCell(h)}</td>
          <td>${gs.length ? gs.map(partyCell).join("") : '<span class="muted">—</span>'}</td>
          <td class="nowrap">${a.carPlate ? esc(a.carPlate) : '<span class="muted">—</span>'}</td><td>${singpassCount(a)}</td>
          <td class="nowrap">${esc(a.createdBy)}<span class="sub">${fmt(a.createdAt)}</span></td>
          <td>${statusChip(a.opsStatus)}</td>
          <td class="actions"><a class="btn sm" href="/ops/applications/${esc(a.ref)}" data-go aria-label="View ${esc(a.ref)}">${icon("eye")}View</a></td></tr>`;
      }).join("") : `<tr><td colspan="9" class="empty">No applications. Submit one as the dealer, or create sample applications in Demo Control.</td></tr>`}
      </tbody></table></div>
      <p class="live small">The hirer and guarantor each show their own Singpass status, updated live.</p>
    </main>`;
    bindCommon();
  };
  await load();
  state.refresh = (d) => { flashRef = d.ref ?? null; return load(); };
}

// ---------------- screen 11: Ops detail ----------------
function opsPartyStatus(p, ref) {
  switch (p.status) {
    case "Fulfilled": return `<dd><span class="st ok">Fulfilled · NRIC matched</span></dd>`;
    case "Pending": return `<dd><span class="st wait">Pending${p.linkStatus === "OPENED" ? " · opened by the customer" : ""} · link expires in ${hoursLeft(p.expiresAt)}</span></dd>`;
    case "NRIC mismatch": return `<dd><span class="st bad">NRIC mismatch · logged in as ${nricWithReveal(ref, p, "returned", p.mismatchUinfin)}</span></dd>`;
    case "Expired": return `<dd><span class="st bad">Expired · resend to send a new link</span></dd>`;
    case "Queued": return `<dd><span class="st wait">Queued · waiting for the Singpass gateway</span></dd>`;
    default: return `<dd><span class="st bad">${esc(p.status)}</span></dd>`;
  }
}

function myinfoTable(p) {
  const mi = p.myinfo;
  if (p.status === "NRIC mismatch") {
    return `<section class="card d-myinfo"><h2>MyInfo Data — ${esc(p.label)}</h2>
      <div class="scroll-x"><table class="cmp"><thead><tr><th>FIELD</th><th>DEALER ENTERED</th><th>FROM MYINFO</th></tr></thead><tbody>
      <tr><td>NRIC</td><td class="num">${esc(p.nricMasked)}</td><td class="t-bad strong num">${esc(p.mismatchUinfin)} ${icon("x-circle")} mismatch</td></tr>
      </tbody></table></div><p class="small muted">Only the returned NRIC is kept; the rest of the MyInfo data was discarded.</p></section>`;
  }
  if (!mi) return "";
  const noa = mi.noaHistory?.[0];
  const row = (f, dealer, myinfo, cls = "") => `<tr><td>${f}</td><td${dealer ? "" : ' class="muted"'}>${dealer ? esc(dealer) : "—"}</td><td class="${cls}">${myinfo}</td></tr>`;
  return `<section class="card d-myinfo"><h2>MyInfo Data — ${esc(p.label)}</h2>
    <div class="scroll-x"><table class="cmp"><thead><tr><th>FIELD</th><th>DEALER ENTERED</th><th>FROM MYINFO</th></tr></thead><tbody>
    <tr><td>NRIC</td><td class="num">${esc(p.nricMasked)}</td><td class="t-ok num">${esc(mi.uinfin)} ${icon("check-circle")} match</td></tr>
    ${row("Name", p.name, esc(mi.name))}
    ${row("Date of birth", "", `<span class="num">${esc(mi.dob)}</span>`)}
    ${row("Registered address", "", esc(mi.regAddress))}
    ${row("Employer", "", esc(mi.employer))}
    ${row("Annual income (NOA)", "", noa ? `<span class="num">SGD ${noa.amount.toLocaleString("en-SG")} (${noa.year})</span>` : "—")}
    ${row("CPF contributions", "", `<span class="num">${mi.cpfMonths} months</span>`)}
    ${row("Housing", "", esc(mi.hdbType || mi.housingType))}
    </tbody></table></div></section>`;
}

// Activity log as a vertical timeline. The server writes the sentences (SGT, no internal codes, no full NRIC).
function activityLog(app) {
  if (!app.activity?.length) return "";
  return `<section class="card d-activity"><h2>Activity</h2><ol class="timeline">${app.activity
    .slice(0, 40)
    .map((e) => `<li class="${esc(e.tone || "")}"><span class="tl-dot" aria-hidden="true"></span><div class="tl-body"><span class="tl-meta"><span class="num">${esc(e.time)}</span>${e.party ? ` · <b>${esc(e.party)}</b>` : ""}</span><span class="tl-text">${esc(e.text)}</span></div></li>`)
    .join("")}</ol></section>`;
}

function linkHistory(p) {
  if (p.history.length < 2) return "";
  return `<div class="linkhist"><span class="muted small">Links sent to the ${esc(p.label.toLowerCase())}:</span>${p.history
    .map((l, i) => `<span class="small num ${l.current ? "" : "old"}">#${i + 1}${l.sentAt ? ` · sent ${fmt(l.sentAt)}` : " · not sent"} · <b>${esc(l.label)}</b>${l.current ? " (current)" : ""}</span>`)
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
      <a class="back-link" href="/ops" data-go>${icon("arrow-left")}All Applications</a>
      <div><h1 class="page-title">Expired Singpass links</h1><p class="page-sub">People whose current link expired without a result. Resend to issue a new link.</p></div>
      <div class="tablebox"><table class="list list-expired"><thead><tr><th>APPLICATION NO.</th><th>PERSON</th><th>EXPIRED</th><th>NEXT RESEND</th><th class="actions">ACTIONS</th></tr></thead><tbody>
      ${rows.length ? rows.map((r) => `<tr><td class="ref"><a href="/ops/applications/${esc(r.ref)}" data-go>${esc(r.ref)}</a></td><td>${esc(r.label)} · ${esc(r.name)}</td><td class="nowrap num">${fmt(r.expiredAt)}</td>
        <td>${r.resendRetryAt ? `<span class="st wait">from ${fmt(r.resendRetryAt)}</span>` : '<span class="st ok">now</span>'}</td>
        <td class="actions"><button class="btn sm" type="button" data-resend="${esc(r.partyId)}" data-ref="${esc(r.ref)}" data-label="${esc(r.label)}" ${r.resendRetryAt ? "disabled" : ""}>${icon("send")}Resend link</button></td></tr>`).join("") : `<tr><td colspan="5" class="empty">No expired links.</td></tr>`}
      </tbody></table></div>
    </main>`;
    bindCommon();
    bindResend(null, load);
  };
  await load();
  state.refresh = () => load();
}

// The right column of the Ops details (Singpass Status + Change Status) sticks only when it fits in the window;
// otherwise it scrolls with the page so "Apply Status Change" is always reachable.
function fitDetailSide() {
  const side = $app.querySelector(".detail-side");
  if (!side) return;
  const top = (document.querySelector(".demo-time")?.offsetHeight ?? 0) + 16;
  side.style.setProperty("--side-top", `${top}px`);
  side.classList.toggle("stick", side.offsetHeight + top + 16 <= window.innerHeight);
}
window.addEventListener("resize", fitDetailSide);

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
    $app.innerHTML = `${header()}<main class="wrap">
      <a class="back-link" href="/ops" data-go>${icon("arrow-left")}All Applications</a>
      <div class="detail-head"><h1 class="page-title">Application Details</h1><span class="ref-badge"><b class="num">${esc(app.ref)}</b></span>${statusChip(app.opsStatus)}</div>
      <div class="detail">
        <div class="detail-main">
          <section class="card d-info">
            <dl class="kv">
              <div><dt>Applicant Name</dt><dd>${esc(h.name)}</dd></div>
              <div><dt>Applicant NRIC</dt><dd class="num nowrap">${nricWithReveal(app.ref, h, "entered", h.nricMasked)}</dd></div>
              <div><dt>Applicant Email</dt><dd>${esc(h.email)}</dd></div>
              <div><dt>Dealer</dt><dd>${esc(app.dealer)}</dd></div>
              <div><dt>Created by</dt><dd>${esc(app.createdBy)} · <span class="num nowrap">${fmt(app.createdAt)}</span></dd></div>
              <div><dt>LTA Access Code</dt><dd class="num">${esc(app.ltaCode)}</dd></div>
            </dl>
          </section>
          ${activityLog(app)}
          ${app.parties.map(myinfoTable).join("")}
          <section class="card d-vehicle">
            <h2>Vehicle Info</h2>
            <dl class="kv"><div><dt>Car Plate</dt><dd${app.carPlate ? "" : ' class="muted"'}>${esc(app.carPlate || "—")}</dd></div><div><dt>Make</dt><dd class="muted">—</dd></div><div><dt>Model</dt><dd class="muted">—</dd></div></dl>
          </section>
        </div>
        <aside class="detail-side">
          <section class="card d-singpass">
            <h2>Singpass Status</h2>
            ${app.parties.map((p) => `<div class="party">
              <dl class="party-dl">
                <div class="full"><dt>${esc(p.label)} — Status</dt>${opsPartyStatus(p, app.ref)}</div>
                <div><dt>${esc(p.label)} — Trigger Date</dt><dd class="num">${fmt(p.triggerAt)}</dd></div>
                <div><dt>${esc(p.label)} — Fulfilled Date</dt><dd class="num${p.fulfilledAt ? "" : " muted"}">${fmt(p.fulfilledAt)}</dd></div>
              </dl>
              <div class="row party-actions">
                <button class="btn sm" type="button" data-retrieve="${esc(p.id)}" ${["Pending", "Queued"].includes(p.status) ? "" : "disabled"}>Retrieve MyInfo (${esc(p.label)})</button>
                <button class="btn sm" type="button" data-resend="${esc(p.id)}" data-label="${esc(p.label)}" ${p.status === "Fulfilled" || app.stage === "AA" ? "disabled" : ""}>Resend Email (${esc(p.label)})</button>
                <button class="btn sm" type="button" data-correct="${esc(p.id)}" data-label="${esc(p.label)}" data-email="${esc(p.email)}" ${app.stage === "AA" ? "disabled" : ""}>Correct NRIC / email</button>
              </div>
              ${linkHistory(p)}
            </div>`).join("")}
          </section>
          <section class="card d-change">
            <div class="row"><h2>Change Status</h2><span class="chip neutral">${icon("lock")}OPS ONLY</span></div>
            <label class="field">New Status
              <select class="select" id="newstatus">
                <option value="IPA" ${selected === "IPA" ? "selected" : ""} ${canIpa ? "" : "disabled"}>Issue IPA${app.ipaAt ? " (issued)" : ""}</option>
                <option value="AA" ${selected === "AA" ? "selected" : ""} ${canAaStage ? "" : "disabled"}>Issue AA${app.aaAt ? " (issued)" : ""}</option>
              </select></label>
            ${selected === "AA" && canAaStage ? `<div class="checklist ${aaBlocked ? "bad" : "ok"}">
              <div class="checklist-title">${icon(aaBlocked ? "lock" : "check-circle", "lg")}<b>${aaBlocked ? "Cannot issue AA yet" : "Ready to issue AA"}</b></div>
              <ul>${app.parties.map((p) => {
                const miss = app.aaCheck.missing.find((m) => m.partyId === p.id);
                return miss ? `<li class="bad">${icon("x-circle")}<span>${esc(p.label)} Singpass ${esc(p.status.toLowerCase())}</span></li>` : `<li class="ok">${icon("check-circle")}<span>${esc(p.label)} Singpass fulfilled</span></li>`;
              }).join("")}</ul>
            </div>` : ""}
            ${selected === "IPA" && canIpa && !app.allFulfilled ? `<div class="note">${icon("info")}<span>An IPA can be issued while Singpass is still pending.</span></div>` : ""}
            <button class="btn primary block" id="apply" type="button" ${applyDisabled ? "disabled" : ""}>Apply Status Change</button>
          </section>
        </aside>
      </div>
    </main>`;
    fitDetailSide();
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
    const outStatus = (m) => (m.status === "sent" ? '<span class="st ok">sent</span>' : m.status === "failed" ? `<span class="st bad">${esc(m.error || "failed")}</span>` : '<span class="st wait">outbox only</span>');
    $app.innerHTML = `${header()}<main class="wrap">
      <div class="page-head">
        <div><h1 class="page-title">Demo Control</h1><p class="page-sub">Hidden page for the presenter. Phone links use <code>${esc(cfg.baseUrl)}</code> · email: ${cfg.smtp ? "SMTP configured" : "SMTP not configured (links only in the log and below)"}</p></div>
        <a class="btn" href="/" data-go>${icon("arrow-left")}Back to portal</a>
      </div>
      <div class="demo-grid">
        <section class="card">
          <h2>Data</h2>
          <div class="row">
            <button class="btn danger" id="reset" type="button">${icon("trash")}Reset all data</button>
            <button class="btn" id="seed" type="button">${icon("database")}Create sample applications</button>
          </div>
          <p class="small muted">Reset hard-deletes every application, link, MyInfo record and message, and puts the clock back. Sample applications are <span class="num nowrap">VMAF-2026-05114</span> to <span class="num">05119</span>.</p>
        </section>
        <section class="card">
          <h2>Gateway, job and clock</h2>
          <div class="ctl-row">
            <span>Simulated Myinfo gateway: ${demo.gatewayAvailable ? '<span class="st ok">available</span>' : '<span class="st bad">unavailable</span>'}</span>
            <div class="row"><button class="btn sm" id="gw" type="button">${demo.gatewayAvailable ? "Switch gateway off" : "Switch gateway on"}</button>
            <button class="btn sm" id="runjob" type="button">${icon("play")}Run job now</button></div>
            <span class="small muted">The auto-verify job also runs every ${(demo.pollIntervalMs / 1000).toFixed(1)} s.</span>
          </div>
          <hr class="divider">
          <div class="ctl-row">
            <span>${icon("clock")} Clock: <span class="num">${fmt(demo.now)}</span>${hours ? ` <span class="chip wait">(+${hours} h)</span>` : ""}</span>
            <div class="row">
              <button class="btn sm" data-advance="1" type="button">+1 h</button>
              <button class="btn sm" data-advance="24" type="button">+24 h</button>
              <button class="btn sm" data-advance="73" type="button">+73 h (expire links)</button>
              ${demo.offsetMs ? '<button class="btn sm" id="realtime2" type="button">Back to real time</button>' : ""}
            </div>
          </div>
        </section>
        <section class="card span-all">
          <h2>Links</h2>
          ${apps.length ? `<div class="tablebox flat"><table class="list list-links"><thead><tr><th>APPLICATION</th><th>PERSON</th><th>STATUS</th><th>LINK</th></tr></thead><tbody>
          ${apps.flatMap((a) => a.parties.map((p) => `<tr><td class="ref">${esc(a.ref)}</td><td>${esc(p.label)} · ${esc(p.name)}<span class="sub">${esc(p.nricMasked)}</span></td><td>${partyStatusText(p)}</td>
            <td class="nowrap">${p.linkUrl ? `<a class="inline-link" href="${esc(p.linkUrl)}" target="_blank" rel="noopener">${icon("external")}Open</a><span class="sep" aria-hidden="true">·</span><button class="link-btn" data-qr="${esc(p.linkUrl)}" type="button" title="Presenter fallback to open the link on a phone; showroom QR is an option after Release 1, not in scope">${icon("qr")} QR (presenter only)</button>` : '<span class="muted">queued</span>'}</td></tr>`)).join("")}
          </tbody></table></div>` : `<p class="muted">No applications yet.</p>`}
          <div id="qrdemo" class="row center"></div>
        </section>
        <section class="card">
          <h2>Outbox (email + SMS)</h2>
          ${outbox.length ? `<ul class="loglist">${outbox.slice(0, 30).map((m) => `<li><span class="log-meta"><span class="num">${fmt(m.at)}</span> · <span class="num">${esc(m.applicationRef)}</span> · ${icon(m.channel === "sms" ? "send" : "mail")}${m.channel === "sms" ? "SMS" : "Email"} → ${esc(m.to)} · ${outStatus(m)}</span>${m.channel === "sms" ? `<span class="small">${esc(m.body)}</span>` : (() => { const u = /https?:\/\/\S+/.exec(m.body)?.[0] ?? ""; return `<a class="mono" href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`; })()}</li>`).join("")}</ul>` : `<p class="muted">No messages yet.</p>`}
        </section>
        <section class="card">
          <h2>Gateway log (simulated gateway side)</h2>
          <p class="small muted">What the gateway knows. AutoFinance never sees refusals (D-33).</p>
          ${demo.gatewayLog.length ? `<ul class="loglist">${demo.gatewayLog.slice(0, 20).map((g) => `<li class="log-line"><span class="num">${fmt(g.at)}</span> · <span class="num">${esc(g.applicationRef)}</span> · <code>${esc(g.linkId)}</code> · <b class="${g.event === "declined" ? "t-bad" : ""}">${esc(g.event)}</b>${g.who ? ` · <span class="num">${esc(g.who)}</span>` : ""}</li>`).join("")}</ul>` : `<p class="muted">Nothing yet.</p>`}
        </section>
      </div>
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
// Simulated gateway pages: neutral grey, no Singpass / Myinfo identity, and this bar is always shown.
const simbar = `<div class="simbar">SIMULATED GATEWAY · DEMO ONLY · NOT REAL SINGPASS</div>`;
const phoneHdr = `<header class="phone-hdr"><span class="dot" aria-hidden="true"></span><span class="brand-text"><b>ValueMax AutoFinance</b><small>IDENTITY VERIFICATION</small></span></header>`;
// a centred result page (invalid link, cancelled, unavailable, done): status icon, short title, one sentence
const statusMark = (kind, name) => `<div class="status-mark ${kind}">${icon(name, "xl")}</div>`;

function invalidScreen() {
  $app.innerHTML = `<div class="phone grey">${phoneHdr}<main class="pbody"><div class="pcard center-card">
    ${statusMark("bad", "alert-circle")}
    <span class="chip bad">Link not valid</span>
    <h1>This link is no longer valid</h1>
    <p class="para">A newer link was sent, or this one expired. Please use the latest email, or ask your dealer to resend.</p>
  </div></main></div>`;
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
  $app.innerHTML = `<div class="phone grey">${phoneHdr}<main class="pbody"><div class="pcard">
    <span class="chip ok">${icon("check-circle")}Link valid · expires in ${hoursLeft(info.expiresAt)}</span>
    <h1>Verify your identity</h1>
    <dl class="pdl"><dt>Application</dt><dd class="num">${esc(info.ref)}</dd><dt>Dealer</dt><dd>${esc(info.dealer)}</dd><dt>Your role</dt><dd>${esc(info.role)}</dd></dl>
    <p class="para">You will log in with Singpass and choose to share your MyInfo details. Only the person this request was sent to can complete it.</p>
    <a class="pbtn" href="${esc(info.redirectUrl)}">Continue to Singpass${icon("arrow-right")}</a>
  </div></main></div>`;
}

// ---------------- customer: simulated ValueMax Myinfo gateway (screens 6–8) ----------------
async function gatewayFlow(linkId) {
  const gw = (method, sub = "", body) => api(method, `/gateway-api/${encodeURIComponent(linkId)}${sub}`, body);
  const unavailable = (msg) => {
    $app.innerHTML = `<div class="phone gw">${simbar}<main class="pbody sp center-card">
      ${statusMark("neutral", "alert-circle")}
      <h1>Myinfo is not available</h1><p class="gw-text">${esc(msg)}</p></main></div>`;
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
    $app.innerHTML = `<div class="phone gw">${simbar}<main class="pbody sp">
      <div class="gw-head"><span class="spsub">ValueMax Myinfo gateway</span><h1>Retrieve Myinfo with Singpass</h1></div>
      <p class="gw-text">VM AutoFinance would like to retrieve your Myinfo details for car loan application <span class="num">${esc(info.applicationRef)}</span>. You will log in with Singpass and choose whether to share them.</p>
      <button class="spbtn" id="retrieve" type="button">Retrieve Myinfo with Singpass</button>
    </main></div>`;
    document.getElementById("retrieve").addEventListener("click", login);
  };

  // Simulated Singpass login
  const login = () => {
    const qrCells = "101101010110110011011001101110110101".split("").map((c) => `<i class="${c === "1" ? "f" : ""}"></i>`).join("");
    $app.innerHTML = `<div class="phone gw">${simbar}<main class="pbody sp">
      <div class="gw-head"><span class="spsub">Step 1 of 3 · via ValueMax Myinfo gateway</span><h1>Log in with Singpass</h1></div>
      <div class="sptabs" role="group" aria-label="Login method"><button type="button" data-tab="app" class="${ctx.tab === "app" ? "on" : ""}" aria-pressed="${ctx.tab === "app"}">Singpass app</button><button type="button" data-tab="pw" class="${ctx.tab === "pw" ? "on" : ""}" aria-pressed="${ctx.tab === "pw"}">Password</button></div>
      ${ctx.tab === "app" ? `
        <div class="qr" role="img" aria-label="QR code (decorative)">${qrCells}</div>
        <p class="gw-text center">Scan with the Singpass app on another device, or pick a test persona on this phone.</p>
        <div class="personas">${info.personas.map((p) => `<button class="persona" type="button" data-nric="${esc(p.uinfin)}"><b>${esc(p.name)}</b><code>${esc(p.uinfin)}</code>${icon("chevron-right")}</button>`).join("")}</div>`
      : `
        <label class="field">Singpass ID (test NRIC / FIN)<input class="input" id="nric" autocomplete="off" placeholder="e.g. F4440488P"></label>
        <label class="field">Password<input class="input" type="password" placeholder="Any value — not checked, not stored"></label>
        <button class="spbtn" id="pwlogin" type="button">Log in</button>`}
      <p class="gw-note">In this demo the ValueMax gateway and Singpass are simulated. With the real gateway, the customer sees the Singpass login.</p>
    </main></div>`;
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
    // singpass-reference/3 and /4: only the names of the requested items, in the reference order; values appear on
    // the review page. The rows are not links, so each has a small tick, not a chevron.
    const items = ["Alias Name", "Country/Place of Birth", "CPF Contribution History (up to 15 months)", "Date of Birth", "Email Address",
      "Name of Employer", "Employment Sector", "HDB Ownership - Address", "HDB Ownership - Date of Purchase", "HDB Ownership - Type of HDB Dwelling",
      "HDB Ownership - Lease Commencement Date", "HDB Ownership - Monthly Loan Instalment", "HDB Ownership - Number of Owners",
      "HDB Ownership - Outstanding HDB Loan Balance", "HDB Ownership - Term of Lease", "Type of HDB", "Type of Housing", "Marital Status",
      "Mobile Number", "Principal Name", "Nationality/Citizenship", "Notice of Assessment History", "Occupation",
      "Ownership of Private Residential Property", "Race", "Registered Address", "Residential Status", "Sex", "NRIC/FIN"];
    $app.innerHTML = `<div class="phone gw">${simbar}<main class="pbody sp">
      <div class="gw-head"><span class="spsub">Step 2 of 3 · Myinfo consent</span><h1>VM AutoFinance is requesting your details</h1>
        <p class="gw-text">For: car loan application <span class="num">${esc(info.applicationRef)}</span> — credit assessment and loan approval</p></div>
      <ul class="splist names">${items.map((k) => `<li>${icon("check")}<span>${esc(k)}</span></li>`).join("")}</ul>
      <p class="gw-note">Clicking "I agree" permits this digital service to retrieve your data. The real list of items is set by the ValueMax gateway.</p>
    </main>
    <div class="gw-actions">
      <button class="spbtn ghost" id="cancel" type="button">Cancel</button>
      <button class="spbtn" id="agree" type="button">I agree, share my details</button>
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

  // Review and submit (singpass-reference/5, in the gateway's neutral grey)
  const review = (tab = "personal") => {
    const p = ctx.person;
    const rows = {
      personal: [["NRIC/FIN", p.uinfin], ["Full Name", p.name], ["Sex", p.sex], ["Race", p.race], ["Nationality/Citizenship", p.nationality], ["Date of Birth", p.dob], ["Country/Place of Birth", p.birthCountry], ["Marital Status", p.maritalStatus], ["Registered Address", p.regAddress], ["Email Address", p.email], ["Mobile Number", p.mobile]],
      employment: [["Name of Employer", p.employer], ["Employment Sector", p.employmentSector], ["Occupation", p.occupation], ["Highest Education", p.education], ...p.noaHistory.map((n) => [`NOA ${n.year}`, `SGD ${n.amount.toLocaleString("en-SG")}`]), ["CPF Contribution History", `${p.cpfMonths} months · latest SGD ${p.cpfLatestAmount.toLocaleString("en-SG")}`]],
      property: [["Type of Housing", p.housingType], ["Type of HDB", p.hdbType || "—"], ["HDB Ownership", p.hdbOwnership || "—"], ["Date of Purchase", p.hdbPurchaseDate || "—"], ["Monthly Loan Instalment", p.hdbMonthlyInstalment ? `SGD ${p.hdbMonthlyInstalment.toLocaleString("en-SG")}` : "—"], ["Outstanding HDB Loan", p.hdbOutstandingLoan ? `SGD ${p.hdbOutstandingLoan.toLocaleString("en-SG")}` : "—"]],
    };
    const titles = { personal: "Personal Information", employment: "Employment & Education", property: "Property" };
    $app.innerHTML = `<div class="phone gw">${simbar}<main class="pbody sp">
      <div class="gw-head center"><span class="spsub">Step 3 of 3 · Review</span><h1>Review</h1>
        <p class="gw-text">Review your details below and click "Submit Application".</p></div>
      <div class="rvtabs" role="group" aria-label="Sections">${Object.keys(rows).map((k) => `<button type="button" data-rv="${k}" class="${k === tab ? "on" : ""}" aria-pressed="${k === tab}">${k === "personal" ? "Personal" : k === "employment" ? "Employment &amp; Education" : "Property"}</button>`).join("")}</div>
      <h2 class="rvhead">${titles[tab]}</h2>
      <ul class="splist">${rows[tab].map(([k, v]) => `<li><span>${esc(k)}</span><b>${esc(v || "—")}</b></li>`).join("")}</ul>
    </main>
    <div class="gw-actions"><button class="spbtn" id="submit" type="button">Submit Application</button></div></div>`;
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
  $app.innerHTML = `<div class="phone gw">${simbar}
    <main class="pbody sp center-card grow">
      ${statusMark("ok", "check")}
      <h1>Details shared</h1>
      <p class="gw-text">Your MyInfo details were sent to ValueMax AutoFinance${ref ? ` for application <span class="num">${esc(ref)}</span>` : ""}. You can close this page.</p>
      <p class="gw-note">Your dealer will contact you about the next step.</p>
      <button class="btn" type="button" data-shortcut="dealer-view">Demo: see the dealer's view${icon("arrow-right")}</button>
    </main>
    <div class="foot">Today the gateway does not send the customer back to AutoFinance, so this page is the end of the customer's journey.</div>
  </div>`;
  bindShortcuts();
}

function declinedScreen() {
  $app.innerHTML = `<div class="phone gw">${simbar}<main class="pbody sp center-card">
    ${statusMark("neutral", "x-circle")}
    <h1>You cancelled</h1>
    <p class="gw-text">No details were shared with ValueMax AutoFinance. You can open the link in your email again while it is valid.</p>
  </main></div>`;
}

// ---------------- boot ----------------
(async function boot() {
  [state.config, { user: state.user }] = await Promise.all([api("GET", "/api/config"), api("GET", "/api/session")]);
  await loadDemoClock();
  connectEvents();
  render();
})();
