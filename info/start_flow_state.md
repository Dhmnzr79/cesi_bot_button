# Start — Flow State (`$flow.state`) AgentFlow V2

По документации Flowise: **все ключи**, которые будут читаться или обновляться в потоке, нужно **объявить и задать начальные значения** в ноде **Start**. Операционные ноды могут только **обновлять** уже объявленные ключи, **новые создавать нельзя**.

Ниже — схема для бота ЦЭСИ (логика — `about.md`).

---

## Что заполнить в Start → Flow State

Каждая строка: **Key** = имя в `$flow.state`, **Value** = стартовое значение на **начало выполнения** (один запрос к Prediction). Между запросами часть полей будет перезаписываться в конце шага (см. колонку «Кто обновляет»).

| Key | Тип (логически) | Начальное значение (пример) | Зачем | Кто обновляет по графу |
|-----|------------------|-----------------------------|--------|-------------------------|
| `intent` | string | `new_question` | Результат Intent Classifier; роутер и IF | **Intent Classifier LLM** (Update Flow State) |
| `intent_confidence` | number | `0` | Опционально, если включили в JSON classifier | **Intent Classifier LLM** |
| `leadIntent` | string | `none` | Воронка записи: `none` \| `awaiting_name` \| `awaiting_phone` \| `complete` | **Parse + Validate + Save** (из ответа Main LLM), при необходимости **Preprocess** |
| `last_context` | string | `""` | Срез знаний после RAG для следующего хода | **Preprocess** / **Qdrant path** / **Parse + Save** (по вашей разбивке) |
| `meta_topic` | string | `other` | Тема для conversion map и промпта | **Parse + Save**, ранее мог уточняться в Preprocess |
| `flags_emotional` | boolean | `false` | Перенос эмоционального флага между ходами (если храните в state) | **Parse + Save** |
| `should_retrieve` | строка после ноды | в Start: `false` | После ноды: `"true"` / `"false"` — Qdrant только при `"true"` (готовый код: `preprocess_router_function.md`) | **Preprocess + Router** |

Минимальный набор для первых итераций графа: **`intent`**, **`leadIntent`**, **`last_context`**, **`should_retrieve`**. Остальное добавляйте, когда соответствующая нода начнёт писать в state.

---

## Согласование имён

- Ключи **в контракте JSON ответа пользователю** (`leadIntent`, `meta_topic`, …) и ключи **`$flow.state`** могут совпадать по имени — так проще в промптах: `{{ $flow.state.leadIntent }}`.
- То, что **не** сохраняете между запросами, можно не держать в state (считать в Custom Function внутри одного run).

---

## Примечание про `intent` до классификатора

Стартовое значение `intent` (например `new_question`) используется только до того, как отработает **Intent Classifier**; затем ключ перезаписывается. Важно, чтобы ключ **был объявлен**, иначе Update Flow State в классификаторе недоступен.

---

## Порядок настройки в UI

1. Открыть **Start** → **Flow State** / аналогичный блок.  
2. Добавить строки по таблице выше (начните с объявленных вами ключей, остальные — по мере подключения нод).  
3. В **Intent Classifier** → Update Flow State: **Key** `intent`, **Value** — выход structured output этой ноды (после объявления ключа в Start переменная должна быть в списке для обновления).
