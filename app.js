(function () {
  "use strict";

  const data = window.TRIP_DATA;
  const tripLogic = window.TripLogic;
  const STORAGE_KEY = "jeju-olle-plan-v5";
  const LEGACY_V4_STORAGE_KEY = "jeju-olle-plan-v4";
  const LEGACY_STORAGE_KEY = "jeju-olle-plan-v3";
  const RECOVERY_KEY = "jeju-olle-plan-v5-recovery";
  const LEGACY_EXECUTION_FOCUS_KEY = "jeju-olle-execution-focus-reset-v1";
  const WEATHER_CACHE_KEY = "jeju-olle-weather-v1";
  const WEATHER_REFRESH_MS = 25 * 60 * 1000;
  const WEATHER_REGIONS = {
    "0923": { name: "济州机场", place: "airport" },
    "0924": { name: "城山 · 牛岛", place: "seongsanPort" },
    "0925": { name: "南元 · 西归浦", place: "namwon" },
    "0926": { name: "西归浦", place: "traveler" },
    "0927": { name: "和顺 · 摹瑟浦", place: "hwasun" },
    "0928": { name: "摹瑟浦 · 加波岛", place: "unjin" }
  };
  const ALLOWED_VIEWS = ["today", "plan", "checkins", "more"];
  const ALLOWED_MODES = ["步行", "公交", "打车", "骑行"];
  const DAY_IDS = data.days.map(function (day) { return day.id; });
  const EXPENSE_CATEGORIES = {
    transport: { label: "交通", icon: "navigation.svg" },
    food: { label: "餐饮", icon: "utensils.svg" },
    stay: { label: "住宿", icon: "house.svg" },
    ticket: { label: "门票", icon: "bookmark.svg" },
    shopping: { label: "购物", icon: "shopping-bag.svg" },
    other: { label: "其他", icon: "ellipsis.svg" }
  };
  const EXPENSE_PAYMENTS = { card: "银行卡", cash: "现金", alipay: "支付宝", wechat: "微信", other: "其他" };
  const EXPENSE_CURRENCIES = ["KRW", "CNY"];
  const filterState = { day: "all", category: "all", query: "" };
  let expenseDayFilter = "all";
  let state = loadState();
  filterState.day = state.activeDay;
  let deferredInstallPrompt = null;
  let waitingWorker = null;
  let updateReloadRequested = false;
  let deletedCheckin = null;
  let deletedExpense = null;
  let lastStampAction = null;
  let toastTimer = null;
  let celebrationTimer = null;
  let printRestore = null;
  let executionLocation = null;
  let executionLocationError = "";
  let executionLocationPending = false;
  let executionLocationRequestId = 0;
  let executionTimelineOpen = false;
  let executionRiskOpen = false;
  let completedCheckinsOpen = false;
  const manualStepByDay = {};
  const viewScroll = {};
  const recentCheckins = new Set();
  const openStampDays = new Set();
  const openRiskDays = new Set();
  const openOtherCutoffDays = new Set();
  let lastVisitAction = null;
  let recentlyStamped = "";
  let offlineShellReady = false;
  let lastBackupAt = "";
  try { lastBackupAt = localStorage.getItem("jeju-olle-last-backup") || ""; } catch (error) { /* Optional device metadata. */ }
  const openRouteDetails = new Set();
  const weatherCache = loadWeatherCache();
  const weatherPending = new Set();
  const weatherErrors = {};

  function initialDayId() {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const now = Object.fromEntries(parts.map(function (part) { return [part.type, part.value]; }));
    const key = now.month + now.day;
    if (now.year !== "2026" || key < "0923") return "0923";
    if (key > "0928") return "0928";
    return DAY_IDS.includes(key) ? key : "0923";
  }

  function defaultState() {
    return {
      version: 5,
      activeView: "today",
      activeDay: initialDayId(),
      compact: false,
      notes: "",
      dayNotes: {},
      stamps: {},
      checkinChecks: {},
      customCheckins: [],
      expenses: [],
      confirmations: {},
      fallbacks: {},
      cutoffChecks: {},
      executions: {}
    };
  }

  function cleanText(value, maxLength) {
    return typeof value === "string" ? value.slice(0, maxLength) : "";
  }

  function cleanBooleanMap(value, maxKeys) {
    const result = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return result;
    Object.keys(value).slice(0, maxKeys).forEach(function (key) {
      if (typeof key === "string" && key.length <= 100) result[key] = Boolean(value[key]);
    });
    return result;
  }

  function isValidCoordinate(lat, lng) {
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  function sanitizeCheckin(raw) {
    if (!raw || typeof raw !== "object") return null;
    const name = cleanText(raw.name, 120).trim();
    const dayId = DAY_IDS.includes(raw.dayId) ? raw.dayId : "";
    const category = Object.hasOwn(data.categories, raw.category) && raw.category !== "all" ? raw.category : "other";
    if (!name || !dayId) return null;
    const lat = raw.lat === "" || raw.lat == null ? null : Number(raw.lat);
    const lng = raw.lng === "" || raw.lng == null ? null : Number(raw.lng);
    const coordinatesValid = isValidCoordinate(lat, lng);
    return {
      id: cleanText(raw.id, 100) || createId(),
      custom: true,
      dayId,
      category,
      name,
      korean: cleanText(raw.korean, 120).trim(),
      address: cleanText(raw.address, 260).trim(),
      lat: coordinatesValid ? lat : null,
      lng: coordinatesValid ? lng : null,
      mapInput: cleanText(raw.mapInput, 1000).trim(),
      mode: ALLOWED_MODES.includes(raw.mode) ? raw.mode : "步行",
      priority: cleanText(raw.priority, 40).trim() || "想去",
      slot: cleanText(raw.slot, 120).trim(),
      dish: cleanText(raw.dish, 160).trim(),
      note: cleanText(raw.note, 1000).trim(),
      createdAt: cleanText(raw.createdAt, 40) || new Date().toISOString(),
      updatedAt: cleanText(raw.updatedAt, 40) || new Date().toISOString()
    };
  }

  function sanitizeExpense(raw) {
    if (!raw || typeof raw !== "object") return null;
    const title = cleanText(raw.title, 120).trim();
    const dayId = DAY_IDS.includes(raw.dayId) ? raw.dayId : "";
    const amount = Number(raw.amount);
    const currency = EXPENSE_CURRENCIES.includes(raw.currency) ? raw.currency : "KRW";
    if (!title || !dayId || !Number.isFinite(amount) || amount <= 0 || amount > 999999999999) return null;
    const roundedAmount = currency === "KRW" ? Math.round(amount) : Math.round(amount * 100) / 100;
    if (roundedAmount <= 0) return null;
    return {
      id: cleanText(raw.id, 100) || createId(),
      title,
      dayId,
      category: Object.hasOwn(EXPENSE_CATEGORIES, raw.category) ? raw.category : "other",
      amount: roundedAmount,
      currency,
      payment: Object.hasOwn(EXPENSE_PAYMENTS, raw.payment) ? raw.payment : "card",
      note: cleanText(raw.note, 500).trim(),
      createdAt: cleanText(raw.createdAt, 40) || new Date().toISOString(),
      updatedAt: cleanText(raw.updatedAt, 40) || new Date().toISOString()
    };
  }

  function sanitizeExecutions(raw) {
    const executions = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return executions;
    DAY_IDS.forEach(function (dayId) {
      const source = raw[dayId];
      if (!source || typeof source !== "object" || Array.isArray(source)) return;
      const day = dayById(dayId);
      const stepIds = day.timeline.map(function (item) { return item.id; });
      const stepStates = {};
      const sourceSteps = source.stepStates && typeof source.stepStates === "object" && !Array.isArray(source.stepStates) ? source.stepStates : {};
      Object.entries(sourceSteps).forEach(function (entry) {
        if (stepIds.includes(entry[0]) && entry[1] && entry[1].done === true) stepStates[entry[0]] = { done: true };
      });
      executions[dayId] = {
        status: ["not-started", "active", "finished"].includes(source.status) ? source.status : "not-started",
        activeStepId: stepIds.includes(source.activeStepId) ? source.activeStepId : "",
        stepStates,
        startedAt: cleanText(source.startedAt, 40),
        finishedAt: cleanText(source.finishedAt, 40)
      };
    });
    return executions;
  }

  function normalizeState(raw) {
    const defaults = defaultState();
    if (!raw || typeof raw !== "object") return defaults;
    return {
      version: 5,
      activeView: ALLOWED_VIEWS.includes(raw.activeView) ? raw.activeView : defaults.activeView,
      activeDay: DAY_IDS.includes(raw.activeDay) ? raw.activeDay : defaults.activeDay,
      compact: Boolean(raw.compact),
      notes: cleanText(raw.notes, 20000),
      dayNotes: Object.fromEntries(Object.entries(raw.dayNotes || {}).filter(function (entry) {
        return DAY_IDS.includes(entry[0]) && typeof entry[1] === "string";
      }).map(function (entry) { return [entry[0], entry[1].slice(0, 5000)]; })),
      stamps: cleanBooleanMap(raw.stamps, 100),
      checkinChecks: cleanBooleanMap(raw.checkinChecks || raw.foodChecks, 1000),
      customCheckins: Array.isArray(raw.customCheckins) ? raw.customCheckins.slice(0, 500).map(sanitizeCheckin).filter(Boolean) : [],
      expenses: Array.isArray(raw.expenses) ? raw.expenses.slice(0, 2000).map(sanitizeExpense).filter(Boolean) : [],
      confirmations: cleanBooleanMap(raw.confirmations, 100),
      fallbacks: cleanBooleanMap(raw.fallbacks, 100),
      cutoffChecks: cleanBooleanMap(raw.cutoffChecks, 100),
      executions: sanitizeExecutions(raw.executions)
    };
  }

  function migrateV4(raw) {
    return normalizeState(Object.assign({}, raw, { version: 5, executions: {} }));
  }

  function migrateLegacy(raw) {
    return normalizeState({
      version: 5,
      activeView: "today",
      activeDay: raw.activeDay,
      compact: raw.compact,
      notes: raw.notes,
      dayNotes: raw.dayNotes,
      stamps: raw.stamps,
      checkinChecks: raw.foodChecks,
      customCheckins: [],
      expenses: [],
      confirmations: {},
      fallbacks: raw.fallbacks,
      executions: {}
    });
  }

  function readStoredState(key) {
    const value = localStorage.getItem(key);
    if (!value) return null;
    try { return JSON.parse(value); } catch (error) { return null; }
  }

  function loadState() {
    try {
      const current = readStoredState(STORAGE_KEY);
      if (current && current.version === 5) return normalizeState(current);
      const version4 = readStoredState(LEGACY_V4_STORAGE_KEY);
      if (version4 && version4.version === 4) {
        const migrated = migrateV4(version4);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
      const legacy = readStoredState(LEGACY_STORAGE_KEY);
      if (legacy && legacy.version === 3) {
        const migrated = migrateLegacy(legacy);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    } catch (error) {
      console.info("未读取到有效的本地行程，将使用默认数据。", error.message);
    }
    return defaultState();
  }

  function clearLegacyExecutionFocus(currentState) {
    try {
      if (localStorage.getItem(LEGACY_EXECUTION_FOCUS_KEY) === "1") return currentState;
      const executions = currentState.executions || {};
      const hasActiveExecution = Object.values(executions).some(function (execution) {
        return execution && execution.status === "active";
      });
      if (hasActiveExecution) {
        currentState = normalizeState(Object.assign({}, currentState, {
          activeView: "today",
          executions: Object.fromEntries(Object.entries(executions).map(function (entry) {
            const execution = entry[1];
            return [entry[0], execution && execution.status === "active" ? Object.assign({}, execution, { status: "not-started", activeStepId: "" }) : execution];
          }))
        }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState));
      }
      localStorage.setItem(LEGACY_EXECUTION_FOCUS_KEY, "1");
    } catch (error) {
      // A storage failure should never prevent the trip plan from opening.
    }
    return currentState;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadWeatherCache() {
    try {
      const raw = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY));
      if (!raw || raw.version !== 1 || !raw.days || typeof raw.days !== "object") return {};
      return Object.fromEntries(DAY_IDS.filter(function (id) {
        const item = raw.days[id];
        return item && Number.isFinite(item.fetchedAt) && item.fetchedAt > 0 && item.forecast && typeof item.forecast === "object";
      }).map(function (id) { return [id, raw.days[id]]; }));
    } catch (error) {
      return {};
    }
  }

  function seoulDateKey() {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(function (part) { return [part.type, part.value]; }));
    return values.year + "-" + values.month + "-" + values.day;
  }

  function weatherDateKey(dayId) {
    return "2026-" + dayId.slice(0, 2) + "-" + dayId.slice(2);
  }

  function weatherDayOffset(dayId) {
    return Math.round((Date.parse(weatherDateKey(dayId) + "T00:00:00Z") - Date.parse(seoulDateKey() + "T00:00:00Z")) / 86400000);
  }

  function weatherDescription(code) {
    if (!Number.isFinite(code)) return "天气预报";
    if (code === 0) return "晴";
    if (code <= 2) return "晴间多云";
    if (code === 3) return "阴";
    if (code === 45 || code === 48) return "有雾";
    if (code >= 51 && code <= 67) return "有雨";
    if (code >= 71 && code <= 77) return "有雪";
    if (code >= 80 && code <= 82) return "阵雨";
    if (code >= 85 && code <= 86) return "阵雪";
    if (code >= 95) return "雷雨";
    return "天气预报";
  }

  function weatherNumber(value, suffix) {
    return Number.isFinite(value) ? Math.round(value) + suffix : "--";
  }

  function weatherUpdatedAt(timestamp) {
    return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(timestamp));
  }

  function renderWeather() {
    const panel = document.getElementById("weather-panel");
    if (!panel) return;
    const dayId = state.activeDay;
    const cached = weatherCache[dayId];
    const content = panel.querySelector(".weather-content");
    const offset = weatherDayOffset(dayId);
    const loading = weatherPending.has(dayId);
    panel.querySelector("[data-refresh-weather]").disabled = loading;
    let message = "";
    if (offset < 0) message = "日期已过，不显示过期预报";
    else if (offset > 15) message = "尚未进入 16 天预报范围";
    else if (!cached) message = loading ? "正在获取沿途天气…" : (navigator.onLine ? (weatherErrors[dayId] ? "天气更新失败，请稍后重试" : "等待天气数据") : "离线中，暂无上次天气数据");
    if (panel.classList.contains("execution-weather")) {
      if (message) {
        content.innerHTML = '<span class="execution-weather-copy">' + htmlEscape(message) + '</span>';
      } else {
        const forecast = cached.forecast;
        const current = offset === 0 && Number.isFinite(forecast.currentTemp);
        const temp = weatherNumber(current ? forecast.currentTemp : forecast.high, "°");
        const weatherRisk = Number(forecast.rain) >= 60 ? "降雨风险高" : Number(forecast.gust) >= 45 ? "强风风险高" : "天气风险可控";
        content.innerHTML = '<span class="execution-weather-copy"><strong>' + htmlEscape(weatherDescription(current ? forecast.currentCode : forecast.code)) + " " + temp + '</strong><span>雨 ' + weatherNumber(forecast.rain, "%") + " · 阵风 " + weatherNumber(forecast.gust, " km/h") + " · " + weatherRisk + '</span></span>';
      }
      content.innerHTML += ((dayId === "0924" || dayId === "0928") ? '<span class="execution-ferry-note">天气不代表船班运行状态</span>' : "");
      return;
    }
    if (message) {
      content.innerHTML = '<p class="weather-empty">' + message + '</p>';
    } else {
      const forecast = cached.forecast;
      const current = offset === 0 && Number.isFinite(forecast.currentTemp);
      content.innerHTML = '<div class="weather-condition">' + htmlEscape(weatherDescription(current ? forecast.currentCode : forecast.code)) + ' · ' + (current ? "当前天气为模型估计" : "当天预报") + '</div>' +
        '<div class="weather-readings"><div class="weather-reading"><span>' + (current ? "当前气温" : "预计最高") + '</span><strong>' + weatherNumber(current ? forecast.currentTemp : forecast.high, "°") + '</strong><small>高 ' + weatherNumber(forecast.high, "°") + ' / 低 ' + weatherNumber(forecast.low, "°") + '</small></div>' +
        '<div class="weather-reading"><span>降雨概率</span><strong>' + weatherNumber(forecast.rain, "%") + '</strong><small>当天最高</small></div>' +
        '<div class="weather-reading"><span>最大阵风</span><strong>' + weatherNumber(forecast.gust, "") + '<em>km/h</em></strong><small>' + (current && Number.isFinite(forecast.currentWind) ? "当前风速 " + weatherNumber(forecast.currentWind, " km/h") : "当天预报") + '</small></div></div>';
    }
    const status = offset < 0 || offset > 15 ? "" : loading ? "更新中" : !navigator.onLine ? (cached ? "离线 · 上次更新" : "离线") : weatherErrors[dayId] ? (cached ? "更新失败 · 上次更新" : "更新失败") : cached ? "更新于" : "";
    content.innerHTML += '<div class="weather-meta"><span>' + (cached && status ? status + " " + htmlEscape(weatherUpdatedAt(cached.fetchedAt)) : status) + '</span><a href="https://open-meteo.com/en/docs" target="_blank" rel="noopener">Open-Meteo</a></div>' +
      ((dayId === "0924" || dayId === "0928") ? '<p class="weather-ferry-note">船班运行仍以码头公告为准</p>' : "");
    const summary = document.querySelector("[data-risk-weather]");
    if (summary) summary.textContent = message || weatherDescription(cached.forecast.code) + " · 雨 " + weatherNumber(cached.forecast.rain, "%") + " · 阵风 " + weatherNumber(cached.forecast.gust, " km/h") + (status !== "更新于" ? " · " + status : "");
    const risk = document.querySelector(".today-risk");
    if (risk) {
      const groups = tripLogic.cutoffGroups(dayById(dayId), state, Date.now());
      const highWeather = !message && hasHighWeatherRisk(dayId);
      risk.classList.toggle("warning", highWeather || Boolean(groups.next && groups.next.tone === "warning"));
      risk.classList.toggle("overdue", groups.overdue.length > 0);
      risk.open = openRiskDays.has(dayId) || highWeather || groups.overdue.length > 0 || Boolean(groups.next && groups.next.tone === "warning");
    }
  }

  function refreshWeather(force) {
    if (state.activeView !== "today" && !force) return;
    const dayId = state.activeDay;
    const offset = weatherDayOffset(dayId);
    const cached = weatherCache[dayId];
    if (offset < 0 || offset > 15 || weatherPending.has(dayId) || !navigator.onLine || (!force && cached && Date.now() - cached.fetchedAt < WEATHER_REFRESH_MS)) {
      renderWeather();
      return;
    }
    const place = data.places[WEATHER_REGIONS[dayId].place];
    const params = new URLSearchParams({
      latitude: place.lat, longitude: place.lng,
      current: "temperature_2m,wind_speed_10m,weather_code",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_gusts_10m_max",
      timezone: "Asia/Seoul", forecast_days: "16"
    });
    const controller = new AbortController();
    const timeout = window.setTimeout(function () { controller.abort(); }, 10000);
    weatherPending.add(dayId);
    delete weatherErrors[dayId];
    renderWeather();
    fetch("https://api.open-meteo.com/v1/forecast?" + params, { cache: "no-store", signal: controller.signal }).then(function (response) {
      if (!response.ok) throw new Error("Weather service unavailable");
      return response.json();
    }).then(function (payload) {
      const daily = payload.daily;
      const index = daily && Array.isArray(daily.time) ? daily.time.indexOf(weatherDateKey(dayId)) : -1;
      if (index < 0) throw new Error("Forecast date unavailable");
      const numberOrNull = function (value) { return Number.isFinite(value) ? value : null; };
      weatherCache[dayId] = { fetchedAt: Date.now(), forecast: {
        code: numberOrNull(daily.weather_code[index]),
        high: numberOrNull(daily.temperature_2m_max[index]),
        low: numberOrNull(daily.temperature_2m_min[index]),
        rain: numberOrNull(daily.precipitation_probability_max[index]),
        gust: numberOrNull(daily.wind_gusts_10m_max[index]),
        currentTemp: offset === 0 && payload.current && payload.current.time && payload.current.time.startsWith(weatherDateKey(dayId)) ? numberOrNull(payload.current.temperature_2m) : null,
        currentCode: offset === 0 && payload.current ? numberOrNull(payload.current.weather_code) : null,
        currentWind: offset === 0 && payload.current ? numberOrNull(payload.current.wind_speed_10m) : null
      } };
      try { localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ version: 1, days: weatherCache })); } catch (error) { /* Keep the weather visible without persistent storage. */ }
    }).catch(function () {
      weatherErrors[dayId] = true;
    }).finally(function () {
      window.clearTimeout(timeout);
      weatherPending.delete(dayId);
      if (state.activeDay === dayId) {
        renderWeather();
      }
    });
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return "place-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function htmlEscape(value) {
    return String(value == null ? "" : value).replace(/[&<>"]/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char];
    });
  }

  function icon(name) {
    return '<span class="ui-icon" style="--icon-url:url(assets/icons/' + htmlEscape(name) + ')" aria-hidden="true"></span>';
  }

  function dayById(dayId) {
    return data.days.find(function (day) { return day.id === dayId; }) || data.days[0];
  }

  function routeMode(context) {
    const value = String(context || "").toLowerCase();
    if (/打车|taxi/.test(value)) return { kakao: "CAR", naver: "car" };
    if (/公交|bus|船班|航班/.test(value)) return { kakao: "PUBLICTRANSIT", naver: "public" };
    if (/骑行|bike|bicycle/.test(value)) return { kakao: "FOOT", naver: "bicycle" };
    return { kakao: "FOOT", naver: "walk" };
  }

  function hasCoordinates(place) {
    return Boolean(place && place.lat !== null && place.lat !== "" && place.lng !== null && place.lng !== "" &&
      isValidCoordinate(Number(place.lat), Number(place.lng)));
  }

  function mapLinks(place, context, compact) {
    if (!place) return "";
    const mode = routeMode(context);
    const destination = place.korean || place.name || place.address;
    const encodedName = encodeURIComponent(destination);
    let kakaoWeb;
    let naverWeb;
    let kakaoApp;
    let naverApp;
    let kakaoIntent;
    let naverIntent;

    if (hasCoordinates(place)) {
      const lat = Number(place.lat);
      const lng = Number(place.lng);
      kakaoWeb = "https://map.kakao.com/link/to/" + encodedName + "," + lat + "," + lng;
      naverWeb = "https://map.naver.com/p/directions/-,,/" + lng + "," + lat + "," + encodedName + "/-/" + mode.naver;
      kakaoApp = "kakaomap://route?ep=" + lat + "," + lng + "&by=" + mode.kakao;
      naverApp = "nmap://route/" + mode.naver + "?sname=" + encodeURIComponent("내 위치") + "&dlat=" + lat + "&dlng=" + lng + "&dname=" + encodedName + "&appname=jeju.olle.plan";
      kakaoIntent = "intent://route?ep=" + lat + "," + lng + "&by=" + mode.kakao + "#Intent;scheme=kakaomap;package=net.daum.android.map;S.browser_fallback_url=" + encodeURIComponent(kakaoWeb) + ";end";
      naverIntent = "intent://route/" + mode.naver + "?sname=" + encodeURIComponent("내 위치") + "&dlat=" + lat + "&dlng=" + lng + "&dname=" + encodedName + "&appname=jeju.olle.plan#Intent;scheme=nmap;package=com.nhn.android.nmap;S.browser_fallback_url=" + encodeURIComponent(naverWeb) + ";end";
    } else {
      kakaoWeb = place.mapInput && /kakao|kko./i.test(place.mapInput) ? place.mapInput : "https://map.kakao.com/link/search/" + encodedName;
      naverWeb = place.mapInput && /naver/i.test(place.mapInput) ? place.mapInput : "https://map.naver.com/p/search/" + encodedName;
      kakaoApp = "kakaomap://search?q=" + encodedName;
      naverApp = "nmap://search?query=" + encodedName + "&appname=jeju.olle.plan";
      kakaoIntent = "intent://search?q=" + encodedName + "#Intent;scheme=kakaomap;package=net.daum.android.map;S.browser_fallback_url=" + encodeURIComponent(kakaoWeb) + ";end";
      naverIntent = "intent://search?query=" + encodedName + "&appname=jeju.olle.plan#Intent;scheme=nmap;package=com.nhn.android.nmap;S.browser_fallback_url=" + encodeURIComponent(naverWeb) + ";end";
    }

    const hasLocation = hasCoordinates(place);
    const cycling = /骑行|bike|bicycle/i.test(context || "");
    const kakaoLabel = hasLocation ? (cycling ? " 步行路线" : " 导航") : " 搜索";
    const naverLabel = hasLocation ? (cycling ? " 骑行路线" : " 导航") : " 搜索";
    return '<div class="map-actions">' +
      '<a class="map-button" href="' + htmlEscape(kakaoWeb) + '" target="_blank" rel="noopener" data-map-app="Kakao Map" data-app-url="' + htmlEscape(kakaoApp) + '" data-android-intent="' + htmlEscape(kakaoIntent) + '" aria-label="Kakao' + kakaoLabel + '：' + htmlEscape(place.name) + '">' + icon("map.svg") + "Kakao" + kakaoLabel + "</a>" +
      '<a class="map-button" href="' + htmlEscape(naverWeb) + '" target="_blank" rel="noopener" data-map-app="Naver Map" data-app-url="' + htmlEscape(naverApp) + '" data-android-intent="' + htmlEscape(naverIntent) + '" aria-label="Naver' + naverLabel + '：' + htmlEscape(place.name) + '">' + icon("navigation.svg") + "Naver" + naverLabel + "</a>" +
    "</div>";
  }

  function isMobileDevice() {
    const mobileUa = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const ipadDesktopUa = /Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
    return mobileUa || ipadDesktopUa;
  }

  function openMapApp(event, link) {
    if (!isMobileDevice()) return;
    event.preventDefault();
    const fallbackUrl = link.href;
    const launchUrl = /Android/i.test(navigator.userAgent) ? link.dataset.androidIntent : link.dataset.appUrl;
    let fallbackTimer;

    function stopFallback() {
      window.clearTimeout(fallbackTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pagehide", stopFallback);
    }
    function handleVisibility() {
      if (document.hidden) stopFallback();
    }

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pagehide", stopFallback, { once: true });
    showToast("正在打开 " + link.dataset.mapApp + "…");
    fallbackTimer = window.setTimeout(function () {
      stopFallback();
      if (!document.hidden) window.location.href = fallbackUrl;
    }, 1200);
    window.location.href = launchUrl;
  }

  function completedKm() {
    return Object.values(data.routes).reduce(function (total, route) {
      if (!route.counts) return total;
      const complete = (route.stamps || ["start", "middle", "end"]).every(function (stamp) {
        return Boolean(state.stamps[route.id + "-" + stamp]);
      });
      return total + (complete ? route.km : 0);
    }, 0);
  }

  function stampStats() {
    const requiredRoutes = Object.values(data.routes).filter(function (route) {
      return route.counts && !route.optional;
    });
    const total = requiredRoutes.length * 3;
    const checked = requiredRoutes.reduce(function (sum, route) {
      return sum + ["start", "middle", "end"].filter(function (stamp) {
        return Boolean(state.stamps[route.id + "-" + stamp]);
      }).length;
    }, 0);
    return { checked, total };
  }

  function executionForDay(dayId, create) {
    if (!state.executions[dayId] && create) {
      state.executions[dayId] = {
        status: "not-started",
        activeStepId: "",
        stepStates: {},
        startedAt: "",
        finishedAt: ""
      };
    }
    return state.executions[dayId] || { status: "not-started", activeStepId: "", stepStates: {}, startedAt: "", finishedAt: "" };
  }

  function isStepDone(execution, stepId) {
    return Boolean(execution.stepStates[stepId] && execution.stepStates[stepId].done);
  }

  function firstIncompleteStep(day, execution, startIndex) {
    const start = Number.isInteger(startIndex) ? startIndex : 0;
    return day.timeline.slice(start).find(function (item) { return !isStepDone(execution, item.id); }) || null;
  }

  function currentExecutionStep(day, execution) {
    const selected = day.timeline.find(function (item) { return item.id === execution.activeStepId && !isStepDone(execution, item.id); });
    return selected || firstIncompleteStep(day, execution);
  }

  function stampsForDay(day) {
    const plans = day.stampPlan || day.routeIds.map(function (routeId) {
      return { routeId, stamps: data.routes[routeId].stamps || ["start", "middle", "end"] };
    });
    return plans.flatMap(function (plan) {
      return plan.stamps.map(function (stamp) { return plan.routeId + "-" + stamp; });
    });
  }

  function syncExecutionFromStamps(day, execution) {
    let changed = false;
    day.timeline.forEach(function (item) {
      if (!item.completionStamps || !item.completionStamps.length) return;
      const complete = item.completionStamps.every(function (key) { return Boolean(state.stamps[key]); });
      if (complete && !isStepDone(execution, item.id)) {
        execution.stepStates[item.id] = { done: true };
        changed = true;
      } else if (!complete && isStepDone(execution, item.id)) {
        delete execution.stepStates[item.id];
        changed = true;
      }
    });
    const active = day.timeline.find(function (item) { return item.id === execution.activeStepId; });
    if (active && isStepDone(execution, active.id)) {
      const index = day.timeline.indexOf(active);
      const next = firstIncompleteStep(day, execution, index + 1) || firstIncompleteStep(day, execution);
      execution.activeStepId = next ? next.id : "";
      changed = true;
    }
    return changed;
  }

  function jejuNowParts() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(new Date());
    return Object.fromEntries(parts.map(function (part) { return [part.type, part.value]; }));
  }

  function suggestedStep(day, execution) {
    const now = jejuNowParts();
    if (now.year !== "2026" || now.month + now.day !== day.id) return null;
    const minutes = Number(now.hour) * 60 + Number(now.minute);
    return day.timeline.filter(function (item) {
      const time = item.time.split(":").map(Number);
      return time[0] * 60 + time[1] <= minutes && !isStepDone(execution, item.id);
    }).at(-1) || null;
  }

  function nextStamp(day) {
    const labels = { start: "起点", middle: "中间", end: "终点" };
    const plans = day.stampPlan || day.routeIds.map(function (routeId) {
      return { routeId, stamps: data.routes[routeId].stamps || ["start", "middle", "end"] };
    });
    for (const plan of plans) {
      for (const stamp of plan.stamps) {
        const key = plan.routeId + "-" + stamp;
        if (!state.stamps[key]) {
          return { key, routeId: plan.routeId, stamp, label: labels[stamp], point: data.stampLocations[plan.routeId][stamp] };
        }
      }
    }
    return null;
  }

  function stampNavigationPlace(stamp) {
    const nearby = stamp.point.place ? data.places[stamp.point.place] : null;
    return nearby ? Object.assign({}, nearby, { name: stamp.point.korean + "章附近", korean: stamp.point.korean }) : {
      name: stamp.point.korean + "章",
      korean: stamp.point.korean,
      address: "官方图：本线 " + stamp.point.km.toFixed(1) + " km 处；请沿现场偶来标识找盖章亭"
    };
  }

  function distanceMeters(from, place) {
    if (!from || !hasCoordinates(place)) return null;
    const radians = function (degree) { return degree * Math.PI / 180; };
    const lat1 = radians(from.lat);
    const lat2 = radians(Number(place.lat));
    const deltaLat = radians(Number(place.lat) - from.lat);
    const deltaLng = radians(Number(place.lng) - from.lng);
    const value = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  }

  function formatDistance(meters) {
    if (!Number.isFinite(meters)) return "";
    return meters < 1000 ? Math.round(meters) + " m" : (meters / 1000).toFixed(meters < 10000 ? 1 : 0) + " km";
  }

  function cutoffStatus(day) {
    return tripLogic.cutoffGroups(day, state, Date.now()).next;
  }

  function cutoffDisplay(day, cutoff) {
    if (!cutoff) return "无";
    if (cutoff.tone === "preview") return Number(day.id.slice(0, 2)) + "/" + Number(day.id.slice(2)) + " " + cutoff.time;
    return cutoff.time + " · " + cutoff.countdown;
  }

  function hasHighWeatherRisk(dayId) {
    const cached = weatherCache[dayId];
    const forecast = cached && cached.forecast;
    return Boolean(forecast && (Number(forecast.rain) >= 60 || Number(forecast.gust) >= 45));
  }

  function startExecution(dayId) {
    if (state.activeDay !== dayId) clearExecutionLocation();
    const day = dayById(dayId);
    const execution = executionForDay(dayId, true);
    syncExecutionFromStamps(day, execution);
    const current = currentExecutionStep(day, execution);
    execution.status = "active";
    execution.activeStepId = current ? current.id : "";
    execution.startedAt = execution.startedAt || new Date().toISOString();
    execution.finishedAt = "";
    state.activeView = "today";
    state.activeDay = dayId;
    saveState();
    renderAll();
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function completeExecutionStep(dayId) {
    const day = dayById(dayId);
    const execution = executionForDay(dayId, true);
    const current = currentExecutionStep(day, execution);
    if (!current) return;
    const missing = (current.completionStamps || []).filter(function (key) { return !state.stamps[key]; });
    if (missing.length) {
      showToast("还缺 " + missing.length + " 枚关联章，盖齐后本步骤会自动完成");
      return;
    }
    execution.stepStates[current.id] = { done: true };
    const index = day.timeline.indexOf(current);
    const next = firstIncompleteStep(day, execution, index + 1) || firstIncompleteStep(day, execution);
    execution.activeStepId = next ? next.id : "";
    saveState();
    renderAll();
    showToast(next ? "已进入下一步" : "全部步骤已完成，可以结束今日");
  }

  function returnToPreviousStep(dayId) {
    const day = dayById(dayId);
    const execution = executionForDay(dayId, true);
    const current = currentExecutionStep(day, execution);
    const currentIndex = current ? day.timeline.indexOf(current) : day.timeline.length;
    if (currentIndex <= 0) {
      showToast("已经是第一步");
      return;
    }
    const previous = day.timeline[currentIndex - 1];
    if (previous.completionStamps && previous.completionStamps.every(function (key) { return Boolean(state.stamps[key]); })) {
      showToast("上一步关联章已盖齐，取消对应章点后才能撤销完成");
      return;
    }
    delete execution.stepStates[previous.id];
    execution.activeStepId = previous.id;
    saveState();
    renderAll();
    showToast("已返回上一步");
  }

  function finishExecution(dayId) {
    const day = dayById(dayId);
    const execution = executionForDay(dayId, true);
    const unfinishedSteps = day.timeline.filter(function (item) { return !isStepDone(execution, item.id); }).length;
    const unstamped = stampsForDay(day).filter(function (key) { return !state.stamps[key]; }).length;
    const message = "结束今日？还有 " + unfinishedSteps + " 个步骤未完成、" + unstamped + " 枚章未盖。进度会保留，可随时重新打开。";
    if (!window.confirm(message)) return;
    execution.status = "finished";
    execution.finishedAt = new Date().toISOString();
    saveState();
    renderAll();
    showToast("今日执行已结束");
  }

  function chooseSuggestedStep(dayId, stepId) {
    chooseExecutionStep(dayId, stepId, "已定位到计划建议步骤，未改动完成状态");
  }

  function chooseExecutionStep(dayId, stepId, message) {
    const day = dayById(dayId);
    const item = day.timeline.find(function (entry) { return entry.id === stepId; });
    if (!item) return;
    const execution = executionForDay(dayId, true);
    if (isStepDone(execution, stepId)) {
      showToast("该步骤已经完成");
      return;
    }
    execution.activeStepId = stepId;
    saveState();
    renderAll();
    window.scrollTo({ top: 0, behavior: "smooth" });
    showToast(message || "已设为当前步骤，未改动其他进度");
  }

  function stampActionContext(key) {
    const labels = { start: "起点章", middle: "中间章", end: "终点章" };
    for (const day of data.days) {
      const plans = day.stampPlan || day.routeIds.map(function (routeId) {
        return { routeId, stamps: data.routes[routeId].stamps || ["start", "middle", "end"] };
      });
      for (const plan of plans) {
        for (const stamp of plan.stamps) {
          if (plan.routeId + "-" + stamp !== key) continue;
          const step = day.timeline.find(function (item) { return (item.completionStamps || []).includes(key); });
          return { dayId: day.id, stepId: step ? step.id : "", label: plan.routeId + "号线" + labels[stamp] };
        }
      }
    }
    return { dayId: "", stepId: "", label: "章点" };
  }

  function undoStamp() {
    if (!lastStampAction) return;
    hideCelebration();
    recentlyStamped = "";
    const action = lastStampAction;
    lastStampAction = null;
    state.stamps[action.key] = false;
    if (action.dayId) {
      const day = dayById(action.dayId);
      const execution = state.executions[action.dayId];
      if (execution) {
        syncExecutionFromStamps(day, execution);
        if (action.autoAdvanced && execution.status === "active" && action.stepId && !isStepDone(execution, action.stepId)) execution.activeStepId = action.stepId;
      }
    }
    saveState();
    renderAll();
    showToast("已撤销“" + action.label + "”");
  }

  function clearExecutionLocation() {
    executionLocationRequestId += 1;
    executionLocation = null;
    executionLocationError = "";
    executionLocationPending = false;
  }

  function updateExecutionLocation() {
    if (!("geolocation" in navigator)) {
      executionLocationError = "此浏览器不支持定位";
      renderToday();
      renderWeather();
      return;
    }
    executionLocationPending = true;
    executionLocationError = "";
    const requestId = ++executionLocationRequestId;
    renderToday();
    renderWeather();
    navigator.geolocation.getCurrentPosition(function (position) {
      if (requestId !== executionLocationRequestId) return;
      if (isValidCoordinate(position.coords.latitude, position.coords.longitude)) {
        executionLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          updatedAt: Date.now()
        };
      } else executionLocationError = "位置坐标无效，请重试";
      executionLocationPending = false;
      renderToday();
      renderWeather();
    }, function (error) {
      if (requestId !== executionLocationRequestId) return;
      executionLocationPending = false;
      executionLocationError = error.code === 1 ? "定位权限被拒绝" : error.code === 3 ? "定位超时，请重试" : "暂时无法取得位置";
      renderToday();
      renderWeather();
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  }

  function checkinsForDay(dayId) {
    const defaults = data.defaultCheckins.filter(function (item) { return item.dayId === dayId; }).map(function (item) {
      return Object.assign({ custom: false }, item);
    });
    const custom = state.customCheckins.filter(function (item) { return item.dayId === dayId; });
    return defaults.concat(custom);
  }

  function combinedCheckins() {
    return data.defaultCheckins.map(function (item) { return Object.assign({ custom: false }, item); }).concat(state.customCheckins);
  }

  function expensesForDay(dayId) {
    return state.expenses.filter(function (expense) { return expense.dayId === dayId; });
  }

  function expenseTotals(items) {
    return items.reduce(function (totals, expense) {
      totals[expense.currency] += expense.amount;
      totals.count += 1;
      return totals;
    }, { KRW: 0, CNY: 0, count: 0 });
  }

  function formatMoney(amount, currency) {
    const value = new Intl.NumberFormat("zh-CN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: currency === "KRW" ? 0 : 2
    }).format(amount || 0);
    return (currency === "KRW" ? "₩" : "¥") + value;
  }

  function renderTodayExpensePanel(dayId) {
    const totals = expenseTotals(expensesForDay(dayId));
    return '<section class="status-panel today-expense"><div class="status-panel-head"><h3>当天花销</h3><span>' + totals.count + ' 笔</span></div><div class="today-money"><strong>' + formatMoney(totals.KRW, "KRW") + '</strong><strong>' + formatMoney(totals.CNY, "CNY") + '</strong></div><div class="data-actions"><button class="secondary-button" type="button" data-open-expense>' + icon("receipt-text.svg") + "记一笔</button></div></section>";
  }

  function placeForCheckin(item) {
    if (item.custom) {
      return {
        name: item.name,
        korean: item.korean,
        address: item.address,
        lat: item.lat,
        lng: item.lng,
        mapInput: item.mapInput
      };
    }
    return data.places[item.place];
  }

  function renderHero() {
    const km = completedKm();
    const stamps = stampStats();
    const percent = Math.min(100, km);
    document.getElementById("today-overview").innerHTML =
      '<section class="trip-summary"><div><p class="trip-date">2026.09.23—09.28</p><h1 id="today-title">沿着海岸，收集济州</h1><p>偶来 100 km · 核心计划 ' + data.trip.coreCertificateKm + ' km</p></div><div class="trip-summary-progress"><div><span>已集齐章的步行线路</span><strong>' + km.toFixed(1) + ' <small>km</small></strong></div><div class="progress-track"><div class="progress-fill" style="width:' + percent + '%"></div></div><p>核心章点 ' + stamps.checked + '/' + stamps.total + ' · 整线集齐后计入里程</p></div></section>';
  }

  function renderDateStrip(targetId) {
    document.getElementById(targetId).innerHTML = data.days.map(function (day) {
      return '<button class="date-chip" type="button" data-day="' + day.id + '" aria-selected="' + (state.activeDay === day.id) + '"><time datetime="2026-' + day.id.slice(0, 2) + "-" + day.id.slice(2) + '">' + day.date.replace("月", "/").replace("日", "") + "</time><span>" + htmlEscape(day.label) + "</span></button>";
    }).join("");
  }

  function renderTodayAction(day, execution) {
    const selected = tripLogic.selectedStep(day, Date.now(), manualStepByDay[day.id]);
    const step = selected.step;
    const place = data.places[step.place];
    const label = selected.manual ? "正在查看" : selected.preview ? "行程预览" : selected.beforeStart ? "今天从这里出发" : "此时计划";
    return '<section class="today-action-card" data-current-plan="' + step.id + '"><div class="today-action-top"><div><span class="next-label">' + label + '</span><time>' + htmlEscape(step.time) + '</time><small>' + (step.timeZone === "Asia/Shanghai" ? "北京时间" : "济州时间") + '</small></div><span class="mode-badge">' + htmlEscape(step.type) + '</span></div><div class="today-action-heading"><h3>' + htmlEscape(step.title) + '</h3><p>' + htmlEscape(step.detail) + '</p></div>' + (place ? '<p class="action-destination" lang="ko">' + htmlEscape(place.korean) + '</p>' + mapLinks(place, step.type) : "") + '<div class="advisory-controls"><button type="button" data-browse-step="' + (selected.index - 1) + '" ' + (selected.index === 0 ? "disabled" : "") + '>上一项</button><button type="button" data-reset-advisory ' + (!selected.manual ? "disabled" : "") + '>' + (selected.preview ? "回到首项" : "回到此时计划") + '</button><button type="button" data-browse-step="' + (selected.index + 1) + '" ' + (selected.index === day.timeline.length - 1 ? "disabled" : "") + '>下一项</button></div><p class="advisory-note">按计划时间提示 · 不会自动记录完成</p></section>';
  }

  function renderTodayActionMetrics(day, cutoff, checkedStamps, totalStamps, km) {
    return '<div class="today-action-metrics"><div class="' + (cutoff ? cutoff.tone : "normal") + '"><span>最近截止</span><strong>' + htmlEscape(cutoffDisplay(day, cutoff)) + '</strong></div><div><span>当天盖章</span><strong>' + checkedStamps + " / " + totalStamps + '</strong></div><div><span>认证进度</span><strong>' + km.toFixed(1) + " km</strong></div></div>";
  }

  function renderExecutionCutoff(day) {
    const cutoff = cutoffStatus(day);
    if (!cutoff) return "";
    return '<section class="execution-cutoff ' + cutoff.tone + '" data-cutoff-id="' + cutoff.id + '"><div><span>硬截止' + (cutoff.tone === "preview" ? "" : " · " + htmlEscape(cutoff.time)) + '</span><strong>' + htmlEscape(cutoff.title) + '</strong></div><b>' + htmlEscape(cutoff.tone === "preview" ? cutoffDisplay(day, cutoff) : cutoff.countdown) + '</b><p>' + htmlEscape(cutoff.action) + "</p></section>";
  }

  function renderExecutionStatus(day) {
    const cutoff = cutoffStatus(day);
    const cached = weatherCache[day.id];
    const forecast = cached && cached.forecast;
    const weather = forecast ? weatherDescription(forecast.code) + " · 雨 " + weatherNumber(forecast.rain, "%") + " · 风 " + weatherNumber(forecast.gust, " km/h") : "天气待更新";
    return '<div class="execution-statusbar"><div class="' + (cutoff ? cutoff.tone : "normal") + '"><span>硬截止</span><strong>' + htmlEscape(cutoffDisplay(day, cutoff)) + '</strong></div><div class="' + (hasHighWeatherRisk(day.id) ? "warning" : "normal") + '"><span>沿途天气</span><strong>' + htmlEscape(weather) + '</strong></div></div>';
  }

  function renderExecutionStamp(day) {
    const stamp = nextStamp(day);
    if (!stamp) {
      return '<section class="execution-stamp complete"><div class="execution-section-label">' + icon("award.svg") + '<span>下一枚章</span></div><h3>当天章点已全部完成</h3><p>检查纸质护照上的印迹是否清晰。</p></section>';
    }
    const place = stampNavigationPlace(stamp);
    const officialImage = "https://contents.ollepass.org/static/homepage/trail/img/road/" + data.stampLocations[stamp.routeId].map;
    const distance = executionLocation ? distanceMeters(executionLocation, place) : null;
    let locationCopy;
    if (!hasCoordinates(place)) locationCopy = "章亭精确坐标未核实，不计算距离";
    else if (executionLocationPending) locationCopy = "正在获取当前位置…";
    else if (executionLocationError) locationCopy = executionLocationError;
    else if (Number.isFinite(distance)) locationCopy = "直线约 " + formatDistance(distance) + " · " + (Number.isFinite(executionLocation.accuracy) ? "精度 ±" + Math.round(executionLocation.accuracy) + " m" + (executionLocation.accuracy > 100 ? "（低精度）" : "") : "精度未知") + " · " + new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(executionLocation.updatedAt)) + " 更新";
    else locationCopy = "点击后仅申请一次位置权限";
    return '<section class="execution-stamp"><div class="execution-section-label">' + icon("award.svg") + '<span>下一枚章</span><a href="' + htmlEscape(officialImage) + '" target="_blank" rel="noopener">官方章点图</a></div><div class="execution-stamp-head"><div><span>' + htmlEscape(stamp.routeId) + '号线 · ' + htmlEscape(stamp.label) + '章</span><h3 lang="ko">' + htmlEscape(stamp.point.korean) + '</h3></div><strong>' + stamp.point.km.toFixed(1) + '<small>KM</small></strong></div><p>' + htmlEscape(stamp.point.note || "按官方路线图和现场偶来标识寻找章亭。") + '</p><div class="execution-location"><span>' + htmlEscape(locationCopy) + '</span>' + (hasCoordinates(place) ? '<button type="button" data-update-execution-location ' + (executionLocationPending ? "disabled" : "") + '>' + icon("navigation.svg") + "更新位置</button>" : "") + '</div><div class="execution-stamp-actions">' + mapLinks(place, "步行", true) + '<label class="execution-stamp-check"><input type="checkbox" data-stamp="' + stamp.key + '" aria-label="' + htmlEscape(stamp.routeId + "号线" + stamp.label + "章已盖") + '"><span>' + icon("check.svg") + "已盖好</span></label></div></section>";
  }

  function renderExecutionCurrent(day, execution) {
    const current = currentExecutionStep(day, execution);
    const doneCount = day.timeline.filter(function (item) { return isStepDone(execution, item.id); }).length;
    if (!current) {
      return '<section class="execution-current all-done"><div class="execution-section-label">' + icon("check.svg") + '<span>全部步骤</span></div><h2>今天的计划已完成</h2><p>确认纸质章印清晰后结束今日。</p><button class="primary-button" type="button" data-finish-execution="' + day.id + '">结束今日</button></section>';
    }
    const place = current.place ? data.places[current.place] : null;
    const currentIndex = day.timeline.indexOf(current);
    const suggestion = suggestedStep(day, execution);
    const missing = (current.completionStamps || []).filter(function (key) { return !state.stamps[key]; });
    return '<section class="execution-current"><div class="execution-current-top"><div><span class="execution-kicker">CURRENT STEP · ' + (doneCount + 1) + "/" + day.timeline.length + '</span><time>' + htmlEscape(current.time) + '</time></div><span class="mode-badge">' + htmlEscape(current.type) + '</span></div><h2>' + htmlEscape(current.title) + '</h2><p>' + htmlEscape(current.detail) + '</p>' + (place ? '<div class="execution-place"><b lang="ko">' + htmlEscape(place.korean) + '</b><span>' + htmlEscape(place.address) + '</span></div>' + mapLinks(place, current.type + " " + current.title) : "") + (missing.length ? '<p class="execution-stamp-lock">' + icon("award.svg") + "盖齐关联的 " + missing.length + " 枚章后自动完成此步骤</p>" : "") + '<div class="execution-controls"><button class="secondary-button" type="button" data-previous-step="' + day.id + '" ' + (currentIndex === 0 ? "disabled" : "") + '>返回上一步</button><button class="primary-button" type="button" data-complete-step="' + day.id + '">' + icon("check.svg") + '完成并继续</button></div>' + (suggestion && suggestion.id !== current.id ? '<div class="execution-suggestion"><span>按济州时间，计划建议在</span><button type="button" data-suggested-step="' + suggestion.id + '" data-execution-day="' + day.id + '">' + htmlEscape(suggestion.time + " · " + suggestion.title) + '</button><small>仅建议，不会自动更改进度</small></div>' : "") + "</section>";
  }

  function renderExecutionTimeline(day, execution) {
    const done = day.timeline.filter(function (item) { return isStepDone(execution, item.id); }).length;
    return '<details class="execution-timeline" data-execution-timeline ' + (executionTimelineOpen ? "open" : "") + '><summary><span>' + icon("calendar-days.svg") + '完整时间轴</span><small>' + done + " / " + day.timeline.length + " 已完成 " + icon("chevron-down.svg") + '</small></summary><div class="execution-timeline-list">' + day.timeline.map(function (item) {
      const itemDone = isStepDone(execution, item.id);
      const active = item.id === execution.activeStepId;
      return '<article class="execution-timeline-item ' + (itemDone ? "done" : "") + (active ? " active" : "") + '"><time>' + htmlEscape(item.time) + '</time><div><h3>' + htmlEscape(item.title) + '</h3><p>' + htmlEscape(item.detail) + '</p></div>' + (itemDone ? '<span class="timeline-state">' + icon("check.svg") + '</span>' : active ? '<span class="timeline-state current">当前</span>' : '<button class="timeline-select" type="button" data-select-execution-step="' + htmlEscape(item.id) + '" data-execution-day="' + day.id + '">设为当前</button>') + "</article>";
    }).join("") + "</div></details>";
  }

  function renderExecutionRiskDetails(day) {
    const cutoff = cutoffStatus(day);
    const autoOpen = Boolean(cutoff && ["warning", "overdue"].includes(cutoff.tone)) || hasHighWeatherRisk(day.id);
    const summary = autoOpen ? "需要立即留意" : "按需查看";
    return '<details class="execution-risk-details" ' + (autoOpen || executionRiskOpen ? "open" : "") + '><summary><span>' + icon("award.svg") + '截止与天气详情</span><small>' + summary + " " + icon("chevron-down.svg") + '</small></summary><div class="execution-risk-content">' + renderExecutionCutoff(day) + '<section class="weather-strip execution-weather" id="weather-panel" aria-label="沿途天气风险"><div class="weather-top"><div class="weather-heading"><span>天气风险</span><strong>' + htmlEscape(WEATHER_REGIONS[day.id].name) + '</strong></div><button class="weather-refresh" type="button" data-refresh-weather aria-label="刷新沿途天气" title="刷新沿途天气">' + icon("refresh-cw.svg") + '</button></div><div class="weather-content" aria-live="polite"></div></section></div></details>';
  }

  function renderExecutionToday(day, execution) {
    syncExecutionFromStamps(day, execution);
    return '<div class="execution-shell"><header class="execution-datebar"><div><span>' + htmlEscape(day.weekday) + " · " + htmlEscape(day.date) + '</span><h1 id="execution-title">' + htmlEscape(day.label) + '</h1></div><button type="button" data-finish-execution="' + day.id + '">结束今日</button></header>' + renderExecutionStatus(day) + '<div class="execution-grid"><main>' + renderExecutionCurrent(day, execution) + renderExecutionStamp(day) + '</main><aside>' + renderExecutionRiskDetails(day) + '</aside></div>' + renderExecutionTimeline(day, execution) + (state.fallbacks[day.id] ? '<section class="execution-fallback"><strong>备选方案已启用</strong><p>' + htmlEscape(day.fallback) + '</p></section>' : "") + "</div>";
  }

  function renderQuickTimeline(day) {
    const startIndex = tripLogic.selectedStep(day, Date.now(), manualStepByDay[day.id]).index;
    const items = day.timeline.slice(startIndex + 1, startIndex + 3);
    if (!items.length) return "";
    return '<div class="section-heading"><h2>接下来</h2><span>' + items.length + ' 个节点</span></div><div class="quick-timeline">' + items.map(function (item) {
      return '<article class="quick-step"><time>' + htmlEscape(item.time) + '</time><div class="step-card"><h3>' + htmlEscape(item.title) + "</h3><p>" + htmlEscape(item.detail) + '</p><button class="text-button" type="button" data-browse-step="' + day.timeline.indexOf(item) + '">查看这一项</button></div></article>';
    }).join("") + "</div>";
  }

  function officialCourseUrl(routeId) {
    const parts = routeId.split("-");
    parts[0] = parts[0].padStart(2, "0");
    return "https://www.jejuolle.org/trail#/road/" + parts.join("-");
  }

  function routeGuidesForDay(day) {
    const routeIds = day.stampPlan ? day.stampPlan.map(function (plan) { return plan.routeId; }) : day.routeIds;
    return routeIds.map(function (routeId) {
      const guide = data.routeGuides[routeId];
      return guide && { routeId, title: guide.title, intro: guide.intro, points: guide.highlights.filter(function (point) { return point.dayId === day.id; }) };
    }).filter(Boolean);
  }

  function renderRouteTeaser(day) {
    const guides = routeGuidesForDay(day);
    if (!guides.length) return "";
    const key = "today-" + day.id;
    const pointCount = guides.reduce(function (count, guide) { return count + guide.points.length; }, 0);
    return '<details class="route-teaser" data-route-disclosure="' + key + '" ' + (openRouteDetails.has(key) ? "open" : "") + '><summary class="route-teaser-head"><h3>沿途看点</h3><span>' + pointCount + ' 处 ' + icon("chevron-down.svg") + '</span></summary><div class="route-teaser-content">' + guides.map(function (guide) {
      return '<p><strong>' + htmlEscape(guide.routeId) + '号线 · ' + htmlEscape(guide.title) + '</strong><span>' + guide.points.map(function (point) { return htmlEscape(data.places[point.place].name); }).join(" · ") + '</span></p>';
    }).join("") + '<button class="text-button" type="button" data-view-target="plan">查看路线</button></div></details>';
  }

  function renderRouteGuides(day, printMode) {
    const guides = routeGuidesForDay(day);
    if (!guides.length) return "";
    const key = "plan-" + day.id;
    const pointCount = guides.reduce(function (count, guide) { return count + guide.points.length; }, 0);
    return '<details class="route-guide-disclosure" data-route-disclosure="' + key + '" ' + (printMode || openRouteDetails.has(key) ? "open" : "") + '><summary class="section-heading route-guide-summary"><h2>沿途特色与打卡</h2><span>' + pointCount + ' 处看点 ' + icon("chevron-down.svg") + '</span></summary><div class="route-guide-list">' + guides.map(function (guide) {
      return '<section class="route-guide"><header class="route-guide-head"><div><strong>' + htmlEscape(guide.routeId) + '号线</strong><h3>' + htmlEscape(guide.title) + '</h3></div><a href="' + htmlEscape(officialCourseUrl(guide.routeId)) + '" target="_blank" rel="noopener" aria-label="查看' + guide.routeId + '号线官方路线介绍">' + icon("external-link.svg") + '官方路线</a></header><p class="route-guide-intro">' + htmlEscape(guide.intro) + '</p><div class="route-highlights">' + guide.points.map(function (point) {
        const place = data.places[point.place];
        const checked = Boolean(state.checkinChecks[point.id]);
        return '<article class="route-highlight ' + (checked ? "completed" : "") + '"><div class="route-highlight-main"><span class="route-highlight-km">' + point.km.toFixed(1) + '<small>KM</small></span><div class="route-highlight-copy"><div class="route-highlight-label"><span>顺路打卡</span><small>' + htmlEscape(point.stop) + '</small></div><h4>' + htmlEscape(place.name) + '</h4><p lang="ko">' + htmlEscape(place.korean) + '</p><p>' + htmlEscape(point.note) + '</p></div><button class="checkin-toggle ' + (checked ? "checked" : "") + '" type="button" data-toggle-checkin="' + htmlEscape(point.id) + '" aria-label="' + (checked ? "取消打卡" : "标记已打卡") + htmlEscape(place.name) + '" title="' + (checked ? "取消打卡" : "标记已打卡") + '">' + icon(checked ? "check.svg" : "bookmark.svg") + '</button></div><div class="route-highlight-actions">' + mapLinks(place, data.routes[guide.routeId].mode, true) + '<span>韩文地名搜索 · 按偶来路标行走</span></div></article>';
      }).join("") + '</div></section>';
    }).join("") + '</div></details>';
  }

  function confirmationsForDay(dayId) {
    return data.confirmations.filter(function (item) { return item.dayId === dayId; });
  }

  function renderConfirmationRows(items) {
    if (!items.length) return '<p class="checkin-detail">今天没有待确认事项。</p>';
    return '<div class="check-list">' + items.map(function (item) {
      return '<label class="confirmation-row"><input type="checkbox" data-confirmation="' + item.id + '" ' + (state.confirmations[item.id] ? "checked" : "") + '><span>' + htmlEscape(item.label) + '</span><small>' + htmlEscape(item.hint) + "</small></label>";
    }).join("") + "</div>";
  }

  function renderToday() {
    const day = dayById(state.activeDay);
    const confirmations = confirmationsForDay(day.id);
    const checkedConfirmations = confirmations.filter(function (item) { return state.confirmations[item.id]; }).length;
    const checkins = checkinsForDay(day.id);
    const checkedPlaces = checkins.filter(function (item) { return state.checkinChecks[item.id]; }).length;
    document.getElementById("today-content").innerHTML =
      '<div class="today-context"><span>' + (tripLogic.dayKey(Date.now()) === tripLogic.dateKey(day.id) ? "今天" : "正在预览") + ' · ' + htmlEscape(day.date) + '</span><button class="text-button" type="button" data-return-today>' + (tripLogic.dayKey(Date.now()) < "2026-09-23" ? "回到出发日" : tripLogic.dayKey(Date.now()) > "2026-09-28" ? "回看最后一天" : "回到今天") + '</button></div><div class="day-title-row"><div><h2>' + htmlEscape(day.label) + '</h2></div><div class="distance-mark">' + day.walkKm.toFixed(1) + '<small>计划步行 km' + (day.bikeKm ? '<br>另骑行 ' + day.bikeKm + ' km' : '') + '</small></div></div>' +
      renderTodayAction(day) +
      '<div class="today-grid"><div class="today-primary">' +
        renderTodayRisk(day) + renderTodayStamp(day) +
        renderQuickTimeline(day) +
        '<div class="data-actions"><button class="secondary-button" type="button" data-open-plan-time>' + icon("calendar-days.svg") + '查看完整时间轴</button></div>' + renderRouteTeaser(day) +
      '</div><aside class="today-side">' +
        (confirmations.length ? '<section class="status-panel"><div class="status-panel-head"><h3>出发前确认</h3><span>' + checkedConfirmations + "/" + confirmations.length + "</span></div>" + renderConfirmationRows(confirmations) + "</section>" : "") +
        renderTodayExpensePanel(day.id) +
        '<section class="status-panel"><div class="status-panel-head"><h3>今天的收藏</h3><span>已到访 ' + checkedPlaces + "/" + checkins.length + '</span></div><div class="data-actions"><button class="secondary-button" type="button" data-view-target="checkins">' + icon("map-pin-check.svg") + '查看地点</button><button class="secondary-button" type="button" data-open-checkin>' + icon("plus.svg") + '新增</button></div></section>' +
      "</aside></div>";
    const otherCutoffs = document.querySelector("#today-content .other-cutoffs");
    if (otherCutoffs) {
      otherCutoffs.dataset.otherCutoffs = day.id;
      otherCutoffs.open = openOtherCutoffDays.has(day.id);
    }
  }

  function renderTodayStamp(day) {
    const keys = stampsForDay(day);
    if (!keys.length) return "";
    const stamp = nextStamp(day);
    const checked = keys.filter(function (key) { return state.stamps[key]; }).length;
    return '<details class="today-stamp ' + (recentlyStamped ? "just-stamped" : "") + '" data-stamp-day="' + day.id + '" ' + (openStampDays.has(day.id) ? "open" : "") + '><summary class="today-stamp-summary"><span>' + icon("award.svg") + '<span><b>' + (stamp ? '下一枚章 · ' + htmlEscape(stamp.routeId) + '号线' : '今天的章已集齐') + '</b><small>' + (stamp ? htmlEscape(stamp.label) + '章 · ' + htmlEscape(stamp.point.korean) : '记得检查纸质护照上的印迹') + '</small></span></span><strong>' + checked + '/' + keys.length + icon("chevron-down.svg") + '</strong></summary><div class="next-stamp-detail">' + renderExecutionStamp(day) + '<button class="text-button" type="button" data-open-plan-stamps>查看当天全部章点</button></div></details>';
  }

  function renderCutoffRow(cutoff, resolved) {
    const explicit = Boolean(state.cutoffChecks[cutoff.id]);
    return '<div class="cutoff-row ' + cutoff.tone + '" data-cutoff-id="' + cutoff.id + '"><div><strong>' + cutoff.time + ' · ' + htmlEscape(cutoff.title) + '</strong><span>' + htmlEscape(cutoff.countdown) + '</span><p>' + htmlEscape(cutoff.action) + '</p></div>' + (resolved && !explicit ? '<small>根据已记录事项确认</small>' : '<label class="cutoff-check"><input type="checkbox" data-cutoff-check="' + cutoff.id + '" ' + (explicit ? "checked" : "") + '>已处理</label>') + '</div>';
  }

  function renderTodayRisk(day) {
    const groups = tripLogic.cutoffGroups(day, state, Date.now());
    const urgent = Boolean(groups.overdue.length || (groups.next && groups.next.tone === "warning") || hasHighWeatherRisk(day.id));
    const others = (day.cutoffs || []).filter(function (item) { return (!groups.next || item.id !== groups.next.id) && !groups.overdue.some(function (past) { return past.id === item.id; }) && !groups.resolved.some(function (done) { return done.id === item.id; }); });
    return '<details class="today-risk" data-risk-day="' + day.id + '" ' + (urgent || openRiskDays.has(day.id) ? "open" : "") + '><summary><span>' + icon("calendar-days.svg") + '<span>截止与天气<small data-risk-weather>天气待更新</small></span></span><strong data-risk-deadline>' + htmlEscape(groups.next ? cutoffDisplay(day, groups.next) : groups.overdue.length ? "有待确认事项" : "暂无待处理截止") + '</strong>' + icon("chevron-down.svg") + '</summary><div class="risk-content">' + (groups.next ? renderCutoffRow(groups.next) : "") + (groups.overdue.length ? '<div class="risk-overdue"><h3>时间已过，请核对是否处理</h3>' + groups.overdue.map(function (item) { return renderCutoffRow(item); }).join("") + '</div>' : '') + (others.length || groups.resolved.length ? '<details class="other-cutoffs"><summary>其余截止与确认记录</summary>' + others.map(function (item) { return renderCutoffRow(Object.assign({}, item, { tone: "preview", countdown: "济州当地时间" })); }).join("") + groups.resolved.map(function (item) { return renderCutoffRow(item, true); }).join("") + '</details>' : '') + '<section class="weather-strip" id="weather-panel" aria-label="所选日期沿途天气"><div class="weather-top"><div class="weather-heading"><span>沿途天气</span><strong>' + htmlEscape(WEATHER_REGIONS[day.id].name) + '</strong></div><button class="weather-refresh" type="button" data-refresh-weather aria-label="刷新沿途天气">' + icon("refresh-cw.svg") + '</button></div><div class="weather-content" aria-live="polite"></div></section>' + (day.fallback ? '<div class="fallback-note ' + (state.fallbacks[day.id] ? "enabled" : "") + '"><p>' + htmlEscape(day.fallback) + '</p><label class="fallback-toggle"><input type="checkbox" data-fallback="' + day.id + '" ' + (state.fallbacks[day.id] ? "checked" : "") + '>已启用备选方案</label></div>' : '') + '</div></details>';
  }

  function renderTimeline(day) {
    return '<div class="section-heading"><h2>时间与交通</h2><span>' + day.timeline.length + ' 个节点</span></div><div class="timeline">' + day.timeline.map(function (item) {
      const place = item.place ? data.places[item.place] : null;
      const typeClass = item.risk ? "risk" : item.type === "徒步" ? "walk" : "";
      return '<article class="timeline-item"><time class="timeline-time">' + htmlEscape(item.time) + '</time><div class="timeline-card"><div class="timeline-top"><h3>' + htmlEscape(item.title) + '</h3><span class="type-tag ' + typeClass + '">' + htmlEscape(item.type) + "</span></div><p>" + htmlEscape(item.detail) + "</p>" + (place ? '<p class="place-address"><b>' + htmlEscape(place.korean) + "</b> · " + htmlEscape(place.address) + "</p>" + mapLinks(place, item.type + " " + item.title) : "") + '<button class="text-button timeline-browse" type="button" data-advisory-step="' + item.id + '" data-advisory-day="' + day.id + '">在今日页查看此项</button></div></article>';
    }).join("") + "</div>";
  }

  function renderStamps(day) {
    const plans = day.stampPlan || day.routeIds.map(function (routeId) {
      return { routeId, stamps: data.routes[routeId].stamps || ["start", "middle", "end"] };
    });
    if (!plans.length) return "";
    const labels = { start: "起点", middle: "中间", end: "终点" };
    return '<div class="section-heading"><h2>纸质护照盖章</h2><span>按官方分段图</span></div><div class="stamp-grid">' + plans.map(function (plan) {
      const route = data.routes[plan.routeId];
      const locations = data.stampLocations[plan.routeId];
      const note = plan.note || (route.counts ? "计入认证" : "骑行记录");
      const officialImage = "https://contents.ollepass.org/static/homepage/trail/img/road/" + locations.map;
      return '<section class="route-stamps"><div class="route-label"><div><strong>' + route.id + '号线</strong><span>' + route.km + " km · " + htmlEscape(note) + '</span></div><a class="stamp-map-link" href="' + htmlEscape(officialImage) + '" target="_blank" rel="noopener" aria-label="查看' + route.id + '号线官方盖章分段图">' + icon("map.svg") + '官方章点图</a></div>' + (locations.hint ? '<p class="stamp-route-hint">' + htmlEscape(locations.hint) + "</p>" : "") + plan.stamps.map(function (stamp) {
        const key = plan.routeId + "-" + stamp;
        const point = locations[stamp];
        const nearby = point.place ? data.places[point.place] : null;
        const place = nearby ? Object.assign({}, nearby, { name: point.korean + "章附近", korean: point.korean }) : {
          name: point.korean + "章", korean: point.korean,
          address: "官方图：本线 " + point.km.toFixed(1) + " km 处；请沿现场偶来标识找盖章亭"
        };
        return '<article class="stamp-point"><div class="stamp-point-main"><span class="stamp-km">' + point.km.toFixed(1) + '<small>KM</small></span><div class="stamp-point-text"><span class="stamp-stage">' + labels[stamp] + '章</span><strong lang="ko">' + htmlEscape(point.korean) + '</strong><p>' + htmlEscape(point.note || (nearby ? "导航到附近地标，按官方图和现场路标找章亭" : "未核实章亭精确坐标 · 地名搜索")) + '</p></div><label class="stamp-check"><input type="checkbox" data-stamp="' + key + '" aria-label="' + route.id + '号线' + labels[stamp] + '章已盖" ' + (state.stamps[key] ? "checked" : "") + '><span>已盖</span></label></div>' + mapLinks(place, "步行", true) + '</article>';
      }).join("") + '<p class="stamp-source">地点及公里标据<a href="' + htmlEscape(officialCourseUrl(route.id)) + '" target="_blank" rel="noopener">济州偶来官方路线页</a>；官方章点图需联网打开，图并非盖章亭实拍。</p></section>';
    }).join("") + "</div>";
  }

  function renderPlanSectionNav(day, dayCheckins, hotel, printMode) {
    if (printMode) return "";
    const hasStamps = Boolean((day.stampPlan && day.stampPlan.length) || day.routeIds.length);
    const links = [
      { id: "time", label: "时间", icon: "calendar-days.svg", show: true },
      { id: "stamps", label: "章点", icon: "award.svg", show: hasStamps },
      { id: "checkins", label: "打卡", icon: "map-pin-check.svg", show: dayCheckins.length > 0 },
      { id: "stay", label: hotel ? "住宿备注" : "当天备注", icon: hotel ? "house.svg" : "notebook-pen.svg", show: true }
    ].filter(function (item) { return item.show; });
    return '<nav class="plan-section-nav" aria-label="计划章节">' + links.map(function (item) {
      return '<button type="button" data-plan-section="plan-' + item.id + "-" + day.id + '">' + icon(item.icon) + htmlEscape(item.label) + "</button>";
    }).join("") + '<button class="plan-current-step" type="button" data-return-advisory>' + icon("navigation.svg") + '返回今日</button></nav>';
  }

  function renderPlanDay(day, printMode) {
    const totalDistance = day.walkKm + (day.bikeKm || 0);
    const hotel = day.hotel ? data.places[day.hotel] : null;
    const dayCheckins = checkinsForDay(day.id).filter(function (item) { return !item.routeHighlight; });
    return '<article class="' + (printMode ? "print-day" : "plan-day") + '"><header class="plan-day-header"><div><p class="overline">' + htmlEscape(day.weekday) + " · " + htmlEscape(day.date) + '</p><h2>' + htmlEscape(day.label) + "</h2><p>" + htmlEscape(day.lead) + '</p></div><div class="distance-mark">' + totalDistance.toFixed(1) + '<small>' + (day.bikeKm ? "WALK + BIKE" : "KM WALK") + "</small></div></header>" + renderPlanSectionNav(day, dayCheckins, hotel, printMode) +
      '<div class="plan-layout"><div>' + renderRouteGuides(day, printMode) + '<section id="plan-time-' + day.id + '" class="plan-anchor-section" tabindex="-1">' + renderTimeline(day) +
      (day.cutoff ? '<section class="cutoff-card"><strong>硬截止 · ' + htmlEscape(day.cutoff) + "</strong><p>" + htmlEscape(day.fallback) + '</p><label class="fallback-toggle"><input type="checkbox" data-fallback="' + day.id + '" ' + (state.fallbacks[day.id] ? "checked" : "") + '><span>' + (state.fallbacks[day.id] ? "已启用备选方案" : "启用备选方案") + "</span></label></section>" : "") +
      '</section><section id="plan-stamps-' + day.id + '" class="plan-anchor-section" tabindex="-1">' + renderStamps(day) + "</section>" +
      (dayCheckins.length ? '<section id="plan-checkins-' + day.id + '" class="plan-anchor-section" tabindex="-1"><div class="section-heading"><h2>当天打卡点</h2><span>' + dayCheckins.length + ' 个</span></div><div class="checkin-list">' + dayCheckins.map(renderCheckinCard).join("") + "</div></section>" : "") +
      '</div><aside id="plan-stay-' + day.id + '" class="plan-side plan-anchor-section" tabindex="-1">' +
      '<section class="status-panel"><div class="status-panel-head"><h3>出发前确认</h3><span>' + confirmationsForDay(day.id).filter(function (item) { return state.confirmations[item.id]; }).length + "/" + confirmationsForDay(day.id).length + "</span></div>" + renderConfirmationRows(confirmationsForDay(day.id)) + "</section>" +
      (hotel ? '<div class="section-heading"><h2>今晚住宿</h2></div><section class="hotel-card"><h3>' + htmlEscape(hotel.name) + "</h3><p><b>" + htmlEscape(hotel.korean) + "</b> · " + htmlEscape(hotel.address) + "</p>" + mapLinks(hotel, "步行") + "</section>" : "") +
      '<div class="section-heading"><h2>当天备注</h2><span>自动保存</span></div><textarea class="day-notes" data-day-note="' + day.id + '" rows="5" placeholder="记录天气、班次、身体状态和临时变更……">' + htmlEscape(state.dayNotes[day.id] || "") + "</textarea></aside></div></article>";
  }

  function renderPlan() {
    document.getElementById("plan-content").innerHTML = renderPlanDay(dayById(state.activeDay), false);
  }

  function checkinCategory(item) {
    return data.categories[item.category] || data.categories.other;
  }

  function renderCheckinCard(item) {
    const place = placeForCheckin(item);
    const category = checkinCategory(item);
    const day = dayById(item.dayId);
    const checked = Boolean(state.checkinChecks[item.id]);
    const detail = [item.dish, item.note].filter(Boolean).join(" · ");
    return '<article class="checkin-card ' + (checked ? "completed" : "") + (recentCheckins.has(item.id) ? " just-visited" : "") + '" data-checkin-card="' + htmlEscape(item.id) + '"><div class="checkin-card-top"><div><span class="category-label">' + icon(category.icon) + htmlEscape(category.label) + '</span><h2>' + htmlEscape(place.name) + '</h2>' + (checked ? '<span class="visited-badge">' + icon("check.svg") + '已到访</span>' : '') + (place.korean ? '<p class="checkin-korean">' + htmlEscape(place.korean) + "</p>" : "") + '</div><button class="checkin-toggle ' + (checked ? "checked" : "") + '" type="button" data-toggle-checkin="' + htmlEscape(item.id) + '" aria-pressed="' + checked + '" aria-label="' + (checked ? "取消打卡" : "标记已打卡") + '">' + icon("check.svg") + "</button></div>" +
      '<div class="checkin-meta"><span>' + htmlEscape(day.date) + "</span><span>" + htmlEscape(item.priority || "想去") + "</span>" + (item.slot ? "<span>" + htmlEscape(item.slot) + "</span>" : "") + "</div>" +
      (detail ? '<p class="checkin-detail">' + htmlEscape(detail) + "</p>" : "") +
      (place.address ? '<p class="place-address"><b>' + htmlEscape(place.korean || place.name) + "</b> · " + htmlEscape(place.address) + "</p>" : "") +
      (!hasCoordinates(place) ? '<p class="location-warning">' + (item.routeHighlight ? "按韩文地名搜索：具体位置以官方线路图和现场路标为准。" : "定位待补充：地图将先打开搜索结果。") + '</p>' : "") +
      '<div class="checkin-card-actions">' + mapLinks(place, item.mode, true) +
      (item.custom ? '<div class="custom-actions"><button type="button" data-edit-checkin="' + htmlEscape(item.id) + '" aria-label="编辑' + htmlEscape(place.name) + '" title="编辑">' + icon("pencil.svg") + '</button><button class="delete-action" type="button" data-delete-checkin="' + htmlEscape(item.id) + '" aria-label="删除' + htmlEscape(place.name) + '" title="删除">' + icon("trash-2.svg") + "</button></div>" : "") +
      "</div></article>";
  }

  function renderCheckinFilters() {
    const summary = document.getElementById("checkin-filter-summary");
    if (summary) summary.textContent = (filterState.day === "all" ? "全部日期" : dayById(filterState.day).date) + " · " + data.categories[filterState.category].label;
    const dayOptions = [{ id: "all", date: "全部日期" }].concat(data.days);
    document.getElementById("checkin-day-filter").innerHTML = dayOptions.map(function (day) {
      return '<button class="filter-chip" type="button" data-filter-day="' + day.id + '" aria-pressed="' + (filterState.day === day.id) + '">' + htmlEscape(day.date) + "</button>";
    }).join("");
    document.getElementById("checkin-category-filter").innerHTML = Object.keys(data.categories).map(function (key) {
      return '<button class="filter-chip" type="button" data-filter-category="' + key + '" aria-pressed="' + (filterState.category === key) + '">' + htmlEscape(data.categories[key].label) + "</button>";
    }).join("");
  }

  function checkinPriorityRank(priority) {
    const value = String(priority || "");
    if (value.includes("必") || value.includes("首选")) return 0;
    if (value.includes("想去") || value.includes("顺路")) return 1;
    if (value.includes("备选")) return 3;
    return 2;
  }

  function checkinMatchesQuery(item, query) {
    if (!query) return true;
    const place = placeForCheckin(item);
    return [place.name, place.korean, place.address, item.dish, item.note, item.priority, item.slot]
      .filter(Boolean).join(" ").toLocaleLowerCase("zh-CN").includes(query);
  }

  function renderCheckins() {
    renderCheckinFilters();
    const query = filterState.query.trim().toLocaleLowerCase("zh-CN");
    const items = combinedCheckins().filter(function (item) {
      const dayMatches = filterState.day === "all" || item.dayId === filterState.day;
      const categoryMatches = filterState.category === "all" || item.category === filterState.category;
      return dayMatches && categoryMatches && checkinMatchesQuery(item, query);
    }).sort(function (a, b) {
      const dayDifference = DAY_IDS.indexOf(a.dayId) - DAY_IDS.indexOf(b.dayId);
      return dayDifference || checkinPriorityRank(a.priority) - checkinPriorityRank(b.priority) || String(a.slot || "").localeCompare(String(b.slot || ""), "zh-CN");
    });
    const pending = items.filter(function (item) { return !state.checkinChecks[item.id] || recentCheckins.has(item.id); });
    const completed = items.filter(function (item) { return state.checkinChecks[item.id] && !recentCheckins.has(item.id); });
    const pendingHtml = pending.map(renderCheckinCard).join("");
    const completedHtml = completed.length ? '<details class="completed-checkins" ' + (query || completedCheckinsOpen ? "open" : "") + '><summary><span>旅程收藏 · 已到访 ' + completed.length + ' 处</span><small>' + (query ? "搜索结果" : "展开回看") + " " + icon("chevron-down.svg") + '</small></summary><div class="checkin-list completed-checkin-list">' + completed.map(renderCheckinCard).join("") + "</div></details>" : "";
    document.getElementById("checkin-list").innerHTML = pending.length || completed.length
      ? pendingHtml + completedHtml
      : '<div class="empty-state">' + icon("map-pin-off.svg") + "<p>当前筛选下没有打卡点。</p></div>";
    const searchInput = document.getElementById("checkin-search-input");
    const clearButton = document.querySelector("[data-clear-checkin-search]");
    if (searchInput && searchInput.value !== filterState.query) searchInput.value = filterState.query;
    if (clearButton) clearButton.hidden = !filterState.query;
  }

  function renderFlightCard(flight) {
    return '<article class="flight-card"><div class="flight-card-top"><span>' + htmlEscape(flight.direction + " · " + flight.date) + '</span><strong>' + htmlEscape(flight.number) + '</strong></div><div class="flight-route"><b>' + htmlEscape(flight.from) + "</b><i></i><b>" + htmlEscape(flight.to) + '</b></div><p class="flight-time"><strong>' + htmlEscape(flight.depart) + "</strong> → " + htmlEscape(flight.arrive) + '</p><p class="flight-note">' + htmlEscape(flight.airline + " · " + flight.note) + "</p></article>";
  }

  function renderExpenseRow(expense) {
    const category = EXPENSE_CATEGORIES[expense.category];
    const day = dayById(expense.dayId);
    return '<article class="expense-row" data-expense-row="' + htmlEscape(expense.id) + '"><span class="expense-category-mark">' + icon(category.icon) + '</span><div class="expense-copy"><h3>' + htmlEscape(expense.title) + '</h3><p>' + htmlEscape(day.date + " · " + category.label + " · " + EXPENSE_PAYMENTS[expense.payment]) + '</p>' + (expense.note ? '<small>' + htmlEscape(expense.note) + "</small>" : "") + '</div><strong class="expense-amount">' + formatMoney(expense.amount, expense.currency) + '</strong><div class="expense-actions"><button type="button" data-edit-expense="' + htmlEscape(expense.id) + '" aria-label="编辑' + htmlEscape(expense.title) + '" title="编辑">' + icon("pencil.svg") + '</button><button class="delete-action" type="button" data-delete-expense="' + htmlEscape(expense.id) + '" aria-label="删除' + htmlEscape(expense.title) + '" title="删除">' + icon("trash-2.svg") + "</button></div></article>";
  }

  function renderExpenseLedger() {
    const allTotals = expenseTotals(state.expenses);
    const filtered = state.expenses.filter(function (expense) {
      return expenseDayFilter === "all" || expense.dayId === expenseDayFilter;
    }).sort(function (a, b) {
      const dayDifference = DAY_IDS.indexOf(b.dayId) - DAY_IDS.indexOf(a.dayId);
      return dayDifference || String(b.createdAt).localeCompare(String(a.createdAt));
    });
    const filterButtons = [{ id: "all", label: "全部" }].concat(data.days.map(function (day) {
      return { id: day.id, label: day.date.replace("月", "/").replace("日", "") };
    })).map(function (option) {
      return '<button type="button" class="expense-filter" data-expense-filter="' + option.id + '" aria-pressed="' + (expenseDayFilter === option.id) + '">' + htmlEscape(option.label) + "</button>";
    }).join("");
    const breakdown = Object.keys(EXPENSE_CATEGORIES).map(function (key) {
      const categoryItems = filtered.filter(function (expense) { return expense.category === key; });
      if (!categoryItems.length) return "";
      const totals = expenseTotals(categoryItems);
      const amountText = [totals.KRW ? formatMoney(totals.KRW, "KRW") : "", totals.CNY ? formatMoney(totals.CNY, "CNY") : ""].filter(Boolean).join(" · ");
      return '<span class="expense-breakdown-item">' + icon(EXPENSE_CATEGORIES[key].icon) + '<b>' + htmlEscape(EXPENSE_CATEGORIES[key].label) + '</b><small>' + htmlEscape(amountText) + "</small></span>";
    }).join("");

    return '<section class="more-section span-2 expense-ledger"><div class="more-section-head"><div>' + icon("wallet-cards.svg") + '<h2>旅行账本</h2></div><span class="type-tag">' + allTotals.count + ' 笔</span></div><div class="expense-total-grid"><div><span>韩元支出</span><strong>' + formatMoney(allTotals.KRW, "KRW") + '</strong></div><div><span>人民币支出</span><strong>' + formatMoney(allTotals.CNY, "CNY") + '</strong></div><button class="primary-button" type="button" data-open-expense>' + icon("plus.svg") + '记一笔</button></div><div class="expense-filter-row" aria-label="按日期筛选支出">' + filterButtons + '</div>' + (breakdown ? '<div class="expense-breakdown">' + breakdown + "</div>" : "") + '<div class="expense-list">' + (filtered.length ? filtered.map(renderExpenseRow).join("") : '<div class="expense-empty">' + icon("receipt-text.svg") + "<p>还没有记录支出</p></div>") + "</div></section>";
  }

  function renderMore() {
    const km = completedKm();
    const allConfirmations = data.confirmations;
    const confirmed = allConfirmations.filter(function (item) { return state.confirmations[item.id]; }).length;
    const officialLinks = [
      ["济州实时公交", "https://bus.jeju.go.kr/"],
      ["牛岛船运公告", "http://www.udoship.com/"],
      ["加波岛预约 / 船班", "https://www.wonderfulis.co.kr/"],
      ["济州偶来官网", "https://www.jejuolle.org/"]
    ];
    const hamo = data.places.hamo;
    const canInstall = Boolean(deferredInstallPrompt);
    const hasRecovery = Boolean(localStorage.getItem(RECOVERY_KEY));

    document.getElementById("more-content").innerHTML =
      '<div class="more-grid">' +
        renderExpenseLedger() +
        renderJourneyMemories() +
        '<section class="more-section span-2"><div class="more-section-head"><div>' + icon("plane.svg") + '<h2>航班</h2></div><span class="type-tag">以订单为准</span></div><div class="flight-pair">' + data.flights.map(renderFlightCard).join("") + "</div></section>" +
        '<section class="more-section"><div class="more-section-head"><div>' + icon("award.svg") + '<h2>100 km证书</h2></div><span class="type-tag walk">' + (km >= 100 ? "READY" : km.toFixed(1) + " KM") + '</span></div><div class="certificate-callout"><strong>9月28日 · 返港后</strong><p>13:00起目标办理；晚船返港时须赶在16:30受理结束前。</p></div><ul class="fact-list"><li><span>受理时间</span><strong>09:00–11:30<br>13:00–16:30</strong></li><li><span>核心认证里程</span><strong>102.1 km</strong></li><li><span>必须携带</span><strong>本人纸质护照</strong></li><li><span>现场步骤</span><strong>QR问卷 + 验章</strong></li></ul>' + mapLinks(hamo, "步行") + "</section>" +
        '<section class="more-section"><div class="more-section-head"><div>' + icon("briefcase.svg") + '<h2>行李与船班确认</h2></div><span class="type-tag">' + confirmed + "/" + allConfirmations.length + "</span></div>" + renderConfirmationRows(allConfirmations) + "</section>" +
        '<section class="more-section"><div class="more-section-head"><div>' + icon("link.svg") + '<h2>官方查询</h2></div></div><div class="official-links">' + officialLinks.map(function (link) {
          return '<a class="official-link" href="' + link[1] + '" target="_blank" rel="noopener"><span>' + htmlEscape(link[0]) + "</span>" + icon("external-link.svg") + "</a>";
        }).join("") + "</div></section>" +
        '<section class="more-section"><div class="more-section-head"><div>' + icon("settings-2.svg") + '<h2>显示与离线</h2></div></div><div class="settings-list"><label class="setting-row"><span>紧凑显示</span><span class="toggle"><input id="compact-toggle" type="checkbox" ' + (state.compact ? "checked" : "") + '><i></i></span></label>' + (canInstall ? '<div class="setting-row"><span>安装到手机桌面</span><button id="install-button" class="secondary-button" type="button">' + icon("download.svg") + '安装</button></div>' : '') + '</div><p class="install-help">' + installationHelp() + '</p><p data-offline-readiness>' + (offlineShellReady ? '行程页面与本地图标已缓存，可离线打开。' : '离线资源尚未确认就绪，请联网打开一次并等待缓存。') + '</p><p>地图、官方章点图和公交船运页面仍需联网；离线天气只显示上次数据。</p></section>' +
        '<section class="more-section span-2"><div class="more-section-head"><div>' + icon("notebook-pen.svg") + '<h2>全程备忘</h2></div><span class="type-tag">自动保存</span></div><textarea id="trip-notes" rows="6" placeholder="车票、天气、临时变更……">' + htmlEscape(state.notes) + "</textarea></section>" +
        '<section class="more-section span-2"><div class="more-section-head"><div>' + icon("database.svg") + '<h2>数据备份</h2></div><span class="type-tag">本机保存</span></div><p>包含支出、打卡、盖章、截止确认、备注与兼容保留的历史进度；临时定位不会导出。</p><p>' + (lastBackupAt && Number.isFinite(Date.parse(lastBackupAt)) ? '最近发起导出：' + htmlEscape(weatherUpdatedAt(Date.parse(lastBackupAt))) + '。请确认文件已保存。' : '尚未在这台设备导出备份。换浏览器或换手机前，请先保存一份。') + '</p><div class="data-actions"><button id="export-button" class="secondary-button" type="button">' + icon("download.svg") + '导出备份</button><button id="import-button" class="secondary-button" type="button">' + icon("upload.svg") + '导入备份</button>' + (hasRecovery ? '<button id="recovery-button" class="secondary-button" type="button">' + icon("history.svg") + "恢复导入前数据</button>" : "") + '<button id="reset-button" class="text-button danger-button" type="button">恢复默认</button></div></section>' +
      "</div>";
  }

  function installationHelp() {
    if (window.matchMedia("(display-mode: standalone)").matches || navigator.standalone) return "已在独立应用窗口中打开。";
    if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)) return /MicroMessenger/.test(navigator.userAgent) ? "在微信右上角菜单选择用 Safari 打开，再从 Safari 的分享菜单选择“添加到主屏幕”。" : "在 Safari 的分享菜单选择“添加到主屏幕”，下次从桌面打开。";
    return "可在浏览器菜单中寻找“安装应用”或“添加到主屏幕”；本机数据不会自动同步到其他浏览器。";
  }

  function renderAll() {
    document.body.dataset.density = state.compact ? "compact" : "comfortable";
    document.body.dataset.executionFocus = "false";
    document.getElementById("view-today").setAttribute("aria-labelledby", "today-title");
    document.querySelectorAll(".app-view").forEach(function (view) {
      view.hidden = view.dataset.view !== state.activeView;
    });
    document.querySelectorAll("[data-view-target]").forEach(function (button) {
      if (!button.closest(".app-dock")) return;
      if (button.dataset.viewTarget === state.activeView) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    renderHero();
    renderDateStrip("today-day-tabs");
    renderDateStrip("plan-day-tabs");
    renderToday();
    renderPlan();
    renderCheckins();
    renderMore();
    updateNetworkStatus();
    renderWeather();
    refreshWeather(false);
  }

  function switchView(viewName, preserveScroll) {
    if (!ALLOWED_VIEWS.includes(viewName)) return;
    viewScroll[state.activeView] = window.scrollY;
    if (viewName !== state.activeView) recentCheckins.clear();
    if (viewName === "checkins" && state.activeView !== "checkins") filterState.day = state.activeDay;
    state.activeView = viewName;
    saveState();
    renderAll();
    if (!preserveScroll) window.scrollTo({ top: viewScroll[viewName] || 0, behavior: "instant" });
  }

  function selectDay(dayId) {
    if (!DAY_IDS.includes(dayId)) return;
    if (state.activeDay !== dayId) clearExecutionLocation();
    recentCheckins.clear();
    state.activeDay = dayId;
    executionTimelineOpen = false;
    executionRiskOpen = false;
    saveState();
    renderAll();
  }

  function scrollToPlanSection(targetId) {
    const target = document.getElementById(targetId);
    if (!target) return;
    const stickyOffset = document.querySelector(".app-bar").getBoundingClientRect().height + (document.querySelector(".plan-section-nav")?.getBoundingClientRect().height || 0) + 16;
    const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - stickyOffset);
    window.scrollTo({ top, behavior: "instant" });
    target.focus({ preventScroll: true });
  }

  function showToast(message, actionLabel, actionName, durationMs) {
    const toast = document.getElementById("toast");
    window.clearTimeout(toastTimer);
    toast.innerHTML = "<span>" + htmlEscape(message) + "</span>" + (actionLabel ? '<button type="button" data-toast-action="' + htmlEscape(actionName) + '">' + htmlEscape(actionLabel) + "</button>" : "");
    toast.hidden = false;
    toastTimer = window.setTimeout(function () {
      toast.hidden = true;
      if (actionName === "undo-stamp") lastStampAction = null;
    }, durationMs || (actionLabel ? 5000 : 2300));
  }

  function showCelebration(kind, label, detail) {
    const layer = document.getElementById("celebration-layer");
    if (!layer) return;
    window.clearTimeout(celebrationTimer);
    window.clearTimeout(toastTimer);
    if (kind !== "milestone" && kind !== "goal") return;
    const isGoal = kind === "goal";
    const sparkPositions = [
      { x: "-136px", y: "-22px", r: "-24deg", tone: "coral" },
      { x: "-108px", y: "28px", r: "18deg", tone: "gold" },
      { x: "-44px", y: "-48px", r: "-8deg", tone: "teal" },
      { x: "58px", y: "-48px", r: "20deg", tone: "gold" },
      { x: "114px", y: "-18px", r: "-18deg", tone: "coral" },
      { x: "138px", y: "30px", r: "28deg", tone: "teal" },
      { x: "84px", y: "50px", r: "-16deg", tone: "coral" },
      { x: "-80px", y: "50px", r: "12deg", tone: "gold" }
    ];
    const sparks = sparkPositions.map(function (spark) {
      return '<i class="celebration-spark ' + spark.tone + '" style="--spark-x:' + spark.x + ';--spark-y:' + spark.y + ';--spark-r:' + spark.r + '"></i>';
    }).join("");
    const title = isGoal ? "100 km，一路的章都记得" : label + "的章，集齐了";
    layer.classList.remove("leaving");
    layer.innerHTML = '<div class="celebration-card celebration-' + kind + '">' + sparks + '<div class="celebration-seal">' + icon("award.svg") + '</div><div class="celebration-copy"><span>旅程纪念</span><strong>' + htmlEscape(title) + '</strong><p>' + htmlEscape(detail) + '</p><div class="celebration-actions"><button type="button" data-toast-action="undo-stamp">撤销这枚章</button><button type="button" data-dismiss-celebration>收起</button></div></div></div>';
    document.getElementById("toast").hidden = true;
    layer.hidden = false;
    celebrationTimer = window.setTimeout(function () {
      layer.classList.add("leaving");
      celebrationTimer = window.setTimeout(function () { lastStampAction = null; hideCelebration(); }, 220);
    }, 8000);
  }

  function hideCelebration() {
    window.clearTimeout(celebrationTimer);
    const layer = document.getElementById("celebration-layer");
    layer.hidden = true;
    layer.innerHTML = "";
    layer.classList.remove("leaving");
  }

  function renderJourneyMemories() {
    const routes = Object.values(data.routes).filter(function (route) { return tripLogic.routeComplete(route, state.stamps); });
    if (!routes.length) return '<section class="more-section span-2 journey-memories"><h2>旅程纪念</h2><p>每集齐一条线路的章，这里就留下一份纪念。</p></section>';
    return '<section class="more-section span-2 journey-memories"><h2>旅程纪念</h2><div class="memory-list">' + (completedKm() >= 100 ? '<article class="memory-card goal"><span>100 km里程目标</span><h3>沿着海岸，走到了这里</h3><p>根据已记录的整线章点计算；正式证书需携纸质护照现场验章。</p></article>' : '') + routes.map(function (route) { return '<article class="memory-card" data-memory-route="' + route.id + '">' + icon("award.svg") + '<span>' + htmlEscape(route.mode) + ' · ' + route.km + ' km</span><h3>' + route.id + '号线</h3><p>本线章点已集齐' + (route.counts ? '' : ' · 骑行不计步行认证') + '</p></article>'; }).join('') + '</div></section>';
  }

  function populateCheckinDayOptions() {
    document.getElementById("checkin-day").innerHTML = data.days.map(function (day) {
      return '<option value="' + day.id + '">' + htmlEscape(day.date + " · " + day.label) + "</option>";
    }).join("");
  }

  function populateExpenseDayOptions() {
    document.getElementById("expense-day").innerHTML = data.days.map(function (day) {
      return '<option value="' + day.id + '">' + htmlEscape(day.date + " · " + day.label) + "</option>";
    }).join("");
  }

  function openQuickAddDialog() {
    document.getElementById("quick-add-dialog").showModal();
  }

  function closeQuickAddDialog() {
    document.getElementById("quick-add-dialog").close();
  }

  function resetExpenseForm() {
    const form = document.getElementById("expense-form");
    form.reset();
    document.getElementById("expense-id").value = "";
    document.getElementById("expense-day").value = state.activeDay;
    document.getElementById("expense-form-title").textContent = "记一笔";
    document.getElementById("expense-form-error").textContent = "";
  }

  function openExpenseDialog(item) {
    resetExpenseForm();
    if (item) {
      document.getElementById("expense-id").value = item.id;
      document.getElementById("expense-title").value = item.title;
      document.getElementById("expense-amount").value = item.amount;
      document.getElementById("expense-day").value = item.dayId;
      document.getElementById("expense-payment").value = item.payment;
      document.getElementById("expense-note").value = item.note || "";
      document.querySelector('input[name="expenseCategory"][value="' + item.category + '"]').checked = true;
      document.querySelector('input[name="currency"][value="' + item.currency + '"]').checked = true;
      document.getElementById("expense-form-title").textContent = "编辑支出";
    }
    document.getElementById("expense-dialog").showModal();
    window.setTimeout(function () { document.getElementById("expense-title").focus(); }, 80);
  }

  function closeExpenseDialog() {
    document.getElementById("expense-dialog").close();
  }

  function resetCheckinForm() {
    const form = document.getElementById("checkin-form");
    form.reset();
    document.getElementById("checkin-id").value = "";
    document.getElementById("checkin-day").value = state.activeDay;
    document.getElementById("checkin-form-title").textContent = "新增打卡点";
    document.getElementById("checkin-form-error").textContent = "";
    document.getElementById("location-state").textContent = "可稍后补充";
    document.getElementById("location-state").className = "";
    document.querySelector(".checkin-details").open = false;
  }

  function openCheckinDialog(item) {
    resetCheckinForm();
    if (item) {
      document.getElementById("checkin-id").value = item.id;
      document.getElementById("checkin-name").value = item.name;
      document.getElementById("checkin-day").value = item.dayId;
      document.getElementById("checkin-mode").value = item.mode;
      document.querySelector('input[name="category"][value="' + item.category + '"]').checked = true;
      document.getElementById("checkin-map-input").value = item.mapInput || "";
      document.getElementById("checkin-lat").value = item.lat == null ? "" : item.lat;
      document.getElementById("checkin-lng").value = item.lng == null ? "" : item.lng;
      document.getElementById("checkin-korean").value = item.korean || "";
      document.getElementById("checkin-address").value = item.address || "";
      document.getElementById("checkin-priority").value = item.priority || "想去";
      document.getElementById("checkin-slot").value = item.slot || "";
      document.getElementById("checkin-dish").value = item.dish || "";
      document.getElementById("checkin-note").value = item.note || "";
      document.getElementById("checkin-form-title").textContent = "编辑打卡点";
      document.querySelector(".checkin-details").open = Boolean(item.mapInput || item.lat != null || item.lng != null || item.korean || item.address || item.slot || item.dish || item.note || item.mode !== "步行" || item.priority !== "想去");
      updateLocationState();
    }
    document.getElementById("checkin-dialog").showModal();
    window.setTimeout(function () { document.getElementById("checkin-name").focus(); }, 80);
  }

  function closeCheckinDialog() {
    document.getElementById("checkin-dialog").close();
  }

  function parseCoordinates(value) {
    const input = cleanText(value, 1000).trim();
    if (!input) return null;
    let decoded = input;
    try { decoded = decodeURIComponent(input); } catch (error) { decoded = input; }

    const queryLat = decoded.match(/[?&#](?:lat|latitude)=(-?\d+(?:\.\d+)?)/i);
    const queryLng = decoded.match(/[?&#](?:lng|lon|longitude)=(-?\d+(?:\.\d+)?)/i);
    if (queryLat && queryLng) {
      const lat = Number(queryLat[1]);
      const lng = Number(queryLng[1]);
      if (isValidCoordinate(lat, lng)) return { lat, lng };
    }

    const pairs = Array.from(decoded.matchAll(/(-?\d{1,3}(?:\.\d{3,}))\s*[,/]\s*(-?\d{1,3}(?:\.\d{3,}))/g));
    for (const match of pairs) {
      const first = Number(match[1]);
      const second = Number(match[2]);
      if (first >= 30 && first <= 40 && second >= 120 && second <= 135) return { lat: first, lng: second };
      if (first >= 120 && first <= 135 && second >= 30 && second <= 40) return { lat: second, lng: first };
      if (isValidCoordinate(first, second)) return { lat: first, lng: second };
      if (isValidCoordinate(second, first)) return { lat: second, lng: first };
    }
    return null;
  }

  function updateLocationState(message, statusClass) {
    const status = document.getElementById("location-state");
    const lat = Number(document.getElementById("checkin-lat").value);
    const lng = Number(document.getElementById("checkin-lng").value);
    if (message) {
      status.textContent = message;
      status.className = statusClass || "";
    } else if (isValidCoordinate(lat, lng)) {
      status.textContent = "精确定位已就绪";
      status.className = "success";
    } else {
      status.textContent = "可稍后补充";
      status.className = "";
    }
  }

  function parseLocationIntoForm() {
    const value = document.getElementById("checkin-map-input").value;
    const coordinates = parseCoordinates(value);
    if (!coordinates) {
      updateLocationState("链接中未找到坐标", "error");
      return false;
    }
    document.getElementById("checkin-lat").value = coordinates.lat.toFixed(7);
    document.getElementById("checkin-lng").value = coordinates.lng.toFixed(7);
    updateLocationState("精确定位已解析", "success");
    return true;
  }

  function useCurrentLocation() {
    const button = document.getElementById("use-location");
    if (!navigator.geolocation) {
      updateLocationState("此浏览器不支持定位", "error");
      return;
    }
    button.disabled = true;
    button.textContent = "正在定位…";
    updateLocationState("正在请求手机定位", "");
    navigator.geolocation.getCurrentPosition(function (position) {
      document.getElementById("checkin-lat").value = position.coords.latitude.toFixed(7);
      document.getElementById("checkin-lng").value = position.coords.longitude.toFixed(7);
      button.innerHTML = icon("navigation.svg") + "使用当前位置";
      button.disabled = false;
      updateLocationState("当前位置已保存", "success");
    }, function (error) {
      const message = error.code === 1 ? "未获得定位权限" : "暂时无法取得位置";
      button.innerHTML = icon("navigation.svg") + "使用当前位置";
      button.disabled = false;
      updateLocationState(message, "error");
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }

  function submitCheckinForm(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = cleanText(formData.get("name"), 120).trim();
    const dayId = cleanText(formData.get("dayId"), 10);
    const error = document.getElementById("checkin-form-error");
    if (!name || !DAY_IDS.includes(dayId)) {
      error.textContent = "请填写地点名称并选择日期。";
      return;
    }

    const rawLat = cleanText(formData.get("lat"), 40).trim();
    const rawLng = cleanText(formData.get("lng"), 40).trim();
    let lat = rawLat ? Number(rawLat) : null;
    let lng = rawLng ? Number(rawLng) : null;
    const mapInput = cleanText(formData.get("mapInput"), 1000).trim();
    if ((!isValidCoordinate(lat, lng)) && mapInput) {
      const parsed = parseCoordinates(mapInput);
      if (parsed) {
        lat = parsed.lat;
        lng = parsed.lng;
      }
    }
    if ((rawLat || rawLng) && !isValidCoordinate(lat, lng)) {
      error.textContent = "经纬度不完整或超出有效范围。";
      return;
    }

    const existingId = document.getElementById("checkin-id").value;
    const existing = state.customCheckins.find(function (item) { return item.id === existingId; });
    const item = sanitizeCheckin({
      id: existingId || createId(),
      name,
      dayId,
      category: formData.get("category"),
      mode: formData.get("mode"),
      mapInput,
      lat,
      lng,
      korean: formData.get("korean"),
      address: formData.get("address"),
      priority: formData.get("priority"),
      slot: formData.get("slot"),
      dish: formData.get("dish"),
      note: formData.get("note"),
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    if (!item) {
      error.textContent = "无法保存，请检查必填内容。";
      return;
    }

    if (existing) {
      state.customCheckins = state.customCheckins.map(function (current) { return current.id === item.id ? item : current; });
    } else {
      state.customCheckins.push(item);
    }
    state.checkinChecks[item.id] = Boolean(state.checkinChecks[item.id]);
    state.activeDay = item.dayId;
    saveState();
    closeCheckinDialog();
    switchView("checkins");
    filterState.day = item.dayId;
    renderCheckins();
    showToast(existing ? "打卡点已更新" : "打卡点已保存");
  }

  function deleteCheckin(id) {
    const index = state.customCheckins.findIndex(function (item) { return item.id === id; });
    if (index < 0) return;
    const item = state.customCheckins[index];
    deletedCheckin = { item, index, checked: Boolean(state.checkinChecks[id]) };
    state.customCheckins.splice(index, 1);
    delete state.checkinChecks[id];
    saveState();
    renderAll();
    showToast("已删除“" + item.name + "”", "撤销", "undo-delete");
  }

  function undoDelete() {
    if (!deletedCheckin) return;
    state.customCheckins.splice(deletedCheckin.index, 0, deletedCheckin.item);
    state.checkinChecks[deletedCheckin.item.id] = deletedCheckin.checked;
    deletedCheckin = null;
    saveState();
    renderAll();
    showToast("打卡点已恢复");
  }

  function submitExpenseForm(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const title = cleanText(formData.get("title"), 120).trim();
    const dayId = cleanText(formData.get("dayId"), 10);
    const currency = cleanText(formData.get("currency"), 5);
    const amountText = cleanText(formData.get("amount"), 40).replace(/[,\s]/g, "");
    const amount = Number(amountText);
    const error = document.getElementById("expense-form-error");
    if (!title || !DAY_IDS.includes(dayId)) {
      error.textContent = "请填写项目并选择日期。";
      return;
    }
    const amountPattern = currency === "KRW" ? /^\d+$/ : /^\d+(?:\.\d{1,2})?$/;
    if (!amountPattern.test(amountText) || !Number.isFinite(amount) || amount <= 0) {
      error.textContent = currency === "KRW" ? "韩元请输入大于0的整数。" : "人民币请输入大于0的金额，最多两位小数。";
      return;
    }
    const existingId = document.getElementById("expense-id").value;
    const existing = state.expenses.find(function (expense) { return expense.id === existingId; });
    const expense = sanitizeExpense({
      id: existingId || createId(),
      title,
      dayId,
      amount,
      currency,
      category: formData.get("expenseCategory"),
      payment: formData.get("payment"),
      note: formData.get("note"),
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    if (!expense) {
      error.textContent = "金额过大或内容无效，请检查后重试。";
      return;
    }
    if (existing) {
      state.expenses = state.expenses.map(function (current) { return current.id === expense.id ? expense : current; });
    } else {
      state.expenses.push(expense);
    }
    state.activeDay = expense.dayId;
    expenseDayFilter = expense.dayId;
    saveState();
    closeExpenseDialog();
    switchView("more");
    showToast(existing ? "支出已更新" : "支出已记录");
  }

  function deleteExpense(id) {
    const index = state.expenses.findIndex(function (expense) { return expense.id === id; });
    if (index < 0) return;
    const expense = state.expenses[index];
    deletedExpense = { item: expense, index };
    state.expenses.splice(index, 1);
    saveState();
    renderAll();
    showToast("已删除“" + expense.title + "”", "撤销", "undo-expense");
  }

  function undoExpenseDelete() {
    if (!deletedExpense) return;
    state.expenses.splice(deletedExpense.index, 0, deletedExpense.item);
    deletedExpense = null;
    saveState();
    renderAll();
    showToast("支出已恢复");
  }

  async function exportBackup() {
    const payload = {
      product: "jeju-olle-trip",
      version: 5,
      exportedAt: new Date().toISOString(),
      state
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const fileName = "jeju-olle-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    const file = new File([blob], fileName, { type: "application/json" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "济州偶来行程备份" });
        recordBackupExport();
        return;
      }
    } catch (error) {
      if (error.name === "AbortError") return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    recordBackupExport();
    showToast("备份文件已导出");
  }

  function recordBackupExport() {
    lastBackupAt = new Date().toISOString();
    try { localStorage.setItem("jeju-olle-last-backup", lastBackupAt); } catch (error) { /* Nonessential metadata. */ }
    renderMore();
  }

  function resetRecordFeedback() {
    lastStampAction = null; lastVisitAction = null; recentlyStamped = "";
    recentCheckins.clear(); openStampDays.clear(); openRiskDays.clear(); openOtherCutoffDays.clear();
    Object.keys(manualStepByDay).forEach(function (key) { delete manualStepByDay[key]; });
    hideCelebration();
  }

  async function importBackup(file) {
    try {
      if (!file || file.size > 2 * 1024 * 1024) throw new Error("文件过大");
      const parsed = JSON.parse(await file.text());
      const incoming = parsed && parsed.product === "jeju-olle-trip" ? parsed.state : parsed;
      let nextState;
      if (incoming && incoming.version === 5) nextState = normalizeState(incoming);
      else if (incoming && incoming.version === 4) nextState = migrateV4(incoming);
      else if (incoming && incoming.version === 3) nextState = migrateLegacy(incoming);
      else throw new Error("不支持的备份版本");
      localStorage.setItem(RECOVERY_KEY, JSON.stringify(state));
      state = nextState;
      resetRecordFeedback();
      clearExecutionLocation();
      filterState.day = state.activeDay;
      filterState.category = "all";
      filterState.query = "";
      deletedCheckin = null;
      deletedExpense = null;
      saveState();
      renderAll();
      showToast("备份已导入");
    } catch (error) {
      showToast("导入失败：" + error.message);
    } finally {
      document.getElementById("import-file").value = "";
    }
  }

  function recoverPreviousState() {
    try {
      const recovery = JSON.parse(localStorage.getItem(RECOVERY_KEY));
      state = normalizeState(recovery);
      resetRecordFeedback();
      clearExecutionLocation();
      filterState.day = state.activeDay;
      filterState.category = "all";
      filterState.query = "";
      deletedCheckin = null;
      deletedExpense = null;
      saveState();
      localStorage.removeItem(RECOVERY_KEY);
      renderAll();
      showToast("已恢复导入前的数据");
    } catch (error) {
      showToast("没有可恢复的数据");
    }
  }

  function resetState() {
    if (!window.confirm("确认清除新增地点、旅行支出、盖章、确认项和备注，恢复默认行程？")) return;
    state = defaultState();
    resetRecordFeedback();
    clearExecutionLocation();
    filterState.day = state.activeDay;
    filterState.category = "all";
    filterState.query = "";
    deletedCheckin = null;
    deletedExpense = null;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(RECOVERY_KEY);
    saveState();
    renderAll();
    showToast("已恢复默认行程");
  }

  function updateNetworkStatus() {
    const status = document.getElementById("network-status");
    const online = navigator.onLine;
    status.classList.toggle("offline", !online);
    status.lastChild.textContent = online ? "在线" : offlineShellReady ? "离线可用" : "离线";
  }

  function initializeInstall() {
    window.addEventListener("beforeinstallprompt", function (event) {
      event.preventDefault();
      deferredInstallPrompt = event;
      document.getElementById("install-shortcut").hidden = false;
      renderMore();
    });
    window.addEventListener("appinstalled", function () {
      deferredInstallPrompt = null;
      document.getElementById("install-shortcut").hidden = true;
      showToast("已安装到手机桌面");
      renderMore();
    });
  }

  async function promptInstall() {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    document.getElementById("install-shortcut").hidden = true;
    renderMore();
  }

  function initializeServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("./sw.js").then(function (registration) {
      navigator.serviceWorker.ready.then(checkOfflineShell);
      if (registration.waiting && navigator.serviceWorker.controller) {
        waitingWorker = registration.waiting;
        document.getElementById("update-banner").hidden = false;
      }
      registration.addEventListener("updatefound", function () {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", function () {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            waitingWorker = worker;
            document.getElementById("update-banner").hidden = false;
          }
        });
      });
    }).catch(function (error) {
      console.info("离线缓存暂不可用。", error.message);
    });
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      checkOfflineShell();
      if (!updateReloadRequested) return;
      updateReloadRequested = false;
      window.location.reload();
    });
  }

  async function checkOfflineShell() {
    if (!("caches" in window)) return;
    try {
      const keys = (await caches.keys()).filter(function (key) { return key.startsWith("jeju-olle-app-"); });
      offlineShellReady = false;
      for (const key of keys) {
        const cache = await caches.open(key);
        const files = ["index.html", "data.js", "trip-logic.js", "app.js", "styles.css", "manifest.webmanifest"];
        document.querySelectorAll(".ui-icon").forEach(function (element) {
          const match = /url\(([^)]+)\)/.exec(element.style.getPropertyValue("--icon-url"));
          if (match) files.push(match[1].replace(/["']/g, ""));
        });
        const essentials = await Promise.all(Array.from(new Set(files)).map(function (file) { return cache.match(new URL(file, document.baseURI).href); }));
        if (essentials.every(Boolean)) { offlineShellReady = true; break; }
      }
      updateNetworkStatus();
      const note = document.querySelector("[data-offline-readiness]");
      if (note) note.textContent = offlineShellReady ? "行程页面与本地图标已缓存，可离线打开。" : "离线资源尚未确认就绪，请联网打开一次并等待缓存。";
    } catch (error) { offlineShellReady = false; updateNetworkStatus(); }
  }

  function bindEvents() {
    document.addEventListener("toggle", function (event) {
      const details = event.target;
      if (details.matches && details.matches("[data-other-cutoffs]")) {
        if (details.open) openOtherCutoffDays.add(details.dataset.otherCutoffs);
        else openOtherCutoffDays.delete(details.dataset.otherCutoffs);
        return;
      }
      if (details.matches && details.matches("[data-stamp-day]")) {
        if (details.open) openStampDays.add(details.dataset.stampDay);
        else openStampDays.delete(details.dataset.stampDay);
        return;
      }
      if (details.matches && details.matches("[data-execution-timeline]")) {
        executionTimelineOpen = details.open;
        return;
      }
      if (details.matches && details.matches(".completed-checkins")) {
        completedCheckinsOpen = details.open;
        return;
      }
      if (!details.matches || !details.matches("[data-route-disclosure]")) return;
      if (details.closest(".print-day")) return;
      const key = details.dataset.routeDisclosure;
      if (details.open) openRouteDetails.add(key);
      else openRouteDetails.delete(key);
    }, true);
    document.addEventListener("click", function (event) {
      const riskToggle = event.target.closest(".today-risk > summary");
      if (riskToggle) {
        if (riskToggle.parentElement.open) openRiskDays.delete(state.activeDay);
        else openRiskDays.add(state.activeDay);
      }
      const otherCutoffsToggle = event.target.closest(".other-cutoffs > summary");
      if (otherCutoffsToggle) {
        const details = otherCutoffsToggle.parentElement;
        if (details.open) openOtherCutoffDays.delete(details.dataset.otherCutoffs);
        else openOtherCutoffDays.add(details.dataset.otherCutoffs);
      }
      const stampToggle = event.target.closest(".today-stamp > summary");
      if (stampToggle) {
        const details = stampToggle.parentElement;
        if (details.open) openStampDays.delete(details.dataset.stampDay);
        else openStampDays.add(details.dataset.stampDay);
      }
      const browseStep = event.target.closest("[data-browse-step]");
      const planStep = event.target.closest("[data-advisory-step]");
      if (planStep) {
        const dayId = planStep.dataset.advisoryDay;
        if (!DAY_IDS.includes(dayId) || !dayById(dayId).timeline.some(function (item) { return item.id === planStep.dataset.advisoryStep; })) return;
        if (state.activeDay !== dayId) clearExecutionLocation();
        state.activeDay = dayId;
        manualStepByDay[dayId] = planStep.dataset.advisoryStep;
        switchView("today");
        window.scrollTo({ top: 0, behavior: "instant" });
        return;
      }
      if (browseStep) {
        const step = dayById(state.activeDay).timeline[Number(browseStep.dataset.browseStep)];
        if (step) manualStepByDay[state.activeDay] = step.id;
        renderToday(); renderWeather();
        document.querySelector(".today-action-card").setAttribute("tabindex", "-1");
        document.querySelector(".today-action-card").focus({ preventScroll: true });
        return;
      }
      if (event.target.closest("[data-reset-advisory]")) {
        delete manualStepByDay[state.activeDay];
        renderToday(); renderWeather();
        return;
      }
      if (event.target.closest("[data-return-today]")) {
        const dayId = initialDayId();
        delete manualStepByDay[dayId];
        selectDay(dayId);
        return;
      }
      if (event.target.closest("[data-return-advisory]")) {
        delete manualStepByDay[state.activeDay];
        switchView("today");
        window.scrollTo({ top: 0, behavior: "instant" });
        return;
      }
      const planTime = event.target.closest("[data-open-plan-time]");
      const planStamps = event.target.closest("[data-open-plan-stamps]");
      if (planTime || planStamps) {
        switchView("plan");
        scrollToPlanSection("plan-" + (planTime ? "time" : "stamps") + "-" + state.activeDay);
        return;
      }
      if (event.target.closest("[data-dismiss-celebration]")) { lastStampAction = null; hideCelebration(); return; }
      const timelineSummary = event.target.closest("[data-execution-timeline] > summary");
      if (timelineSummary) executionTimelineOpen = !timelineSummary.parentElement.open;
      const riskSummary = event.target.closest(".execution-risk-details > summary");
      if (riskSummary) executionRiskOpen = !riskSummary.parentElement.open;
      const reopenExecutionButton = event.target.closest("[data-reopen-execution]");
      if (reopenExecutionButton) {
        startExecution(reopenExecutionButton.dataset.reopenExecution);
        return;
      }
      const completeStepButton = event.target.closest("[data-complete-step]");
      if (completeStepButton) {
        completeExecutionStep(completeStepButton.dataset.completeStep);
        return;
      }
      const previousStepButton = event.target.closest("[data-previous-step]");
      if (previousStepButton) {
        returnToPreviousStep(previousStepButton.dataset.previousStep);
        return;
      }
      const finishExecutionButton = event.target.closest("[data-finish-execution]");
      if (finishExecutionButton) {
        finishExecution(finishExecutionButton.dataset.finishExecution);
        return;
      }
      const suggestedStepButton = event.target.closest("[data-suggested-step]");
      if (suggestedStepButton) {
        chooseSuggestedStep(suggestedStepButton.dataset.executionDay, suggestedStepButton.dataset.suggestedStep);
        return;
      }
      const selectExecutionStepButton = event.target.closest("[data-select-execution-step]");
      if (selectExecutionStepButton) {
        chooseExecutionStep(selectExecutionStepButton.dataset.executionDay, selectExecutionStepButton.dataset.selectExecutionStep);
        return;
      }
      if (event.target.closest("[data-update-execution-location]")) {
        updateExecutionLocation();
        return;
      }
      if (event.target.closest("[data-refresh-weather]")) {
        refreshWeather(true);
        return;
      }
      const mapLink = event.target.closest("[data-map-app]");
      if (mapLink) {
        openMapApp(event, mapLink);
        return;
      }
      const planSectionButton = event.target.closest("[data-plan-section]");
      if (planSectionButton) {
        scrollToPlanSection(planSectionButton.dataset.planSection);
        return;
      }
      const viewButton = event.target.closest("[data-view-target]");
      if (viewButton) {
        switchView(viewButton.dataset.viewTarget);
        return;
      }
      const dayButton = event.target.closest("[data-day]");
      if (dayButton) {
        selectDay(dayButton.dataset.day);
        return;
      }
      if (event.target.closest("[data-open-quick-add]")) {
        openQuickAddDialog();
        return;
      }
      if (event.target.closest("[data-close-quick-add]")) {
        closeQuickAddDialog();
        return;
      }
      if (event.target.closest("[data-quick-checkin]")) {
        closeQuickAddDialog();
        openCheckinDialog();
        return;
      }
      if (event.target.closest("[data-quick-expense]")) {
        closeQuickAddDialog();
        openExpenseDialog();
        return;
      }
      if (event.target.closest("[data-open-checkin]")) {
        openCheckinDialog();
        return;
      }
      if (event.target.closest("[data-close-checkin]")) {
        closeCheckinDialog();
        return;
      }
      if (event.target.closest("[data-open-expense]")) {
        openExpenseDialog();
        return;
      }
      if (event.target.closest("[data-close-expense]")) {
        closeExpenseDialog();
        return;
      }
      const toggleCheckin = event.target.closest("[data-toggle-checkin]");
      if (toggleCheckin) {
        const routeDetails = toggleCheckin.closest("[data-route-disclosure]");
        if (routeDetails && routeDetails.open) openRouteDetails.add(routeDetails.dataset.routeDisclosure);
        const id = toggleCheckin.dataset.toggleCheckin;
        const checked = !state.checkinChecks[id];
        const item = combinedCheckins().find(function (current) { return current.id === id; });
        const place = item ? placeForCheckin(item) : null;
        state.checkinChecks[id] = checked;
        if (checked) recentCheckins.add(id);
        else recentCheckins.delete(id);
        saveState();
        renderAll();
        document.querySelector('.app-view:not([hidden]) [data-toggle-checkin="' + CSS.escape(id) + '"]')?.focus({ preventScroll: true });
        if (checked && place) {
          lastVisitAction = { id, name: place.name };
          showToast("已到访 · " + place.name, "撤销", "undo-visit", 8000);
        } else showToast("已取消到访记录");
        return;
      }
      const editCheckin = event.target.closest("[data-edit-checkin]");
      if (editCheckin) {
        const item = state.customCheckins.find(function (current) { return current.id === editCheckin.dataset.editCheckin; });
        if (item) openCheckinDialog(item);
        return;
      }
      const deleteButton = event.target.closest("[data-delete-checkin]");
      if (deleteButton) {
        deleteCheckin(deleteButton.dataset.deleteCheckin);
        return;
      }
      const editExpense = event.target.closest("[data-edit-expense]");
      if (editExpense) {
        const expense = state.expenses.find(function (current) { return current.id === editExpense.dataset.editExpense; });
        if (expense) openExpenseDialog(expense);
        return;
      }
      const deleteExpenseButton = event.target.closest("[data-delete-expense]");
      if (deleteExpenseButton) {
        deleteExpense(deleteExpenseButton.dataset.deleteExpense);
        return;
      }
      const expenseFilter = event.target.closest("[data-expense-filter]");
      if (expenseFilter) {
        expenseDayFilter = expenseFilter.dataset.expenseFilter;
        renderMore();
        return;
      }
      const dayFilter = event.target.closest("[data-filter-day]");
      if (dayFilter) {
        recentCheckins.clear();
        filterState.day = dayFilter.dataset.filterDay;
        renderCheckins();
        return;
      }
      const categoryFilter = event.target.closest("[data-filter-category]");
      if (categoryFilter) {
        recentCheckins.clear();
        filterState.category = categoryFilter.dataset.filterCategory;
        renderCheckins();
        return;
      }
      if (event.target.closest("[data-clear-checkin-search]")) {
        filterState.query = "";
        renderCheckins();
        document.getElementById("checkin-search-input").focus();
        return;
      }
      const toastAction = event.target.closest("[data-toast-action]");
      if (toastAction && toastAction.dataset.toastAction === "undo-visit" && lastVisitAction) {
        state.checkinChecks[lastVisitAction.id] = false;
        recentCheckins.delete(lastVisitAction.id);
        const name = lastVisitAction.name;
        lastVisitAction = null;
        saveState(); renderAll();
        showToast("已撤销到访 · " + name);
        return;
      }
      if (toastAction && toastAction.dataset.toastAction === "undo-delete") {
        undoDelete();
        return;
      }
      if (toastAction && toastAction.dataset.toastAction === "undo-expense") {
        undoExpenseDelete();
        return;
      }
      if (toastAction && toastAction.dataset.toastAction === "undo-stamp") {
        undoStamp();
        return;
      }
      if (event.target.closest("#parse-location")) {
        parseLocationIntoForm();
        return;
      }
      if (event.target.closest("#use-location")) {
        useCurrentLocation();
        return;
      }
      if (event.target.closest("#export-button")) {
        exportBackup();
        return;
      }
      if (event.target.closest("#import-button")) {
        document.getElementById("import-file").click();
        return;
      }
      if (event.target.closest("#recovery-button")) {
        recoverPreviousState();
        return;
      }
      if (event.target.closest("#reset-button")) {
        resetState();
        return;
      }
      if (event.target.closest("#print-button")) {
        window.print();
        return;
      }
      if (event.target.closest("#install-button") || event.target.closest("#install-shortcut")) {
        promptInstall();
        return;
      }
      if (event.target.closest("#apply-update") && waitingWorker) {
        updateReloadRequested = true;
        waitingWorker.postMessage({ type: "SKIP_WAITING" });
      }
    });

    document.addEventListener("change", function (event) {
      if (event.target.matches("[data-stamp]")) {
        hideCelebration();
        window.clearTimeout(toastTimer);
        const key = event.target.dataset.stamp;
        const checked = event.target.checked;
        const context = stampActionContext(key);
        const execution = context.dayId && state.executions[context.dayId];
        const linkedStepDone = Boolean(execution && context.stepId && isStepDone(execution, context.stepId));
        const linkedStepActive = Boolean(execution && execution.activeStepId === context.stepId);
        const route = Object.values(data.routes).find(function (item) { return (item.stamps || ["start", "middle", "end"]).some(function (stage) { return item.id + "-" + stage === key; }); });
        const wasComplete = route && tripLogic.routeComplete(route, state.stamps);
        const previousKm = completedKm();
        state.stamps[key] = checked;
        recentlyStamped = checked ? key : "";
        data.days.forEach(function (day) {
          const execution = state.executions[day.id];
          if (execution) syncExecutionFromStamps(day, execution);
        });
        saveState();
        renderAll();
        window.setTimeout(function () { recentlyStamped = ""; document.querySelectorAll(".just-stamped").forEach(function (element) { element.classList.remove("just-stamped"); }); }, 900);
        if (checked) {
          lastStampAction = Object.assign({ key, autoAdvanced: Boolean(execution && linkedStepActive && !linkedStepDone && context.stepId && isStepDone(execution, context.stepId)) }, context);
          if (previousKm < 100 && completedKm() >= 100) showCelebration("goal", "100 km", "已集齐章的步行线路达到100 km，正式证书请携纸质护照现场办理。");
          else if (route && !wasComplete && tripLogic.routeComplete(route, state.stamps)) showCelebration("milestone", route.id + "号线", route.km + " km · 已收入更多页的旅程纪念" + (route.counts ? "" : " · 骑行不计认证"));
          else showToast("已记录“" + context.label + "”", "撤销", "undo-stamp", 8000);
        } else if (lastStampAction && lastStampAction.key === key) {
          lastStampAction = null;
          hideCelebration();
        }
      } else if (event.target.matches("[data-cutoff-check]")) {
        state.cutoffChecks[event.target.dataset.cutoffCheck] = event.target.checked;
        saveState(); renderToday(); renderWeather();
        showToast("截止处理状态已保存");
      } else if (event.target.matches("[data-confirmation]")) {
        state.confirmations[event.target.dataset.confirmation] = event.target.checked;
        saveState();
        renderAll();
      } else if (event.target.matches("[data-fallback]")) {
        state.fallbacks[event.target.dataset.fallback] = event.target.checked;
        saveState();
        renderAll();
      } else if (event.target.id === "compact-toggle") {
        state.compact = event.target.checked;
        saveState();
        renderAll();
      } else if (event.target.id === "import-file") {
        importBackup(event.target.files[0]);
      }
    });

    document.addEventListener("input", function (event) {
      if (event.target.matches("[data-day-note]")) {
        state.dayNotes[event.target.dataset.dayNote] = event.target.value.slice(0, 5000);
        saveState();
      } else if (event.target.id === "trip-notes") {
        state.notes = event.target.value.slice(0, 20000);
        saveState();
      } else if (event.target.id === "checkin-lat" || event.target.id === "checkin-lng") {
        updateLocationState();
      } else if (event.target.id === "checkin-search-input") {
        filterState.query = event.target.value.slice(0, 160);
        renderCheckins();
      }
    });

    document.getElementById("checkin-form").addEventListener("submit", submitCheckinForm);
    document.getElementById("expense-form").addEventListener("submit", submitExpenseForm);
    document.getElementById("quick-add-dialog").addEventListener("click", function (event) {
      if (event.target === event.currentTarget) closeQuickAddDialog();
    });
    document.getElementById("expense-dialog").addEventListener("click", function (event) {
      if (event.target === event.currentTarget) closeExpenseDialog();
    });
    document.getElementById("checkin-dialog").addEventListener("click", function (event) {
      if (event.target === event.currentTarget) closeCheckinDialog();
    });
    document.getElementById("checkin-map-input").addEventListener("blur", function () {
      if (this.value.trim()) parseLocationIntoForm();
    });
    window.addEventListener("online", function () { updateNetworkStatus(); refreshWeather(false); });
    window.addEventListener("offline", function () { updateNetworkStatus(); renderWeather(); });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) { refreshTodayClock(); refreshWeather(false); }
    });
    window.setInterval(function () {
      if (!document.hidden) refreshWeather(false);
    }, WEATHER_REFRESH_MS);
    window.setInterval(function () {
      refreshTodayClock();
    }, 30000);
  }

  function refreshTodayClock() {
    if (document.hidden || state.activeView !== "today" || document.activeElement?.closest("textarea,select,dialog[open],input:not([type=checkbox])")) return;
    const active = document.activeElement;
    let focusSelector = "";
    if (active?.matches(".today-risk > summary")) focusSelector = ".today-risk > summary";
    else if (active?.matches(".other-cutoffs > summary")) focusSelector = ".other-cutoffs > summary";
    else if (active?.matches(".today-stamp > summary")) focusSelector = ".today-stamp > summary";
    else for (const attribute of ["data-browse-step", "data-reset-advisory", "data-cutoff-check", "data-refresh-weather", "data-stamp"]) {
      if (active?.hasAttribute(attribute)) { focusSelector = '[' + attribute + '="' + CSS.escape(active.getAttribute(attribute)) + '"]'; break; }
    }
    renderToday(); renderWeather();
    if (focusSelector) document.querySelector("#today-content " + focusSelector)?.focus({ preventScroll: true });
  }

  function configurePrint() {
    window.addEventListener("beforeprint", function () {
      printRestore = document.getElementById("plan-content").innerHTML;
      document.getElementById("plan-content").innerHTML = data.days.map(function (day) {
        return renderPlanDay(day, true);
      }).join("");
    });
    window.addEventListener("afterprint", function () {
      if (printRestore != null) document.getElementById("plan-content").innerHTML = printRestore;
      printRestore = null;
    });
  }

  populateCheckinDayOptions();
  populateExpenseDayOptions();
  bindEvents();
  configurePrint();
  initializeInstall();
  initializeServiceWorker();
  renderAll();
})();
