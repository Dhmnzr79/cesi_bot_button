const ALLOW_LEAD = ["none", "awaiting_name", "awaiting_phone", "complete"];
const ALLOW_CTA = ["booking", "none"];
const ALLOW_TOPIC = ["implantation", "prosthetics", "orthodontics", "clinic", "doctors", "other"];

function pick(obj, path, fallback) {
  let cur = obj;
  for (const k of path) {
    if (cur == null || typeof cur !== "object") return fallback;
    cur = cur[k];
  }
  return cur === undefined || cur === null ? fallback : cur;
}

function toArrayFollowups(v) {
  if (Array.isArray(v)) {
    return v.map(String).map((s) => s.trim()).filter(Boolean);
  }
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return [];
    try {
      const j = JSON.parse(t);
      if (Array.isArray(j)) return j.map(String).map((s) => s.trim()).filter(Boolean);
    } catch (e) {}
  }
  return [];
}

function parseDocsFromContext(ctxRaw) {
  const s = String(ctxRaw || "").trim();
  if (!s) return [];
  try {
    const j = JSON.parse(s);
    if (Array.isArray(j)) return j;
    if (j && Array.isArray(j.documents)) return j.documents;
    if (j && Array.isArray(j.output)) return j.output;
  } catch (e) {}
  return [];
}

function extractSubtopicButtonsFromDocs(docs, topic, subtopic) {
  let target = docs.find((d) => {
    const m = d && d.metadata ? d.metadata : {};
    return String(m.topic || "") === topic && String(m.subtopic || "") === subtopic;
  });

  if (!target) {
    target = docs.find((d) => {
      const m = d && d.metadata ? d.metadata : {};
      return String(m.topic || "") === topic;
    });
  }

  if (!target || !target.pageContent) return [];

  const lines = String(target.pageContent).split("\n");
  const headings = lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith("### "))
    .map((line) => line.replace(/^###\s+/, "").trim())
    .filter(Boolean)
    .filter((h) => h.toLowerCase() !== "коротко");

  return [...new Set(headings)].slice(0, 4);
}

function normText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[.,!?;:()"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function readCoveredFromState(v) {
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return [];
    try {
      const j = JSON.parse(t);
      if (Array.isArray(j)) return j.map(String).map((s) => s.trim()).filter(Boolean);
    } catch (e) {}
  }
  return [];
}

let root = $main_llm;
if (typeof root === "string") {
  try {
    root = JSON.parse(root.trim());
  } catch (e) {
    root = {};
  }
}

const parsed = pick(root, ["json"], null) || pick(root, ["output"], null) || root;
const raw = parsed && typeof parsed === "object" ? parsed : {};

let answer = String(raw.answer ?? "").trim();
if (!answer) {
  answer = "Извините, не удалось сформировать ответ. Переформулируйте вопрос или напишите администратору.";
}

let ui_ctaIntent = String(raw.ui_ctaIntent ?? "none");
if (!ALLOW_CTA.includes(ui_ctaIntent)) ui_ctaIntent = "none";

let leadIntent = String(raw.leadIntent ?? "none");
if (!ALLOW_LEAD.includes(leadIntent)) leadIntent = "none";

let meta_shouldHandoff = Boolean(raw.meta_shouldHandoff);

let meta_topic = String(raw.meta_topic ?? "other");
if (!ALLOW_TOPIC.includes(meta_topic)) meta_topic = "other";

let meta_subtopic = String(raw.meta_subtopic ?? "").trim();

// Fallback: если модель не вернула subtopic, достаем из last_context metadata
if (!meta_subtopic) {
  const ctx = String($flow?.state?.last_context ?? "");
  const m = ctx.match(/"subtopic"\s*:\s*"([^"]+)"/);
  if (m && m[1]) meta_subtopic = m[1].trim();
}

let followup_options = toArrayFollowups(raw.followup_options);
followup_options = [...new Set(followup_options)].slice(0, 4);

// Fallback: если LLM не вернула кнопки, извлекаем подтемы из текущего doc
if (leadIntent === "none" && followup_options.length === 0) {
  const docs = parseDocsFromContext($flow?.state?.last_context);
  if (docs.length > 0) {
    const fromDocs = extractSubtopicButtonsFromDocs(docs, meta_topic, meta_subtopic);
    if (fromDocs.length > 0) {
      followup_options = fromDocs;
    }
  }
}

// Память уже раскрытых подтем: чтобы кнопки не "возвращались" обратно.
let covered_subtopics = readCoveredFromState($flow?.state?.covered_subtopics);
covered_subtopics = [...new Set(covered_subtopics)].slice(0, 20);
const coveredNormSet = new Set(covered_subtopics.map(normText));

// Если пользователь кликнул кнопку-подтему, считаем ее раскрытой.
const userInputNorm = normText($flow?.input ?? "");
if (userInputNorm) {
  const docs = parseDocsFromContext($flow?.state?.last_context);
  const possible = extractSubtopicButtonsFromDocs(docs, meta_topic, meta_subtopic);
  const matched = possible.find((h) => normText(h) === userInputNorm);
  if (matched) {
    covered_subtopics.push(matched);
  }
}

covered_subtopics = [...new Set(covered_subtopics)].slice(0, 20);
const coveredAfterSet = new Set(covered_subtopics.map(normText));

// Убираем из кнопок уже пройденные подтемы и текущий клик.
followup_options = followup_options.filter((opt) => {
  const n = normText(opt);
  if (!n) return false;
  if (n === userInputNorm) return false;
  if (coveredAfterSet.has(n)) return false;
  return true;
});

// В режиме записи кнопки и CTA выключаем
if (leadIntent !== "none") {
  followup_options = [];
  ui_ctaIntent = "none";
}

const validated = {
  answer,
  ui_ctaIntent,
  leadIntent,
  meta_shouldHandoff,
  meta_topic,
  meta_subtopic,
  followup_options
};

try {
  if (typeof $flow !== "undefined" && $flow.state && typeof $flow.state === "object") {
    $flow.state.leadIntent = validated.leadIntent;
    $flow.state.meta_topic = validated.meta_topic;
    $flow.state.meta_subtopic = validated.meta_subtopic;
    $flow.state.message_count = Number($flow.state.message_count ?? 0) + 1;
    $flow.state.covered_subtopics = JSON.stringify(covered_subtopics);

    // Мягкий антифлуд
    if ($flow.state.message_count > 15) {
      validated.meta_shouldHandoff = true;
      validated.ui_ctaIntent = "none";
      validated.followup_options = [];
      validated.answer = "Чтобы не тратить ваше время, передам диалог администратору — он поможет быстрее и точнее.";
    }
  }
} catch (e) {}

return JSON.stringify(validated);
