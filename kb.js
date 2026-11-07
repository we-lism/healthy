/* =========================================================
 * 건강참조 - 의학 참조자료 DB (하드코딩)
 * 원칙: 의사 글 / 논문·학회 / 언론(전문의 인용)만 사용
 *       각 항목은 서로 다른 출처 2개 이상으로 교차검증
 * 조사일: 2026-11-07
 * ※ 본 자료는 진료를 대체하지 않습니다. 약 조절은 반드시 주치의와 상의.
 * ========================================================= */
const KB_VERSION = "2026-11-07b";

const SOURCES = {
  S1: { t: "와파린 복용자 건강한 식사 지침 (HealthLinkBC, 2023)", u: "https://www.healthlinkbc.ca/sites/default/files/documents/healthy-eating-guidelines-for-people-taking-warfarin-anticoagulants-k.pdf", type: "공공보건기관" },
  S2: { t: "경구용 항응고제 Warfarin (약학정보원)", u: "https://common.health.kr/shared/healthkr/pharmreview/경구용항응고제1.pdf", type: "약학 전문자료" },
  S3: { t: "Do I need to avoid foods high in vitamin K if I'm on warfarin? (Harvard Health)", u: "https://www.health.harvard.edu/diet-and-nutrition/do-i-need-to-avoid-foods-high-in-vitamin-k-if-im-on-warfarin", type: "의대 출판" },
  S4: { t: "Warfarin drug interactions, Appendix 2 (Queensland Health, Micromedex 2022 근거)", u: "https://www.health.qld.gov.au/__data/assets/pdf_file/0023/1172912/appendix-2-warfarin-drug-interactions.pdf", type: "공공보건기관" },
  S5: { t: "와파린 사용자에서 NSAID 추가 후 INR 상승 위험인자 (KoreaMed 논문)", u: "https://synapse.koreamed.org/articles/1021266", type: "논문" },
  S6: { t: "타박상과 출혈 (MSD 매뉴얼, 2025-09 검토)", u: "https://www.msdmanuals.com/ko/홈/혈액-질환/혈액-응고-과정/타박상과-출혈", type: "의학 매뉴얼" },
  S7: { t: "항응고제 (약학정보원) - 출혈 부작용·응급 징후", u: "https://common.health.kr/shared/healthkr/pharmreview/항응고제.pdf", type: "약학 전문자료" },
  S8: { t: "뇌졸중 90% 예방 가능…이웃손발시선 (대한뇌졸중학회, 메디칼타임즈 2024-10-29)", u: "https://medicaltimes.com/Mobile/News/NewsView.html?ID=1161119", type: "학회·언론" },
  S9: { t: "뇌졸중 신호는 이웃손발시선 (대한뇌졸중학회, 메디칼타임즈 2025-10-29)", u: "https://medicaltimes.com/Mobile/News/NewsView.html?ID=1165820", type: "학회·언론" },
  S10: { t: "뇌출혈 예방을 위해 지금 할 수 있는 것 (김상현 신경외과 전문의, 2026-06)", u: "https://www.hyunmyoung.co.kr/neurosurgery/intracerebral-hemorrhage-prevention/", type: "의사 글" },
  S11: { t: "뇌출혈 회복 기간과 재활 과정 (김상현 신경외과 전문의)", u: "https://www.hyunmyoung.co.kr/neurosurgery/intracerebral-hemorrhage-recovery-rehab", type: "의사 글" },
  S12: { t: "항응고제 복용 중 머리를 부딪혔다면 즉시 병원으로 (김상현 신경외과 전문의, 2026-05)", u: "https://www.hyunmyoung.co.kr/v2/brain-ct/brain-ct-44a2a12e9a", type: "의사 글" },
  S13: { t: "급성관상동맥증후군 환자 운동과 심혈관 사건 (서울아산병원 권준교 교수팀, 세계일보 2025-05)", u: "https://www.segye.com/newsView/20250512504358", type: "논문·언론" },
  S14: { t: "심장질환, 수술보다 중요한 재활 (영남대병원 곽소영 교수, 매일신문 2024-02)", u: "https://www.imaeil.com/page/view/2024022615292275113", type: "의사·언론" },
  S15: { t: "젊어지는 통풍 환자 (중앙대병원 류마티스내과 송정수 교수, 스포츠경향 2024-01)", u: "https://sports.khan.co.kr/article/202401281914023", type: "의사·언론" },
  S16: { t: "통풍 예방을 위한 생활습관 5가지 (정지인 내과·류마티스 전문의)", u: "https://www.hyunmyoung.co.kr/general-medicine/통풍-예방을-위한-생활습관-5가지", type: "의사 글" },
  S17: { t: "통풍 환자의 식이요법, 맥주만 끊으면 되나요? (정지인 전문의, 2026-04)", u: "https://www.hyunmyoung.co.kr/general-medicine/통풍-환자의-식이요법-맥주만-끊으면-되나요", type: "의사 글" },
  S18: { t: "통풍 식이·생활 초기 신호 (정지인 전문의) - 탈수·급격한 절식", u: "https://www.hyunmyoung.co.kr/rheumatology/gout-diet-lifestyle-early-signs/", type: "의사 글" },
  S19: { t: "약+영양제 상호작용: 항응고제·비타민E·오메가3·홍삼 (코메디닷컴 2026-07)", u: "https://kormedi.com/2811343/", type: "논문·언론" },
  S20: { t: "건기식 허와실 - 오메가3·항응고제 출혈 (대한가정의학회, 메디칼타임즈)", u: "https://medicaltimes.com/Main/News/NewsView.html?ID=1139815", type: "학회·언론" },
  S21: { t: "Pulse Oximeter: What Your Reading Means (Acibadem)", u: "https://acibademinternational.com/blog/pulse-oximeter-what-your-reading-means-and-its-limits/", type: "병원" },
  S22: { t: "Oxygen Level 92 While Sleeping (MedlinePlus 기준 인용, 2026-09)", u: "https://pillo.care/blog/oxygen-level-92-while-sleeping", type: "언론(MedlinePlus 인용)" },
  S23: { t: "심부전 Q&A, 이뇨제 복용량 조절 (서울아산병원)", u: "https://www.amc.seoul.kr/asan/healthtv/video/videoDetail.do?videoId=1290", type: "병원" },
  S24: { t: "심부전, 병원 가야 할 타이밍 (정지인 내과 전문의)", u: "https://www.hyunmyoung.co.kr/general-medicine/heart-failure-when-to-see-doctor", type: "의사 글" },
  S25: { t: "Rapid weight gain (Heart Failure Matters, 유럽심장학회 심부전협회)", u: "https://www.heartfailurematters.org/warning-signs/rapid-weight-gain/", type: "학회" },
  S26: { t: "디곡신(digoxin) (약학정보원)", u: "https://common.health.kr/shared/healthkr/pharmreview/디곡신(digoxin).pdf", type: "약학 전문자료" },
  S27: { t: "디고신정 복용 후 졸음·시야 이상 이상사례 (대한약사회 지역의약품안전센터)", u: "https://common.health.kr/shared/healthkr/pharmreview/02_디곡신_기운없음_시야이상_상당히확실함.pdf", type: "약사회 보고" },
  S28: { t: "스피로노락톤 25mg 허가정보 (식약처, 약학정보원)", u: "https://health.kr/drug/2023101900003", type: "허가정보" },
  S29: { t: "스피로노락톤(spironolactone) (약학정보원)", u: "https://common.health.kr/shared/healthkr/pharmreview/스피로노락톤(spironolactone).pdf", type: "약학 전문자료" },
  S30: { t: "Pitavastatin vs rosuvastatin on INR in warfarin users (Curr Med Res Opin, 2012)", u: "https://pesquisa.bvsalud.org/bvsiec/resource/pt/mdl-22149769", type: "논문" },
  S31: { t: "Pitavastatin and steady-state warfarin (J Clin Pharmacol, 2011)", u: "https://katalog.lib.cas.cz/KNAV/EdsRecord/edsair,edsair.doi.dedup.....4b97a4b25b398791e31c1188631f55f4", type: "논문" },
  S32: { t: "트리메타지딘(trimetazidine) (약학정보원)", u: "https://common.health.kr/shared/healthkr/pharmreview/트리메타지딘(trimetazidine).pdf", type: "약학 전문자료" },
  S33: { t: "트리메타지딘 사용과 파킨슨증 위험 - 건강보험 청구자료 코호트 (서울대, 2021)", u: "https://s-space.snu.ac.kr/handle/10371/175794", type: "논문" },
  S34: { t: "푸로세미드정 허가정보 - 혈중 요산 증가·통풍 발작 (식약처, 약학정보원)", u: "https://health.kr/drug/A11A0950A0068", type: "허가정보" },
  S35: { t: "통풍 (질병관리청 국가건강정보포털)", u: "https://health.kdca.go.kr/healthinfo/biz/health/gnrlzHealthInfo/gnrlzHealthInfo/gnrlzHealthInfoView.do?cntnts_sn=6732", type: "정부기관" },
  S36: { t: "통풍 (MSD 매뉴얼, 2025-07 검토)", u: "https://www.msdmanuals.com/ko/home/뼈-관절-근육-장애/통풍과-칼슘-피로인산염-관절염/통풍", type: "의학 매뉴얼" }
};

/* 질환 정의: 병력/현재상태 텍스트에서 키워드로 인식 */
const CONDITIONS = [
  {
    id: "warfarin",
    name: "항응고제(와파린) 복용",
    keys: ["와파린", "와르파린", "쿠마딘", "warfarin", "항응고"],
    summary: [
      "비타민K 음식을 끊을 필요는 없음. 매일 비슷한 양으로 '일정하게' 먹는 것이 핵심 [S1,S2,S3]",
      "녹색잎채소를 갑자기 많이 먹거나 끊으면 INR이 흔들릴 수 있음 [S1,S2]",
      "소염진통제(이부프로펜·나프록센 등)는 출혈 위험을 높임 → 임의 복용 금지 [S4,S5]",
      "오메가3·홍삼·은행잎·마늘 보충제·비타민E는 출혈 위험을 높일 수 있음 → 주치의 상의 [S1,S19,S20]",
      "잇몸출혈·코피·멍 증가는 진료, 토혈·혈뇨·흑변·멈추지 않는 출혈은 응급 [S6,S7]",
      "넘어지거나 머리를 부딪혔으면 증상이 없어도 병원 [S12]"
    ],
    refs: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S12", "S19", "S20"]
  },
  {
    id: "heart",
    name: "심장 시술(풍선확장술·스텐트) 이후",
    keys: ["풍선", "확장술", "스텐트", "심장", "관상동맥", "협심증", "심근경색", "심장내과"],
    summary: [
      "시술 후에도 중강도 운동을 꾸준히 하면 심혈관 사건 위험이 낮아짐(최대 13%) [S13,S14]",
      "과격한 운동은 피하고, 운동 강도는 주치의·심장재활 처방에 맞춤 [S13,S14]",
      "운동 중 흉통·심한 호흡곤란·불규칙한 맥박이 생기면 즉시 중단 [S14]"
    ],
    refs: ["S13", "S14"]
  },
  {
    id: "ich",
    name: "뇌출혈 이력(신경외과 시술)",
    keys: ["뇌출혈", "뇌내출혈", "출혈성", "신경외과", "뇌졸중", "지주막하"],
    summary: [
      "재발 예방의 핵심은 혈압 관리. 혈압약을 거르지 않기 [S10,S11]",
      "싱겁게 먹기: WHO 권장 나트륨 하루 2,000mg(소금 5g) [S8,S10]",
      "이웃손발시선(웃지 못함·한쪽 팔다리 힘빠짐·말 어눌함·시선 쏠림) 중 하나라도 있으면 즉시 119 [S8,S9]",
      "갑작스러운 심한 두통·구토·의식저하도 즉시 119 [S10,S11]"
    ],
    refs: ["S8", "S9", "S10", "S11"]
  },
  {
    id: "diuretic",
    name: "이뇨제·강심제 복용 (라식스·알닥톤·디고신)",
    keys: ["라식스", "푸로세미드", "알닥톤", "스피로노락톤", "디고신", "디곡신", "이뇨제", "심부전"],
    summary: [
      "체중을 매일 같은 시각·조건에서 재기. 2~3일에 2kg 이상 늘면 몸에 물이 차는 신호 → 진료 [S23,S24,S25]",
      "이뇨제 양을 스스로 줄이거나 늘리지 않기. 체중 변화를 보고 병원에서 조절 [S23,S24]",
      "물 양은 주치의 지시를 따름. 통풍 때문에 물을 크게 늘리기 전에 주치의 확인 [S24,S23]",
      "알닥톤 복용 중: '저염 소금(칼륨 소금)'·칼륨 보충제는 칼륨을 위험하게 올릴 수 있음 → 피하기 [S28,S29]",
      "디고신 과다 신호: 구역·구토·식욕저하, 물체가 노랗게·흐리게 보임, 심한 졸음, 두근거림 → 주치의 연락 [S26,S27]",
      "라식스는 요산을 올려 통풍 발작을 부를 수 있음. 그래도 임의 중단 말고 주치의와 상의 [S34,S35,S36]",
      "가만히 있어도 숨이 몹시 차거나 분홍빛 거품 가래가 나오면 즉시 119 [S24]"
    ],
    refs: ["S23", "S24", "S25", "S26", "S27", "S28", "S29", "S34", "S35", "S36"]
  },
  {
    id: "drugs_other",
    name: "기타 복용약 (리바로·바스티난MR·테놀민)",
    keys: ["리바로", "피타바스타틴", "바스티난", "트리메타지딘", "테놀민", "아테놀올"],
    summary: [
      "리바로(피타바스타틴)는 연구에서 와파린 INR을 유의하게 바꾸지 않았음 (단, 2011~2012년 연구) [S30,S31]",
      "바스티난MR(트리메타지딘): 손떨림·몸이 굳음·걸음이 불안정하면 주치의에게 알리기. 고령은 특히 주의 [S32,S33]",
      "바스티난MR + 혈압 낮추는 약: 어지러움·휘청거림으로 넘어질 수 있음. 와파린 복용 중 낙상은 출혈 위험 [S32,S12]",
      "테놀민(두근거릴 때만 복용): 먹은 날은 기록해 두고 다음 진료 때 알리기"
    ],
    refs: ["S30", "S31", "S32", "S33", "S12"]
  },
  {
    id: "gout",
    name: "통풍",
    keys: ["통풍", "요산", "엄지발가락", "발가락"],
    summary: [
      "내장류·멸치·정어리·홍합은 가능한 피함, 소·돼지고기·고등어·새우는 양과 빈도 조절 [S16,S15]",
      "모든 술(맥주·소주·막걸리·와인)은 요산 배설을 방해 [S17,S15]",
      "과당 음료(주스·탄산)는 요산을 올림 [S15,S17]",
      "탈수·급격한 절식·과격한 운동은 발작 계기 [S18,S15]",
      "와파린 복용 중 통풍약(알로푸리놀) 시작·변경 시 INR 확인 필요 [S4]"
    ],
    refs: ["S15", "S16", "S17", "S18", "S4"]
  }
];

/* 음식 키워드 (교차검증된 목록만) */
const FOOD = {
  vitK_high: { label: "비타민K 많은 채소", refs: ["S1", "S3"], words: ["시금치", "부추", "근대", "무청", "시래기", "냉이", "쑥", "비름", "갓김치", "케일", "브로콜리", "청국장", "낫토", "녹즙"] },
  purine_vhigh: { label: "퓨린 매우 높음", refs: ["S16", "S15"], words: ["소간", "돼지간", "닭간", "곱창", "막창", "대창", "내장", "멸치", "정어리", "홍합"] },
  purine_high: { label: "퓨린 높음", refs: ["S16", "S15"], words: ["소고기", "쇠고기", "돼지고기", "삼겹살", "갈비", "고등어", "새우", "치킨"] },
  alcohol: { label: "술", refs: ["S17", "S15", "S10"], words: ["음주", "맥주", "소주", "막걸리", "와인", "하이볼", "소맥", "양주", "위스키"] },
  fructose: { label: "과당 음료", refs: ["S15", "S17"], words: ["콜라", "사이다", "탄산음료", "주스", "에이드", "음료수"] },
  supplement: { label: "출혈 위험 보충제", refs: ["S19", "S20", "S1"], words: ["오메가3", "오메가", "홍삼", "인삼", "은행잎", "비타민e", "비타민E", "마늘즙", "흑마늘"] },
  ksalt: { label: "칼륨 소금", refs: ["S28", "S29"], words: ["저염소금", "저나트륨소금", "칼륨소금", "칼륨보충제", "칼륨약"] },
  nsaid: { label: "소염진통제·아스피린", refs: ["S4", "S5"], words: ["이부프로펜", "부루펜", "애드빌", "나프록센", "탁센", "낙센", "멜록시캄", "세레콕시브", "쎄레브렉스", "디클로페낙", "인도메타신", "아스피린"] }
};

/* 증상 체크 항목 */
const SYMPTOMS = {
  emergency: [
    { id: "neuro_face", label: "웃을 때 한쪽 얼굴이 처짐", refs: ["S8", "S9"] },
    { id: "neuro_arm", label: "한쪽 팔·다리에 힘이 빠짐", refs: ["S8", "S9"] },
    { id: "neuro_speech", label: "말이 어눌하거나 말이 안 통함", refs: ["S8", "S9"] },
    { id: "neuro_gaze", label: "시선이 한쪽으로 쏠림", refs: ["S8", "S9"] },
    { id: "headache", label: "갑작스러운 심한 두통·구토", refs: ["S10", "S11", "S6"] },
    { id: "head_injury", label: "넘어짐·머리 부딪힘", refs: ["S12"] },
    { id: "vomit_blood", label: "피를 토함", refs: ["S7", "S6"] },
    { id: "black_stool", label: "검은 변·피 섞인 변", refs: ["S7", "S6"] },
    { id: "hematuria", label: "소변에 피", refs: ["S7", "S6"] },
    { id: "nonstop", label: "멈추지 않는 출혈", refs: ["S7", "S6"] },
    { id: "chest", label: "가슴 통증·심한 호흡곤란", refs: ["S14"] },
    { id: "hf_acute", label: "가만히 있어도 숨이 몹시 참·분홍 거품 가래", refs: ["S24"] }
  ],
  caution: [
    { id: "gum", label: "잇몸 출혈", refs: ["S7", "S6"] },
    { id: "nose", label: "코피", refs: ["S7", "S6"] },
    { id: "bruise", label: "멍이 늘어남", refs: ["S7", "S6"] },
    { id: "dizzy", label: "어지러움·기운 없음", refs: ["S6"] },
    { id: "hf_lying", label: "누우면 숨참·다리 붓기 심해짐", refs: ["S24", "S23"] },
    { id: "dig_gi", label: "구역·구토·식욕 떨어짐", refs: ["S26", "S27"], group: "digoxin" },
    { id: "dig_eye", label: "물체가 노랗게·흐리게 보임", refs: ["S26", "S27"], group: "digoxin" },
    { id: "dig_sleep", label: "하루 종일 심하게 졸림·멍함", refs: ["S27", "S26"], group: "digoxin" },
    { id: "palp", label: "가슴 두근거림·맥이 불규칙한 느낌", refs: ["S26", "S14"], group: "digoxin" },
    { id: "tremor", label: "손떨림·몸이 굳음·걸음 불안정", refs: ["S32", "S33"] }
  ]
};

/* 산소포화도 기준 [S21,S22] */
const SPO2 = { normal: 95, contact: 92, emergency: 88, refs: ["S21", "S22"] };

/* 기본 복약 계획 (사용자 설명 기준, 설정에서 수정 가능) */
const DEFAULT_MED_PLAN = [
  { id: "p_am", label: "아침 약봉지 (심장약)", slot: "아침", every: 1 },
  { id: "p_noon", label: "점심 통풍약", slot: "점심", every: 3 },
  { id: "p_pm", label: "저녁 약봉지 (와르파린·뇌출혈 관련약)", slot: "저녁", every: 1 }
];
const DEFAULT_PRN = [{ id: "prn_tenormin", label: "테놀민 (두근거릴 때)" }];
const DEFAULT_MEDS_TEXT = "와르파린나트륨정 2mg 0.75정 매일 저녁 / 리바로정 4mg 1정 / 알닥톤필름코팅정 25mg 1정 / 디고신정 0.25mg 0.5정 / 라식스정 1정 / 바스티난MR 35mg 1일 2정 / 현대테놀민정 25mg 0.5정(두근거릴 때만)";
