// ValueMax Singpass demo — single-page frontend (dealer, Ops, customer phone, Demo Control).

const $app = document.getElementById("app");
const $toast = document.getElementById("toast");

// ---------------- utilities ----------------
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

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
function toast(msg, isErr = false) {
  $toast.textContent = msg;
  $toast.className = `show${isErr ? " err" : ""}`;
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
const roleLabel = (r) => (r === "hirer" ? "Hirer" : "Guarantor");

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

// ---------------- state ----------------
const state = { user: null, config: null, draft: null, refresh: null };
const emptyParty = () => ({ name: "", nric: "", email: "", mobile: "" });
function loadDraft() {
  try {
    const d = JSON.parse(sessionStorage.getItem("draft") || "null");
    if (d) return d;
  } catch {}
  return { hirer: emptyParty(), guarantorOn: false, guarantor: emptyParty(), ltaCode: "", c1: false, c2: false };
}
function saveDraft() {
  try { sessionStorage.setItem("draft", JSON.stringify(state.draft)); } catch {}
}

// ---------------- realtime ----------------
function connectEvents() {
  const es = new EventSource("/api/events");
  const onChange = (e) => {
    let data = {};
    try { data = JSON.parse(e.data); } catch {}
    if (state.refresh) state.refresh(data);
  };
  es.addEventListener("application", onChange);
  es.addEventListener("outbox", (e) => state.refresh && state.refresh({ outbox: true }));
}

// ---------------- router ----------------
function go(path) {
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
    if ((m = path.match(/^\/v\/([^/]+)$/))) return await customerFlow(m[1]);
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
    if ((m = path.match(/^\/ops\/applications\/([^/]+)$/))) return await opsDetail(m[1]);
    return go("/ops");
  } catch (e) {
    if (e.status === 401) {
      state.user = null;
      return signIn();
    }
    $app.innerHTML = `${header()}<div class="wrap"><div class="note-red">${esc(e.message)}</div><a class="btn" href="/" data-go>Home</a></div>`;
  }
}

// ---------------- shells ----------------
function header() {
  const u = state.user;
  const area = u?.kind === "ops" ? "OPERATIONS" : "DEALER PORTAL";
  return `<header class="hdr">
    <a class="brand" href="/" data-go><span class="dot"></span><div><b>ValueMax AutoFinance</b><small>${area}</small></div></a>
    <div class="who">${u ? `${esc(u.org)} — ${esc(u.name)}<span class="avatar">${esc(u.initials)}</span>
      <button class="hdr-btn" id="signout" type="button">Switch role</button>` : ""}</div>
  </header>`;
}

function dealerShell(active, inner) {
  const item = (href, label, key) => `<a href="${href}" data-go class="${active === key ? "on" : ""}">${label}</a>`;
  return `${header()}<div class="layout">
    <nav class="side" aria-label="Dealer menu">
      <span class="cap">FINANCE</span>
      ${item("/dealer/applications", "My Applications", "list")}
      ${item("/dealer/apply", "Quick Apply", "apply")}
      <span class="item muted">Account</span>
      <span class="cap mt">SUPPORT</span>
      <span class="item muted">Document Centre</span>
      <span class="item muted">Contact Us</span>
    </nav>
    <main class="main">${inner}</main>
  </div>`;
}

function bindCommon() {
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
  $app.innerHTML = `${header()}<div class="signin">
    <h1 style="font-size:26px;color:var(--red-deep)">Sign in to the demo</h1>
    <p class="muted" style="margin:0">Pick a role. No password in this demo.</p>
    ${users.map((u) => `<button class="rolecard" data-user="${u.id}" type="button"><span class="avatar">${esc(u.initials)}</span>
      <span><b>${esc(u.name)} — ${esc(u.org)}</b><span class="muted small">${u.kind === "ops" ? "VMAF Ops · all applications, IPA / AA" : "Dealer user · Quick Apply, own applications"}</span></span></button>`).join("")}
    <p class="small muted">Customers do not sign in: they open the link from their email on their phone.</p>
  </div>`;
  $app.querySelectorAll("[data-user]").forEach((b) =>
    b.addEventListener("click", async () => {
      const { user } = await api("POST", "/api/session", { userId: b.dataset.user });
      state.user = user;
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
    <label class="field">Phone Number *${prefix === "hirer" ? " (for WhatsApp updates)" : ""}<input class="input" inputmode="numeric" data-f="${prefix}.mobile" value="${esc(p.mobile)}"${bg}><span class="hint" data-h="${prefix}.mobile"></span></label>
  </div>`;
}

function fieldState(prefix, key, value, other) {
  if (!value) return { cls: "", msg: "" };
  if (key === "nric") {
    if (!validNric(value)) return { cls: "err", msg: "✗ Invalid NRIC / FIN" };
    if (prefix === "guarantor" && other && value.trim().toUpperCase() === other.trim().toUpperCase()) return { cls: "err", msg: "✗ Must differ from the hirer's NRIC" };
    return { cls: "ok", msg: "✓ Valid NRIC / FIN" };
  }
  if (key === "email") return validEmail(value) ? { cls: "ok", msg: "✓ Looks good" } : { cls: "err", msg: "✗ Invalid email" };
  if (key === "mobile") return validMobile(value) ? { cls: "ok", msg: "✓ Valid Singapore mobile number" } : { cls: "err", msg: "✗ 8 digits, starting with 8 or 9" };
  return { cls: "", msg: "" };
}

function partyValid(p, other) {
  return p.name.trim() && validNric(p.nric) && validEmail(p.email) && validMobile(p.mobile) && (!other || p.nric.trim().toUpperCase() !== other.trim().toUpperCase());
}
function draftValid(d) {
  return partyValid(d.hirer) && (!d.guarantorOn || partyValid(d.guarantor, d.hirer.nric)) && d.ltaCode.trim();
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
      ${d.guarantorOn ? `<div class="gbox"><b style="font-size:16px">Guarantor Details</b>${partyFields("guarantor", d.guarantor, "Guarantor", true)}</div>` : ""}
      <label class="field" style="max-width:360px">LTA Access Code *<input class="input" data-f="ltaCode" value="${esc(d.ltaCode)}"><span class="hint">The rest of the form unlocks once this is entered.</span></label>
    </section>
    <div class="row between">
      <button class="btn" id="clear" type="button">Cancel</button>
      <button class="btn primary" id="next" type="button">Next: Documents →</button>
    </div>`);
  bindCommon();

  const refreshHints = () => {
    for (const prefix of ["hirer", "guarantor"]) {
      for (const key of ["nric", "email", "mobile"]) {
        const h = $app.querySelector(`[data-h="${prefix}.${key}"]`);
        if (!h) continue;
        const s = fieldState(prefix, key, d[prefix][key], d.hirer.nric);
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
  document.getElementById("sample").addEventListener("click", () => {
    const email = d.hirer.email || "";
    d.hirer = { name: "HENG SHI ZHENG", nric: "F4440488P", email, mobile: "9123 4567" };
    d.guarantorOn = true;
    d.guarantor = { name: "RAJESH KUMAR S/O MURUGAN", nric: "G4440425M", email: d.guarantor.email || email, mobile: "9876 5432" };
    d.ltaCode = "A7K29Q";
    saveDraft();
    dealerApply();
    toast("Sample filled — type the email address(es) that should receive the Singpass link");
  });
  document.getElementById("clear").addEventListener("click", () => {
    state.draft = { hirer: emptyParty(), guarantorOn: false, guarantor: emptyParty(), ltaCode: "", c1: false, c2: false };
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
      <div class="grid2">${box("HIRER", d.hirer)}${d.guarantorOn ? box("GUARANTOR", d.guarantor) : ""}</div>
      <label class="check"><input type="checkbox" id="c1" ${d.c1 ? "checked" : ""}>I confirm that the Applicant and Guarantor(s) have been shown the declarations above, have read and understood them in a language they understand, and have agreed to them — including consent to identity, employment and credit bureau verification.</label>
      <div class="band">DEALER'S ATTESTATION</div>
      <p class="para">By submitting this application, I, as an authorised representative of the Dealer named in this application, confirm that: (a) all information was provided by the Applicant / Guarantor(s) and is accurate and complete; (b) I have verified the identity of the Applicant / Guarantor(s) against their original supporting documents; (c) the Applicant / Guarantor(s) have consented to … receiving a Singpass verification request to authorise MyInfo retrieval; and (d) I understand the Dealer is not an agent of VMAF.</p>
      <label class="check"><input type="checkbox" id="c2" ${d.c2 ? "checked" : ""}>I have explained the above (including the Privacy Policy) to the Applicant / Guarantor(s), and I make the Dealer's Attestation set out above.</label>
    </section>
    <div class="note-gold">On submit, a Singpass verification link is emailed to the hirer${d.guarantorOn ? " and the guarantor" : ""} (one active link each, valid ${state.config.ttlHours} hours), and the LTA Access Code is used to retrieve the vehicle's log card and PARF/COE rebate details automatically.</div>
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
        guarantor: d.guarantorOn ? d.guarantor : null,
        ltaCode: d.ltaCode,
      });
      state.draft = { hirer: emptyParty(), guarantorOn: false, guarantor: emptyParty(), ltaCode: "", c1: false, c2: false };
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
      <div class="okcircle"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1F8A5B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg></div>
      <h1 style="font-size:28px;color:var(--red-deep)">Interest Received</h1>
      <p class="para" style="font-size:16px;max-width:560px">Thanks — we've received your interest for <b style="color:var(--text)">${esc(hirer.name)}</b>. We're now sending Singpass verification links to the ${app.parties.length > 1 ? "hirer and guarantor" : "hirer"}, and retrieving their vehicle documents via LTA.</p>
      <span class="pill">Application Ref: ${esc(app.ref)}</span>
      <div class="grid2" style="width:100%;max-width:560px;text-align:left">
        ${app.parties.map((p) => `<div class="sumbox"><span class="muted small">${roleLabel(p.role)} · link sent</span><b style="font-size:14px">Expires ${fmt(p.expiresAt)}</b></div>`).join("")}
      </div>
      <p class="para" style="font-size:15px">Keep an eye on the <b>My Applications</b> page for updates — this application now shows as <b>Pending</b>.</p>
      <div class="row center">
        <a class="btn" href="/dealer/apply" data-go>Submit Another</a>
        <button class="btn" id="qrbtn" type="button">Show QR of the link</button>
        <a class="btn primary" href="/dealer/applications/${esc(app.ref)}" data-go>View Application Status →</a>
      </div>
      <div id="qrs" class="row center" hidden></div>
    </section>
  </main>`;
  bindCommon();
  document.getElementById("qrbtn").addEventListener("click", () => {
    const box = document.getElementById("qrs");
    box.hidden = !box.hidden;
    if (box.hidden) return;
    box.innerHTML = app.parties.map((p, i) => `<div class="qrbox"><b>${roleLabel(p.role)}</b><div id="qr${i}"></div><code>${esc(p.linkUrl)}</code></div>`).join("");
    app.parties.forEach((p, i) => makeQr(document.getElementById(`qr${i}`), p.linkUrl));
  });
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
  const r = roleLabel(p.role);
  switch (p.status) {
    case "Fulfilled": return `<span class="chip ok">${r} · Fulfilled ${fmt(p.fulfilledAt)}</span>`;
    case "Pending": return `<span class="chip wait">${r} · Pending · link expires in ${hoursLeft(p.expiresAt)}</span>`;
    case "Expired": return `<span class="chip bad">${r} · Link expired</span>`;
    case "NRIC mismatch": return `<span class="chip bad">${r} · NRIC mismatch — Ops will follow up</span>`;
    case "Declined": return `<span class="chip bad">${r} · Declined on Singpass</span>`;
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
    step(app.ipaAt ? "done" : "todo", "IPA Issued", app.ipaAt ? `In-Principle Approval issued ${fmt(app.ipaAt)}` : "In-Principle Approval"),
    step(app.aaAt ? "done" : "todo", "AA", app.aaAt ? `Approval Advice issued ${fmt(app.aaAt)}` : "Approval Advice (final approval)"),
  ].join("");
}

async function dealerStatus(ref) {
  let prev = null;
  const load = async () => {
    const app = await api("GET", `/api/applications/${ref}`);
    const sig = JSON.stringify(app.parties.map((p) => p.status)) + app.stage;
    $app.innerHTML = dealerShell("list", `
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
          <span class="small muted">Updates live — no need to refresh.</span>
        </div>
      </section>`);
    bindCommon();
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
  if (a.parties.some((p) => ["NRIC mismatch", "Declined", "Expired"].includes(p.status))) return `<b class="t-bad">${n ? `${n} of ${a.parties.length}` : "No"}</b>`;
  return `<b class="${n ? "t-wait" : "t-bad"}">${n ? `${n} of ${a.parties.length}` : "No"}</b>`;
}
function partyStatusText(p) {
  const cls = p.status === "Fulfilled" ? "t-ok" : p.status === "Pending" ? "t-wait" : "t-bad";
  return `<b class="${cls}">${esc(p.status)}</b>`;
}

async function opsList() {
  let flashRef = null;
  const load = async () => {
    const apps = await api("GET", "/api/applications");
    $app.innerHTML = `${header()}<main class="wrap">
      <div class="row between" style="align-items:flex-start">
        <div><h1 style="font-size:28px">Ops — All Applications</h1><span style="font-size:15px;color:var(--text-2)">All loan applications across every dealer — Ops review queue.</span></div>
        <a class="btn" href="/demo" data-go>Demo Control</a>
      </div>
      <div class="tablebox"><table class="list"><thead><tr><th>APPLICATION NO.</th><th>DEALER</th><th>HIRER</th><th>GUARANTOR</th><th>CAR PLATE</th><th>SINGPASS FULFILLED</th><th>CREATED</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>
      ${apps.length ? apps.map((a) => {
        const h = a.parties.find((p) => p.role === "hirer");
        const g = a.parties.find((p) => p.role === "guarantor");
        return `<tr class="${a.ref === flashRef ? "flash" : ""}"><td><b>${esc(a.ref)}</b></td><td>${esc(a.dealer)}</td>
          <td>${esc(h.name)}<br><span class="sub">${esc(h.nric)} · ${partyStatusText(h)}</span></td>
          <td>${g ? `${esc(g.name)}<br><span class="sub">${esc(g.nric)} · ${partyStatusText(g)}</span>` : "—"}</td>
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
function opsPartyStatus(p) {
  switch (p.status) {
    case "Fulfilled": return `<dd class="t-ok">Fulfilled · NRIC matched</dd>`;
    case "Pending": return `<dd class="t-wait">Pending · link expires in ${hoursLeft(p.expiresAt)}</dd>`;
    case "NRIC mismatch": return `<dd class="t-bad">NRIC mismatch · logged in as ${esc(p.mismatchUinfin)}</dd>`;
    case "Expired": return `<dd class="t-bad">Expired · resend to send a new link</dd>`;
    case "Declined": return `<dd class="t-bad">Declined · customer pressed Cancel</dd>`;
    default: return `<dd class="t-bad">${esc(p.status)}</dd>`;
  }
}

function myinfoTable(p) {
  const mi = p.myinfo;
  if (p.status === "NRIC mismatch") {
    return `<h2 style="font-size:24px">MyInfo Data — ${roleLabel(p.role)}</h2>
      <div style="overflow-x:auto"><table class="cmp"><thead><tr><th>FIELD</th><th>DEALER ENTERED</th><th>FROM MYINFO</th></tr></thead><tbody>
      <tr><td>NRIC</td><td>${esc(p.nric)}</td><td class="t-bad" style="font-weight:600">${esc(p.mismatchUinfin)} ✗ mismatch</td></tr>
      </tbody></table></div><p class="small muted" style="margin:0">Only the returned NRIC is kept; the rest of the MyInfo data was discarded.</p>`;
  }
  if (!mi) return "";
  const noa = mi.noaHistory?.[0];
  const row = (f, dealer, myinfo, cls = "") => `<tr><td>${f}</td><td${dealer ? "" : ' style="color:var(--faint)"'}>${dealer ? esc(dealer) : "—"}</td><td class="${cls}">${myinfo}</td></tr>`;
  return `<h2 style="font-size:24px">MyInfo Data — ${roleLabel(p.role)}</h2>
    <div style="overflow-x:auto"><table class="cmp"><thead><tr><th>FIELD</th><th>DEALER ENTERED</th><th>FROM MYINFO</th></tr></thead><tbody>
    ${row("NRIC", p.nric, `${esc(mi.uinfin)} ✓ match`, "t-ok")}
    ${row("Name", p.name, esc(mi.name))}
    ${row("Date of birth", "", esc(mi.dob))}
    ${row("Registered address", "", esc(mi.regAddress))}
    ${row("Employer", "", esc(mi.employer))}
    ${row("Annual income (NOA)", "", noa ? `SGD ${noa.amount.toLocaleString("en-SG")} (${noa.year})` : "—")}
    ${row("CPF contributions", "", `${mi.cpfMonths} months`)}
    ${row("Housing", "", esc(mi.hdbType || mi.housingType))}
    </tbody></table></div>`;
}

async function opsDetail(ref) {
  let selected = "IPA";
  const load = async () => {
    const app = await api("GET", `/api/applications/${ref}`);
    const h = app.parties.find((p) => p.role === "hirer");
    const canIpa = app.stage === "Submitted";
    const canAaStage = app.stage === "Submitted" || app.stage === "IPA";
    if (selected === "IPA" && !canIpa && canAaStage) selected = "AA";
    const aaBlocked = !app.allFulfilled;
    const applyDisabled = selected === "IPA" ? !canIpa : !canAaStage || aaBlocked;
    $app.innerHTML = `${header()}<main class="wrap narrow">
      <a href="/ops" data-go style="font-weight:600;text-decoration:none">← All Applications</a>
      <section class="card" style="padding:32px;gap:22px">
        <div class="row" style="align-items:center;gap:14px"><h1 style="font-size:28px">Application Details</h1><span class="chip wait" style="font-size:14px">${esc(app.ref)}</span>${statusChip(app.opsStatus)}</div>
        <dl class="kv">
          <div><dt>Applicant Name</dt><dd>${esc(h.name)}</dd></div>
          <div><dt>Applicant NRIC</dt><dd>${esc(h.nric)}</dd></div>
          <div><dt>Applicant Email</dt><dd>${esc(h.email)}</dd></div>
          <div><dt>Dealer</dt><dd>${esc(app.dealer)}</dd></div>
          <div><dt>Created by</dt><dd>${esc(app.createdBy)} · ${fmt(app.createdAt)}</dd></div>
          <div><dt>LTA Access Code</dt><dd>${esc(app.ltaCode)}</dd></div>
        </dl>
        <h2 style="font-size:24px">Singpass Status</h2>
        ${app.parties.map((p) => `<div class="partyblock">
          <dl class="kv">
            <div><dt>${roleLabel(p.role)} — Status</dt>${opsPartyStatus(p)}</div>
            <div><dt>${roleLabel(p.role)} — Trigger Date</dt><dd>${fmt(p.triggerAt)}</dd></div>
            <div><dt>${roleLabel(p.role)} — Fulfilled Date</dt><dd${p.fulfilledAt ? "" : ' style="color:var(--faint)"'}>${fmt(p.fulfilledAt)}</dd></div>
          </dl>
          <div class="row" style="gap:10px">
            <button class="btn sm" type="button" disabled title="Retrieval happens automatically when the customer submits">Retrieve MyInfo (${roleLabel(p.role)})</button>
            <button class="btn sm" type="button" data-resend="${p.role}" ${p.status === "Fulfilled" ? "disabled" : ""}>Resend Email (${roleLabel(p.role)})</button>
            ${p.history.length > 1 ? `<span class="small muted" style="align-self:center">${p.history.length} links sent</span>` : ""}
          </div>
        </div>`).join("")}
        ${app.notes.map((n) => `<div class="note-red">${fmt(n.at)}: ${esc(n.text)}</div>`).join("")}
        ${app.parties.map(myinfoTable).join("")}
        <h2 style="font-size:24px">Vehicle Info</h2>
        <dl class="kv"><div><dt>Car Plate</dt><dd>${esc(app.carPlate || "—")}</dd></div><div><dt>Make</dt><dd style="color:var(--faint)">— (via LTA, out of scope)</dd></div><div><dt>Model</dt><dd style="color:var(--faint)">—</dd></div></dl>
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
          ${app.parties.map((p) => p.status === "Fulfilled" ? `<span class="t-ok">✓ ${roleLabel(p.role)} Singpass fulfilled</span>` : `<span style="color:var(--red-text)">✗ ${roleLabel(p.role)} Singpass ${esc(p.status.toLowerCase())}</span>`).join("")}
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
    $app.querySelectorAll("[data-resend]").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        await api("POST", `/api/applications/${ref}/parties/${b.dataset.resend}/resend`);
        toast(`New link emailed to the ${b.dataset.resend}; the old link no longer works`);
      } catch (e) { toast(e.message, true); b.disabled = false; }
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
    const [apps, outbox] = await Promise.all([api("GET", "/api/applications"), api("GET", "/api/demo/outbox")]);
    const cfg = state.config;
    $app.innerHTML = `${header()}<main class="wrap narrow">
      <div class="row between"><div><h1 style="font-size:28px">Demo Control</h1><span class="muted">Hidden page for the presenter. Phone links use <code>${esc(cfg.baseUrl)}</code> · email: ${cfg.smtp ? "SMTP configured" : "SMTP not configured (links only in the log and below)"}</span></div>
        <a class="btn" href="/" data-go>Back to portal</a></div>
      <section class="card" style="gap:14px">
        <h2>Data</h2>
        <div class="row">
          <button class="btn danger" id="reset" type="button">Reset all data</button>
          <button class="btn" id="seed" type="button">Create sample applications</button>
        </div>
        <p class="small muted" style="margin:0">Reset hard-deletes every application, link and MyInfo record. Sample applications are VMAF-2026-05114 to 05119.</p>
      </section>
      <section class="card" style="gap:14px">
        <h2>Links (error cases)</h2>
        ${apps.length ? `<div style="overflow-x:auto"><table class="cmp"><thead><tr><th>APPLICATION</th><th>PERSON</th><th>STATUS</th><th>LINK</th><th></th></tr></thead><tbody>
        ${apps.flatMap((a) => a.parties.map((p) => `<tr><td><b>${esc(a.ref)}</b></td><td>${roleLabel(p.role)} · ${esc(p.name)}<br><span class="small muted">${esc(p.nric)}</span></td><td>${partyStatusText(p)}</td>
          <td><a href="${esc(p.linkUrl)}" target="_blank" rel="noopener">Open</a> · <button class="link-btn" data-qr="${esc(p.linkUrl)}" type="button">QR</button></td>
          <td>${p.status === "Pending" ? `<button class="btn sm" data-expire="${esc(a.ref)}|${p.role}" type="button">Make link expired</button>` : ""}</td></tr>`)).join("")}
        </tbody></table></div>` : `<p class="muted" style="margin:0">No applications yet.</p>`}
        <div id="qrdemo" class="row center"></div>
      </section>
      <section class="card" style="gap:14px">
        <h2>Outbox (last emails)</h2>
        ${outbox.length ? outbox.map((m) => `<div class="sumbox"><span class="lbl">${fmt(m.at)} · ${esc(m.ref)} · ${roleLabel(m.role)} → ${esc(m.to)} · ${m.delivered ? '<span class="t-ok">sent</span>' : `<span class="t-wait">${esc(m.error || "not sent")}</span>`}</span><a class="mono" href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.url)}</a></div>`).join("") : `<p class="muted" style="margin:0">No emails yet.</p>`}
      </section>
      <section class="card" style="gap:10px">
        <h2>Error cases to show</h2>
        <ol class="para" style="padding-left:20px;margin:0;display:flex;flex-direction:column;gap:6px">
          <li><b>Expired link</b>: "Make link expired" above, then open the link on the phone.</li>
          <li><b>Old link after Resend</b>: Ops → Application → "Resend Email", then open the first email's link.</li>
          <li><b>NRIC mismatch</b>: on the simulated Singpass login, pick a persona different from the NRIC the dealer entered.</li>
          <li><b>Customer cancels</b>: press "Cancel" on the consent screen.</li>
        </ol>
      </section>
    </main>`;
    bindCommon();
    document.getElementById("reset").addEventListener("click", async () => {
      await api("POST", "/api/demo/reset");
      toast("All demo data deleted");
    });
    document.getElementById("seed").addEventListener("click", async () => {
      const r = await api("POST", "/api/demo/seed");
      toast(`${r.added} sample application(s) created`);
    });
    $app.querySelectorAll("[data-expire]").forEach((b) => b.addEventListener("click", async () => {
      const [ref, role] = b.dataset.expire.split("|");
      try { await api("POST", `/api/demo/expire/${ref}/${role}`); toast("Link is now expired"); } catch (e) { toast(e.message, true); }
    }));
    $app.querySelectorAll("[data-qr]").forEach((b) => b.addEventListener("click", () => {
      const box = document.getElementById("qrdemo");
      box.innerHTML = `<div class="qrbox"><div id="qrd"></div><code>${esc(b.dataset.qr)}</code></div>`;
      makeQr(document.getElementById("qrd"), b.dataset.qr);
    }));
  };
  await load();
  state.refresh = () => load();
}

// ---------------- customer flow (screens 5–8) ----------------
const simbar = `<div class="simbar">SIMULATED GATEWAY · DEMO ONLY · NOT REAL SINGPASS</div>`;
const phoneHdr = `<div class="phone-hdr"><span class="dot" style="width:10px;height:10px"></span><div><b>ValueMax AutoFinance</b><small>IDENTITY VERIFICATION</small></div></div>`;

function invalidScreen() {
  $app.innerHTML = `<div class="phone grey">${phoneHdr}<div class="pbody"><div class="pcard">
    <span class="chip xs bad" style="align-self:flex-start">Link not valid</span>
    <h1 style="color:var(--red)">This link is no longer valid</h1>
    <p class="para">A newer link was sent, or this one expired or was already used. Please use the latest email, or ask your dealer to resend.</p>
  </div></div></div>`;
}

async function customerFlow(token) {
  const info = await api("GET", `/api/v/${token}`);
  if (!info.valid) return invalidScreen();
  const ctx = { token, info, person: null, tab: "app" };

  const fail = (e) => {
    if (e.status === 410) return invalidScreen();
    toast(e.message, true);
  };

  // Screen 5 — link check
  const check = () => {
    $app.innerHTML = `<div class="phone grey">${phoneHdr}<div class="pbody"><div class="pcard">
      <span class="chip xs ok" style="align-self:flex-start">✓ Link valid · expires in ${hoursLeft(info.expiresAt)}</span>
      <h1>Verify your identity</h1>
      <dl class="pdl"><dt>Application</dt><dd>${esc(info.ref)}</dd><dt>Dealer</dt><dd>${esc(info.dealer)}</dd><dt>Your role</dt><dd>${roleLabel(info.role)}</dd><dt>NRIC</dt><dd>${esc(info.maskedNric)}</dd></dl>
      <p class="para">You will log in with Singpass and choose to share your MyInfo details. Only the person with NRIC ${esc(info.maskedNric)} can complete this.</p>
      <button class="pbtn" id="go" type="button">Retrieve Myinfo with Singpass</button>
    </div></div></div>`;
    document.getElementById("go").addEventListener("click", async (e) => {
      e.target.disabled = true;
      try { await api("POST", `/api/v/${token}/start`); login(); } catch (err) { fail(err); e.target.disabled = false; }
    });
  };

  // Screen 6 — simulated Singpass login
  const login = async () => {
    const personas = await api("GET", "/api/personas");
    const qrCells = "101101010110110011011001101110110101".split("").map((c) => `<i class="${c === "1" ? "f" : ""}"></i>`).join("");
    $app.innerHTML = `<div class="phone">${simbar}<div class="pbody sp">
      <div><span class="spsub">Step 1 of 2 · via ValueMax Myinfo gateway</span><h1>Log in with Singpass</h1></div>
      <div class="sptabs"><button type="button" data-tab="app" class="${ctx.tab === "app" ? "on" : ""}">Singpass app</button><button type="button" data-tab="pw" class="${ctx.tab === "pw" ? "on" : ""}">Password</button></div>
      ${ctx.tab === "app" ? `
        <div class="qr" role="img" aria-label="QR code (decorative)">${qrCells}</div>
        <p style="margin:0;text-align:center;font-size:14px;color:var(--sp-2)">Scan with the Singpass app on another device, or pick a test persona on this phone.</p>
        <div style="display:flex;flex-direction:column;gap:8px">${personas.map((p) => `<button class="persona" type="button" data-nric="${esc(p.uinfin)}"><b>${esc(p.name)}</b><code>${esc(p.uinfin)}</code></button>`).join("")}</div>`
      : `
        <label class="field">Singpass ID (test NRIC / FIN)<input class="input" id="nric" autocomplete="off" placeholder="e.g. F4440488P"></label>
        <label class="field">Password<input class="input" type="password" placeholder="Any value — not checked, not stored"></label>
        <button class="spbtn" id="pwlogin" type="button">Log in</button>`}
      <p style="margin:0;font-size:12px;color:var(--sp-3)">In development and UAT this screen is the simulated gateway with Singpass staging test accounts. In production, the customer sees the real Singpass login.</p>
    </div></div>`;
    $app.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { ctx.tab = b.dataset.tab; login(); }));
    const doLogin = async (uinfin) => {
      try {
        const r = await api("POST", `/api/v/${token}/login`, { uinfin });
        ctx.person = r.person;
        consent();
      } catch (e) { fail(e); }
    };
    $app.querySelectorAll("[data-nric]").forEach((b) => b.addEventListener("click", () => doLogin(b.dataset.nric)));
    document.getElementById("pwlogin")?.addEventListener("click", () => doLogin(document.getElementById("nric").value));
  };

  // Screen 7 — consent
  const consent = () => {
    const p = ctx.person;
    const noa = p.noaHistory?.[0];
    const items = [
      ["NRIC", p.uinfin], ["Name", p.name], ["Date of birth", p.dob], ["Registered address", p.regAddress],
      ["Name of employer", p.employer], ["Annual income (NOA)", noa ? `SGD ${noa.amount.toLocaleString("en-SG")}` : "—"],
      ["CPF contributions", `${p.cpfMonths} months`], ["Type of housing", p.hdbType || p.housingType],
    ];
    $app.innerHTML = `<div class="phone">${simbar}<div class="pbody sp" style="padding:24px;gap:16px">
      <div><span class="spsub">Step 2 of 2 · Myinfo</span><h1 style="font-size:22px">VM AutoFinance is requesting your details</h1>
        <p style="margin:6px 0 0;font-size:14px;color:var(--sp-2)">For: car loan application ${esc(info.ref)}</p></div>
      <ul class="splist">${items.map(([k, v]) => `<li><span>${k}</span><b>${esc(v)}</b></li>`).join("")}</ul>
      <p style="margin:0;font-size:12px;color:var(--sp-3)">Sample data only. The real data list is set by the ValueMax gateway.</p>
      <button class="spbtn" id="agree" type="button">I agree, share my details</button>
      <button class="spbtn ghost" id="cancel" type="button">Cancel</button>
    </div></div>`;
    document.getElementById("agree").addEventListener("click", () => (info.showReview ? review() : submit()));
    document.getElementById("cancel").addEventListener("click", async () => {
      try { await api("POST", `/api/v/${token}/decline`); declined(); } catch (e) { fail(e); }
    });
  };

  // Screen 8a — review
  const review = (tab = "personal") => {
    const p = ctx.person;
    const rows = {
      personal: [["NRIC/FIN", p.uinfin], ["Full Name", p.name], ["Sex", p.sex], ["Race", p.race], ["Nationality/Citizenship", p.nationality], ["Date of Birth", p.dob], ["Country/Place of Birth", p.birthCountry], ["Marital Status", p.maritalStatus], ["Registered Address", p.regAddress], ["Email Address", p.email], ["Mobile Number", p.mobile]],
      employment: [["Name of Employer", p.employer], ["Employment Sector", p.employmentSector], ["Occupation", p.occupation], ["Highest Education", p.education], ...p.noaHistory.map((n) => [`NOA ${n.year}`, `SGD ${n.amount.toLocaleString("en-SG")}`]), ["CPF Contribution History", `${p.cpfMonths} months · latest SGD ${p.cpfLatestAmount.toLocaleString("en-SG")}`]],
      property: [["Type of Housing", p.housingType], ["Type of HDB", p.hdbType || "—"], ["HDB Ownership", p.hdbOwnership || "—"], ["Date of Purchase", p.hdbPurchaseDate || "—"], ["Monthly Loan Instalment", p.hdbMonthlyInstalment ? `SGD ${p.hdbMonthlyInstalment.toLocaleString("en-SG")}` : "—"], ["Outstanding HDB Loan", p.hdbOutstandingLoan ? `SGD ${p.hdbOutstandingLoan.toLocaleString("en-SG")}` : "—"]],
    };
    const titles = { personal: "Personal Information", employment: "Employment & Education", property: "Property" };
    $app.innerHTML = `<div class="phone">${simbar}<div class="pbody sp" style="padding:24px;gap:14px">
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
    try { await api("POST", `/api/v/${token}/submit`); done(); } catch (e) { fail(e); }
  };

  // Screen 8b — done (no redirect back to the portal)
  const done = () => {
    $app.innerHTML = `<div class="phone">${simbar.replace("var(--sp-bar)", "#3A3A44")}
      <div style="flex:1;padding:32px 24px;display:flex;flex-direction:column;gap:18px;align-items:center;text-align:center;justify-content:center">
        <div class="okcircle" style="width:80px;height:80px"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#1F8A5B" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg></div>
        <h1 style="font-size:24px">Details shared</h1>
        <p class="para" style="font-size:15px;max-width:300px">Your MyInfo details were sent to ValueMax AutoFinance for application ${esc(info.ref)}. You can close this page.</p>
        <p class="small muted" style="margin:0;max-width:300px">Your dealer will contact you about the next step.</p>
      </div>
      <div class="foot">The gateway does not send the customer back to AutoFinance, so this page is the end of the customer's journey.</div>
    </div>`;
  };

  const declined = () => {
    $app.innerHTML = `<div class="phone">${simbar}<div class="pbody sp" style="text-align:center;padding-top:64px">
      <h1>You cancelled</h1>
      <p style="margin:0;color:var(--sp-2)">No details were shared with ValueMax AutoFinance. To continue your application, ask your dealer to send a new link.</p>
    </div></div>`;
  };

  check();
}

// ---------------- boot ----------------
(async function boot() {
  [state.config, { user: state.user }] = await Promise.all([api("GET", "/api/config"), api("GET", "/api/session")]);
  connectEvents();
  render();
})();
