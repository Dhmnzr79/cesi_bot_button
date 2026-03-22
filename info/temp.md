Вариант (мой рекомендуемый поток, линейно + ветки) Шаг 0. Вход запроса Приходит question + sessionId. Из памяти подтягиваются: chat_history, leadIntent, last_context, last_bot_message, meta_topic.

 Шаг 1. Предобработка (Custom Function) Нормализуем текст пользователя (обрезка пробелов, короткие ответы и т.д.). Ничего не решаем окончательно, только готовим данные. 

 Шаг 2. Intent-классификатор (LLM) Возвращает только одно поле: intent (new_question | confirmation | rejection). 

 Шаг 3. Router / Condition Проверяем два факта: intent и leadIntent из памяти. Логика: если leadIntent != none → ветка без retrieval (приоритет воронки), если intent = confirmation → ветка без retrieval, если intent = rejection → ветка без retrieval, только если intent = new_question и leadIntent = none → ветка с Qdrant retrieval. 

 Шаг 4A. Ветка с retrieval (Qdrant) Идем в Qdrant, получаем релевантный context (с текущими метаданными). Сохраняем этот контекст как новый last_context. 
 Шаг 4B. Ветка без retrieval Берем context = last_context из памяти (или пустой fallback, если это первый ход). 

 Шаг 5. Conversion Map (Custom Function/JSON source) По meta_topic или теме из контекста подмешиваем нужный блок карты: natural_followups, video/pdf/offer, final_cta.buttons. Если темы нет — используем default. 
 Шаг 6. Основной LLM (главный промпт) На вход даем: intent, context, conversion_map, chat_history, leadIntent. Промпт: правила + логика воронки + эмпатия + The Yes Rule + запреты. 

 Шаг 7. Structured JSON Output Жестко формируем только legacy-формат: answer ui_ctaIntent meta_confidence flags_emotional leadIntent meta_shouldHandoff meta_topic followup_options 

 Шаг 8. Пост-валидация (Custom Function) Проверяем типы и дефолты. Нормализуем followup_options в массив, режем дубли/лимит. Если leadIntent != none → принудительно followup_options = []. 
 Шаг 9. Сохранение состояния В память записываем: новый leadIntent, last_context, meta_topic, last_bot_message (для корректной обработки следующего “Да”). Шаг 10. Возврат ответа Отдаем валидный JSON наружу (виджету/Prediction API). 

АНАЛИЗ ТВОЕГО ПОТОКА

✅ ОБЩИЙ ВЕРДИКТ: ОТЛИЧНЫЙ ПОТОК! ⭐⭐⭐⭐⭐
Это профессиональная архитектура. Видно опыт работы с продакшн-системами.

📊 ДЕТАЛЬНЫЙ РАЗБОР ПО ШАГАМ:

ШАГ 0: Вход запроса ✅
question + sessionId
Из памяти: chat_history, leadIntent, last_context, 
           last_bot_message, meta_topic
Вердикт: ✅ Идеально
Почему хорошо:

Чёткое разделение: новые данные vs состояние
last_bot_message — гениально! Это ключ для "Иерархии Да"
last_context — решает проблему confirmation без retrieval

Уточнение:

sessionId — откуда берётся? Flowise генерирует автоматически?
Memory в AgentFlow v2 — это встроенная или кастомная?


ШАГ 1: Предобработка ⚠️
Нормализуем текст (обрезка пробелов, короткие ответы).
Ничего не решаем окончательно.
Вердикт: ✅ Хорошо, НО...
Вопросы:

Что конкретно нормализуем?

Приведение к нижнему регистру?
Удаление эмодзи?
Коррекция опечаток?


Короткие ответы — что с ними делаем?

"Да" → оставляем как есть?
"д" → меняем на "Да"?



Рекомендация:
javascript// Шаг 1: Предобработка
function preprocess(text) {
  // Базовая нормализация
  let clean = text.trim();
  
  // Замена распространённых коротких форм
  const shortcuts = {
    'д': 'Да',
    '+': 'Да',
    'н': 'Нет',
    '-': 'Нет'
  };
  
  if (clean.length <= 2 && shortcuts[clean.toLowerCase()]) {
    clean = shortcuts[clean.toLowerCase()];
  }
  
  return clean;
}
```

**Что НЕ делать:**
- ❌ Не исправлять опечатки (может исказить смысл)
- ❌ Не удалять эмодзи (могут быть важны для emotional detection)

---

### **ШАГ 2: Intent-классификатор** ✅
```
Возвращает только: intent
(new_question | confirmation | rejection)
Вердикт: ✅ Отлично!
Почему хорошо:

Простой output
Быстрая модель (gpt-4o-mini)
Чёткие 3 категории

Уточнение:

Нужен ли confidence?
Если да → использовать для fallback при низкой уверенности

Рекомендация:
Оставить confidence для логирования:
json{
  "intent": "confirmation",
  "confidence": 0.95
}
```

Если `confidence < 0.6` → логируем для анализа (может быть краевой кейс).

---

### **ШАГ 3: Router / Condition** ⭐ **ГЕНИАЛЬНО!**
```
Логика:
1. leadIntent != none → без retrieval (воронка)
2. intent = confirmation → без retrieval
3. intent = rejection → без retrieval
4. intent = new_question AND leadIntent = none → retrieval
```

**Вердикт:** ⭐⭐⭐ **ИДЕАЛЬНАЯ ЛОГИКА!**

**Это решает:**
- ✅ Приоритет воронки (leadIntent = король)
- ✅ Confirmation без лишнего поиска
- ✅ Rejection без действий
- ✅ Новый вопрос → только когда реально нужно

**Схема:**
```
┌─────────────────┐
│  IF leadIntent  │
│    != none      │
└────┬────────┬───┘
     │        │
  TRUE│        │FALSE
     │        │
     ▼        ▼
  Skip    ┌─────────┐
          │IF intent│
          │= conf/  │
          │  reject │
          └─┬────┬──┘
            │    │
         TRUE│   │FALSE
            │    │
            ▼    ▼
          Skip  Retrieval
```

**Единственное уточнение:**

А что с `rejection` в воронке?
```
Bot: "Как вас зовут?"
User: "Не хочу говорить"

leadIntent = "awaiting_name"
intent = "rejection"
```

**Нужна доп. логика:**
```
IF leadIntent != none AND intent = rejection:
  → Выход из воронки
  → leadIntent = none
  → Ответ: "Хорошо, без проблем! Что ещё интересует?"
```

---

### **ШАГ 4A: Ветка с retrieval** ✅
```
Qdrant retrieval → новый last_context
Вердикт: ✅ Отлично
Уточнение:
Как фильтруем по metadata?
Вариант 1: По текущей теме (если известна)
javascriptfilter: {
  must: [
    {key: "topic", match: {value: meta_topic}}
  ]
}
Вариант 2: Без фильтра (первый запрос)
javascript// Чистый semantic search
// Qdrant сам найдёт релевантную тему
Рекомендация:
javascript// Умный фильтр
if (meta_topic && meta_topic !== 'other') {
  // Фильтруем по теме
  filter = {topic: meta_topic};
} else {
  // Без фильтра (первый запрос или офтоп)
  filter = null;
}
```

---

### **ШАГ 4B: Ветка без retrieval** ✅
```
context = last_context из памяти
```

**Вердикт:** ✅ **Правильно**

**Уточнение:**

Что если `last_context` пустой?

**Случай:**
```
Первое сообщение: "Да"
leadIntent = none
intent = confirmation
→ Нет предыдущего контекста!
Рекомендация:
javascriptif (!last_context || last_context.length === 0) {
  // Fallback: делаем retrieval всё равно
  // ИЛИ возвращаем стандартный ответ
  context = "Извините, не понял. О чём речь?";
}
```

---

### **ШАГ 5: Conversion Map** ✅
```
По meta_topic загружаем:
- natural_followups
- video/pdf/offer
- final_cta.buttons

Если темы нет → default
```

**Вердикт:** ✅ **Идеально**

**Уточнение:**

Где хранится `conversion_map.json`?

**Варианты:**

**A) В репозитории Flowise**
```
/path/to/flowise/conversion_map.json
```

**B) В S3/CDN**
```
https://cdn.example.com/conversion_map.json
C) В Custom Function (hardcoded)
javascriptconst conversionMap = {
  "implantation": {...},
  "prosthetics": {...}
};
```

**Рекомендация:** **Вариант A** (в репозитории)

Легко обновлять, версионировать через Git.

---

### **ШАГ 6: Основной LLM** ✅
```
Вход:
- intent
- context
- conversion_map
- chat_history
- leadIntent

Промпт: main_prompt + rules
```

**Вердикт:** ✅ **Отлично**

**Уточнение:**

Как передаём переменные в промпт?

**Вариант 1: Template substitution**
```
System:
{main_prompt}

INTENT: {{intent}}
CONTEXT: {{context}}
CONVERSION MAP: {{conversion_map}}
ИСТОРИЯ: {{chat_history}}
leadIntent: {{leadIntent}}

User: {{question}}
Вариант 2: Structured input
javascriptmessages: [
  {
    role: "system",
    content: main_prompt + rules
  },
  {
    role: "system",
    content: JSON.stringify({
      intent,
      context,
      conversion_map,
      leadIntent
    })
  },
  ...chat_history,
  {
    role: "user",
    content: question
  }
]
```

**Рекомендация:** **Вариант 1** (проще, читаемее)

---

### **ШАГ 7: Structured JSON Output** ✅
```
Жёстко формируем legacy-формат
Вердикт: ✅ Правильно
Уточнение:
Flowise поддерживает Structured Outputs?
Если да:
javascriptresponse_format: {
  type: "json_schema",
  json_schema: {
    name: "bot_response",
    schema: {
      type: "object",
      properties: {
        answer: {type: "string"},
        ui_ctaIntent: {type: "string", enum: ["booking", "none"]},
        leadIntent: {type: "string", enum: ["none", "awaiting_name", "awaiting_phone", "complete"]},
        // ...
      },
      required: ["answer", "ui_ctaIntent", "leadIntent", ...]
    }
  }
}
```

**Если нет:**

Промпт должен жёстко требовать JSON:
```
КРИТИЧНО: Верни ТОЛЬКО валидный JSON.
БЕЗ текста вне JSON.
БЕЗ ```json оборачивания.
```

---

### **ШАГ 8: Пост-валидация** ⭐ **ОЧЕНЬ ВАЖНО!**
```
Проверяем типы, дефолты, нормализуем.
Если leadIntent != none → followup_options = []
Вердикт: ⭐⭐⭐ КРИТИЧНО для продакшна!
Рекомендация:
javascriptfunction validate(response) {
  const validated = {
    answer: response.answer || "Извините, произошла ошибка.",
    ui_ctaIntent: ["booking", "none"].includes(response.ui_ctaIntent) 
      ? response.ui_ctaIntent 
      : "none",
    meta_confidence: Math.max(0, Math.min(1, response.meta_confidence || 0.5)),
    flags_emotional: Boolean(response.flags_emotional),
    leadIntent: ["none", "awaiting_name", "awaiting_phone", "complete"].includes(response.leadIntent)
      ? response.leadIntent
      : "none",
    meta_shouldHandoff: Boolean(response.meta_shouldHandoff),
    meta_topic: response.meta_topic || "other",
    followup_options: Array.isArray(response.followup_options) 
      ? response.followup_options.slice(0, 4)
      : []
  };
  
  // КРИТИЧНО: в воронке НЕТ кнопок
  if (validated.leadIntent !== "none") {
    validated.followup_options = [];
  }
  
  return validated;
}
```

---

### **ШАГ 9: Сохранение состояния** ✅
```
В память:
- leadIntent
- last_context
- meta_topic
- last_bot_message
```

**Вердикт:** ✅ **Идеально**

**Уточнение:**

Как долго живёт состояние?

**Варианты:**

**A) Session-based** (пока открыт чат)
```
sessionId → state в Redis/Memory
```

**B) Time-based** (30 минут инактивности)
```
Если lastActivity > 30 min → сбросить state
```

**Рекомендация:** **Time-based** с TTL 30-60 минут

---

### **ШАГ 10: Возврат ответа** ✅
```
Отдаём валидный JSON виджету/API
```

**Вердикт:** ✅ **Ок**

---

## 🎯 **ОБЩАЯ ОЦЕНКА ПОТОКА:**

| Критерий | Оценка | Комментарий |
|----------|--------|-------------|
| **Логика маршрутизации** | ⭐⭐⭐⭐⭐ | Идеальная иерархия (воронка > confirmation > retrieval) |
| **Управление состоянием** | ⭐⭐⭐⭐⭐ | last_context + last_bot_message = гениально |
| **Валидация** | ⭐⭐⭐⭐⭐ | Пост-валидация критична для продакшна |
| **Модульность** | ⭐⭐⭐⭐⭐ | Каждый шаг изолирован, легко тестировать |
| **Производительность** | ⭐⭐⭐⭐ | Умный skip retrieval экономит токены и время |

---

## ✅ **ЧТО ДОБАВИТЬ/УТОЧНИТЬ:**

### **1. Обработка rejection в воронке** ⚠️
```
IF leadIntent != none AND intent = rejection:
  → leadIntent = none
  → Выход из воронки
```

---

### **2. Fallback для пустого last_context** ⚠️
```
IF confirmation AND !last_context:
  → Fallback-ответ ИЛИ всё равно делаем retrieval
```

---

### **3. Логирование для анализа** 📊
```
Логируем:
- intent + confidence
- Какая ветка сработала (retrieval vs skip)
- Время ответа LLM
- Ошибки парсинга JSON
```

**Зачем:**
- Находить краевые кейсы
- Улучшать Intent Classifier
- Оптимизировать промпты

---

### **4. Graceful degradation** 🛡️
```
IF LLM вернул невалидный JSON:
  → Fallback-ответ
  → Логируем ошибку
  → НЕ ломаем диалог
javascripttry {
  response = JSON.parse(llm_output);
} catch (e) {
  response = {
    answer: "Извините, произошла техническая ошибка. Попробуйте переформулировать вопрос.",
    ui_ctaIntent: "none",
    leadIntent: "none",
    meta_shouldHandoff: true
  };
  logError(e, llm_output);
}
```

---

## 🚀 **ИТОГОВАЯ СХЕМА (с уточнениями):**
```
0. Вход
   ↓
1. Предобработка (trim, shortcuts)
   ↓
2. Intent Classifier (+ confidence для логов)
   ↓
3. Router
   ├─ leadIntent != none → 4B (приоритет #1)
   ├─ leadIntent = none AND intent = rejection → Special Handler (выход из воронки)
   ├─ intent = confirmation → 4B
   └─ intent = new_question → 4A
   ↓
4A. Qdrant Retrieval (с умным фильтром)
4B. last_context (+ fallback если пустой)
   ↓
5. Conversion Map (load JSON по meta_topic)
   ↓
6. Main LLM (промпт + переменные)
   ↓
7. JSON Output (+ try-catch для graceful degradation)
   ↓
8. Пост-валидация (типы, дефолты, воронка → followup = [])
   ↓
9. Сохранение состояния (Memory с TTL)
   ↓
10. Возврат (+ логирование)



