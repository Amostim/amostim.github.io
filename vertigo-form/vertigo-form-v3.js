// Patient-facing V3 form. The question data is generated from the shared contract JSON.
const FORM_DEF = window.VERTIGO_V3_CONTRACT;
const FORM_VERSION = FORM_DEF.formVersion;
const COLLECT_TOKEN = new URLSearchParams(window.location.search).get("t") || "";
const SUPABASE_FORM_ENDPOINT = "https://bxjooumydgyqlcmrufjn.supabase.co/functions/v1/vertigo-form";
const state = { answers: {} };
const byId = (id) => FORM_DEF.coreQuestions.find((item) => item.id === id) ||
  FORM_DEF.branches.flatMap((branch) => branch.questions).find((item) => item.id === id);
const chosen = (id) => new Set(state.answers[id] || []);
const one = (id) => (state.answers[id] || []).length === 1 ? state.answers[id][0] : null;

function branchVisible(branch) {
  const trigger = branch.trigger;
  switch (trigger.kind) {
    case "answer_any": return trigger.values.some((value) => chosen(trigger.question).has(value));
    case "migraine_or_recurrent_spontaneous":
      return ["headache", "photophobia_phonophobia", "visual_aura"].some((value) => chosen("q5").has(value)) ||
        ["rare_recurrent", "recurrent"].includes(one("q3")) && chosen("q4").has("spontaneous");
    case "orthostatic_or_presyncope":
      return chosen("q4").has("orthostatic") || chosen("q1").has("presyncope") || ["presyncope", "loss_of_consciousness"].includes(one("q7"));
    case "chronic":
      return one("q2") === "continuous" || one("q3") === "chronic_frequent" || ["visual", "walking_standing"].some((value) => chosen("q4").has(value));
    case "medication_or_nonspecific":
      return (one("q8") !== null && one("q8") !== "none") || chosen("q1").has("nonspecific_dizziness") || chosen("q1").has("presyncope");
    default: return false;
  }
}

function visibleQuestions() {
  const visible = FORM_DEF.coreQuestions.slice();
  FORM_DEF.branches.filter(branchVisible).forEach((branch) => {
    branch.questions.forEach((question) => {
      const conditions = question.visibleWhenAll || [];
      if (conditions.every((condition) => one(condition.question) === condition.equals)) visible.push(question);
    });
  });
  return visible;
}

function pruneHiddenAnswers() {
  const visibleIds = new Set(visibleQuestions().map((question) => question.id));
  Object.keys(state.answers).forEach((id) => { if (!visibleIds.has(id)) delete state.answers[id]; });
}

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

function setValue(question, optionId, checked) {
  const current = state.answers[question.id] || [];
  let next;
  const exclusive = new Set(question.exclusiveOptionIds || []);
  if (question.type === "single") next = checked ? [optionId] : [];
  else if (exclusive.has(optionId)) next = checked ? [optionId] : current.filter((value) => value !== optionId);
  else if (optionId === "none") next = checked ? ["none"] : [];
  else next = checked ? [...current.filter((value) => value !== "none" && !exclusive.has(value)), optionId] : current.filter((value) => value !== optionId);
  if (next.length) state.answers[question.id] = [...new Set(next)];
  else delete state.answers[question.id];
  pruneHiddenAnswers();
  render();
}

function renderQuestion(question, ordinal) {
  const card = el("section", "card");
  card.id = "q_" + question.id;
  const title = el("h2", "q-title");
  title.append(document.createTextNode(ordinal + ". " + question.labelCn));
  if (question.required) title.append(el("span", "req", " *"));
  card.append(title);
  question.options.forEach((option) => {
    const label = el("label", "opt");
    const input = document.createElement("input");
    input.type = question.type === "single" ? "radio" : "checkbox";
    if (question.type === "single") input.name = "grp_" + question.id;
    input.value = option.id;
    input.checked = chosen(question.id).has(option.id);
    input.addEventListener("change", () => setValue(question, option.id, input.checked));
    label.append(input, el("span", null, option.labelCn));
    card.append(label);
  });
  return card;
}

function render() {
  const root = document.getElementById("root");
  root.replaceChildren();
  const header = el("header");
  header.append(
    el("h1", null, "眩晕/头晕问诊"),
    el("p", null, "8 个核心问题，后续问题根据回答显示。"),
    el("p", "notice", "本表用于收集信息，不提供诊断。若出现新发神经症状、晕厥或不能站立行走，请立即寻求急诊评估。"),
  );
  root.append(header, el("h2", null, "核心问题"));
  FORM_DEF.coreQuestions.forEach((question, index) => root.append(renderQuestion(question, index + 1)));
  let ordinal = FORM_DEF.coreQuestions.length;
  FORM_DEF.branches.filter(branchVisible).forEach((branch) => {
    const visible = branch.questions.filter((question) => (question.visibleWhenAll || []).every((condition) => one(condition.question) === condition.equals));
    if (!visible.length) return;
    root.append(el("h2", "branch-title", branch.labelCn));
    visible.forEach((question) => root.append(renderQuestion(question, ++ordinal)));
  });
  const redFlags = [...chosen("q6")].filter((value) => value !== "none");
  const acuteHearingContext = one("q3") === "first_episode" &&
    (one("q2") === "continuous" && one("e1") === "no" ||
      ["12_24h", "24_72h"].includes(one("q2")) && one("e1") !== "yes");
  if (acuteHearingContext && one("b4") === "yes") {
    const alert = el("section", "card missing", "急性持续性眩晕合并新发单侧听力下降：需考虑 AICA 供血区卒中可能，请尽快由医生进行影像评估，不要等待表单处理。");
    alert.setAttribute("role", "alert");
    root.append(alert);
  }
  if (redFlags.length || one("q7") === "loss_of_consciousness") {
    const alert = el("section", "card missing", "已选择危险信号。请不要等待表单处理，立即联系急救或按当地急诊流程就医。");
    alert.setAttribute("role", "alert");
    root.append(alert);
  }
}

function firstMissing() {
  return visibleQuestions().find((question) => question.required && !(state.answers[question.id] || []).length)?.id || null;
}

function showThanks() {
  document.getElementById("submitBar").style.display = "none";
  document.getElementById("root").replaceChildren(el("div", "thanks", "感谢您的填写！如有危险信号，请及时寻求急诊帮助。"));
}

document.getElementById("submitBtn").addEventListener("click", async () => {
  const missing = firstMissing();
  if (missing) {
    const card = document.getElementById("q_" + missing);
    if (card) { card.classList.add("missing"); card.scrollIntoView({ behavior: "smooth", block: "center" }); }
    window.alert("请完成 8 个核心问题和当前显示的动态追问后再提交。");
    return;
  }
  const button = document.getElementById("submitBtn");
  button.disabled = true;
  const answers = { formVersion: FORM_VERSION, source: "self", rawAnswers: Object.fromEntries(visibleQuestions().map((question) => [question.id, state.answers[question.id] || []])) };
  try {
    const response = await fetch(SUPABASE_FORM_ENDPOINT + (COLLECT_TOKEN ? "?t=" + encodeURIComponent(COLLECT_TOKEN) : ""), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collect_token: COLLECT_TOKEN, form_version: FORM_VERSION, answers }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error?.message || ("提交失败（HTTP " + response.status + "）"));
    }
    showThanks();
  } catch (error) {
    button.disabled = false;
    window.alert(error.message || "网络错误，请检查网络后重试。");
  }
});

render();
