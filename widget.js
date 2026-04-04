// Виджет ЦЭСИ (только прод). Статика: /widget/ или /widget-test/ — префикс по src скрипта.
// avatar.png — рядом с widget.js.
console.log("WIDGET JS LOADED");
// Только здесь (синхронно): внутри DOMContentLoaded document.currentScript уже null → иначе всегда /widget/
const CESI_WIDGET_SCRIPT_SRC = (document.currentScript && document.currentScript.src) || "";

function ensureWidgetFont() {
  if (document.getElementById("cesi-widget-font")) return;
  const link = document.createElement("link");
  link.id = "cesi-widget-font";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap";
  document.head.appendChild(link);
}
ensureWidgetFont();

// Мобильная клавиатура: Layout Viewport должен сжиматься, чтобы шапка не уезжала вверх.
function ensureViewportForKeyboard() {
  const meta = document.querySelector('meta[name="viewport"]');
  const needed = "interactive-widget=resizes-content";
  if (meta) {
    if (!meta.getAttribute("content").includes("interactive-widget")) {
      meta.setAttribute("content", meta.getAttribute("content") + ", " + needed);
    }
  } else {
    const m = document.createElement("meta");
    m.name = "viewport";
    m.content = "width=device-width, initial-scale=1, " + needed;
    document.head.appendChild(m);
  }
}
ensureViewportForKeyboard();

document.addEventListener("DOMContentLoaded", () => {

(() => {
  const apiHost = "https://bot.jeeptour41.ru";
  const chatflowid = "6dcd1df0-45ae-41a1-ab4e-0080a1e8106a";

  const WIDGET_PUBLIC_PREFIX = /\/widget-test\//i.test(CESI_WIDGET_SCRIPT_SRC) ? "/widget-test" : "/widget";

  const WIDGET_STATIC_BASE = apiHost;
  const WIDGET_CSS_HREF = `${WIDGET_STATIC_BASE}${WIDGET_PUBLIC_PREFIX}/widget.css`;
  const AVATAR_PATH = `${WIDGET_PUBLIC_PREFIX}/avatar.png`;

  const PAGE_LOAD_TIME = Date.now();

  const ENDPOINT = `${apiHost}/api/v1/prediction/${chatflowid}`;

  // Session management: один sessionId на пользователя, TTL 24 часа
  const SESSION_STORAGE_KEY = "cesi_chat_session_id";
  const SESSION_TS_KEY = "cesi_chat_session_ts";
  const HISTORY_STORAGE_KEY = "cesi_chat_history";
  const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

  let sessionId = null;

  function getOrCreateSessionId() {
    if (sessionId) return sessionId;
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    const storedTs = parseInt(localStorage.getItem(SESSION_TS_KEY) || "0", 10);
    const now = Date.now();
    if (stored && storedTs && (now - storedTs) < SESSION_TTL_MS) {
      sessionId = stored;
      return sessionId;
    }
    clearSession();
    sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2);
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    localStorage.setItem(SESSION_TS_KEY, String(now));
    return sessionId;
  }

  function clearSession() {
    sessionId = null;
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(SESSION_TS_KEY);
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  }

  // ---- UI ----
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = WIDGET_CSS_HREF;
  document.head.appendChild(css);

  const AVATAR_URL = `${WIDGET_STATIC_BASE}${AVATAR_PATH}`;

  const btn = document.createElement("div");
  btn.id = "botWidgetBtn";
  btn.className = "botWidgetClosed";
  btn.setAttribute("aria-label", "Открыть чат с Анной");
  btn.innerHTML = `
    <div class="botWidgetClosed-inner">
      <div class="botWidgetClosed-avatarWrap">
        <img src="${AVATAR_URL}" alt="Анна" class="botWidgetClosed-avatar" onerror="this.style.display='none'">
        <span class="botWidgetClosed-status" aria-hidden="true"></span>
      </div>
      <div class="botWidgetClosed-main">
        <div class="botWidgetClosed-info">
          <span class="botWidgetClosed-name">Анна</span>
          <span class="botWidgetClosed-role">Онлайн консультант ЦЭСИ</span>
          <span class="botWidgetClosed-online botWidgetClosed-online--desktop">🟢 Онлайн 24/7</span>
        </div>
        <button type="button" class="botWidgetClosed-btn botWidgetClosed-btn--desktop" tabindex="-1">Задать вопрос</button>
        <span class="botWidgetClosed-hint botWidgetClosed-hint--desktop">Без звонков и спама</span>
      </div>
    </div>
  `;
  btn.setAttribute("role", "button");
  btn.tabIndex = 0;
  document.body.appendChild(btn);

  const box = document.createElement("div");
  box.id = "botWidgetBox";
  box.innerHTML = `
    <div id="botWidgetHeader">
      <div class="botWidgetHeader-info">
        <img src="${AVATAR_URL}" alt="" class="botWidgetHeader-avatar" onerror="this.style.display='none'">
        <div>
          <div class="botWidgetHeader-name">Анна</div>
          <div class="botWidgetHeader-role">Онлайн консультант ЦЭСИ</div>
          <div class="botWidgetHeader-online">🟢 Онлайн 24/7</div>
        </div>
      </div>
      <div class="botWidgetHeader-actions">
        <button id="botWidgetClearSession" class="botWidgetHeader-clearSession" type="button" title="Отладка: удалить сессию">Удалить сессию</button>
        <button id="botWidgetClose" class="botWidgetHeader-close" type="button" aria-label="Закрыть">×</button>
      </div>
    </div>
    <div id="botWidgetMsgs"></div>
    <div id="botWidgetForm">
      <div id="botWidgetFormInner">
        <textarea id="botWidgetInput" placeholder="Напишите сообщение..." rows="1"></textarea>
        <button id="botWidgetSend" type="button" aria-label="Отправить"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>
      </div>
    </div>
  `;
  document.body.appendChild(box);

  const msgs = box.querySelector("#botWidgetMsgs");
  const input = box.querySelector("#botWidgetInput");
  const send = box.querySelector("#botWidgetSend");
  const close = box.querySelector("#botWidgetClose");

  // Состояние виджета
  const widgetState = {
    currentStage: 'discovery',
    leadSent: false,
    leadName: null,
    messageCount: 0,
    dialogState: 'normal',
    leadIntent: 'none',
    hasInteracted: false,
    suggestedShownCount: 0,
    lastBotMessageTime: 0,
    lastParsedResponse: null,
    startMenuUsed: false,
    lastInputAt: 0,
    suggestedCheckInterval: null,
    scrollTriggerShown: false,
    chatOpenedOnce: false,
    // Подтемы, по которым пользователь уже кликал (чтобы не предлагать повторно)
    usedFollowups: [],
    // Глубина взаимодействия внутри темы (для усиления CTA по подтемам)
    interactionDepth: 0,
    // Количество ответов бота в текущей сессии (для глобального CTA по длине диалога)
    botAnswerCount: 0,
    // Текущая тема по сигналу модели (meta_topic)
    currentTopic: 'other',
    /** true после клика «Рассказать о своей ситуации» до «Назад» или успешного ввода текста (фолбэк, если Parse в Flowise не отдал situation_pending) */
    situationAwaitingNote: false
  };

  const LEAD_ENDPOINT = `${apiHost}/lead/send-lead`;
  const CHAT_LOG_ENDPOINT = `${apiHost}/lead/chat-log`;

  // Определение рабочего времени (Камчатка, UTC+12)
  function isWorkingHours() {
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const kamchatkaMs = utcMs + 12 * 60 * 60000;
    const k = new Date(kamchatkaMs);
    const day = k.getUTCDay(); // 0 воскресенье, 1 понедельник ...
    const hour = k.getUTCHours();

    // Воскресенье — выходной
    if (day === 0) return false;
    // Пн–Пт 8:00–20:00
    if (day >= 1 && day <= 5) {
      return hour >= 8 && hour < 20;
    }
    // Суббота 8:00–14:00
    if (day === 6) {
      return hour >= 8 && hour < 14;
    }
    return false;
  }

  async function sendLeadToBackend(name, phone, message) {
    console.log('LEAD ENDPOINT', LEAD_ENDPOINT);
    const res = await fetch(LEAD_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, message: message || undefined })
    });
    if (!res.ok) return false;
    let data = {};
    try {
      data = await res.json();
    } catch (e) {
      return true;
    }
    return data.success === true;
  }

  function setCompletedState() {
    input.placeholder = "Напишите сообщение...";
  }

  async function logMessage(role, text, extra) {
    try {
      const sid = getOrCreateSessionId();
      const payload = {
        sessionId: sid,
        role,
        text,
        meta: extra || null
      };
      await fetch(CHAT_LOG_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      // Логирование не должно ломать работу виджета
      console.warn("chat log error", e);
    }
  }

  function updateDialogState() {
    if (widgetState.leadSent) {
      widgetState.dialogState = 'blocked';
    } else if (widgetState.leadIntent === 'awaiting_name' || widgetState.leadIntent === 'awaiting_phone') {
      widgetState.dialogState = 'collecting_contact';
    } else {
      widgetState.dialogState = 'normal';
    }
  }

  function formatPhoneValue(value) {
    let d = (value || '').replace(/\D/g, '');
    if (d.startsWith('7') || d.startsWith('8')) d = d.slice(1);
    d = d.slice(0, 10);
    if (d.length === 0) return '';
    if (d.length <= 3) return '+7 (' + d;
    if (d.length <= 6) return '+7 (' + d.slice(0, 3) + ') ' + d.slice(3);
    return '+7 (' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6, 8) + '-' + d.slice(8, 10);
  }

  function extractPhoneDigits(value) {
    let d = (value || '').replace(/\D/g, '');
    if (d.startsWith('7') || d.startsWith('8')) d = d.slice(1);
    return d.slice(0, 10);
  }

  let phoneMaskHandler = null;

  function updatePhoneMaskUI() {
    const isPhone = widgetState.leadIntent === 'awaiting_phone' && !widgetState.leadSent;
    if (isPhone) {
      input.placeholder = '+7 (___) ___-__-__';
      input.setAttribute('inputmode', 'tel');
      input.setAttribute('autocomplete', 'tel');
      if (!phoneMaskHandler) {
        phoneMaskHandler = () => {
          if (widgetState.leadIntent !== 'awaiting_phone') return;
          const formatted = formatPhoneValue(input.value);
          input.value = formatted;
          input.setSelectionRange(formatted.length, formatted.length);
        };
        input.addEventListener('input', phoneMaskHandler);
      }
    } else {
      input.placeholder = 'Напишите сообщение...';
      input.removeAttribute('inputmode');
      input.removeAttribute('autocomplete');
      if (phoneMaskHandler) {
        input.removeEventListener('input', phoneMaskHandler);
        phoneMaskHandler = null;
      }
    }
  }

  // Scroll-триггер: плавное расширение карточки один раз за сессию
  function maybeShowScrollTeaser() {
    if (widgetState.scrollTriggerShown) return;
    if (widgetState.chatOpenedOnce) return;
    if (!btn || btn.style.display === "none") return;

    const now = Date.now();
    if (now - PAGE_LOAD_TIME < 15000) return;

    const doc = document.documentElement;
    const scrollTop = window.scrollY || window.pageYOffset || 0;
    const viewport = window.innerHeight || doc.clientHeight || 0;
    const fullHeight = doc.scrollHeight || 0;
    if (fullHeight <= 0) return;

    const scrolled = (scrollTop + viewport) / fullHeight;
    if (scrolled < 0.35) return;

    widgetState.scrollTriggerShown = true;

    const working = isWorkingHours();
    const line1 = working ? "Есть вопрос по лечению?" : "Клиника сейчас не работает.";
    const line2 = working ? "Могу коротко объяснить." : "Но я могу ответить на вопросы.";

    let collapseTimer = null;

    const collapseTeaser = () => {
      if (collapseTimer) {
        clearTimeout(collapseTimer);
        collapseTimer = null;
      }
      btn.classList.remove("botWidgetClosed--teaser");
      btn.removeEventListener("mouseenter", cancelCollapse);
      btn.removeEventListener("touchstart", cancelCollapse);
      if (closeBtn.parentNode) closeBtn.remove();
      setTimeout(() => {
        if (teaserEl.parentNode) teaserEl.remove();
      }, 300);
    };

    const cancelCollapse = () => {
      if (collapseTimer) {
        clearTimeout(collapseTimer);
        collapseTimer = null;
      }
    };

    const teaserEl = document.createElement("div");
    teaserEl.className = "botWidgetClosed-teaser";
    teaserEl.innerHTML = `
      <div class="botWidgetClosed-teaser-divider"></div>
      <div class="botWidgetClosed-teaser-body">
        <div class="botWidgetClosed-teaser-text">
          <span class="botWidgetClosed-teaser-line1">${line1}</span>
          <span class="botWidgetClosed-teaser-line2">${line2}</span>
        </div>
        <button type="button" class="botWidgetClosed-teaser-btn botWidgetClosed-teaser-btn--desktop">Открыть консультацию</button>
        <button type="button" class="botWidgetClosed-teaser-btn botWidgetClosed-teaser-btn--mobile">Задать вопрос</button>
      </div>
    `;

    const openChatFromTeaser = (e) => {
      e.stopPropagation();
      openChat();
    };

    teaserEl.querySelectorAll(".botWidgetClosed-teaser-btn").forEach((b) => {
      b.addEventListener("click", openChatFromTeaser);
    });

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "botWidgetClosed-teaser-close";
    closeBtn.setAttribute("aria-label", "Свернуть");
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      collapseTeaser();
    });

    btn.appendChild(teaserEl);
    btn.appendChild(closeBtn);

    btn.addEventListener("mouseenter", cancelCollapse);
    btn.addEventListener("touchstart", cancelCollapse);

    requestAnimationFrame(() => {
      btn.classList.add("botWidgetClosed--teaser");
    });

    collapseTimer = setTimeout(collapseTeaser, 8000);
  }

  // Стартовое меню: 3 пункта до первого сообщения
  const START_MENU_ITEMS = [
    'Я переживаю насчёт боли',
    'Посмотреть цены',
    'Как проходит консультация'
  ];

  function renderStartMenu() {
    if (widgetState.messageCount > 0 || widgetState.dialogState !== 'normal') return;
    const existing = msgs.querySelector('.botStartMenu');
    if (existing) return;

    const container = document.createElement('div');
    container.className = 'botStartMenu';
    START_MENU_ITEMS.forEach(text => {
      const btn = document.createElement('button');
      btn.className = 'botStartMenuItem';
      btn.textContent = text;
      btn.onclick = () => {
        widgetState.startMenuUsed = true;
        sendAsUser(text);
      };
      container.appendChild(btn);
    });
    msgs.appendChild(container);
  }

  function hideStartMenu() {
    const el = msgs.querySelector('.botStartMenu');
    if (el) el.remove();
  }

  const TYPING_MAX_MS = 2000;
  let typingTimeoutId = null;

  function showTypingIndicator() {
    hideTypingIndicator();
    const el = document.createElement('div');
    el.className = 'botTyping';
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<span class="botTyping-dot"></span><span class="botTyping-dot"></span><span class="botTyping-dot"></span>';
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
    typingTimeoutId = setTimeout(() => {
      typingTimeoutId = null;
      hideTypingIndicator();
      setFormLoading(false);
    }, TYPING_MAX_MS);
  }

  function hideTypingIndicator() {
    if (typingTimeoutId) {
      clearTimeout(typingTimeoutId);
      typingTimeoutId = null;
    }
    const el = msgs.querySelector('.botTyping');
    if (el) el.remove();
  }

  function setFormLoading(loading) {
    if (loading) {
      input.disabled = true;
      send.disabled = true;
      box.querySelector('#botWidgetForm').classList.add('is-loading');
    } else {
      input.disabled = false;
      send.disabled = false;
      box.querySelector('#botWidgetForm').classList.remove('is-loading');
    }
  }

  // Подсказки при зависании: 1 показ за сессию
  const SUGGESTED_ITEMS = [
    'Этапы имплантации',
    'Что входит в консультацию',
    'Какая приживаемость имплантов?'
  ];

  function renderSuggestedBlock() {
    if (widgetState.suggestedShownCount > 0) return;
    const existing = msgs.querySelector('.botSuggested');
    if (existing) return;

    const container = document.createElement('div');
    container.className = 'botSuggested';
    const title = document.createElement('div');
    title.className = 'botSuggestedTitle';
    title.textContent = 'Часто спрашивают:';
    container.appendChild(title);
    SUGGESTED_ITEMS.forEach(text => {
      const btn = document.createElement('button');
      btn.className = 'botSuggestedItem';
      btn.textContent = text;
      btn.onclick = () => {
        container.remove();
        widgetState.suggestedShownCount = 1;
        sendAsUser(text);
      };
      container.appendChild(btn);
    });
    msgs.appendChild(container);
    msgs.scrollTop = msgs.scrollHeight;
    widgetState.suggestedShownCount = 1;
  }

  function checkSuggestedConditions() {
    if (widgetState.suggestedShownCount > 0) return;
    if (widgetState.leadIntent !== 'none') return;
    if (widgetState.lastBotMessageTime === 0) return;
    // Ждём подольше, чтобы не мешать обычному диалогу
    if (Date.now() - widgetState.lastBotMessageTime < 30000) return;

    // Показываем блок «Часто спрашивают» только если в последнем ответе
    // не было followup-кнопок и CTA, и не было эмоционального флага.
    const lp = widgetState.lastParsedResponse;
    if (!lp) return;
    if (lp.flags && lp.flags.emotional) return;
    if (lp.followups && lp.followups.length > 0) return;
    if (lp.meta && lp.meta.shouldHandoff) return;
    if (lp.ui && lp.ui.ctaIntent === 'booking') return;

    renderSuggestedBlock();
  }

  async function sendAsUser(text) {
    input.value = '';
    addMsg(text, 'user');
    widgetState.hasInteracted = true;
    widgetState.messageCount++;
    hideStartMenu();
    try {
      await askFlowise(text);
    } catch (e) {
      addMsg("Не получилось связаться с мозгом. Сейчас проверим endpoint / доступ.", "bot");
      addMsg(String(e.message || e), "bot");
      widgetState.lastBotMessageTime = Date.now();
    }
  }

  function addMsg(text, who, skipSave) {
    const d = document.createElement("div");
    d.className = `botMsg ${who === "user" ? "botUser" : "botBot"}`;
    d.textContent = text;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    if (!skipSave) saveHistory();
  }

  function saveHistory() {
    const items = [];
    msgs.querySelectorAll(".botMsg").forEach((el) => {
      const who = el.classList.contains("botUser") ? "user" : "bot";
      items.push({ text: el.textContent, who });
    });
    const state = {
      messages: items,
      leadSent: widgetState.leadSent
    };
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(state));
  }

  function restoreHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (!raw) return false;
      const state = JSON.parse(raw);
      const messages = state.messages || [];
      if (messages.length === 0) return false;

      messages.forEach(({ text, who }) => {
        addMsg(text, who, true);
      });
      if (state.leadSent) {
        widgetState.leadSent = true;
        setCompletedState();
      }
      widgetState.messageCount = messages.filter((m) => m.who === "user").length;
      return true;
    } catch (e) {
      console.warn("restoreHistory error", e);
      return false;
    }
  }

  // Парсинг ответа от Flowise (плоская структура: ui_ctaIntent, meta_stage и т.д.)
  function parseFlowiseResponse(data) {
    try {
      // 1. AgentFlow V2 (редко, но оставляем)
      if (Array.isArray(data) && data[0]?.json) {
        data = data[0].json;
      }
      // 2. Prediction API: structured output лежит в data.json
      if (data && typeof data === 'object' && data.json && typeof data.json === 'object') {
        data = { ...data.json, text: data.text ?? '' };
      }
      // 3. Structured Output пришёл как JSON-строка в data.text
      if (
        data &&
        typeof data === 'object' &&
        typeof data.text === 'string' &&
        data.text.trim().startsWith('{')
      ) {
        data = JSON.parse(data.text);
      }
      // 4. Если data — строка
      if (typeof data === 'string') {
        data = JSON.parse(data);
      }
      // 5. Дальше — существующая логика
      if (data && typeof data === 'object') {
        var followupOpts = data.followup_options ?? data.followupOptions;
        if (typeof followupOpts === 'string') {
          try { followupOpts = JSON.parse(followupOpts); } catch (e) { followupOpts = []; }
        }
        if (!Array.isArray(followupOpts)) followupOpts = [];
        // Сырые данные Structured Output → базовый объект
        var conv = data.conversion;
        if (conv && typeof conv === 'object' && conv.video && typeof conv.video === 'object') {
          conv = {
            video: {
              title: String(conv.video.title || '').trim(),
              url: String(conv.video.url || '').trim()
            }
          };
        } else {
          conv = null;
        }
        var parsed = {
          answer: data.answer || data.text || '',
          ui: {
            ctaIntent: data.ui_ctaIntent ?? data.ui?.ctaIntent ?? 'none',
            ctaLabel: typeof data.cta_label === 'string' && data.cta_label.trim()
              ? data.cta_label.trim()
              : ''
          },
          meta: {
            stage: data.meta_stage ?? data.meta?.stage ?? 'discovery',
            confidence: data.meta_confidence ?? data.meta?.confidence ?? 0,
            shouldHandoff: data.meta_shouldHandoff ?? data.meta?.shouldHandoff ?? false,
            topic: data.meta_topic ?? data.meta?.topic ?? 'other',
            subtopic: data.meta_subtopic ?? data.meta?.subtopic ?? ''
          },
          flags: {
            emotional: data.flags_emotional ?? data.flags?.emotional ?? false
          },
          leadIntent: data.leadIntent ?? 'none',
          followup_options: followupOpts,
          conversion: conv && conv.video && conv.video.url ? conv : null,
          show_situation_button: !!data.show_situation_button,
          situation_pending:
            data.situation_pending === true ||
            String(data.situation_pending || "").toLowerCase() === "true",
          isValid: true
        };
        return normalizeParsedResponse(parsed);
      }
    } catch (e) {
      console.error('parseFlowiseResponse error', e);
    }

    // Fallback
    const text = typeof data === 'string' ? data : (data?.text || data?.answer || JSON.stringify(data));
    return {
      answer: text,
      ui: { ctaIntent: 'none' },
      meta: { stage: widgetState.currentStage, confidence: 0, shouldHandoff: false, topic: widgetState.currentTopic || 'other' },
      flags: { emotional: false },
      leadIntent: 'none',
      followup_options: [],
      conversion: null,
      show_situation_button: false,
      situation_pending: false,
      isValid: false
    };
  }

  // Нормализация ответа от LLM: типы полей, лимиты, followup_options
  function normalizeParsedResponse(parsed) {
    var result = parsed || {};

    // answer
    if (typeof result.answer !== 'string') {
      result.answer = String(result.answer || '');
    }

    // ui
    if (!result.ui || typeof result.ui !== 'object') result.ui = {};
    if (result.ui.ctaIntent !== 'booking' && result.ui.ctaIntent !== 'none') {
      result.ui.ctaIntent = 'none';
    }
    if (typeof result.ui.ctaLabel !== 'string') result.ui.ctaLabel = '';

    // meta
    if (!result.meta || typeof result.meta !== 'object') {
      result.meta = { stage: 'discovery', confidence: 0, shouldHandoff: false, topic: 'other' };
    } else {
      result.meta.stage = result.meta.stage || 'discovery';
      if (typeof result.meta.confidence !== 'number') result.meta.confidence = 0;
      result.meta.shouldHandoff = !!result.meta.shouldHandoff;
      if (!result.meta.topic) result.meta.topic = 'other';
      if (typeof result.meta.subtopic !== 'string') result.meta.subtopic = '';
    }

    // flags
    if (!result.flags || typeof result.flags !== 'object') {
      result.flags = { emotional: false };
    } else {
      result.flags.emotional = !!result.flags.emotional;
    }

    // leadIntent
    if (typeof result.leadIntent !== 'string') {
      result.leadIntent = 'none';
    }

    // followup_options: нормализуем в массив объектов { label, query }, убираем дубли, режем до 3
    var rawFollowups = Array.isArray(result.followup_options) ? result.followup_options : [];
    var normalized = rawFollowups.map(function (opt) {
      // Если пришла строка с JSON-объектом, сначала попробуем распарсить
      if (typeof opt === 'string') {
        var trimmed = opt.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          try {
            var parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed === 'object') {
              var pLabel = parsed.label || parsed.text || parsed.query || '';
              var pQuery = parsed.query || parsed.label || parsed.text || '';
              if (pLabel && pQuery) {
                return { label: pLabel, query: pQuery };
              }
            }
          } catch (e) {
            // если не получилось — падаем в обычную строку ниже
          }
        }
        return { label: opt, query: opt };
      }
      if (opt && typeof opt === 'object') {
        var label = opt.label || opt.text || opt.query || '';
        var query = opt.query || opt.label || opt.text || '';
        return (label && query) ? { label: label, query: query } : null;
      }
      return null;
    }).filter(Boolean);

    // дедупликация по label
    var seen = {};
    var unique = [];
    normalized.forEach(function (item) {
      if (!seen[item.label]) {
        seen[item.label] = true;
        unique.push(item);
      }
    });

    result.followup_options = unique.slice(0, 3);

    if (!result.conversion || typeof result.conversion !== 'object') {
      result.conversion = null;
    }

    result.show_situation_button = !!result.show_situation_button;
    if (typeof result.situation_pending === "string") {
      result.situation_pending = result.situation_pending.toLowerCase() === "true";
    } else {
      result.situation_pending = !!result.situation_pending;
    }

    return result;
  }

  /** Шаг «опишите ситуацию»: только «Назад к диалогу» + ввод текста (без handoff и записи). */
  function isOnlyBackToDialogFollowups(parsed) {
    var opts = parsed.followup_options;
    if (!Array.isArray(opts) || opts.length !== 1) return false;
    var o = opts[0];
    var label = typeof o === "string" ? o : o && o.label;
    if (!label) return false;
    return String(label)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ") === "назад к диалогу";
  }

  // Отображение ответа бота
  function renderAnswer(answer) {
    addMsg(answer, "bot");
  }

  // Кнопки «узнать подробнее» (followup_options из ответа)
  // options: массив строк ИЛИ объектов { label, query }
  function renderFollowupButtons(options) {
    const existing = msgs.querySelector(".botFollowupButtons");
    if (existing) existing.remove();
    if (!options || !options.length) return;
    // Нормализуем: каждая опция = { label, query }
    const normalized = options.map((opt) => {
      if (typeof opt === 'string') {
        return { label: opt, query: opt };
      }
      if (opt && typeof opt === 'object') {
        const label = opt.label || opt.text || opt.query || '';
        const query = opt.query || opt.label || opt.text || '';
        return label && query ? { label, query } : null;
      }
      return null;
    }).filter(Boolean);
    if (!normalized.length) return;

    // Фильтруем уже использованные подписи и ограничиваем количество
    const remaining = normalized.filter((item) => !widgetState.usedFollowups.includes(item.label));
    if (!remaining.length) return;
    const toShow = remaining.slice(0, 3);
    const wrap = document.createElement("div");
    wrap.className = "botFollowupButtons";
    wrap.style.cssText = "display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0;";
    toShow.forEach(function (item) {
      const label = item.label;
      const query = item.query;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "botFollowupBtn";
      btn.textContent = label;
      btn.style.cssText = "padding: 8px 14px; background: #f0f0f0; color: #333; border: 1px solid #ddd; border-radius: 8px; cursor: pointer; font-size: 13px;";
      btn.onclick = function () {
        wrap.remove();
        if (!widgetState.usedFollowups.includes(label)) {
          widgetState.usedFollowups.push(label);
        }
        input.value = "";
        widgetState.hasInteracted = true;
        widgetState.messageCount++;
        hideStartMenu();
        addMsg(label, "user");
        askFlowise(query);
      };
      wrap.appendChild(btn);
    });
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
  }

  const SITUATION_BUTTON_QUERY = "Рассказать о своей ситуации";
  const SIT_BACK_TO_DIALOG = "Назад к диалогу";
  const VIDEO_REVEAL_LABEL = "Посмотреть видео с врачом";

  function isBackToDialogText(s) {
    return (
      String(s || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ") === "назад к диалогу"
    );
  }

  /** Кнопка; плеер вставляется только после клика (порядок: ответ → followup → видео → ситуация → CTA) */
  function renderVideoRevealButton(video) {
    if (!video || !video.url) return;
    const wrap = document.createElement("div");
    wrap.className = "botVideoRevealWrap";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "botVideoToggleBtn";
    btn.textContent = VIDEO_REVEAL_LABEL;
    btn.onclick = function () {
      btn.remove();
      const embed = document.createElement("div");
      embed.className = "botVideoEmbed";
      const v = document.createElement("video");
      v.setAttribute("controls", "controls");
      v.setAttribute("playsinline", "playsinline");
      v.preload = "metadata";
      const source = document.createElement("source");
      source.src = video.url;
      source.type = "video/mp4";
      v.appendChild(source);
      embed.appendChild(v);
      if (video.title) {
        const cap = document.createElement("div");
        cap.className = "botVideoEmbedCaption";
        cap.textContent = video.title;
        embed.appendChild(cap);
      }
      wrap.appendChild(embed);
      msgs.scrollTop = msgs.scrollHeight;
    };
    wrap.appendChild(btn);
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function renderSituationButton() {
    const wrap = document.createElement("div");
    wrap.className = "botSituationWrap";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "botSituationBtn";
    btn.textContent = SITUATION_BUTTON_QUERY;
    btn.onclick = function () {
      wrap.remove();
      input.value = "";
      widgetState.hasInteracted = true;
      widgetState.messageCount++;
      widgetState.situationAwaitingNote = true;
      hideStartMenu();
      addMsg(SITUATION_BUTTON_QUERY, "user");
      askFlowise(SITUATION_BUTTON_QUERY);
    };
    wrap.appendChild(btn);
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
  }

  // Отображение кнопки CTA: booking или handoff
  function renderCTAButton(type, bookingLabel) {
    const existingCTA = msgs.querySelector(".botCTAButton");
    if (existingCTA) existingCTA.parentElement.remove();

    const ctaBtn = document.createElement("button");
    ctaBtn.className = "botCTAButton";
    if (type === "handoff") {
      ctaBtn.textContent = "Связаться с администратором";
      ctaBtn.onclick = () => {
        ctaBtn.parentElement.remove();
        onHandoffClick();
      };
    } else {
      const label = (bookingLabel && String(bookingLabel).trim()) || "Записаться на консультацию";
      ctaBtn.textContent = label;
      ctaBtn.onclick = () => {
        ctaBtn.parentElement.remove();
        onCTAClick(label);
      };
    }
    ctaBtn.style.cssText = "margin: 8px 0; padding: 10px 16px; background: #4ECDC4; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px;";

    const msgContainer = document.createElement("div");
    msgContainer.style.cssText = "display: flex; flex-direction: column; align-items: flex-start;";
    msgContainer.appendChild(ctaBtn);
    msgs.appendChild(msgContainer);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function onCTAClick(intentText) {
    const text = (intentText && String(intentText).trim()) || "Записаться на консультацию";
    input.value = "";
    widgetState.hasInteracted = true;
    widgetState.messageCount++;
    hideStartMenu();
    addMsg(text, "user");
    askFlowise(text);
  }

  function onHandoffClick() {
    const text = "Хочу связаться с администратором";
    input.value = "";
    widgetState.hasInteracted = true;
    widgetState.messageCount++;
    hideStartMenu();
    addMsg(text, "user");
    askFlowise(text);
  }

  const WELCOME_TEXT = "Здравствуйте.\nЯ онлайн-консультант клиники ЦЭСИ.\nМогу помочь разобраться в вопросах лечения.";

  function openChat(intentMessage) {
    widgetState.chatOpenedOnce = true;
    box.style.display = "flex";
    btn.style.display = "none";

    getOrCreateSessionId();

    const hasContent = msgs.querySelectorAll(".botMsg").length > 0;
    if (!hasContent) {
      const hasHistory = restoreHistory();
      if (intentMessage) {
        // CTA: не показывать приветствие, сразу отправить intent
      } else if (!hasHistory) {
        addMsg(WELCOME_TEXT, "bot");
      }
      if (!intentMessage) renderStartMenu();
    } else if (widgetState.leadSent) {
      setCompletedState();
    }

    if (intentMessage) {
      addMsg(intentMessage, "user");
      widgetState.hasInteracted = true;
      widgetState.messageCount++;
      hideStartMenu();
      askFlowise(intentMessage).catch((e) => {
        addMsg("Не получилось связаться с мозгом. Сейчас проверим endpoint / доступ.", "bot");
        addMsg(String(e.message || e), "bot");
        widgetState.lastBotMessageTime = Date.now();
      });
    }

    if (!window.matchMedia("(max-width: 768px)").matches) {
      input.focus();
    }
    if (!widgetState.suggestedCheckInterval) {
      widgetState.suggestedCheckInterval = setInterval(checkSuggestedConditions, 3000);
    }
  }

  window.openCesiChat = function(intent) {
    openChat(intent || null);
  };

  btn.onclick = () => openChat();
  btn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openChat();
    }
  });

  close.onclick = () => {
    box.style.display = "none";
    btn.style.display = "block";
    if (widgetState.suggestedCheckInterval) {
      clearInterval(widgetState.suggestedCheckInterval);
      widgetState.suggestedCheckInterval = null;
    }
  };

  const clearSessionBtn = box.querySelector("#botWidgetClearSession");
  if (clearSessionBtn) {
    clearSessionBtn.onclick = () => {
      clearSession();
      location.reload();
    };
  }

  // Инициализация scroll-триггера
  window.addEventListener("scroll", maybeShowScrollTeaser);

  async function askFlowise(text) {
    if (isBackToDialogText(text)) {
      widgetState.situationAwaitingNote = false;
    }
    setFormLoading(true);
    showTypingIndicator();
    try {
      const sid = getOrCreateSessionId();
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, overrideConfig: { sessionId: sid } })
      });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`HTTP ${res.status}: ${t}`);
    }
    const data = await res.json();
    console.log('Flowise raw response', data);

    // Парсим ответ от Flowise
    const parsed = parseFlowiseResponse(data);
    
    // Обновляем состояние
    widgetState.currentStage = parsed.meta.stage;
    widgetState.leadIntent = parsed.leadIntent;

    // Обновляем тему и глубину по теме (interactionDepth будет использоваться ниже)
    const newTopic = (parsed.meta && parsed.meta.topic) ? String(parsed.meta.topic) : 'other';
    if (widgetState.currentTopic !== newTopic) {
      widgetState.currentTopic = newTopic;
      widgetState.interactionDepth = 0;
    }

    widgetState.lastParsedResponse = parsed.isValid ? {
      flags: parsed.flags,
      ui: parsed.ui,
      meta: parsed.meta,
      followups: parsed.followup_options || []
    } : null;
    // Глобальный счётчик ответов бота (для простого правила CTA по длине диалога)
    widgetState.botAnswerCount = (widgetState.botAnswerCount || 0) + 1;
    updateDialogState();
    updatePhoneMaskUI();

    // Сохраняем имя при переходе к запросу телефона
    if (parsed.isValid && parsed.leadIntent === 'awaiting_phone') {
      widgetState.leadName = text;
    }
    
    // Отображаем ответ бота; блоки действий — сразу под ответом: followup → видео (по клику) → ситуация → CTA
    renderAnswer(parsed.answer);
    widgetState.lastBotMessageTime = Date.now();
    // Лог ответа бота
    try {
      await logMessage("bot", parsed.answer, {
        leadIntent: parsed.leadIntent,
        ui_ctaIntent: parsed.ui.ctaIntent,
        meta_stage: parsed.meta.stage,
        meta_shouldHandoff: parsed.meta.shouldHandoff
      });
    } catch (e) {
      // уже логируем внутри logMessage
    }
    
    // Отладка: что пришло перед проверкой отправки заявки
    console.log('LEAD CHECK', {
      leadIntent: parsed.leadIntent,
      leadName: widgetState.leadName,
      text
    });
    
    // leadIntent === 'complete' → отправка заявки (отдельный try/catch, не путать с ошибкой Flowise)
    if (parsed.isValid && parsed.leadIntent === 'complete' && !widgetState.leadSent && widgetState.leadName) {
      widgetState.leadSent = true;
      saveHistory();
      try {
        const ok = await sendLeadToBackend(widgetState.leadName, text);
        if (ok) {
          setCompletedState();
          if (!isWorkingHours()) {
            addMsg("Сейчас клиника не работает. Мы свяжемся с вами в рабочее время.", "bot");
          }
        } else {
          addMsg("Заявка отправлена, но без подтверждения. Мы свяжемся с вами.", "bot");
        }
      } catch (e) {
        console.error('Lead send error', e);
        addMsg("Заявка отправлена. Мы свяжемся с вами в ближайшее время.", "bot");
      }
    }
    
    // Кнопки: макс. 3 вместе с CTA (правило продукта). Порядок: followup → видео → «ситуация» → CTA.
    if (parsed.isValid) {
      if (parsed.leadIntent === "awaiting_name") {
        widgetState.situationAwaitingNote = false;
      }

      let followOpts = Array.isArray(parsed.followup_options) ? parsed.followup_options.slice() : [];
      const onlyBackApi = isOnlyBackToDialogFollowups({ ...parsed, followup_options: followOpts });
      const situationWaitInput =
        parsed.leadIntent === "none" &&
        (parsed.situation_pending === true ||
          widgetState.situationAwaitingNote === true ||
          onlyBackApi);

      if (situationWaitInput && parsed.leadIntent === "none") {
        if (!isOnlyBackToDialogFollowups({ ...parsed, followup_options: followOpts })) {
          followOpts = [{ label: SIT_BACK_TO_DIALOG, query: SIT_BACK_TO_DIALOG }];
        }
      }

      const hasFollowups = followOpts.length > 0;
      const followupCount = hasFollowups ? followOpts.length : 0;

      const inLeadFlow = parsed.leadIntent !== "none";
      const needHandoff = !situationWaitInput && parsed.meta.shouldHandoff === true;

      let shouldShowBookingCTA = false;
      if (!situationWaitInput && !inLeadFlow && !needHandoff) {
        const topicDepth = widgetState.interactionDepth || 0;
        const conversationCount = widgetState.botAnswerCount || 0;
        if (followupCount >= 3) {
          shouldShowBookingCTA = false;
        } else if (followupCount === 2) {
          shouldShowBookingCTA = conversationCount >= 4 || topicDepth >= 2;
        } else if (followupCount === 1) {
          shouldShowBookingCTA = true;
        } else {
          shouldShowBookingCTA = true;
        }
      }

      const ctaWillShow = needHandoff || shouldShowBookingCTA;
      const maxSecondary = situationWaitInput ? 3 : ctaWillShow ? 2 : 3;
      let budget = maxSecondary;
      const nFollowRender = Math.min(followupCount, budget, 3);
      budget -= nFollowRender;

      // Обновляем глубину взаимодействия внутри темы (не считаем шаг «ситуация»)
      if (hasFollowups && !situationWaitInput) {
        widgetState.interactionDepth = (widgetState.interactionDepth || 0) + 1;
      } else if (!hasFollowups && !situationWaitInput) {
        widgetState.interactionDepth = 0;
      }

      if (parsed.leadIntent === "none" && nFollowRender > 0) {
        renderFollowupButtons(followOpts.slice(0, nFollowRender));
      }

      const wantVideo =
        !situationWaitInput &&
        !needHandoff &&
        parsed.conversion &&
        parsed.conversion.video &&
        parsed.conversion.video.url;
      if (wantVideo && budget > 0) {
        renderVideoRevealButton(parsed.conversion.video);
        budget -= 1;
      }

      const wantSituation =
        parsed.show_situation_button &&
        parsed.leadIntent === "none" &&
        !situationWaitInput &&
        !needHandoff;
      if (wantSituation && budget > 0) {
        renderSituationButton();
        budget -= 1;
      }

      if (situationWaitInput) {
        // только «Назад» и поле ввода
      } else if (needHandoff) {
        renderCTAButton("handoff");
      } else if (!inLeadFlow && shouldShowBookingCTA) {
        renderCTAButton("booking", parsed.ui && parsed.ui.ctaLabel);
      }
    }
    } finally {
      hideTypingIndicator();
      setFormLoading(false);
    }
  }

  const SEND_DEBOUNCE_MS = 400;
  let lastSendAt = 0;

  async function onSend() {
    const text = input.value.trim();
    if (!text) return;
    if (box.querySelector('#botWidgetForm').classList.contains('is-loading')) return;
    const now = Date.now();
    if (now - lastSendAt < SEND_DEBOUNCE_MS) return;
    lastSendAt = now;

    widgetState.hasInteracted = true;
    widgetState.messageCount++;
    hideStartMenu();
    input.value = "";
    updateSendButtonState();
    autoGrowTextarea();
    addMsg(text, "user");
    // Лог сообщения пользователя
    try {
      await logMessage("user", text);
    } catch (e) {
      // уже логируем внутри logMessage
    }

    try {
      await askFlowise(text);
    } catch (e) {
      addMsg("Не получилось связаться с мозгом. Сейчас проверим endpoint / доступ.", "bot");
      addMsg(String(e.message || e), "bot");
      widgetState.lastBotMessageTime = Date.now();
    }
  }

  function updateSendButtonState() {
    const hasText = input.value.trim().length > 0;
    send.classList.toggle("has-text", hasText);
  }

  function autoGrowTextarea() {
    input.style.height = "auto";
    const h = Math.min(input.scrollHeight, 120);
    input.style.height = h + "px";
  }

  send.onclick = onSend;
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      if (e.shiftKey) {
        return;
      }
      e.preventDefault();
      onSend();
    }
  });
  input.addEventListener("input", () => {
    widgetState.lastInputAt = Date.now();
    updateSendButtonState();
    autoGrowTextarea();
  });

  updateSendButtonState();
  autoGrowTextarea();

  function initMobileViewportFix() {
    if (!window.visualViewport) return;
    const boxEl = document.getElementById("botWidgetBox");
    if (!boxEl) return;

    const updateHeight = () => {
      boxEl.style.height = window.visualViewport.height + "px";
    };

    updateHeight();
    window.visualViewport.addEventListener("resize", updateHeight);
    window.visualViewport.addEventListener("scroll", updateHeight);
  }

  const isMobile = window.matchMedia("(max-width: 768px)").matches;
  if (isMobile) {
    initMobileViewportFix();
  }
})();

});