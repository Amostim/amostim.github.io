// Patient-facing V2 form. Deterministic clinical evaluation remains in the app;
// this page only collects raw answers, runs required-branch validation, and warns on red flags.
const FORM_VERSION = "2.1";
const COLLECT_TOKEN = new URLSearchParams(window.location.search).get("t") || "";
const SUPABASE_FORM_ENDPOINT = "https://bxjooumydgyqlcmrufjn.supabase.co/functions/v1/vertigo-form";
const q = (id, labelCn, type, options) => ({
  id, labelCn, type,
  options: options.map((option) => {
    const separator = option.indexOf("|");
    return { id: option.slice(0, separator), labelCn: option.slice(separator + 1) };
  }),
});
const CORE = [
  q("v2_sensation", "你主要有什么感觉？（可多选）", "multi", ["spinning|天旋地转", "motion_floating|摇晃、漂浮", "imbalance|走路不稳", "presyncope|眼前发黑、快晕倒", "oscillopsia|走路或转头时视物晃动", "nonspecific|头昏脑沉", "unsure|说不清"]),
  q("v2_onset", "这次症状何时开始？", "single", ["within_72h|72 小时内", "4_to_30_days|4–30 天前", "over_30_days|超过 30 天", "unknown|不清楚"]),
  q("v2_course", "症状是怎样发生的？", "single", ["continuous|持续存在", "episodes|一阵一阵发作", "persistent_most_days|多数日子都有", "unknown|不清楚"]),
  q("v2_duration", "一次发作或当前持续了多久？", "single", ["under_1_min|少于 1 分钟", "1_5min|1 至不足 5 分钟", "5_20min|5 至不足 20 分钟", "20min_to_12h|20 分钟至不足 12 小时", "12h_to_24h|12 至不足 24 小时", "24h_to_72h|24–72 小时", "over_24h_or_continuous|超过 72 小时或持续不停", "unknown|不清楚"]),
  q("v2_trigger_relationship", "动作与症状是什么关系？", "single", ["clearly_triggered|动作前基本不晕，某动作会引出一阵新症状", "worsens_only|本来持续在晕，头动只是让它更重", "orthostatic|主要在站起时出现", "spontaneous|没有明确动作也会发作", "unclear|不确定"]),
  q("v2_red_flags", "现在或本次是否出现以下情况？（可多选）", "multi", ["none|以上都没有", "unilateral_weakness_or_numbness|新发单侧无力或麻木", "diplopia|复视", "dysarthria|说话含糊", "dysphagia|吞咽困难", "sudden_severe_headache_or_neck_pain|突发剧烈头痛或颈痛", "unable_to_stand_or_walk|无法独立站立或行走", "loss_of_consciousness|晕厥或意识丧失", "chest_pain|胸痛"]),
  q("v2_auditory", "有没有听力或耳部变化？（可多选）", "multi", ["none|没有", "tinnitus|耳鸣", "aural_fullness|耳闷", "hearing_change|听力变化", "otalgia_or_discharge|耳痛或耳流液"]),
  q("v2_associated", "还伴有哪些线索？（可多选）", "multi", ["none|没有或不清楚", "migraine_history|曾被医生诊断偏头痛", "headache|发作时头痛", "photophobia|怕光", "phonophobia|怕声音", "visual_aura|视觉先兆", "motion_sickness_history|容易晕车或晕船", "palpitations|心悸", "medication_change|近期开始、加量或停减药物", "sedation_or_slowness|犯困或反应变慢", "possible_hypoglycemia_symptoms|发作时出汗、手抖、心慌或明显饥饿"]),
];
const GROUPS = {
  episodes: [q("v2_episode_count", "大约发作过几次？", "single", ["first|第一次", "2_to_5|2–5 次", "more_than_5|超过 5 次", "unknown|不清楚"]), q("v2_symptom_free_between", "两次发作之间是否基本恢复？", "single", ["yes|是", "no|否，仍持续有症状", "unknown|不清楚"])],
  trigger: [q("v2_trigger_details", "哪些情境会引出或加重症状？（可多选）", "multi", ["rolling_in_bed|床上翻身", "lying_down|躺下或起床", "looking_up_or_bending|抬头或弯腰", "standing|站起", "walking|走路或转头", "visual_motion|人群、车流或复杂图案", "transport|乘车、乘船或下船后", "sound_or_pressure|声音、咳嗽、用力或压力变化", "flight_or_diving|飞行、潜水或气压变化"]), q("v2_symptoms_at_rest", "不动时或两次动作之间，症状是否仍持续？", "single", ["no|基本不晕", "yes|仍持续有症状", "unknown|不清楚"])],
  orthostatic: [q("v2_on_standing", "站起后是否会出现或明显加重？", "single", ["yes|是", "no|否", "unknown|不清楚"]), q("v2_improves_lying", "坐下或躺下后是否缓解？", "single", ["yes|是", "no|否", "unknown|不清楚"]), q("v2_exertional_or_palpitations", "是否与活动、心悸或胸部不适同时发生？", "single", ["yes|是", "no|否", "unknown|不清楚"])],
  auditory: [q("v2_hearing_side", "主要影响哪一侧？", "single", ["left|左侧", "right|右侧", "bilateral|双侧", "uncertain|不确定"]), q("v2_hearing_synchronized", "耳鸣、耳闷或听力变化是否通常与眩晕同时发生或随眩晕加重？", "single", ["yes|是", "no|否", "unknown|不清楚"]), q("v2_hearing_fluctuates", "听力是否波动？", "single", ["yes|是", "no|否", "unknown|不清楚"])],
  auditory_sudden: [q("v2_hearing_sudden_or_new", "听力下降是否突然发生或最近新出现？", "single", ["yes|是", "no|否", "unknown|不清楚"])],
  migraine: [q("v2_migraine_pattern", "头痛是否偏侧、搏动性，或被日常活动加重？", "single", ["yes|是", "no|否", "unknown|不清楚"])],
  migraine_attack_count: [q("v2_similar_attack_count", "这种相似发作一共发生过多少次？", "single", ["one|1 次", "two_to_four|2–4 次", "five_or_more|≥5 次", "unknown|不清楚"])],
  chronic: [q("v2_over_3_months", "多数日子有症状是否已持续 3 个月或更久？", "single", ["yes|是", "no|否", "unknown|不清楚"]), q("v2_worse_upright", "站立或行走时是否加重？", "single", ["yes|是", "no|否", "unknown|不清楚"]), q("v2_worse_motion", "主动转头、走动或乘车时是否加重？", "single", ["yes|是", "no|否", "unknown|不清楚"]), q("v2_worse_visual", "车流、人群或复杂图案等视觉环境是否加重？", "single", ["yes|是", "no|否", "unknown|不清楚"]), q("v2_functional_impact", "这些症状是否明显影响日常活动？", "single", ["yes|是", "no|否", "unknown|不清楚"])],
  pppd_trigger_event: [q("v2_pppd_trigger_events", "长期症状开始前是否有明显诱发事件？（可多选）", "multi", ["prior_vestibular_event|既往眩晕或前庭事件", "migraine|偏头痛", "physical_illness_or_surgery|身体疾病或手术", "significant_psychological_event|明显心理事件", "no_obvious_trigger|无明显诱因", "unknown|不清楚"])],
  bilateral: [q("v2_worse_dark_or_uneven", "在昏暗环境或不平地面行走是否更不稳？", "single", ["yes|是", "no|否", "unknown|不清楚"]), q("v2_oscillopsia_movement", "走路或快速转头时是否有视物晃动？", "single", ["yes|是", "no|否", "unknown|不清楚"]), q("v2_symptoms_sitting_still", "安静坐着或躺着时是否也明显不稳？", "single", ["yes|是", "no|否", "unknown|不清楚"])],
  transport: [q("v2_during_transport", "症状是否在乘车、乘船等运动过程中出现？", "single", ["yes|是", "no|否", "unknown|不清楚"]), q("v2_persists_after_transport", "停止运动后是否仍持续摇晃感？", "single", ["yes|是", "no|否", "unknown|不清楚"]), q("v2_improves_reexposure", "再次乘车或运动时是否暂时减轻？", "single", ["yes|是", "no|否", "unknown|不清楚"])],
  medication: [q("v2_medication_timing", "药物变化与症状开始的时间关系？", "single", ["before|症状前开始、加量或停减药", "after|症状后才变化", "uncertain|不确定"]), q("v2_medication_class", "可能涉及哪类药物？", "multi", ["antihypertensive_or_diuretic|降压药或利尿剂", "glucose_lowering|降糖药", "sedative|镇静、安眠或止晕药", "possible_ototoxic|可能影响听力/前庭的药物", "other|其他", "unknown|不清楚"])],
  glucose: [q("v2_glucose_checked", "发作时是否测过血糖？", "single", ["low|测得偏低", "not_low|测得未偏低", "not_measured|没有测量", "unknown|不清楚"])],
  pressure: [q("v2_pressure_relation", "症状是否与声音、咳嗽用力或气压变化相关？", "single", ["yes|是", "no|否", "unknown|不清楚"])],
};
const state = { age: "", gender: "", answers: {} };
const redFlagIds = new Set(["unilateral_weakness_or_numbness", "diplopia", "dysarthria", "dysphagia", "sudden_severe_headache_or_neck_pain", "unable_to_stand_or_walk", "loss_of_consciousness", "chest_pain"]);
const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text != null) node.textContent = text; return node; };
function selected(id) { return new Set(state.answers[id] || []); }
function visibleGroups() {
  const a = selected("v2_associated"), s = selected("v2_sensation"), hearing = selected("v2_auditory"), triggers = selected("v2_trigger_details");
  const relation = (state.answers.v2_trigger_relationship || [])[0], course = (state.answers.v2_course || [])[0], onset = (state.answers.v2_onset || [])[0];
  const groups = new Set();
  if (course === "episodes") groups.add("episodes");
  if (["clearly_triggered", "worsens_only", "orthostatic"].includes(relation)) groups.add("trigger");
  if (relation === "orthostatic" || triggers.has("standing") || s.has("presyncope") || a.has("palpitations")) groups.add("orthostatic");
  if (["hearing_change", "tinnitus", "aural_fullness"].some((id) => hearing.has(id))) groups.add("auditory");
  if (hearing.has("hearing_change")) groups.add("auditory_sudden");
  if (["migraine_history", "headache", "photophobia", "phonophobia", "visual_aura"].some((id) => a.has(id))) groups.add("migraine");
  const migraineCandidate = ["migraine_history", "headache", "photophobia", "phonophobia", "visual_aura"].some((id) => a.has(id));
  if (course === "episodes" && migraineCandidate) groups.add("migraine_attack_count");
  if (course === "persistent_most_days" || onset === "over_30_days") groups.add("chronic");
  if (course === "persistent_most_days" && ["v2_over_3_months", "v2_worse_upright", "v2_worse_motion", "v2_worse_visual", "v2_functional_impact"].every((id) => state.answers[id]?.[0] === "yes")) groups.add("pppd_trigger_event");
  if (course === "persistent_most_days" || s.has("imbalance") || s.has("oscillopsia") || Number(state.age) >= 65) groups.add("bilateral");
  if (a.has("motion_sickness_history") || triggers.has("transport")) groups.add("transport");
  if (a.has("medication_change")) groups.add("medication");
  if (a.has("possible_hypoglycemia_symptoms") || selected("v2_medication_class").has("glucose_lowering")) groups.add("glucose");
  if (triggers.has("sound_or_pressure") || triggers.has("flight_or_diving")) groups.add("pressure");
  return groups;
}
function currentQuestions() { const groups = visibleGroups(); return CORE.concat(...Object.keys(GROUPS).filter((id) => groups.has(id)).map((id) => GROUPS[id])); }
function pruneHiddenAnswers() { const ids = new Set(currentQuestions().map((question) => question.id)); Object.keys(state.answers).forEach((id) => { if (!ids.has(id)) delete state.answers[id]; }); }
function optionRow(question, option) {
  const label = el("label", "opt"), input = document.createElement("input");
  input.type = question.type === "single" ? "radio" : "checkbox";
  if (question.type === "single") input.name = "grp_" + question.id;
  input.value = option.id; input.checked = (state.answers[question.id] || []).includes(option.id);
  input.addEventListener("change", () => {
    if (question.type === "single") state.answers[question.id] = input.checked ? [option.id] : [];
    else { let values = state.answers[question.id] || []; const pppdExclusive = question.id === "v2_pppd_trigger_events" && ["no_obvious_trigger", "unknown"].includes(option.id); if (pppdExclusive) values = input.checked ? [option.id] : values.filter((value) => value !== option.id); else { values = option.id === "none" ? (input.checked ? ["none"] : []) : values.filter((value) => value !== "none" && !(question.id === "v2_pppd_trigger_events" && ["no_obvious_trigger", "unknown"].includes(value))); if (option.id !== "none") values = input.checked ? [...values, option.id] : values.filter((value) => value !== option.id); } state.answers[question.id] = values; }
    pruneHiddenAnswers(); render();
  });
  label.append(input, el("span", null, option.labelCn)); return label;
}
function renderQuestion(question, index) {
  const card = el("section", "card"); card.id = "q_" + question.id;
  const title = el("h2", "q-title"); title.append(document.createTextNode((index + 1) + ". " + question.labelCn), el("span", "req", " *")); card.append(title);
  question.options.forEach((option) => card.append(optionRow(question, option))); return card;
}
function render() {
  const root = document.getElementById("root"); root.innerHTML = "";
  const header = el("header"), warning = el("p", null, "本表用于收集信息，不提供诊断。出现严重或新发神经症状、晕厥、胸痛等，请立即寻求急诊帮助。");
  header.append(el("h1", null, "眩晕/头晕问诊"), el("p", null, "8 个核心问题，后续问题根据回答显示。年龄与性别选填。"), warning); root.append(header);
  const basic = el("section", "card"); basic.append(el("h2", "q-title", "基本信息（选填）"));
  const ageLabel = el("label", null, "年龄"), age = document.createElement("input"); age.type = "number"; age.min = "0"; age.max = "130"; age.className = "field"; age.placeholder = "岁"; age.value = state.age; age.addEventListener("change", () => { state.age = age.value; pruneHiddenAnswers(); render(); }); basic.append(ageLabel, age);
  const genderLabel = el("label", null, "性别"); basic.append(genderLabel);
  [{ id: "male", labelCn: "男" }, { id: "female", labelCn: "女" }].forEach((option) => { const label = el("label", "opt"), input = document.createElement("input"); input.type = "radio"; input.name = "gender"; input.checked = state.gender === option.id; input.addEventListener("change", () => { state.gender = option.id; }); label.append(input, el("span", null, option.labelCn)); basic.append(label); }); root.append(basic);
  root.append(el("h2", null, "核心问题")); CORE.forEach((question, index) => root.append(renderQuestion(question, index)));
  const branches = currentQuestions().slice(CORE.length);
  if (branches.length) { root.append(el("h2", null, "根据回答追加的问题")); branches.forEach((question, index) => root.append(renderQuestion(question, CORE.length + index))); }
  const redFlags = (state.answers.v2_red_flags || []).filter((id) => redFlagIds.has(id));
  if (redFlags.length) { const alert = el("section", "card missing", "已选择危险信号。请不要等待问卷分析，立即联系急救或按当地急诊流程就医。"); alert.setAttribute("role", "alert"); root.append(alert); }
}
function firstMissing() { return currentQuestions().find((question) => !(state.answers[question.id] || []).length)?.id || null; }
function showThanks() { document.getElementById("submitBar").style.display = "none"; const root = document.getElementById("root"); root.innerHTML = ""; root.append(el("div", "thanks", "感谢您的填写！如有危险信号，请及时寻求急诊帮助。")); }
document.getElementById("submitBtn").addEventListener("click", async () => {
  const missing = firstMissing();
  if (missing) { const card = document.getElementById("q_" + missing); if (card) { card.classList.add("missing"); card.scrollIntoView({ behavior: "smooth", block: "center" }); } window.alert("请完成 8 个核心问题和当前显示的追问后再提交。"); return; }
  const button = document.getElementById("submitBtn"); button.disabled = true;
  const answers = { formVersion: FORM_VERSION, rawAnswers: Object.fromEntries(currentQuestions().map((question) => [question.id, state.answers[question.id] || []])) };
  if (state.age !== "") answers.age = state.age; if (state.gender !== "") answers.gender = state.gender;
  try { const response = await fetch(SUPABASE_FORM_ENDPOINT + (COLLECT_TOKEN ? "?t=" + encodeURIComponent(COLLECT_TOKEN) : ""), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collect_token: COLLECT_TOKEN, form_version: FORM_VERSION, answers }) }); if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error?.message || ("提交失败（HTTP " + response.status + "）")); } showThanks(); }
  catch (error) { button.disabled = false; window.alert(error.message || "网络错误，请检查网络后重试。"); }
});
render();
