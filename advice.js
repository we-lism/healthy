/* 건강참조 - 오늘의 맞춤 조언 엔진
 * 입력값(식사·운동·복약·증상·측정·마음)에 따라 문장이 달라짐
 * 모든 문장은 kb.js 출처 번호를 가짐 */
"use strict";

function avgPrev(date, fn, days = 7) {
  const v = [];
  for (let i = 1; i <= days; i++) { const l = state.logs[addDays(date, -i)]; if (l) { const x = fn(l); if (x != null && !isNaN(x)) v.push(x); } }
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
function nextMealSlot(date) {
  if (date !== today()) return "다음 날 아침";
  const h = new Date().getHours();
  if (h < 10) return "점심"; if (h < 15) return "저녁"; return "내일 아침";
}

function buildAdvice(date) {
  const log = state.logs[date];
  const conds = detectConditions(currentProfile()).map(c => c.id);
  const has = id => conds.includes(id);
  const ev = evaluateDay(date);
  const A = { status: [], meal: [], menu: [], exercise: [], mind: [], heart: [], brain: [], gout: [] };
  const P = (k, t, refs = []) => A[k].push({ t, refs });
  if (!log) {
    P("status", "오늘 기록이 없습니다. 하단 '일자별 관리'에서 식사·약·체중부터 입력하면 맞춤 조언이 나옵니다.");
    return { A, ev, slot: nextMealSlot(date) };
  }
  const sym = log.symptoms || {};
  const txt = dayText(log);
  const meals = log.meals || [];
  const exs = log.exercises || [];
  const totalMin = exs.reduce((n, x) => n + (Number(x.min) || 0), 0);
  const salty = meals.filter(m => m.salt === "짜게").length;
  const pain = log.pain === "" || log.pain == null ? null : Number(log.pain);
  const stress = log.stress === "" || log.stress == null ? null : Number(log.stress);
  const sleep = log.sleep === "" || log.sleep == null ? null : Number(log.sleep);
  const w = Number(log.weight) || null;
  const emergency = SYMPTOMS.emergency.some(s => sym[s.id]);
  const flare = pain != null && pain >= 7;
  const fallRisk = sym.dizzy || sym.tremor || sym.head_injury;
  const hfSign = sym.hf_lying || ev.reasons.some(r => r.t.startsWith("체중"));
  const digGi = sym.dig_gi;
  const purV = hits(txt, "purine_vhigh"), purH = hits(txt, "purine_high"), alc = hits(txt, "alcohol"), fru = hits(txt, "fructose");
  const vk = countVitK(log), vkAvg = avgPrev(date, l => (l.meals || []).length ? countVitK(l) : null);
  const minAvg = avgPrev(date, l => (l.exercises || []).reduce((n, x) => n + (Number(x.min) || 0), 0));
  const painPrev = avgPrev(date, l => l.pain === "" || l.pain == null ? null : Number(l.pain), 3);
  const due = duePlans(date), meds = log.meds || {};
  const taken = due.filter(p => meds[p.id]).length;
  const slot = nextMealSlot(date);

  /* 1. 현재 상태 */
  P("status", `오늘 위험도 '${ev.level}'. 확인할 항목 ${ev.reasons.filter(r => r.lv !== "하").length}건`, []);
  P("status", `약 ${taken}/${due.length} 체크 · 식사 ${meals.length}끼(짜게 ${salty}끼) · 운동 ${totalMin}분${minAvg != null ? ` (최근 평균 ${Math.round(minAvg)}분)` : ""}`);
  if (w) { const wa = avgPrev(date, l => Number(l.weight) || null); P("status", `체중 ${w}kg${wa != null ? ` (최근 평균 대비 ${(w - wa >= 0 ? "+" : "") + (w - wa).toFixed(1)}kg)` : ""}`, has("diuretic") ? ["S23", "S25"] : []); }
  if (pain != null) P("status", `통증 ${pain}점${painPrev != null ? ` (최근 3일 평균 ${painPrev.toFixed(1)}점 → ${pain > painPrev + 1 ? "나빠짐" : pain < painPrev - 1 ? "좋아짐" : "비슷"})` : ""}`);
  if (log.spo2) P("status", `산소포화도 ${log.spo2}%`, SPO2.refs);
  if (stress != null || sleep != null) P("status", `${stress != null ? `스트레스 ${stress}점` : ""}${stress != null && sleep != null ? " · " : ""}${sleep != null ? `수면 ${sleep}시간` : ""}`);

  /* 2. 다음 식사 */
  if (emergency) P("meal", "위험 신호가 있습니다. 식사보다 119·진료가 먼저입니다", ["S8", "S6"]);
  else {
    if (digGi) P("meal", `${slot}: 구역·식욕저하가 있어 적게. 못 먹을 정도면 디고신 과다일 수 있어 주치의 연락`, ["S26", "S27"]);
    if (salty >= 1) P("meal", `${slot}: 오늘 짠 끼니 ${salty}번. 국·찌개는 건더기만, 조림 대신 구이·찜`, ["S37", "S8"]);
    else P("meal", `${slot}: 지금처럼 싱겁게. 국물은 건더기 위주로`, ["S37", "S10"]);
    if (has("gout")) {
      if (purV.length || purH.length >= 1) P("meal", `${slot}: 오늘 ${[...purV, ...purH].join("·")}를 드셨으니 고기·생선 없이 달걀·두부·저지방 우유(요구르트)로 단백질`, ["S45", "S16"]);
      else P("meal", `${slot}: 고기·생선은 한 끼에 소량. 단백질은 달걀·두부·저지방 우유가 무난`, ["S45", "S16"]);
      if (alc.length || fru.length) P("meal", `${slot}: ${[...alc, ...fru].join("·")} 대신 물(주치의가 정한 양 안에서)`, ["S17", "S15"]);
    }
    if (has("warfarin") && vkAvg != null) {
      if (vk > vkAvg + 1) P("meal", `${slot}: 오늘 비타민K 채소가 평소보다 많음(${vk}가지/평균 ${vkAvg.toFixed(1)}). 이번 끼니는 시금치·부추·케일 같은 녹색잎채소를 빼기`, ["S1", "S3"]);
      else if (vk < vkAvg - 1) P("meal", `${slot}: 오늘 비타민K 채소가 평소보다 적음(${vk}가지/평균 ${vkAvg.toFixed(1)}). 평소 먹던 나물 한 접시 정도 채우기`, ["S1", "S2"]);
      else P("meal", `${slot}: 녹색잎채소는 오늘과 같은 양으로 유지`, ["S1", "S2"]);
    }
    if (has("diuretic")) P("meal", "간은 소금·간장으로. '저염 소금'(칼륨 소금)은 쓰지 않기", ["S28", "S29"]);
  }

  /* 3. 식단 추천 (내일 하루) */
  const protein = has("gout") ? ((purV.length || purH.length >= 2 || flare) ? "달걀·두부·저지방 우유(요구르트)만, 고기·생선은 쉬기" : "아침·점심은 달걀·두부·저지방 우유, 저녁 한 끼만 생선이나 살코기 소량") : "달걀·두부·생선·살코기 골고루 소량";
  const veg = has("warfarin") ? (vkAvg != null ? `녹색잎채소(시금치·부추 등)는 하루 ${Math.max(0, Math.round(vkAvg))}가지 정도로 평소와 같게` : "녹색잎채소는 매일 비슷한 양으로") : "채소 충분히";
  const cook = "구이·찜 위주, 국물은 건더기만, 조림·젓갈 줄이기";
  P("menu", `단백질: ${protein}`, has("gout") ? ["S45", "S16"] : []);
  P("menu", `채소: ${veg}`, has("warfarin") ? ["S1", "S3"] : []);
  P("menu", `조리: ${cook}`, ["S37", "S8"]);
  P("menu", `음료: ${has("diuretic") ? "물은 주치의가 정한 양 안에서" : "물 충분히"}. 술·단 음료·과일주스는 빼기`, has("diuretic") ? ["S24", "S17"] : ["S17", "S15"]);
  if (has("warfarin")) P("menu", "홍삼·오메가3·녹즙 등은 새로 시작하지 않기", ["S19", "S1"]);

  /* 4. 운동 */
  if (emergency || ev.level === "상") P("exercise", "오늘은 운동 쉬기. 위험 신호 확인과 진료가 먼저", ["S6", "S14"]);
  else if (flare) {
    P("exercise", `통증 ${pain}점: 아픈 발은 쉬고, 앉거나 누워 발을 심장보다 높게`, ["S44"]);
    P("exercise", "얼음을 수건에 싸서 아픈 관절에 대기 (하루 여러 번, 피부가 너무 차가워지면 떼기). 주치의 안내가 다르면 그 방법을 따르기", ["S43", "S44"]);
    P("exercise", "걷기 대신 앉아서 팔·어깨 스트레칭 10분", ["S44", "S13"]);
  } else if (hfSign) {
    P("exercise", "숨참·붓기·체중 증가 신호가 있어 평소보다 가볍게. 숨이 차면 바로 멈추고 진료 상담", ["S24", "S14"]);
  } else if (fallRisk) {
    P("exercise", "어지러움·떨림이 있어 실내 운동으로. 일어설 때 천천히, 손잡이 잡고", ["S47", "S32"]);
    P("exercise", "의자 잡고 앉았다 일어서기 10회 × 2번 (하체 근력·균형)", ["S46", "S47"]);
  } else {
    const goal = 30;
    if (totalMin < goal) P("exercise", `걷기 ${goal - totalMin}분 더 (오늘 ${totalMin}분). 10분씩 나눠도 됨. 저녁 식후 산책이 좋음`, ["S13", "S38"]);
    else P("exercise", `오늘 ${totalMin}분 달성. 내일도 30분 내외 유지, 갑자기 늘리지 않기`, ["S13", "S14"]);
    if (exs.some(x => x.intensity === "강")) P("exercise", "강도 '강'은 '중'(말은 할 수 있는 정도)으로 낮추기", ["S13", "S14"]);
    P("exercise", "의자 잡고 앉았다 일어서기 10회 (넘어짐 예방)", ["S46", "S47"]);
  }
  if (fallRisk && !emergency && (flare || hfSign)) P("exercise", "어지러움·떨림도 있으니 일어설 때 천천히, 손잡이 잡고", ["S47", "S32"]);
  if (has("warfarin") && !emergency) P("exercise", "밝고 평평한 길에서. 넘어지거나 머리를 부딪히면 증상이 없어도 병원", ["S12", "S46"]);

  /* 5. 마음·수면 */
  if (stress != null && stress >= 7) {
    P("mind", `스트레스 ${stress}점: 복식호흡 5분 × 2번. 코로 4초 들이쉬고 6~8초 길게 내쉬기`, ["S39", "S38"]);
    P("mind", "스트레스가 길게 이어지면 혈압·심혈관 위험이 올라감. 원인을 적어두고 가족과 나누기", ["S40", "S37"]);
  } else if (stress != null && stress >= 4) P("mind", `스트레스 ${stress}점: 자기 전 복식호흡 5분`, ["S39", "S38"]);
  else if (stress != null) P("mind", `스트레스 ${stress}점: 안정적. 지금 생활 유지`, ["S40"]);
  else P("mind", "스트레스 점수(0~10)를 입력하면 맞춤 조언이 나옵니다");
  if (sleep != null) {
    if (sleep < 6) P("mind", `수면 ${sleep}시간: 부족. 오늘 밤 7~8시간 목표, 낮잠은 30분 이내`, ["S41", "S42"]);
    else if (sleep > 9) P("mind", `수면 ${sleep}시간: 너무 김. 7~8시간이 심장·뇌에 가장 안전한 범위`, ["S41", "S42"]);
    else P("mind", `수면 ${sleep}시간: 적정 범위(7~9시간 권장)`, ["S41", "S42"]);
  }
  if (sym.dig_sleep) P("mind", "하루 종일 심하게 졸리면 피로가 아니라 디고신 부작용일 수 있음 → 주치의 연락", ["S27", "S26"]);

  /* 6. 심장 */
  if (has("heart") || has("diuretic")) {
    if (sym.chest || sym.hf_acute) P("heart", "가슴 통증·심한 숨참 → 즉시 119", ["S14", "S24"]);
    if (hfSign) {
      const what = [sym.hf_lying ? "누우면 숨참·다리 붓기" : "", ev.reasons.some(r => r.t.startsWith("체중")) ? "며칠 새 체중 증가" : ""].filter(Boolean).join(", ");
      P("heart", `${what} → 몸에 물이 차는 신호일 수 있음. 이뇨제를 스스로 바꾸지 말고 병원 연락`, ["S23", "S24"]);
    }
    if (has("diuretic")) P("heart", w ? "내일 아침에도 같은 시각·같은 옷차림으로 체중 측정" : "체중이 빠졌습니다. 내일 아침 같은 시각에 재서 입력", ["S24", "S25"]);
    if (sym.palp) P("heart", "두근거림 → 테놀민 복용 여부를 기록하고 다음 진료 때 알리기. 디고신 과다 신호와 겹치면 바로 연락", ["S26", "S27"]);
    if (salty >= 2) P("heart", "짠 음식은 몸에 물을 붙잡아 심장 부담을 키움 → 내일은 국물 없는 식사", ["S24", "S37"]);
    if (!A.heart.length) P("heart", "특이 신호 없음. 약 시간 지키기와 30분 걷기 유지", ["S13", "S23"]);
  }
  /* 7. 머리(뇌) */
  if (has("ich") || has("warfarin")) {
    if (["neuro_face", "neuro_arm", "neuro_speech", "neuro_gaze", "headache"].some(k => sym[k])) P("brain", "뇌졸중 의심 증상 → 지금 바로 119. 기다리지 말기", ["S8", "S9"]);
    if (sym.head_injury) P("brain", "와파린 복용 중 머리 부딪힘 → 증상이 없어도 오늘 병원(CT)", ["S12"]);
    P("brain", salty ? `오늘 짠 끼니 ${salty}번 → 혈압 관리가 뇌출혈 재발 예방의 핵심. 내일은 싱겁게` : "싱겁게 먹은 하루. 혈압 관리가 뇌출혈 재발 예방의 핵심이니 유지", ["S10", "S11"]);
    if (sleep != null && (sleep < 6 || sleep > 9)) P("brain", "수면이 너무 짧거나 길면 뇌졸중 위험이 올라감 → 7~8시간 맞추기", ["S42", "S41"]);
    const lastV = state.vitals.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!lastV) P("brain", "병원 측정 혈압을 '병원측정'에 입력해 두면 다음 진료 때 추이를 보여드릴 수 있음");
    else { const d = daysBetween(lastV.date, date); if (d >= 90) P("brain", `병원 혈압 측정 후 ${d}일. 3개월 측정 시기`, ["S10"]); }
  }
  /* 8. 통풍 */
  if (has("gout")) {
    if (flare) P("gout", `통증 ${pain}점 → 발작 의심. 소염진통제는 와파린과 함께 먹으면 출혈 위험이 커서 임의로 먹지 말고 진료`, ["S4", "S5"]);
    else if (pain != null && pain >= 4) P("gout", `통증 ${pain}점 → 아픈 발에 무리 주지 않기. 내일도 계속되면 진료`, ["S44", "S15"]);
    else if (pain != null) P("gout", `통증 ${pain}점 → 안정적`, ["S15"]);
    if (purV.length || alc.length) P("gout", `오늘 ${[...purV, ...alc].join("·")} → 술·고퓨린 음식은 발작의 흔한 계기. 내일은 완전히 빼기`, ["S45", "S17"]);
    if (has("diuretic")) P("gout", "라식스는 요산을 올릴 수 있음. 발작이 잦아지면 주치의에게 약 조합 상담 (임의 중단 금지)", ["S34", "S36"]);
    P("gout", "저지방 우유·요구르트·달걀·두부는 요산 관리에 도움이 되는 단백질", ["S45", "S16"]);
  }
  return { A, ev, slot };
}

const ADVICE_TITLES = [
  ["status", "현재 상태"], ["meal", "다음 식사"], ["menu", "내일 식단"], ["exercise", "운동"],
  ["mind", "마음·수면"], ["heart", "심장"], ["brain", "머리(뇌)"], ["gout", "통풍"]
];
function adviceHtml(date) {
  const { A } = buildAdvice(date);
  return ADVICE_TITLES.filter(([k]) => A[k].length).map(([k, n]) =>
    `<h3>${n}</h3><ul class="clean">${A[k].map(x => `<li>${esc(x.t)}${refTags(x.refs)}</li>`).join("")}</ul>`).join("");
}
