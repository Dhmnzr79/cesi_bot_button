/**
 * 1) Вставляет config/cta_map.json и config/video_map.json в parse_validate_save.mvp.js
 *    (маркеры cta_map_auto / video_map_auto).
 * 2) Собирает info/load_conversion_map.mvp.js для ноды Load Conversion Map в Flowise.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function resolveCtaLabel(ctaMap, topic, subtopic) {
  const t = String(topic || "");
  const s = String(subtopic || "").trim().toLowerCase();
  const fall =
    String(ctaMap.default ?? "Записаться на консультацию").trim() ||
    "Записаться на консультацию";
  const bt = ctaMap.by_topic && ctaMap.by_topic[t];
  if (!bt || typeof bt !== "object") return fall;
  if (s && bt.by_subtopic && typeof bt.by_subtopic[s] === "string" && bt.by_subtopic[s].trim()) {
    return bt.by_subtopic[s].trim();
  }
  if (typeof bt.default === "string" && bt.default.trim()) return bt.default.trim();
  return fall;
}

function getVideoSlot(vm, topic, subtopic) {
  const slot =
    vm &&
    vm.by_topic &&
    vm.by_topic[topic] &&
    vm.by_topic[topic].by_subtopic &&
    vm.by_topic[topic].by_subtopic[subtopic];
  if (!slot || typeof slot !== "object") return { title: "", url: "" };
  const url = String(slot.url ?? "").trim();
  const title = String(slot.title ?? "").trim();
  if (!url) return { title: "", url: "" };
  return { title, url };
}

function buildUxLayer(ctaMap, videoMap) {
  const pairs = new Map();
  function addPair(topic, sub) {
    if (!topic || !sub) return;
    pairs.set(`${topic}__${sub}`, { topic, subtopic: sub });
  }
  for (const [topic, t] of Object.entries(videoMap.by_topic || {})) {
    if (!t || !t.by_subtopic) continue;
    for (const sub of Object.keys(t.by_subtopic)) addPair(topic, sub);
  }
  for (const [topic, t] of Object.entries(ctaMap.by_topic || {})) {
    if (!t || !t.by_subtopic) continue;
    for (const sub of Object.keys(t.by_subtopic)) addPair(topic, sub);
  }
  const UX_LAYER = {};
  UX_LAYER.default = {
    cta_label: resolveCtaLabel(ctaMap, "other", ""),
    video: { title: "", url: "" }
  };
  for (const [, { topic, subtopic }] of pairs) {
    const key = `${topic}__${subtopic}`;
    UX_LAYER[key] = {
      cta_label: resolveCtaLabel(ctaMap, topic, subtopic),
      video: getVideoSlot(videoMap, topic, subtopic)
    };
  }
  return UX_LAYER;
}

function buildLoadConversionMap(projectRoot) {
  const ctaPath = path.join(projectRoot, "config", "cta_map.json");
  const vidPath = path.join(projectRoot, "config", "video_map.json");
  const outPath = path.join(projectRoot, "info", "load_conversion_map.mvp.js");
  const ctaMap = JSON.parse(fs.readFileSync(ctaPath, "utf8"));
  const videoMap = JSON.parse(fs.readFileSync(vidPath, "utf8"));
  const UX_LAYER = buildUxLayer(ctaMap, videoMap);
  const embedded = JSON.stringify(UX_LAYER, null, 2);

  const body = `/**
 * Load Conversion Map — тело ноды Custom Function в Flowise (например customFunctionAgentflow_1).
 * Подставляется в промпт как {{customFunctionAgentflow_1}}.
 *
 * Автогенерация из config/cta_map.json + config/video_map.json — НЕ править вручную.
 * Команда: node scripts/sync-maps.js
 *
 * Совпадает с логикой Parse (cta_label, conversion.video). Модель не должна подменять URL и подпись кнопки.
 */
const UX_LAYER = ${embedded};

function pickKeyFromContext(ctx) {
  const s = String(ctx || "");
  let topic = "";
  let subtopic = "";
  let filename = "";
  const mt = s.match(/"topic"\\s*:\\s*"([^"]+)"/);
  if (mt) topic = (mt[1] || "").trim();
  const ms = s.match(/"subtopic"\\s*:\\s*"([^"]+)"/);
  if (ms) subtopic = (ms[1] || "").trim();
  const mf =
    s.match(/"source_filename"\\s*:\\s*"([^"]+)"/) || s.match(/"filename"\\s*:\\s*"([^"]+)"/);
  if (mf) filename = (mf[1] || "").trim();

  if (topic && subtopic) {
    const k = topic + "__" + subtopic;
    if (Object.prototype.hasOwnProperty.call(UX_LAYER, k)) return k;
  }
  if (filename) {
    const base = filename.replace(/\\.md$/i, "");
    if (Object.prototype.hasOwnProperty.call(UX_LAYER, base)) return base;
    const parts = base.split("__");
    if (parts.length >= 3) {
      const k = parts[0] + "__" + parts[parts.length - 1];
      if (Object.prototype.hasOwnProperty.call(UX_LAYER, k)) return k;
    }
  }
  return "default";
}

const key = pickKeyFromContext(typeof $flow !== "undefined" && $flow.state ? $flow.state.last_context : "");
const pack = UX_LAYER[key] != null ? UX_LAYER[key] : UX_LAYER.default;
return JSON.stringify({
  cta_label: pack.cta_label,
  video: pack.video,
  _ux_key: key,
  _note:
    "Совпадает с Parse (cta_map + video_map). Не выдумывай другой URL или текст кнопки. Поле conversion.video в JSON ответа модели может быть пустым — финально подставляет Parse."
});
`;

  fs.writeFileSync(outPath, body, "utf8");
  console.log("OK:", path.relative(projectRoot, outPath));
}
const parsePath = path.join(root, "info", "parse_validate_save.mvp.js");

function patchBlock(js, beginMarker, endMarker, constName, jsonPath) {
  const raw = fs.readFileSync(jsonPath, "utf8");
  JSON.parse(raw);
  const i0 = js.indexOf(beginMarker);
  const i1 = js.indexOf(endMarker);
  if (i0 === -1 || i1 === -1 || i1 <= i0) {
    console.error("Маркеры не найдены:", beginMarker, endMarker);
    process.exit(1);
  }
  const before = js.slice(0, i0 + beginMarker.length);
  const after = js.slice(i1);
  const body = `\nconst ${constName} = ${raw.trim()};\n`;
  return before + body + after;
}

let js = fs.readFileSync(parsePath, "utf8");

js = patchBlock(
  js,
  "// <cta_map_auto BEGIN>",
  "// <cta_map_auto END>",
  "CTA_MAP",
  path.join(root, "config", "cta_map.json")
);

js = patchBlock(
  js,
  "// <video_map_auto BEGIN>",
  "// <video_map_auto END>",
  "VIDEO_MAP",
  path.join(root, "config", "video_map.json")
);

fs.writeFileSync(parsePath, js, "utf8");
console.log("OK: CTA_MAP + VIDEO_MAP обновлены в parse_validate_save.mvp.js");

buildLoadConversionMap(root);
