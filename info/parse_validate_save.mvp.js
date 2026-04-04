const ALLOW_LEAD = ["none", "awaiting_name", "awaiting_phone", "complete"];
const ALLOW_CTA = ["booking", "none"];
const ALLOW_TOPIC = ["implantation", "prosthetics", "orthodontics", "clinic", "doctors", "other"];
const ALLOW_TURN = ["new_question", "continuation", "confirmation", "rejection", "unclear"];
const ALLOW_TONE = ["default", "supportive"];

// <cta_map_auto BEGIN>
const CTA_MAP = {
  "_meta": {
    "priority": "Сначала совпадение topic + subtopic, затем default для topic, затем глобальный default.",
    "subtopic": "Сравнение без учёта регистра."
  },
  "default": "Записаться на консультацию",
  "by_topic": {
    "implantation": {
      "default": "Подобрать дату визита",
      "by_subtopic": {
        "implants": "Получить план лечения бесплатно",
        "cost": "Получить план лечения бесплатно"
      }
    }
  }
};
// <cta_map_auto END>

function resolveCtaLabel(meta_topic, meta_subtopic) {
  const topic = String(meta_topic || "");
  const sub = String(meta_subtopic || "").trim().toLowerCase();
  const map = CTA_MAP && typeof CTA_MAP === "object" ? CTA_MAP : {};
  const fall = String(map.default || "Записаться на консультацию").trim() || "Записаться на консультацию";
  const t = map.by_topic && typeof map.by_topic === "object" ? map.by_topic[topic] : null;
  if (!t || typeof t !== "object") return fall;
  if (sub && t.by_subtopic && typeof t.by_subtopic === "object") {
    const exact = t.by_subtopic[sub];
    if (typeof exact === "string" && exact.trim()) return exact.trim();
  }
  if (typeof t.default === "string" && t.default.trim()) return t.default.trim();
  return fall;
}

// <video_map_auto BEGIN>
const VIDEO_MAP = {
  "_meta": {
    "description": "Видео в ответе: совпадение meta_topic + meta_subtopic (регистр subtopic не важен). Пустой url — слот не используется. Заполняется только при leadIntent = none; перезаписывает video из JSON модели, если для пары topic+subtopic есть запись здесь."
  },
  "by_topic": {
    "implantation": {
      "by_subtopic": {
        "pain": {
          "url": "https://s3.twcstorage.ru/denisart-cloud/cesi_khan.mp4",
          "title": "Видео ЦЭСИ"
        },
        "osseointegration": {
          "url": "https://s3.twcstorage.ru/denisart-cloud/cesi_khan.mp4",
          "title": "Видео ЦЭСИ"
        }
      }
    }
  }
};
// <video_map_auto END>

function resolveVideoForTopic(meta_topic, meta_subtopic) {
  const topic = String(meta_topic || "");
  const sub = String(meta_subtopic || "").trim().toLowerCase();
  const root = VIDEO_MAP && VIDEO_MAP.by_topic && typeof VIDEO_MAP.by_topic === "object"
    ? VIDEO_MAP.by_topic[topic]
    : null;
  if (!root || typeof root !== "object" || !root.by_subtopic || typeof root.by_subtopic !== "object") {
    return null;
  }
  const slot = root.by_subtopic[sub];
  if (!slot || typeof slot !== "object") return null;
  const url = String(slot.url || "").trim();
  if (!url) return null;
  return { title: String(slot.title || "").trim(), url };
}

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

function extractSubtopicButtonsFromDocs(docs, topic, subtopic, maxCount) {
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

  const max = typeof maxCount === "number" && maxCount > 0 ? maxCount : 4;
  return [...new Set(headings)].slice(0, max);
}

function normText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[.,!?;:()"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normBool(v) {
  if (v === true || v === 1) return true;
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    return t === "true" || t === "1";
  }
  return false;
}

/** Flowise Structured Output часто даёт только String — тогда JSON одной строкой. */
function normalizeConversionRaw(v) {
  if (v && typeof v === "object" && !Array.isArray(v)) return v;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return {};
    try {
      const j = JSON.parse(t);
      if (j && typeof j === "object" && !Array.isArray(j)) return j;
    } catch (e) {}
  }
  return {};
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

const userLine = String($flow?.input ?? "").trim();
const prevTopicState = String($flow?.state?.meta_topic ?? "").trim();
const prevSubtopicState = String($flow?.state?.meta_subtopic ?? "").trim();

const SIT_TRIG_NORM = normText("Рассказать о своей ситуации");
const SIT_BACK_NORM = normText("Назад к диалогу");
const SIT_INVITE =
  "Хорошо. Коротко опишите вашу ситуацию — что сейчас беспокоит или в чём сомневаетесь. Мы передадим это администратору перед тем, как связаться с вами.";

const situationPendingAtStart = normBool($flow?.state?.situation_pending);

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

/** Что вернула модель в JSON до нормализации Parse (лог ниже). */
const toneFromModel = String(raw.tone ?? "").trim();

// Fallback: если модель не вернула subtopic, достаем из last_context metadata
if (!meta_subtopic) {
  const ctx = String($flow?.state?.last_context ?? "");
  const m = ctx.match(/"subtopic"\s*:\s*"([^"]+)"/);
  if (m && m[1]) meta_subtopic = m[1].trim();
}

let nextSituationPending = normBool($flow?.state?.situation_pending);
let nextSituationOfferShown = String($flow?.state?.situation_offer_shown ?? "").trim();
if (prevTopicState !== meta_topic || prevSubtopicState !== meta_subtopic) {
  nextSituationOfferShown = "";
}
/** undefined — не трогать state.situation_note; строка — записать (в т.ч. "" при «Назад») */
let situationNoteWrite = undefined;
let situationHandled = false;

// turn_type + should_retrieve (v1: один основной LLM)
let turn_type = String(raw.turn_type ?? raw.turnType ?? "new_question").trim();
if (!ALLOW_TURN.includes(turn_type)) turn_type = "new_question";

let should_retrieve = Boolean(raw.should_retrieve);
// reasonable default: retrieve on new questions unless lead disables it
if (raw.should_retrieve === undefined || raw.should_retrieve === null) {
  should_retrieve = turn_type === "new_question";
}

// conversion payload (video only; no downloads)
const convRaw = normalizeConversionRaw(raw.conversion);
const convVideo = (convRaw.video && typeof convRaw.video === "object") ? convRaw.video : {};
const conversion = {
  video: {
    title: String(convVideo.title ?? "").trim(),
    url: String(convVideo.url ?? "").trim()
  }
};

// Сценарий «ситуация»: ход после приглашения (см. bot_behaviors_from_logic.v1.md §4.2)
if (normBool($flow?.state?.situation_pending) && leadIntent === "none") {
  const u = normText(userLine);
  if (u === SIT_BACK_NORM) {
    situationHandled = true;
    nextSituationPending = false;
    situationNoteWrite = "";
    answer = "Хорошо, продолжаем.";
    should_retrieve = true;
    turn_type = "continuation";
    conversion.video = { title: "", url: "" };
    meta_shouldHandoff = false;
  } else if (userLine.length > 0 && normText(userLine) !== SIT_TRIG_NORM) {
    situationHandled = true;
    nextSituationPending = false;
    situationNoteWrite = userLine.slice(0, 800);
    answer = "Спасибо, мы передадим это администратору. Как к вам обращаться?";
    leadIntent = "awaiting_name";
    ui_ctaIntent = "none";
    should_retrieve = false;
    turn_type = "continuation";
    conversion.video = { title: "", url: "" };
    meta_shouldHandoff = false;
  }
}

let followup_options = [];
if (!situationHandled) {
  followup_options = toArrayFollowups(raw.followup_options);
  followup_options = [...new Set(followup_options)].slice(0, 2);

  // Fallback: если LLM не вернула кнопки, извлекаем подтемы из текущего doc
  if (leadIntent === "none" && followup_options.length === 0) {
    const docs = parseDocsFromContext($flow?.state?.last_context);
    if (docs.length > 0) {
      const fromDocs = extractSubtopicButtonsFromDocs(docs, meta_topic, meta_subtopic);
      if (fromDocs.length > 0) {
        followup_options = extractSubtopicButtonsFromDocs(docs, meta_topic, meta_subtopic, 30).slice(0, 2);
      }
    }
  }
}

// Только реальные ### из текущего документа — убираем выдуманные followup от LLM
if (!situationHandled && leadIntent === "none") {
  const docsW = parseDocsFromContext($flow?.state?.last_context);
  const allowedLabels = extractSubtopicButtonsFromDocs(docsW, meta_topic, meta_subtopic, 30);
  if (allowedLabels.length > 0) {
    const allowedNorm = new Set(allowedLabels.map(normText));
    followup_options = followup_options.filter((opt) => allowedNorm.has(normText(opt)));
    if (followup_options.length === 0) {
      followup_options = allowedLabels.slice(0, 2);
    }
  }
}

// Память уже раскрытых подтем: сброс при смене темы/подтемы
let covered_subtopics = readCoveredFromState($flow?.state?.covered_subtopics);
if (prevTopicState !== meta_topic || prevSubtopicState !== meta_subtopic) {
  covered_subtopics = [];
}
covered_subtopics = [...new Set(covered_subtopics)].slice(0, 20);

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

// Триггер «Рассказать о своей ситуации» (один раз на пару topic+subtopic в state)
if (!situationHandled && leadIntent === "none" && meta_topic === "implantation") {
  if (normText(userLine) === SIT_TRIG_NORM) {
    const offerKey = `${meta_topic}__${meta_subtopic || "_"}`;
    if (nextSituationOfferShown !== offerKey) {
      answer = SIT_INVITE;
      followup_options = ["Назад к диалогу"];
      ui_ctaIntent = "none";
      conversion.video = { title: "", url: "" };
      should_retrieve = false;
      turn_type = "continuation";
      nextSituationPending = true;
      nextSituationOfferShown = offerKey;
      meta_shouldHandoff = false;
    }
  }
}

// Тон: финальное значение — по meta_topic (модель может ошибиться; сравнение с tone_llm — в логе)
let tone = meta_topic === "implantation" ? "supportive" : "default";
if (!ALLOW_TONE.includes(tone)) tone = "default";
try {
  console.log(
    JSON.stringify({
      tag: "parse_mvp_tone",
      tone_llm: toneFromModel,
      tone_final: tone,
      meta_topic
    })
  );
} catch (e) {}

// Текст кнопки записи — только из карты Parse (модель не придумывает)
let cta_label = resolveCtaLabel(meta_topic, meta_subtopic);

// Видео по карте VIDEO_MAP: не дублируем «вторую конверсию», если уже ≥2 followup-кнопки
if (followup_options.length >= 2) {
  conversion.video = { title: "", url: "" };
} else if (leadIntent === "none") {
  const v = resolveVideoForTopic(meta_topic, meta_subtopic);
  if (v) conversion.video = v;
}

// Детерминированный запрет retrieval (2026 компромисс):
// - если активна воронка записи — retrieval не делаем вообще, независимо от мнения LLM
if (leadIntent !== "none") {
  should_retrieve = false;
}

const offerKeySit = `${meta_topic}__${meta_subtopic || "_"}`;
const situationOfferInState = String($flow?.state?.situation_offer_shown ?? "").trim();
const onlyBackFollowup =
  followup_options.length === 1 && normText(followup_options[0]) === SIT_BACK_NORM;

let show_situation_button =
  leadIntent === "none" &&
  meta_topic === "implantation" &&
  !situationPendingAtStart &&
  !situationHandled &&
  followup_options.length <= 1 &&
  !onlyBackFollowup &&
  situationOfferInState !== offerKeySit &&
  !nextSituationPending;

// Макс. 3 кнопки вместе с CTA: видео из карты и «ситуация» не в одном ответе (иначе 1 followup + оба + CTA = 4)
if (show_situation_button && String(conversion.video.url || "").trim()) {
  show_situation_button = false;
}

if (nextSituationPending) meta_shouldHandoff = false;

const validated = {
  answer,
  ui_ctaIntent,
  leadIntent,
  meta_shouldHandoff,
  meta_topic,
  meta_subtopic,
  followup_options,
  turn_type,
  should_retrieve,
  conversion,
  tone,
  cta_label,
  show_situation_button,
  situation_pending: nextSituationPending
};

try {
  if (typeof $flow !== "undefined" && $flow.state && typeof $flow.state === "object") {
    $flow.state.leadIntent = validated.leadIntent;
    $flow.state.meta_topic = validated.meta_topic;
    $flow.state.meta_subtopic = validated.meta_subtopic;
    $flow.state.should_retrieve = String(validated.should_retrieve);
    $flow.state.message_count = Number($flow.state.message_count ?? 0) + 1;
    $flow.state.covered_subtopics = JSON.stringify(covered_subtopics);
    $flow.state.situation_pending = nextSituationPending ? "true" : "false";
    $flow.state.situation_offer_shown = nextSituationOfferShown;
    if (situationNoteWrite !== undefined) {
      $flow.state.situation_note = situationNoteWrite;
    }

    // Мягкий антифлуд
    if ($flow.state.message_count > 15) {
      validated.meta_shouldHandoff = true;
      validated.ui_ctaIntent = "none";
      validated.followup_options = [];
      validated.show_situation_button = false;
      validated.situation_pending = false;
      validated.answer = "Чтобы не тратить ваше время, передам диалог администратору — он поможет быстрее и точнее.";
    }
  }
} catch (e) {}

return JSON.stringify(validated);
