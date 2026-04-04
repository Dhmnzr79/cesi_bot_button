/**
 * Load Conversion Map — тело ноды Custom Function в Flowise (например customFunctionAgentflow_1).
 * Подставляется в промпт как {{customFunctionAgentflow_1}}.
 *
 * Автогенерация из config/cta_map.json + config/video_map.json — НЕ править вручную.
 * Команда: node scripts/sync-maps.js
 *
 * Совпадает с логикой Parse (cta_label, conversion.video). Модель не должна подменять URL и подпись кнопки.
 */
const UX_LAYER = {
  "default": {
    "cta_label": "Записаться на консультацию",
    "video": {
      "title": "",
      "url": ""
    }
  },
  "implantation__pain": {
    "cta_label": "Подобрать дату визита",
    "video": {
      "title": "Видео ЦЭСИ",
      "url": "https://s3.twcstorage.ru/denisart-cloud/cesi_khan.mp4"
    }
  },
  "implantation__osseointegration": {
    "cta_label": "Подобрать дату визита",
    "video": {
      "title": "Видео ЦЭСИ",
      "url": "https://s3.twcstorage.ru/denisart-cloud/cesi_khan.mp4"
    }
  },
  "implantation__implants": {
    "cta_label": "Получить план лечения бесплатно",
    "video": {
      "title": "",
      "url": ""
    }
  },
  "implantation__cost": {
    "cta_label": "Получить план лечения бесплатно",
    "video": {
      "title": "",
      "url": ""
    }
  }
};

function pickKeyFromContext(ctx) {
  const s = String(ctx || "");
  let topic = "";
  let subtopic = "";
  let filename = "";
  const mt = s.match(/"topic"\s*:\s*"([^"]+)"/);
  if (mt) topic = (mt[1] || "").trim();
  const ms = s.match(/"subtopic"\s*:\s*"([^"]+)"/);
  if (ms) subtopic = (ms[1] || "").trim();
  const mf =
    s.match(/"source_filename"\s*:\s*"([^"]+)"/) || s.match(/"filename"\s*:\s*"([^"]+)"/);
  if (mf) filename = (mf[1] || "").trim();

  if (topic && subtopic) {
    const k = topic + "__" + subtopic;
    if (Object.prototype.hasOwnProperty.call(UX_LAYER, k)) return k;
  }
  if (filename) {
    const base = filename.replace(/\.md$/i, "");
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
