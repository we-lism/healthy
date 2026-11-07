/* 건강참조 앱 로직 - 모든 데이터는 이 휴대폰(localStorage)에만 저장 */
"use strict";

/* ---------------- 저장소 ---------------- */
const STORE_KEY = "healthref_v1";
const DB = {
  load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  },
  save(d) { localStorage.setItem(STORE_KEY, JSON.stringify(d)); }
};
let state = DB.load();
state.admin = state.admin || { pwHash: null };
state.logs = state.logs || {};
state.vitals = state.vitals || [];
state.session = state.session || null;
function persist() { DB.save(state); }
function ensurePlan() {
  const u = state.user; if (!u) return;
  if (!u.medPlan) u.medPlan = DEFAULT_MED_PLAN.map(p => ({ ...p, start: (u.createdAt || new Date().toISOString()).slice(0, 10) }));
  if (!u.prn) u.prn = DEFAULT_PRN.map(p => ({ ...p }));
}
ensurePlan();

/* ---------------- 유틸 ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const addDays = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return ymd(d); };
const fmtDT = iso => { const d = new Date(iso); return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
async function sha256(t) {
  if (window.crypto && crypto.subtle) {
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
  }
  let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) | 0; return "w" + h; // 비보안 환경 대체
}
function toast(msg) {
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}
function refTags(refs) {
  return (refs || []).map(r => `<span class="ref" data-ref="${r}">[${r.slice(1)}]</span>`).join("");
}
function refify(text) { // "문장 [S1,S2]" -> 링크 표기
  return esc(text).replace(/\[((?:S\d+,?)+)\]/g, (_, g) => refTags(g.split(",")));
}
document.addEventListener("click", e => {
  const r = e.target.closest(".ref"); if (!r) return;
  const s = SOURCES[r.dataset.ref]; if (!s) return;
  openModal(`<h2>참조 [${r.dataset.ref.slice(1)}]</h2><p>${esc(s.t)}</p><p class="muted">유형: ${esc(s.type)}</p><p><a href="${esc(s.u)}" target="_blank" rel="noopener">원문 열기</a></p><button class="btn btn2" onclick="closeModal()">닫기</button>`);
});
function openModal(html) { $("#modal").innerHTML = `<div class="modal" onclick="if(event.target===this)closeModal()"><div class="sheet">${html}</div></div>`; }
function closeModal() { $("#modal").innerHTML = ""; }
window.closeModal = closeModal;

/* ---------------- 음성 입력 ---------------- */
const MIC_SVG = '<svg viewBox="0 0 24 24"><path fill="#1f5f5b" d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2z"/></svg>';
function voiceField(id, opts = {}) {
  const tag = opts.area ? "textarea" : "input";
  const val = esc(opts.value || "");
  const ph = esc(opts.ph || "");
  const inner = opts.area ? `<textarea id="${id}" placeholder="${ph}">${val}</textarea>` : `<input id="${id}" value="${val}" placeholder="${ph}">`;
  return `<div class="voice-wrap">${inner}<button type="button" class="mic" data-mic="${id}" aria-label="음성으로 입력">${MIC_SVG}</button></div>`;
}
let recog = null;
document.addEventListener("click", e => {
  const b = e.target.closest("[data-mic]"); if (!b) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast("이 브라우저는 음성입력을 지원하지 않습니다. 크롬을 사용하세요."); return; }
  if (recog) { recog.stop(); return; }
  const target = document.getElementById(b.dataset.mic);
  recog = new SR(); recog.lang = "ko-KR"; recog.interimResults = false; recog.maxAlternatives = 1;
  b.classList.add("on"); toast("말씀하세요");
  recog.onresult = ev => {
    const txt = ev.results[0][0].transcript;
    target.value = target.value ? target.value + " " + txt : txt;
    target.dispatchEvent(new Event("input", { bubbles: true }));
  };
  recog.onerror = ev => toast(ev.error === "not-allowed" ? "마이크 권한을 허용해 주세요" : "음성 인식 실패: 다시 눌러주세요");
  recog.onend = () => { b.classList.remove("on"); recog = null; };
  recog.start();
});

/* ---------------- 질환 인식 / 판정 엔진 ---------------- */
function currentProfile() {
  const u = state.user; if (!u) return null;
  return u.versions[u.versions.length - 1];
}
function detectConditions(ver) {
  if (!ver) return [];
  const t = (ver.history + " " + ver.status + " " + (ver.meds || "")).toLowerCase();
  return CONDITIONS.filter(c => c.keys.some(k => t.includes(k.toLowerCase())));
}
function hits(text, group) {
  const t = String(text || "").replace(/\s/g, "").toLowerCase();
  const h = FOOD[group].words.filter(w => t.includes(w.toLowerCase().replace(/\s/g, "")));
  return h.filter(w => !h.some(o => o !== w && o.toLowerCase().includes(w.toLowerCase()))); // 오메가/오메가3 중복 제거
}
function dayText(log) {
  const meals = (log.meals || []).map(m => m.food).join(" ");
  const ex = (log.exercises || []).map(x => x.kind + " " + (x.note || "")).join(" ");
  return meals + " " + ex + " " + (log.note || "");
}
function daysBetween(a, b) { return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000); }
function duePlans(date) {
  return (state.user?.medPlan || []).filter(p => { const d = daysBetween(p.start || date, date); return d >= 0 && d % (Number(p.every) || 1) === 0; });
}
const SLOT_DUE_HOUR = { "아침": 10, "점심": 15, "저녁": 21 };
function countVitK(log) { return (log.meals || []).reduce((n, m) => n + hits(m.food, "vitK_high").length, 0); }

function evaluateDay(date) {
  const log = state.logs[date];
  if (!log) return { level: "없음", reasons: [], tomorrow: [] };
  const conds = detectConditions(currentProfile()).map(c => c.id);
  const has = id => conds.includes(id);
  const R = []; // {lv, t, refs}
  const add = (lv, t, refs) => R.push({ lv, t, refs });
  const sym = log.symptoms || {};
  const txt = dayText(log);

  // 1) 응급 증상
  SYMPTOMS.emergency.forEach(s => { if (sym[s.id]) add("상", `${s.label} → 즉시 119 또는 응급실`, s.refs); });
  // 2) 산소포화도
  const sp = Number(log.spo2);
  if (sp) {
    if (sp <= SPO2.emergency) add("상", `산소포화도 ${sp}% (88% 이하) → 즉시 진료`, SPO2.refs);
    else if (sp <= SPO2.contact) add("상", `산소포화도 ${sp}% (92% 이하) → 손을 따뜻하게 하고 재측정, 계속 낮으면 오늘 진료`, SPO2.refs);
    else if (sp < SPO2.normal) add("중", `산소포화도 ${sp}% (95% 미만) → 안정 후 재측정`, SPO2.refs);
  }
  // 3) 주의 출혈 증상
  SYMPTOMS.caution.forEach(s => { if (sym[s.id]) add("중", `${s.label} → 주치의에게 알리기`, s.refs); });
  // 4) 복약
  const meds = log.meds || {};
  const hr = new Date().getHours(), isToday = date === today();
  // 오늘은 해당 시간대가 지난 것만 누락 판정
  const missed = duePlans(date).filter(p => !meds[p.id] && (!isToday || hr >= (SLOT_DUE_HOUR[p.slot] || 21))).map(p => p.label);
  (state.user?.prn || []).forEach(p => { if (meds[p.id]) add("하", `${p.label} 복용함 → 다음 진료 때 알리기`, []); });
  if (missed.length) add("중", `약 복용 미체크: ${missed.join(", ")} → 임의로 2배 복용하지 말고 주치의·약사 지시 따르기`, ["S2", "S7"]);
  // 5) 약물·보충제 상호작용
  const ns = hits(txt, "nsaid");
  if (ns.length && has("warfarin")) add("중", `소염진통제(${ns.join(", ")}) 기록 → 와파린과 함께면 출혈 위험. 처방받지 않았다면 주치의 연락`, FOOD.nsaid.refs);
  const sup = hits(txt, "supplement");
  if (sup.length && has("warfarin")) add("중", `출혈 위험 보충제(${sup.join(", ")}) → 주치의 상의 전 중단 권장`, FOOD.supplement.refs);
  // 5-2) 이뇨제·강심제
  if (has("diuretic")) {
    const dig = SYMPTOMS.caution.filter(s => s.group === "digoxin" && sym[s.id]);
    if (dig.length >= 2) add("상", `디고신 과다 의심 증상 ${dig.length}가지 (${dig.map(s => s.label).join(", ")}) → 오늘 바로 진료`, ["S26", "S27"]);
    const ks = hits(txt, "ksalt");
    if (ks.length) add("중", `칼륨 소금·보충제(${ks.join(", ")}) → 알닥톤과 함께면 칼륨 상승 위험`, FOOD.ksalt.refs);
    const w = Number(log.weight);
    if (w) {
      const near = (from, to) => { for (let i = from; i <= to; i++) { const p = state.logs[addDays(date, -i)]; if (p && Number(p.weight)) return Number(p.weight); } return null; };
      const w3 = near(2, 3), w7 = near(6, 7);
      if (w3 != null && w - w3 >= 2) add("중", `체중 ${(w - w3).toFixed(1)}kg 증가 (2~3일 사이) → 몸에 물이 찰 수 있음. 병원 연락`, ["S23", "S24", "S25"]);
      else if (w7 != null && w - w7 >= 2) add("중", `체중 ${(w - w7).toFixed(1)}kg 증가 (1주 사이) → 병원에서 이뇨제 조절 상담`, ["S23", "S25"]);
    }
  }
  // 6) 통풍
  if (has("gout")) {
    const vh = hits(txt, "purine_vhigh"), h = hits(txt, "purine_high"), al = hits(txt, "alcohol"), fr = hits(txt, "fructose");
    if (vh.length) add("중", `퓨린 매우 높은 음식(${vh.join(", ")}) → 가능한 피하기`, FOOD.purine_vhigh.refs);
    if (h.length >= 2) add("중", `퓨린 높은 음식 ${h.length}가지(${h.join(", ")}) → 주 2~3회로 제한`, FOOD.purine_high.refs);
    else if (h.length === 1) add("하", `퓨린 높은 음식(${h[0]}) 1회 → 양 조절`, FOOD.purine_high.refs);
    if (al.length) add("중", `술(${al.join(", ")}) → 요산 배설 방해`, FOOD.alcohol.refs);
    if (fr.length) add("하", `과당 음료(${fr.join(", ")}) → 물로 대체`, FOOD.fructose.refs);
    const pain = Number(log.pain);
    if (pain >= 7) add("중", `통증 ${pain}점 → 통풍 발작 의심. 진통제 임의 복용 말고 진료`, ["S4", "S5", "S15"]);
    else if (pain >= 4) add("하", `통증 ${pain}점 → 관찰`, ["S15"]);
    const water = Number(log.water);
    if (log.water !== "" && log.water != null && water < 4 && pain >= 4) {
      if (has("diuretic")) add("하", `물 ${water}컵 + 통증 → 이뇨제 복용 중이라 물 양은 주치의 지시량 확인 후 조절`, ["S24", "S18"]);
      else add("하", `물 ${water}컵 + 통증 → 탈수는 발작 계기 (수분 제한 지시가 없다면 물 늘리기)`, ["S18", "S15"]);
    }
  }
  // 7) 짠 음식 (뇌출혈·혈압)
  const salty = (log.meals || []).filter(m => m.salt === "짜게").length;
  if (salty >= 2) add("중", `짜게 먹은 끼니 ${salty}회 → 혈압 관리 위해 싱겁게`, ["S8", "S10"]);
  else if (salty === 1) add("하", "짜게 먹은 끼니 1회 → 다음 끼니 싱겁게", ["S8", "S10"]);
  // 8) 비타민K 일정성
  if (has("warfarin")) {
    const k = countVitK(log);
    const prev = [];
    for (let i = 1; i <= 7; i++) { const p = state.logs[addDays(date, -i)]; if (p && (p.meals || []).length) prev.push(countVitK(p)); }
    if (prev.length >= 3) {
      const avg = prev.reduce((a, b) => a + b, 0) / prev.length;
      if (k >= avg + 2) add("중", `비타민K 채소 ${k}가지 (최근 평균 ${avg.toFixed(1)}가지보다 많음) → 평소 양으로`, FOOD.vitK_high.refs);
      else if (avg >= 1.5 && k === 0) add("중", `비타민K 채소 0가지 (최근 평균 ${avg.toFixed(1)}가지) → 갑자기 끊지 말기`, FOOD.vitK_high.refs);
    }
  }
  // 9) 운동
  const exs = log.exercises || [];
  const totalMin = exs.reduce((n, x) => n + (Number(x.min) || 0), 0);
  if (has("heart") && exs.some(x => x.intensity === "강")) add("하", "강한 강도 운동 기록 → 과격한 운동은 피하고 처방 강도 지키기", ["S13", "S14"]);

  const order = { "상": 3, "중": 2, "하": 1 };
  const level = R.length ? R.reduce((a, r) => order[r.lv] > order[a] ? r.lv : a, "하") : "하";

  // 다음 날 권고
  const T = [];
  if (level === "상") T.push({ t: "오늘 위험 신호가 있었습니다. 내일 일정보다 진료가 먼저입니다", refs: ["S6", "S8"] });
  if (has("warfarin")) T.push({ t: "비타민K 채소(시금치·부추·케일 등)는 최근 1주 평소 양과 비슷하게. 갑자기 늘리거나 끊지 않기", refs: ["S1", "S2"] });
  if (has("ich") || salty) T.push({ t: "국·찌개 국물 줄이고 싱겁게 (나트륨 하루 2,000mg 이내)", refs: ["S8", "S10"] });
  if (has("gout")) T.push({ t: "고기·생선은 한 끼만, 내장·멸치·홍합·술·단 음료는 빼기", refs: ["S16", "S17"] });
  if (has("heart") || has("ich")) {
    if (totalMin < 30 && level !== "상") T.push({ t: `걷기 등 중강도 운동 30분 (오늘 ${totalMin}분)`, refs: ["S13", "S14"] });
    else if (level !== "상") T.push({ t: `오늘 운동 ${totalMin}분 유지. 과격하게 늘리지 않기`, refs: ["S13", "S14"] });
  }
  if (has("diuretic")) T.push({ t: "아침 같은 시각·같은 옷차림으로 체중 재서 기록. 저염 소금(칼륨 소금)은 쓰지 않기", refs: ["S24", "S28"] });
  if (missed.length) T.push({ t: "약은 정해진 시각에. 알림(설정 > 알림)을 켜두기", refs: ["S2"] });
  if (has("warfarin")) T.push({ t: "새 약·영양제는 먹기 전에 주치의·약사 확인", refs: ["S1", "S19"] });
  return { level, reasons: R, tomorrow: T, totalMin };
}

/* ---------------- 라우팅 ---------------- */
let tab = "home";
let dailyDate = today();
function render() {
  const s = state.session;
  $("#nav").classList.toggle("hidden", !(s && s.role === "user"));
  $("#who").textContent = s ? (s.role === "admin" ? "관리자" : (state.user?.name || "")) : "";
  $("#app").onclick = null;
  if (!s) return renderLogin();
  if (s.role === "admin") return renderAdmin();
  if (!state.user) { state.session = null; persist(); return renderLogin(); }
  $$("#nav button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  ({ home: renderHome, daily: renderDaily, history: renderHistory, vitals: renderVitals, settings: renderSettings }[tab] || renderHome)();
  window.scrollTo(0, 0);
}
$("#nav").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; tab = b.dataset.tab; render(); });

/* ---------------- 로그인 / 가입 ---------------- */
function renderLogin(msg) {
  const exists = !!state.user;
  $("#app").innerHTML = `
  <div class="card">
    <h2>로그인</h2>
    <label>아이디</label><input id="lid" autocomplete="username">
    <label>비밀번호</label><input id="lpw" type="password" autocomplete="current-password">
    <p class="muted">관리자: 아이디 admin (최초에는 비밀번호 없이 접속)</p>
    ${msg ? `<p style="color:var(--hi)">${esc(msg)}</p>` : ""}
    <button class="btn" id="loginBtn">로그인</button>
    ${exists ? `<p class="muted">이 휴대폰에는 이미 1명(${esc(state.user.id)})이 등록되어 있습니다. 1기기 1명 규칙.</p>`
             : `<button class="btn btn2" id="toSignup">회원가입</button>`}
  </div>
  <p class="disclaimer">이 앱은 진료를 대체하지 않습니다. 응급 시 119.</p>`;
  $("#loginBtn").onclick = doLogin;
  if (!exists) $("#toSignup").onclick = renderSignup;
}
async function doLogin() {
  const id = $("#lid").value.trim(), pw = $("#lpw").value;
  if (id === "admin") {
    if (!state.admin.pwHash) { state.session = { role: "admin", at: Date.now() }; persist(); return render(); }
    if (await sha256(pw) === state.admin.pwHash) { state.session = { role: "admin", at: Date.now() }; persist(); return render(); }
    return renderLogin("관리자 비밀번호가 다릅니다.");
  }
  if (!state.user || state.user.id !== id) return renderLogin("등록되지 않은 아이디입니다.");
  if (await sha256(pw) !== state.user.pwHash) return renderLogin("비밀번호가 다릅니다.");
  state.session = { role: "user", at: Date.now() }; persist(); tab = "home"; render();
}
function renderSignup() {
  if (state.user) return renderLogin("이 휴대폰에는 이미 등록된 사용자가 있습니다.");
  $("#app").innerHTML = `
  <div class="card">
    <h2>회원가입</h2>
    <p class="muted">이 휴대폰에서는 1명만 건강관리를 할 수 있습니다.</p>
    <label>아이디</label><input id="sid">
    <label>비밀번호 (4자 이상)</label><input id="spw" type="password">
    <label>환자명</label>${voiceField("sname")}
    <label>국적</label>${voiceField("snat", { value: "대한민국" })}
    <label>지역</label>${voiceField("sreg", { ph: "예: 제주시" })}
    <label>생년월일</label><input id="sbirth" type="date">
    <label>성별</label><select id="ssex"><option>여</option><option>남</option></select>
    <label>병력고지</label>${voiceField("shist", { area: true, ph: "예: 심장내과 풍선확장술(와르파린 복용), 신경외과 뇌출혈 시술, 통풍" })}
    <label>현재상태</label>${voiceField("sstat", { area: true, ph: "예: 엄지발가락 저림, 가끔 어지러움" })}
    <label>복용약 (약 이름·용량)</label>${voiceField("smeds", { area: true, ph: "예: " + DEFAULT_MEDS_TEXT })}
    <button type="button" class="btn-sm btn2" id="fillMeds">처방전 예시 목록 넣기</button>
    <p id="serr" style="color:var(--hi)"></p>
    <button class="btn" id="signupBtn">가입하기</button>
    <button class="btn btn2" id="toLogin">로그인으로</button>
  </div>`;
  $("#toLogin").onclick = () => renderLogin();
  $("#fillMeds").onclick = () => { $("#smeds").value = DEFAULT_MEDS_TEXT.replace(/ \/ /g, "\n"); };
  $("#signupBtn").onclick = async () => {
    const v = id => $("#" + id).value.trim();
    const err = m => { $("#serr").textContent = m; };
    if (state.user) return err("이미 등록된 사용자가 있습니다.");
    if (!v("sid")) return err("아이디를 입력하세요.");
    if (v("sid").toLowerCase() === "admin") return err("admin은 사용할 수 없는 아이디입니다.");
    if ($("#spw").value.length < 4) return err("비밀번호는 4자 이상.");
    for (const [k, n] of [["sname", "환자명"], ["snat", "국적"], ["sreg", "지역"], ["sbirth", "생년월일"], ["shist", "병력고지"], ["sstat", "현재상태"]]) if (!v(k)) return err(n + "을(를) 입력하세요.");
    state.user = {
      id: v("sid"), pwHash: await sha256($("#spw").value), name: v("sname"), nationality: v("snat"),
      region: v("sreg"), birth: v("sbirth"), sex: $("#ssex").value, createdAt: new Date().toISOString(),
      versions: [{ at: new Date().toISOString(), history: v("shist"), status: v("sstat"), meds: v("smeds") }]
    };
    ensurePlan(); persist();
    renderLogin("가입 완료. 로그인하면 이후 자동 로그인됩니다.");
  };
}

/* ---------------- 홈 ---------------- */
function riskBadge(lv) { return `<span class="badge lv-${lv}">${lv === "없음" ? "기록없음" : lv}</span>`; }
function renderHome() {
  const ver = currentProfile();
  const conds = detectConditions(ver);
  const t = today();
  const evToday = evaluateDay(t);
  const lastDate = Object.keys(state.logs).sort().reverse().find(d => d <= t);
  const ev = state.logs[t] ? evToday : (lastDate ? evaluateDay(lastDate) : evToday);
  const evDate = state.logs[t] ? t : lastDate;
  const hiAlert = ev.reasons.filter(r => r.lv === "상");
  let strip = "";
  for (let i = 6; i >= 0; i--) { const d = addDays(t, -i); strip += `<div>${d.slice(5)}${riskBadge(evaluateDay(d).level)}</div>`; }
  const lastV = state.vitals.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
  const vDays = lastV ? Math.floor((new Date(t) - new Date(lastV.date)) / 86400000) : null;

  $("#app").innerHTML = `
  ${hiAlert.length && evDate === t ? `<div class="alert hi">위험 신호 ${hiAlert.length}건<br>${hiAlert.map(r => esc(r.t)).join("<br>")}<br><a href="tel:119" style="color:#fff;font-size:20px">119 전화하기</a></div>` : ""}
  <div class="card">
    <h2>${esc(state.user.name)}님 건강상태</h2>
    <div class="risk-big">${riskBadge(ev.level)}<div class="muted">${evDate ? (evDate === t ? "오늘 기록 기준" : evDate + " 기록 기준 (오늘 기록 없음)") : "기록이 없습니다. 하단 '일자별 관리'에서 입력하세요"}</div></div>
    ${ev.reasons.length ? `<ul class="clean">${ev.reasons.map(r => `<li><span class="badge lv-${r.lv}" style="font-size:12px;padding:1px 8px">${r.lv}</span> ${esc(r.t)}${refTags(r.refs)}</li>`).join("")}</ul>` : (evDate ? `<p class="muted">특이사항 없음</p>` : "")}
    <h3>최근 7일 위험도</h3><div class="strip">${strip}</div>
  </div>
  <div class="card">
    <h2>내일 이렇게 하세요</h2>
    ${ev.tomorrow.length ? `<ol>${ev.tomorrow.map(x => `<li>${esc(x.t)}${refTags(x.refs)}</li>`).join("")}</ol>` : `<p class="muted">일자별 기록을 입력하면 권고가 나옵니다.</p>`}
  </div>
  <div class="card">
    <h2>병력 기반 관리 포인트</h2>
    <p class="muted">병력 기준일: ${fmtDT(ver.at)} · 참조자료 ${KB_VERSION}</p>
    ${conds.length ? conds.map(c => `<h3>${esc(c.name)}</h3><ul class="clean">${c.summary.map(s => `<li>${refify(s)}</li>`).join("")}</ul>`).join("")
      : `<p>입력하신 병력에서 앱 참조자료와 일치하는 질환을 찾지 못했습니다. 설정 &gt; 병력 수정에서 질환명을 구체적으로 적어주세요.</p>`}
  </div>
  <div class="card">
    <h2>병원 측정 (혈압·맥박)</h2>
    ${lastV ? `<p>최근 ${esc(lastV.date)} · ${esc(lastV.hospital)}<br><b>${esc(lastV.sys)}/${esc(lastV.dia)} mmHg · 맥박 ${esc(lastV.pulse)}</b></p>${vDays >= 90 ? `<p style="color:var(--mid)">측정 후 ${vDays}일 경과. 3개월 측정 시기입니다.</p>` : `<p class="muted">측정 후 ${vDays}일</p>`}` : `<p class="muted">하단 '병원측정'에서 입력하세요.</p>`}
  </div>
  <p class="disclaimer">이 앱은 진료를 대체하지 않습니다. 약 용량 변경은 반드시 주치의와 상의하세요.</p>`;
}

/* ---------------- 일자별 관리 ---------------- */
const MEAL_TYPES = ["아침", "아점", "점심", "점저", "저녁", "간식"];
const UNITS = ["스푼", "공기", "그릇", "접시", "개", "조각", "컵", "회"];
const EX_KINDS = ["산책-도보", "실내걷기", "자전거", "스트레칭", "체조", "기타"];
function blankLog() { return { meals: [], exercises: [], meds: {}, symptoms: {}, pain: "", water: "", spo2: "", weight: "", note: "" }; }
let draft = null;
function renderDaily() {
  draft = JSON.parse(JSON.stringify(state.logs[dailyDate] || blankLog()));
  draft.meds = draft.meds || {};
  draft.symptoms = draft.symptoms || {};
  $("#app").innerHTML = `
  <div class="card">
    <div class="row"><div><label>날짜</label><input type="date" id="dd" value="${dailyDate}" max="${today()}"></div>
    <div class="narrow"><button class="btn2 btn-sm" id="prevD">이전</button> <button class="btn2 btn-sm" id="nextD">다음</button></div></div>
  </div>
  <div class="card">
    <h2>약 복용</h2>
    <div class="checks">
      ${duePlans(dailyDate).map(p => `<label><input type="checkbox" data-med="${p.id}" ${draft.meds[p.id] ? "checked" : ""}><b>${esc(p.slot)}</b>&nbsp;${esc(p.label)}</label>`).join("") || `<p class="muted">오늘 예정된 약이 없습니다.</p>`}
    </div>
    ${(state.user.prn || []).length ? `<h3>필요할 때만 먹는 약</h3><div class="checks">${state.user.prn.map(p => `<label><input type="checkbox" data-med="${p.id}" ${draft.meds[p.id] ? "checked" : ""}>${esc(p.label)} 먹음</label>`).join("")}</div>` : ""}
    <p class="muted">복약 계획 변경: 설정 &gt; 복약 계획</p>
  </div>
  <div class="card">
    <h2>식사</h2>
    <div class="row">
      <div><label>식사유형</label><select id="mType">${MEAL_TYPES.map(x => `<option>${x}</option>`).join("")}</select></div>
      <div><label>간의 세기</label><select id="mSalt"><option>싱겁게</option><option selected>보통</option><option>짜게</option></select></div>
    </div>
    <label>먹은 음식 (밥, 반찬 등)</label>${voiceField("mFood", { ph: "예: 현미밥, 시금치나물, 된장국" })}
    <div class="row">
      <div><label>먹은 양</label><input id="mAmt" type="number" inputmode="decimal" min="0" step="0.5" placeholder="수량"></div>
      <div><label>단위</label><select id="mUnit">${UNITS.map(x => `<option>${x}</option>`).join("")}</select></div>
    </div>
    <button class="btn btn2" id="addMeal">식사 추가</button>
    <div id="mealList"></div>
  </div>
  <div class="card">
    <h2>운동</h2>
    <div class="row">
      <div><label>종류</label><select id="eKind">${EX_KINDS.map(x => `<option>${x}</option>`).join("")}</select></div>
      <div><label>강도</label><select id="eInt"><option>약</option><option selected>중</option><option>강</option></select></div>
      <div><label>시간(분)</label><input id="eMin" type="number" inputmode="numeric" min="0" placeholder="분"></div>
    </div>
    <label>비고 (운동 중·후 몸상태)</label>${voiceField("eNote", { ph: "예: 걷고 나서 숨이 조금 참" })}
    <button class="btn btn2" id="addEx">운동 추가</button>
    <div id="exList"></div>
  </div>
  <div class="card">
    <h2>측정</h2>
    <div class="row">
      <div><label>산소포화도(%)</label><input id="spo2" type="number" inputmode="numeric" min="50" max="100" value="${esc(draft.spo2)}"></div>
      <div><label>체중(kg)</label><input id="weight" type="number" inputmode="decimal" step="0.1" value="${esc(draft.weight)}"></div>
    </div>
    <div class="row">
      <div><label>통증 점수 (0~10)</label><input id="pain" type="number" inputmode="numeric" min="0" max="10" value="${esc(draft.pain)}"></div>
      <div><label>물 (컵)</label><input id="water" type="number" inputmode="numeric" min="0" value="${esc(draft.water)}"></div>
    </div>
  </div>
  <div class="card">
    <h2>출혈·위험 증상</h2>
    <h3 style="color:var(--hi)">하나라도 있으면 119</h3>
    <div class="checks">${SYMPTOMS.emergency.map(s => `<label><input type="checkbox" data-sym="${s.id}" ${draft.symptoms[s.id] ? "checked" : ""}>${esc(s.label)}</label>`).join("")}</div>
    <h3>주치의에게 알릴 증상</h3>
    <div class="checks">${SYMPTOMS.caution.map(s => `<label><input type="checkbox" data-sym="${s.id}" ${draft.symptoms[s.id] ? "checked" : ""}>${esc(s.label)}</label>`).join("")}</div>
  </div>
  <div class="card">
    <h2>오늘 메모</h2>
    ${voiceField("dnote", { area: true, value: draft.note, ph: "복용한 다른 약·영양제, 몸상태 등" })}
    <button class="btn" id="saveDay">저장하고 위험도 보기</button>
  </div>`;
  const drawLists = () => {
    $("#mealList").innerHTML = draft.meals.map((m, i) => `<div class="item"><button class="x" data-dm="${i}">삭제</button><b>${esc(m.type)}</b> · ${esc(m.food)}<br><span class="muted">${m.amt ? esc(m.amt) + " " + esc(m.unit) : "양 미입력"} · 간 ${esc(m.salt)}</span></div>`).join("");
    $("#exList").innerHTML = draft.exercises.map((x, i) => `<div class="item"><button class="x" data-de="${i}">삭제</button><b>${esc(x.kind)}</b> · 강도 ${esc(x.intensity)} · ${esc(x.min)}분${x.note ? `<br><span class="muted">${esc(x.note)}</span>` : ""}</div>`).join("");
  };
  drawLists();
  $("#dd").onchange = e => { if (e.target.value) { dailyDate = e.target.value; renderDaily(); } };
  $("#prevD").onclick = () => { dailyDate = addDays(dailyDate, -1); renderDaily(); };
  $("#nextD").onclick = () => { if (dailyDate < today()) { dailyDate = addDays(dailyDate, 1); renderDaily(); } };
  $("#addMeal").onclick = () => {
    const food = $("#mFood").value.trim(); if (!food) return toast("먹은 음식을 입력하세요");
    draft.meals.push({ type: $("#mType").value, food, amt: $("#mAmt").value || "", unit: $("#mUnit").value, salt: $("#mSalt").value });
    $("#mFood").value = ""; $("#mAmt").value = ""; drawLists();
  };
  $("#addEx").onclick = () => {
    const min = $("#eMin").value; if (!min) return toast("운동 시간(분)을 입력하세요");
    draft.exercises.push({ kind: $("#eKind").value, intensity: $("#eInt").value, min, note: $("#eNote").value.trim() });
    $("#eMin").value = ""; $("#eNote").value = ""; drawLists();
  };
  $("#app").onclick = e => {
    const dm = e.target.closest("[data-dm]"), de = e.target.closest("[data-de]");
    if (dm) { draft.meals.splice(+dm.dataset.dm, 1); drawLists(); }
    if (de) { draft.exercises.splice(+de.dataset.de, 1); drawLists(); }
  };
  $("#saveDay").onclick = () => {
    $$("[data-med]").forEach(c => draft.meds[c.dataset.med] = c.checked);
    $$("[data-sym]").forEach(c => { if (c.checked) draft.symptoms[c.dataset.sym] = true; else delete draft.symptoms[c.dataset.sym]; });
    ["spo2", "weight", "pain", "water"].forEach(k => draft[k] = $("#" + k).value);
    draft.note = $("#dnote").value.trim();
    if ($("#mFood").value.trim()) $("#addMeal").click();
    draft.savedAt = new Date().toISOString();
    state.logs[dailyDate] = draft; persist();
    showDayResult(dailyDate);
  };
}
function showDayResult(date) {
  const ev = evaluateDay(date);
  openModal(`<h2>${date} 위험도</h2><div class="risk-big">${riskBadge(ev.level)}</div>
  ${ev.reasons.length ? `<ul class="clean">${ev.reasons.map(r => `<li><span class="badge lv-${r.lv}" style="font-size:12px;padding:1px 8px">${r.lv}</span> ${esc(r.t)}${refTags(r.refs)}</li>`).join("")}</ul>` : "<p>특이사항 없음</p>"}
  ${ev.level === "상" ? `<a class="btn danger" style="display:block;text-align:center;text-decoration:none" href="tel:119">119 전화하기</a>` : ""}
  <h3>다음 날 권고</h3><ol>${ev.tomorrow.map(x => `<li>${esc(x.t)}${refTags(x.refs)}</li>`).join("")}</ol>
  <button class="btn" onclick="closeModal()">확인</button>`);
}

/* ---------------- 기록조회 ---------------- */
function renderHistory() {
  const dates = Object.keys(state.logs).sort().reverse();
  $("#app").innerHTML = `
  <div class="card"><h2>일자별 기록</h2>
  <label>검색 (음식·메모·몸상태)</label>${voiceField("q", { ph: "예: 시금치, 어지러움" })}
  <div id="hlist"></div></div>
  <div class="card"><h2>병력 변경 이력</h2>
  ${state.user.versions.slice().reverse().map((v, i) => `<div class="item"><b>${i === 0 ? "현재" : "이전"} · ${fmtDT(v.at)}</b><br>병력: ${esc(v.history)}<br>현재상태: ${esc(v.status)}${v.meds ? `<br>복용약: ${esc(v.meds)}` : ""}<br>${detectConditions(v).map(c => `<span class="tag">${esc(c.name)}</span>`).join("")}</div>`).join("")}
  </div>`;
  const draw = () => {
    const q = $("#q").value.trim().replace(/\s/g, "");
    const list = dates.filter(d => !q || dayText(state.logs[d]).replace(/\s/g, "").includes(q) || d.includes(q));
    $("#hlist").innerHTML = list.length ? list.map(d => {
      const l = state.logs[d], ev = evaluateDay(d);
      return `<div class="item" data-open="${d}"><b>${d}</b> ${riskBadge(ev.level)}<br>
      <span class="muted">식사 ${l.meals.length} · 운동 ${(l.exercises || []).reduce((n, x) => n + (+x.min || 0), 0)}분 · 약 ${duePlans(d).filter(p => l.meds?.[p.id]).length}/${duePlans(d).length}${l.spo2 ? " · SpO2 " + esc(l.spo2) + "%" : ""}${l.weight ? " · " + esc(l.weight) + "kg" : ""}</span>
      ${l.meals.length ? `<br>${l.meals.map(m => esc(m.type + ": " + m.food)).join("<br>")}` : ""}</div>`;
    }).join("") : `<p class="muted">기록이 없습니다.</p>`;
  };
  draw();
  $("#q").addEventListener("input", draw);
  $("#hlist").onclick = e => { const it = e.target.closest("[data-open]"); if (it) { dailyDate = it.dataset.open; tab = "daily"; render(); } };
}

/* ---------------- 병원측정 ---------------- */
function renderVitals() {
  $("#app").innerHTML = `
  <div class="card"><h2>병원 측정 혈압·맥박</h2>
  <p class="muted">3개월에 1번 병원에서 잰 값을 입력합니다.</p>
  <label>측정일</label><input id="vd" type="date" value="${today()}" max="${today()}">
  <label>병원</label><select id="vh"><option>제주한라병원</option><option>제주대학교병원</option><option>기타</option></select>
  <div class="row">
    <div><label>수축기</label><input id="vs" type="number" inputmode="numeric" placeholder="예: 125"></div>
    <div><label>이완기</label><input id="vdi" type="number" inputmode="numeric" placeholder="예: 80"></div>
    <div><label>맥박</label><input id="vp" type="number" inputmode="numeric" placeholder="예: 72"></div>
  </div>
  <label>의사 소견 메모</label>${voiceField("vn", { ph: "예: 혈압약 유지" })}
  <button class="btn" id="vSave">저장</button></div>
  <div class="card"><h2>측정 이력</h2>
  <table><tr><th>날짜</th><th>병원</th><th>혈압</th><th>맥박</th></tr>
  ${state.vitals.slice().sort((a, b) => b.date.localeCompare(a.date)).map(v => `<tr><td>${esc(v.date)}</td><td>${esc(v.hospital)}</td><td>${esc(v.sys)}/${esc(v.dia)}</td><td>${esc(v.pulse)}${v.note ? `<br><span class="muted">${esc(v.note)}</span>` : ""}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">기록 없음</td></tr>`}
  </table></div>`;
  $("#vSave").onclick = () => {
    const v = { date: $("#vd").value, hospital: $("#vh").value, sys: $("#vs").value, dia: $("#vdi").value, pulse: $("#vp").value, note: $("#vn").value.trim() };
    if (!v.date || !v.sys || !v.dia) return toast("날짜와 혈압을 입력하세요");
    state.vitals.push(v); persist(); toast("저장했습니다"); renderVitals();
  };
}

/* ---------------- 알림 (캘린더) ---------------- */
const ALARMS = [["07:00", "아침 식전"], ["09:00", "아침 식후"], ["11:00", "점심 식전"], ["14:00", "점심 식후"], ["17:00", "저녁 식전"], ["19:00", "저녁 식후"]];
function appUrl() { return location.href.split("#")[0].split("?")[0]; }
function nextDateStr() { return addDays(today(), 1).replace(/-/g, ""); }
function buildICS() {
  const d = nextDateStr();
  const ev = ALARMS.map(([t, n], i) => {
    const hm = t.replace(":", "") + "00";
    const endH = pad(+t.slice(0, 2)) + pad(+t.slice(3) + 10) + "00";
    return ["BEGIN:VEVENT", `UID:healthref-${i}-${d}@healthref`, `DTSTAMP:${d}T000000Z`,
      `DTSTART;TZID=Asia/Seoul:${d}T${hm}`, `DTEND;TZID=Asia/Seoul:${d}T${endH}`, "RRULE:FREQ=DAILY",
      `SUMMARY:[건강참조] ${n} 기록`, `DESCRIPTION:${n} - 식사·약·몸상태 기록하기\\n${appUrl()}`, `URL:${appUrl()}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:[건강참조] ${n}`, "TRIGGER:PT0M", "END:VALARM", "END:VEVENT"].join("\r\n");
  }).join("\r\n");
  const tz = ["BEGIN:VTIMEZONE", "TZID:Asia/Seoul", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:+0900", "TZOFFSETTO:+0900", "TZNAME:KST", "END:STANDARD", "END:VTIMEZONE"].join("\r\n");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//healthref//KO", "CALSCALE:GREGORIAN", tz, ev, "END:VCALENDAR"].join("\r\n");
}
function gcalUrl(t, n) {
  const d = nextDateStr(), hm = t.replace(":", "") + "00";
  const end = pad(+t.slice(0, 2)) + pad(+t.slice(3) + 10) + "00";
  const p = new URLSearchParams({ action: "TEMPLATE", text: `[건강참조] ${n} 기록`, dates: `${d}T${hm}/${d}T${end}`, ctz: "Asia/Seoul", recur: "RRULE:FREQ=DAILY", details: `${n} - 식사·약·몸상태 기록하기\n${appUrl()}` });
  return "https://calendar.google.com/calendar/render?" + p.toString();
}
/* 앱이 열려 있을 때의 보조 알림 */
let lastFired = "";
function inAppAlarmTick() {
  const n = new Date(), hm = `${pad(n.getHours())}:${pad(n.getMinutes())}`;
  const hit = ALARMS.find(a => a[0] === hm);
  if (!hit || lastFired === today() + hm) return;
  lastFired = today() + hm;
  const msg = `[건강참조] ${hit[1]} 기록할 시간입니다`;
  if ("Notification" in window && Notification.permission === "granted" && navigator.serviceWorker) {
    navigator.serviceWorker.ready.then(r => r.showNotification("건강참조", { body: msg, icon: "icons/icon-192.png", tag: hm }));
  } else toast(msg);
}
setInterval(inAppAlarmTick, 20000);

/* ---------------- 설정 ---------------- */
function renderSettings() {
  const u = state.user, cur = currentProfile();
  $("#app").innerHTML = `
  <div class="card"><h2>알림 등록 (하루 6회)</h2>
  <p>${ALARMS.map(a => `<span class="tag">${a[0]} ${a[1]}</span>`).join("")}</p>
  <p class="muted">휴대폰 캘린더에 매일 반복 알림으로 등록합니다. 앱이 꺼져 있어도 알림이 옵니다. 알림을 누르면 앱 주소로 이동합니다.</p>
  <h3>방법 1. 삼성 캘린더 (한 번에 6개)</h3>
  <button class="btn" id="icsBtn">알림 파일 받기 (.ics)</button>
  <p class="muted">받은 파일을 눌러 '삼성 캘린더'로 열고 저장하세요.</p>
  <h3>방법 2. 구글 캘린더 (6개 각각 저장)</h3>
  ${ALARMS.map(([t, n]) => `<a class="btn btn2" style="display:block;text-align:center;text-decoration:none;margin-top:8px" target="_blank" rel="noopener" href="${esc(gcalUrl(t, n))}">${t} ${n} 등록</a>`).join("")}
  <h3>보조. 앱이 열려 있을 때 알림</h3>
  <button class="btn btn2" id="notiBtn">앱 알림 허용</button>
  </div>
  <div class="card"><h2>복약 계획</h2>
  <p class="muted">약봉지·약 단위로 체크박스를 만듭니다. '며칠마다'는 3이면 3일에 1번입니다. 시작일은 최근 복용한 날로 맞추세요.</p>
  <div id="planList"></div>
  <button class="btn btn2" id="addPlan">정기 약 추가</button>
  <h3>필요할 때만 먹는 약</h3><div id="prnList"></div>
  <div class="row"><div><input id="prnNew" placeholder="예: 테놀민 (두근거릴 때)"></div><div class="narrow"><button class="btn2 btn-sm" id="addPrn">추가</button></div></div>
  <button class="btn" id="savePlan">복약 계획 저장</button></div>
  <div class="card"><h2>병력·현재상태·복용약 수정</h2>
  <p class="muted">수정하면 기존 내용은 이력으로 보관되고, 새 내용으로 다시 분석합니다.</p>
  <label>병력고지</label>${voiceField("eh", { area: true, value: cur.history })}
  <label>현재상태</label>${voiceField("es", { area: true, value: cur.status })}
  <label>복용약</label>${voiceField("em", { area: true, value: cur.meds || "" })}
  <button class="btn" id="verBtn">수정 저장 후 다시 분석</button></div>
  <div class="card"><h2>내 정보</h2>
  <table>
  <tr><th>아이디</th><td>${esc(u.id)}</td></tr><tr><th>환자명</th><td>${esc(u.name)}</td></tr>
  <tr><th>국적</th><td>${esc(u.nationality)}</td></tr><tr><th>지역</th><td>${esc(u.region)}</td></tr>
  <tr><th>생년월일</th><td>${esc(u.birth)}</td></tr><tr><th>성별</th><td>${esc(u.sex)}</td></tr></table>
  <button class="btn btn2" id="bkBtn">기록 백업 파일 받기</button>
  <p class="muted">기록은 이 휴대폰에만 저장됩니다. 휴대폰 교체·브라우저 데이터 삭제 전에 백업하세요.</p>
  <button class="btn btn2" id="logoutBtn">로그아웃</button></div>
  <div class="card"><h2>참조자료 목록</h2><p class="muted">조사일 ${KB_VERSION} · 항목마다 2개 이상 출처로 교차 확인</p>
  <ul class="clean">${Object.entries(SOURCES).map(([k, s]) => `<li>[${k.slice(1)}] <a href="${esc(s.u)}" target="_blank" rel="noopener">${esc(s.t)}</a> <span class="muted">${esc(s.type)}</span></li>`).join("")}</ul></div>`;
  const plan = JSON.parse(JSON.stringify(u.medPlan)), prn = JSON.parse(JSON.stringify(u.prn));
  const drawPlan = () => {
    $("#planList").innerHTML = plan.map((p, i) => `<div class="item"><button class="x" data-dp="${i}">삭제</button>
      <label>이름</label><input data-pf="label" data-i="${i}" value="${esc(p.label)}">
      <div class="row"><div><label>시간대</label><select data-pf="slot" data-i="${i}">${["아침", "점심", "저녁"].map(x => `<option ${x === p.slot ? "selected" : ""}>${x}</option>`).join("")}</select></div>
      <div><label>며칠마다</label><input type="number" min="1" data-pf="every" data-i="${i}" value="${esc(p.every)}"></div></div>
      <label>시작일 (최근 복용일)</label><input type="date" data-pf="start" data-i="${i}" value="${esc(p.start)}"></div>`).join("");
    $("#prnList").innerHTML = prn.map((p, i) => `<div class="item"><button class="x" data-dr="${i}">삭제</button>${esc(p.label)}</div>`).join("");
  };
  drawPlan();
  $("#planList").oninput = e => { const f = e.target.dataset.pf; if (f) plan[+e.target.dataset.i][f] = f === "every" ? Math.max(1, +e.target.value || 1) : e.target.value; };
  $("#planList").onclick = e => { const d = e.target.closest("[data-dp]"); if (d) { plan.splice(+d.dataset.dp, 1); drawPlan(); } };
  $("#prnList").onclick = e => { const d = e.target.closest("[data-dr]"); if (d) { prn.splice(+d.dataset.dr, 1); drawPlan(); } };
  $("#addPlan").onclick = () => { plan.push({ id: "p_" + Date.now(), label: "새 약", slot: "아침", every: 1, start: today() }); drawPlan(); };
  $("#addPrn").onclick = () => { const v = $("#prnNew").value.trim(); if (!v) return; prn.push({ id: "prn_" + Date.now(), label: v }); $("#prnNew").value = ""; drawPlan(); };
  $("#savePlan").onclick = () => { u.medPlan = plan; u.prn = prn; persist(); toast("복약 계획을 저장했습니다"); };
  $("#icsBtn").onclick = () => download("건강참조_알림.ics", buildICS(), "text/calendar");
  $("#notiBtn").onclick = async () => {
    if (!("Notification" in window)) return toast("이 브라우저는 알림을 지원하지 않습니다");
    const p = await Notification.requestPermission(); toast(p === "granted" ? "허용됨" : "허용되지 않음");
  };
  $("#verBtn").onclick = () => {
    const h = $("#eh").value.trim(), s = $("#es").value.trim(), m = $("#em").value.trim();
    if (!h || !s) return toast("병력과 현재상태를 입력하세요");
    if (h === cur.history && s === cur.status && m === (cur.meds || "")) return toast("변경된 내용이 없습니다");
    const before = detectConditions(cur).map(c => c.name);
    u.versions.push({ at: new Date().toISOString(), history: h, status: s, meds: m }); persist();
    const after = detectConditions(currentProfile()).map(c => c.name);
    const added = after.filter(x => !before.includes(x)), removed = before.filter(x => !after.includes(x));
    openModal(`<h2>다시 분석했습니다</h2><p>기존 병력은 '기록조회 &gt; 병력 변경 이력'에 보관됩니다.</p>
    <p><b>인식된 관리 항목</b><br>${after.map(x => `<span class="tag">${esc(x)}</span>`).join("") || "없음"}</p>
    ${added.length ? `<p>새로 추가: ${added.map(esc).join(", ")}</p>` : ""}${removed.length ? `<p>빠진 항목: ${removed.map(esc).join(", ")}</p>` : ""}
    <button class="btn" onclick="closeModal();tab='home';render()">홈에서 보기</button>`);
  };
  $("#bkBtn").onclick = () => download(`건강참조_백업_${today()}.json`, JSON.stringify({ user: state.user, logs: state.logs, vitals: state.vitals }, null, 1), "application/json");
  $("#logoutBtn").onclick = () => { if (confirm("로그아웃하면 다음에 다시 로그인해야 합니다.")) { state.session = null; persist(); render(); } };
}
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------------- 관리자 ---------------- */
function renderAdmin() {
  if (!state.admin.pwHash) {
    $("#app").innerHTML = `<div class="card"><h2>관리자 비밀번호 설정</h2>
    <p>최초 접속입니다. 계속하려면 비밀번호를 정하세요.</p>
    <label>새 비밀번호 (6자 이상)</label><input id="ap1" type="password">
    <label>새 비밀번호 확인</label><input id="ap2" type="password">
    <p id="aerr" style="color:var(--hi)"></p>
    <button class="btn" id="apBtn">설정하고 관리자 화면 열기</button></div>`;
    $("#apBtn").onclick = async () => {
      const a = $("#ap1").value, b = $("#ap2").value;
      if (a.length < 6) return $("#aerr").textContent = "6자 이상 입력하세요.";
      if (a !== b) return $("#aerr").textContent = "두 비밀번호가 다릅니다.";
      state.admin.pwHash = await sha256(a); persist(); toast("관리자 비밀번호가 설정되었습니다"); render();
    };
    return;
  }
  const u = state.user;
  const dates = Object.keys(state.logs).sort().reverse();
  $("#app").innerHTML = `
  <div class="card"><h2>관리자</h2><p class="muted">이 휴대폰에 저장된 데이터만 보입니다.</p>
  <button class="btn btn2" id="aLogout">관리자 로그아웃</button></div>
  <div class="card"><h2>등록 사용자</h2>
  ${u ? `<table><tr><th>아이디</th><td>${esc(u.id)}</td></tr><tr><th>환자명</th><td>${esc(u.name)}</td></tr><tr><th>국적/지역</th><td>${esc(u.nationality)} / ${esc(u.region)}</td></tr><tr><th>생년월일/성별</th><td>${esc(u.birth)} / ${esc(u.sex)}</td></tr><tr><th>가입</th><td>${fmtDT(u.createdAt)}</td></tr><tr><th>기록 일수</th><td>${dates.length}일</td></tr></table>
  <h3>병력 이력 (${u.versions.length}건)</h3>${u.versions.slice().reverse().map(v => `<div class="item"><b>${fmtDT(v.at)}</b><br>${esc(v.history)}<br><span class="muted">${esc(v.status)}</span></div>`).join("")}
  <h3>최근 위험도</h3>${dates.slice(0, 14).map(d => `<div>${d} ${riskBadge(evaluateDay(d).level)}</div>`).join("") || "<p class='muted'>기록 없음</p>"}
  <button class="btn btn2" id="aReset">사용자 비밀번호 초기화</button>
  <button class="btn danger" id="aDel">사용자·기록 전체 삭제</button>` : `<p class="muted">등록된 사용자가 없습니다.</p>`}
  </div>
  <div class="card"><h2>백업 / 복원</h2>
  <button class="btn btn2" id="aBk">전체 백업 받기</button>
  <label>백업 파일 복원</label><input type="file" id="aRs" accept=".json"></div>
  <div class="card"><h2>관리자 비밀번호 변경</h2>
  <label>새 비밀번호 (6자 이상)</label><input id="anp" type="password">
  <button class="btn" id="anpBtn">변경</button></div>
  <div class="card"><h2>참조자료 DB</h2><p>버전 ${KB_VERSION} · 출처 ${Object.keys(SOURCES).length}개 · 인식 질환 ${CONDITIONS.length}개</p>
  ${CONDITIONS.map(c => `<span class="tag">${esc(c.name)}</span>`).join("")}</div>`;
  $("#aLogout").onclick = () => { state.session = null; persist(); render(); };
  $("#aBk").onclick = () => download(`건강참조_전체백업_${today()}.json`, JSON.stringify({ user: state.user, logs: state.logs, vitals: state.vitals }, null, 1), "application/json");
  $("#aRs").onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then(t => {
      try {
        const d = JSON.parse(t);
        if (!d.user || !d.user.versions) throw 0;
        if (!confirm(`${d.user.name}(${d.user.id}) 데이터로 덮어씁니다. 계속할까요?`)) return;
        state.user = d.user; state.logs = d.logs || {}; state.vitals = d.vitals || []; ensurePlan(); persist(); toast("복원 완료"); render();
      } catch (_) { toast("올바른 백업 파일이 아닙니다"); }
    });
  };
  $("#anpBtn").onclick = async () => { const p = $("#anp").value; if (p.length < 6) return toast("6자 이상"); state.admin.pwHash = await sha256(p); persist(); toast("변경 완료"); $("#anp").value = ""; };
  if (u) {
    $("#aReset").onclick = async () => { const p = prompt("사용자 새 비밀번호 (4자 이상)"); if (p && p.length >= 4) { u.pwHash = await sha256(p); persist(); toast("초기화 완료"); } };
    $("#aDel").onclick = () => { if (confirm("사용자와 모든 기록을 삭제합니다. 되돌릴 수 없습니다. 백업하셨나요?")) { delete state.user; state.logs = {}; state.vitals = []; persist(); toast("삭제 완료"); render(); } };
  }
}

/* ---------------- 시작 ---------------- */
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
render();
