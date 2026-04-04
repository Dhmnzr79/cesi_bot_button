# Карты UX без правки логики Parse вручную

Тексты **CTA-кнопки** и **привязка видео** к `meta_topic` / `meta_subtopic` задаются JSON в `config/`, затем встраиваются в ноду **Parse** в Flowise.

## Файлы конфигурации

| Файл | Назначение |
|------|------------|
| [config/cta_map.json](../config/cta_map.json) | Подпись кнопки записи → поле `cta_label`. |
| [config/video_map.json](../config/video_map.json) | `url` + `title` ролика по паре topic + subtopic → `conversion.video`. |
| [info/parse_validate_save.mvp.js](parse_validate_save.mvp.js) | Встроенные копии `CTA_MAP` и `VIDEO_MAP` (между маркерами `*_auto`). |
| [info/load_conversion_map.mvp.js](load_conversion_map.mvp.js) | Автогенерация для ноды **Load Conversion Map** в Flowise (`{{customFunctionAgentflow_1}}`); те же CTA/видео, что и в Parse. |

## CTA (`cta_map.json`)

- **`default`** — для любого topic без своего блока в `by_topic`.
- **`by_topic[topic].default`** — для темы, если subtopic не в `by_subtopic`.
- **`by_topic[topic].by_subtopic[subtopic]`** — точное совпадение (регистр subtopic в коде не важен).

Поле **`_meta`** только для людей.

## Видео (`video_map.json`)

- Только **`by_topic`** → **`by_subtopic`** → **`{ "url", "title" }`**.
- Пустой **`url`** — слот отключён.
- Подстановка только при **`leadIntent === "none"`**. Если для пары есть запись в карте, она **перезаписывает** `conversion.video` из ответа модели.

## После любых правок JSON

```bash
node scripts/sync-maps.js
```

Обновятся:
- блоки `CTA_MAP` и `VIDEO_MAP` в `parse_validate_save.mvp.js` — скопируйте **весь** скрипт в ноду **Parse** в Flowise;
- файл **`load_conversion_map.mvp.js`** — скопируйте **целиком** в ноду **Load Conversion Map** в Flowise.

Команда `node scripts/sync-cta-map.js` делает то же самое (вызывает `sync-maps.js`).

Без скрипта — вручную вставьте объекты между `// <cta_map_auto BEGIN/END>` и `// <video_map_auto BEGIN/END>`.
