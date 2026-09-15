(function () {
  "use strict";

  const data = window.TRIP_DATA;
  const STORAGE_KEY = "jeju-olle-plan-v4";
  const LEGACY_STORAGE_KEY = "jeju-olle-plan-v3";
  const RECOVERY_KEY = "jeju-olle-plan-v4-recovery";
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
  const filterState = { day: "all", category: "all" };
  let expenseDayFilter = "all";
  let state = loadState();
  let deferredInstallPrompt = null;
  let waitingWorker = null;
  let updateReloadRequested = false;
  let deletedCheckin = null;
  let deletedExpense = null;
  let toastTimer = null;
  let printRestore = null;
  const openRouteDetails = new Set();

  function initialDayId() {
    const now = new Date();
    const key = String(now.getMonth() + 1).padStart(2, "0") + String(now.getDate()).padStart(2, "0");
    if (now.getFullYear() !== 2026 || key < "0923") return "0923";
    if (key > "0928") return "0928";
    return DAY_IDS.includes(key) ? key : "0923";
  }

  function defaultState() {
    return {
      version: 4,
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
      fallbacks: {}
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

  function normalizeState(raw) {
    const defaults = defaultState();
    if (!raw || typeof raw !== "object") return defaults;
    return {
      version: 4,
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
      fallbacks: cleanBooleanMap(raw.fallbacks, 100)
    };
  }

  function migrateLegacy(raw) {
    return normalizeState({
      version: 4,
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
      fallbacks: raw.fallbacks
    });
  }

  function loadState() {
    try {
      const current = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (current && current.version === 4) return normalizeState(current);
      const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
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

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
    return '<img src="assets/icons/' + htmlEscape(name) + '" alt="">';
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

    const labelSuffix = compact ? "" : " 导航";
    return '<div class="map-actions">' +
      '<a class="map-button' + (hasCoordinates(place) ? "" : " disabled") + '" href="' + htmlEscape(kakaoWeb) + '" target="_blank" rel="noopener" data-map-app="Kakao Map" data-app-url="' + htmlEscape(kakaoApp) + '" data-android-intent="' + htmlEscape(kakaoIntent) + '" aria-label="使用Kakao Map前往' + htmlEscape(place.name) + '">' + icon("map.svg") + "KAKAO" + labelSuffix + "</a>" +
      '<a class="map-button' + (hasCoordinates(place) ? "" : " disabled") + '" href="' + htmlEscape(naverWeb) + '" target="_blank" rel="noopener" data-map-app="Naver Map" data-app-url="' + htmlEscape(naverApp) + '" data-android-intent="' + htmlEscape(naverIntent) + '" aria-label="使用Naver Map前往' + htmlEscape(place.name) + '">' + icon("navigation.svg") + "NAVER" + labelSuffix + "</a>" +
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
      '<section class="today-hero"><div class="today-hero-inner">' +
        '<div><p class="trip-date">2026.09.23–09.28 · SOLO WALK</p><h1 id="today-title">济州偶来 <span>100 km行程</span></h1><p class="trip-route">北京大兴 → 济州东部 → 西归浦 → 加波岛 → 北京首都</p></div>' +
        '<div class="hero-progress"><div class="hero-progress-top"><span>' + (km >= 100 ? "证书里程已达成" : "认证进度") + '</span><strong>' + km.toFixed(1) + ' KM</strong></div><div class="progress-track"><div class="progress-fill" style="width:' + percent + '%"></div></div><p class="hero-progress-foot">核心计划 ' + data.trip.coreCertificateKm + ' km · 纸质盖章 ' + stamps.checked + " / " + stamps.total + "</p></div>" +
      "</div></section>";
  }

  function renderDateStrip(targetId) {
    document.getElementById(targetId).innerHTML = data.days.map(function (day) {
      return '<button class="date-chip" type="button" data-day="' + day.id + '" aria-selected="' + (state.activeDay === day.id) + '"><time datetime="2026-' + day.id.slice(0, 2) + "-" + day.id.slice(2) + '">' + day.date.replace("月", "/").replace("日", "") + "</time><span>" + htmlEscape(day.label) + "</span></button>";
    }).join("");
  }

  function renderNextCard(day) {
    const place = data.places[day.next.place];
    return '<section class="next-card"><div class="next-card-top"><div><span class="next-label">NEXT ACTION</span><time>' + htmlEscape(day.next.time) + '</time></div><span class="mode-badge">' + htmlEscape(day.next.mode) + '</span></div><h3>' + htmlEscape(day.next.title) + "</h3><p>" + htmlEscape(day.next.detail) + "</p>" + (place ? mapLinks(place, day.next.mode) : "") + "</section>";
  }

  function renderQuickTimeline(day) {
    let startIndex = day.timeline.findIndex(function (item) {
      return item.time === day.next.time && item.title === day.next.title;
    });
    const items = startIndex >= 0 ? day.timeline.slice(startIndex + 1, startIndex + 4) : day.timeline.filter(function (item) {
      return item.title !== day.next.title;
    }).slice(0, 3);
    if (!items.length) return "";
    return '<div class="section-heading"><h2>接下来</h2><span>' + items.length + ' 个节点</span></div><div class="quick-timeline">' + items.map(function (item) {
      return '<article class="quick-step"><time>' + htmlEscape(item.time) + '</time><div class="step-card"><h3>' + htmlEscape(item.title) + "</h3><p>" + htmlEscape(item.detail) + "</p></div></article>";
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
    const stamps = stampStats();
    const km = completedKm();
    const confirmations = confirmationsForDay(day.id);
    const checkedConfirmations = confirmations.filter(function (item) { return state.confirmations[item.id]; }).length;
    const totalDistance = day.walkKm + (day.bikeKm || 0);
    const checkins = checkinsForDay(day.id);
    const checkedPlaces = checkins.filter(function (item) { return state.checkinChecks[item.id]; }).length;

    document.getElementById("today-content").innerHTML =
      '<div class="day-title-row"><div><p class="overline">' + htmlEscape(day.weekday) + " · " + htmlEscape(day.date) + '</p><h2>' + htmlEscape(day.label) + '</h2><p>' + htmlEscape(day.lead) + '</p></div><div class="distance-mark">' + totalDistance.toFixed(1) + '<small>' + (day.bikeKm ? day.walkKm + " WALK + " + day.bikeKm + " BIKE" : "KM WALK") + "</small></div></div>" +
      '<div class="today-grid"><div class="today-primary">' +
        renderNextCard(day) +
        renderRouteTeaser(day) +
        renderQuickTimeline(day) +
        (day.cutoff ? '<section class="cutoff-card"><strong>硬截止 · ' + htmlEscape(day.cutoff) + "</strong><p>" + htmlEscape(day.fallback) + '</p><label class="fallback-toggle"><input type="checkbox" data-fallback="' + day.id + '" ' + (state.fallbacks[day.id] ? "checked" : "") + '><span>' + (state.fallbacks[day.id] ? "已启用备选方案" : "启用备选方案") + "</span></label></section>" : "") +
        '<div class="data-actions"><button class="secondary-button" type="button" data-view-target="plan">' + icon("calendar-days.svg") + "查看完整时间轴</button></div>" +
      '</div><aside class="today-side">' +
        '<section class="status-panel"><div class="status-panel-head"><h3>100 km进度</h3><span>' + (km >= 100 ? "READY" : (100 - km).toFixed(1) + " KM TO GO") + '</span></div><div class="mini-progress"><i style="width:' + Math.min(100, km) + '%"></i></div><div class="metric-row"><div><span>核心</span><strong>' + data.trip.coreCertificateKm + '</strong></div><div><span>认证</span><strong>' + km.toFixed(1) + '</strong></div><div><span>盖章</span><strong>' + stamps.checked + "/" + stamps.total + "</strong></div></div></section>" +
        '<section class="status-panel"><div class="status-panel-head"><h3>出发前确认</h3><span>' + checkedConfirmations + "/" + confirmations.length + "</span></div>" + renderConfirmationRows(confirmations) + "</section>" +
        renderTodayExpensePanel(day.id) +
        '<section class="status-panel"><div class="status-panel-head"><h3>当天打卡</h3><span>' + checkedPlaces + "/" + checkins.length + '</span></div><div class="data-actions"><button class="secondary-button" type="button" data-view-target="checkins">' + icon("map-pin-check.svg") + '查看地点</button><button class="secondary-button" type="button" data-open-checkin>' + icon("plus.svg") + '新增</button></div></section>' +
      "</aside></div>";
  }

  function renderTimeline(day) {
    return '<div class="section-heading"><h2>时间与交通</h2><span>' + day.timeline.length + ' 个节点</span></div><div class="timeline">' + day.timeline.map(function (item) {
      const place = item.place ? data.places[item.place] : null;
      const typeClass = item.risk ? "risk" : item.type === "徒步" ? "walk" : "";
      return '<article class="timeline-item"><time class="timeline-time">' + htmlEscape(item.time) + '</time><div class="timeline-card"><div class="timeline-top"><h3>' + htmlEscape(item.title) + '</h3><span class="type-tag ' + typeClass + '">' + htmlEscape(item.type) + "</span></div><p>" + htmlEscape(item.detail) + "</p>" + (place ? '<p class="place-address"><b>' + htmlEscape(place.korean) + "</b> · " + htmlEscape(place.address) + "</p>" + mapLinks(place, item.type + " " + item.title) : "") + "</div></article>";
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

  function renderPlanDay(day, printMode) {
    const totalDistance = day.walkKm + (day.bikeKm || 0);
    const hotel = day.hotel ? data.places[day.hotel] : null;
    const dayCheckins = checkinsForDay(day.id).filter(function (item) { return !item.routeHighlight; });
    return '<article class="' + (printMode ? "print-day" : "plan-day") + '"><header class="plan-day-header"><div><p class="overline">' + htmlEscape(day.weekday) + " · " + htmlEscape(day.date) + '</p><h2>' + htmlEscape(day.label) + "</h2><p>" + htmlEscape(day.lead) + '</p></div><div class="distance-mark">' + totalDistance.toFixed(1) + '<small>' + (day.bikeKm ? "WALK + BIKE" : "KM WALK") + "</small></div></header>" +
      '<div class="plan-layout"><div>' + renderRouteGuides(day, printMode) + renderTimeline(day) +
      (day.cutoff ? '<section class="cutoff-card"><strong>硬截止 · ' + htmlEscape(day.cutoff) + "</strong><p>" + htmlEscape(day.fallback) + '</p><label class="fallback-toggle"><input type="checkbox" data-fallback="' + day.id + '" ' + (state.fallbacks[day.id] ? "checked" : "") + '><span>' + (state.fallbacks[day.id] ? "已启用备选方案" : "启用备选方案") + "</span></label></section>" : "") +
      renderStamps(day) +
      (dayCheckins.length ? '<div class="section-heading"><h2>当天打卡点</h2><span>' + dayCheckins.length + ' 个</span></div><div class="checkin-list">' + dayCheckins.map(renderCheckinCard).join("") + "</div>" : "") +
      '</div><aside class="plan-side">' +
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
    return '<article class="checkin-card ' + (checked ? "completed" : "") + '" data-checkin-card="' + htmlEscape(item.id) + '"><div class="checkin-card-top"><div><span class="category-label">' + icon(category.icon) + htmlEscape(category.label) + '</span><h2>' + htmlEscape(place.name) + '</h2>' + (place.korean ? '<p class="checkin-korean">' + htmlEscape(place.korean) + "</p>" : "") + '</div><button class="checkin-toggle ' + (checked ? "checked" : "") + '" type="button" data-toggle-checkin="' + htmlEscape(item.id) + '" aria-label="' + (checked ? "取消打卡" : "标记已打卡") + '">' + icon("check.svg") + "</button></div>" +
      '<div class="checkin-meta"><span>' + htmlEscape(day.date) + "</span><span>" + htmlEscape(item.priority || "想去") + "</span>" + (item.slot ? "<span>" + htmlEscape(item.slot) + "</span>" : "") + "</div>" +
      (detail ? '<p class="checkin-detail">' + htmlEscape(detail) + "</p>" : "") +
      (place.address ? '<p class="place-address"><b>' + htmlEscape(place.korean || place.name) + "</b> · " + htmlEscape(place.address) + "</p>" : "") +
      (!hasCoordinates(place) ? '<p class="location-warning">' + (item.routeHighlight ? "按韩文地名搜索：具体位置以官方线路图和现场路标为准。" : "定位待补充：地图将先打开搜索结果。") + '</p>' : "") +
      '<div class="checkin-card-actions">' + mapLinks(place, item.mode, true) +
      (item.custom ? '<div class="custom-actions"><button type="button" data-edit-checkin="' + htmlEscape(item.id) + '" aria-label="编辑' + htmlEscape(place.name) + '" title="编辑">' + icon("pencil.svg") + '</button><button class="delete-action" type="button" data-delete-checkin="' + htmlEscape(item.id) + '" aria-label="删除' + htmlEscape(place.name) + '" title="删除">' + icon("trash-2.svg") + "</button></div>" : "") +
      "</div></article>";
  }

  function renderCheckinFilters() {
    const dayOptions = [{ id: "all", date: "全部日期" }].concat(data.days);
    document.getElementById("checkin-day-filter").innerHTML = dayOptions.map(function (day) {
      return '<button class="filter-chip" type="button" data-filter-day="' + day.id + '" aria-pressed="' + (filterState.day === day.id) + '">' + htmlEscape(day.date) + "</button>";
    }).join("");
    document.getElementById("checkin-category-filter").innerHTML = Object.keys(data.categories).map(function (key) {
      return '<button class="filter-chip" type="button" data-filter-category="' + key + '" aria-pressed="' + (filterState.category === key) + '">' + htmlEscape(data.categories[key].label) + "</button>";
    }).join("");
  }

  function renderCheckins() {
    renderCheckinFilters();
    const items = combinedCheckins().filter(function (item) {
      const dayMatches = filterState.day === "all" || item.dayId === filterState.day;
      const categoryMatches = filterState.category === "all" || item.category === filterState.category;
      return dayMatches && categoryMatches;
    }).sort(function (a, b) {
      return DAY_IDS.indexOf(a.dayId) - DAY_IDS.indexOf(b.dayId);
    });
    document.getElementById("checkin-list").innerHTML = items.length
      ? items.map(renderCheckinCard).join("")
      : '<div class="empty-state">' + icon("map-pin-off.svg") + "<p>当前筛选下没有打卡点。</p></div>";
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
        '<section class="more-section span-2"><div class="more-section-head"><div>' + icon("plane.svg") + '<h2>航班</h2></div><span class="type-tag">以订单为准</span></div><div class="flight-pair">' + data.flights.map(renderFlightCard).join("") + "</div></section>" +
        '<section class="more-section"><div class="more-section-head"><div>' + icon("award.svg") + '<h2>100 km证书</h2></div><span class="type-tag walk">' + (km >= 100 ? "READY" : km.toFixed(1) + " KM") + '</span></div><div class="certificate-callout"><strong>9月28日 · 返港后</strong><p>13:00起目标办理；晚船返港时须赶在16:30受理结束前。</p></div><ul class="fact-list"><li><span>受理时间</span><strong>09:00–11:30<br>13:00–16:30</strong></li><li><span>核心认证里程</span><strong>102.1 km</strong></li><li><span>必须携带</span><strong>本人纸质护照</strong></li><li><span>现场步骤</span><strong>QR问卷 + 验章</strong></li></ul>' + mapLinks(hamo, "步行") + "</section>" +
        '<section class="more-section"><div class="more-section-head"><div>' + icon("briefcase.svg") + '<h2>行李与船班确认</h2></div><span class="type-tag">' + confirmed + "/" + allConfirmations.length + "</span></div>" + renderConfirmationRows(allConfirmations) + "</section>" +
        '<section class="more-section"><div class="more-section-head"><div>' + icon("link.svg") + '<h2>官方查询</h2></div></div><div class="official-links">' + officialLinks.map(function (link) {
          return '<a class="official-link" href="' + link[1] + '" target="_blank" rel="noopener"><span>' + htmlEscape(link[0]) + "</span>" + icon("external-link.svg") + "</a>";
        }).join("") + "</div></section>" +
        '<section class="more-section"><div class="more-section-head"><div>' + icon("settings-2.svg") + '<h2>显示与安装</h2></div></div><div class="settings-list"><label class="setting-row"><span>紧凑显示</span><span class="toggle"><input id="compact-toggle" type="checkbox" ' + (state.compact ? "checked" : "") + '><i></i></span></label><div class="setting-row"><span>安装到手机桌面</span><button id="install-button" class="secondary-button" type="button" ' + (canInstall ? "" : "disabled") + ">" + icon("download.svg") + (canInstall ? "安装" : "由浏览器提供") + "</button></div></div></section>" +
        '<section class="more-section span-2"><div class="more-section-head"><div>' + icon("notebook-pen.svg") + '<h2>全程备忘</h2></div><span class="type-tag">自动保存</span></div><textarea id="trip-notes" rows="6" placeholder="车票、天气、临时变更……">' + htmlEscape(state.notes) + "</textarea></section>" +
        '<section class="more-section span-2"><div class="more-section-head"><div>' + icon("database.svg") + '<h2>数据备份</h2></div><span class="type-tag">本机保存</span></div><p>导出文件包含旅行支出、打卡点、盖章和备注，可在另一台设备导入。</p><div class="data-actions"><button id="export-button" class="secondary-button" type="button">' + icon("download.svg") + '导出备份</button><button id="import-button" class="secondary-button" type="button">' + icon("upload.svg") + '导入备份</button>' + (hasRecovery ? '<button id="recovery-button" class="secondary-button" type="button">' + icon("history.svg") + "恢复导入前数据</button>" : "") + '<button id="reset-button" class="text-button danger-button" type="button">恢复默认</button></div></section>' +
      "</div>";
  }

  function renderAll() {
    document.body.dataset.density = state.compact ? "compact" : "comfortable";
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
  }

  function switchView(viewName, preserveScroll) {
    if (!ALLOWED_VIEWS.includes(viewName)) return;
    state.activeView = viewName;
    saveState();
    renderAll();
    if (!preserveScroll) window.scrollTo({ top: 0, behavior: "auto" });
  }

  function selectDay(dayId) {
    if (!DAY_IDS.includes(dayId)) return;
    state.activeDay = dayId;
    saveState();
    renderAll();
  }

  function showToast(message, actionLabel, actionName) {
    const toast = document.getElementById("toast");
    window.clearTimeout(toastTimer);
    toast.innerHTML = "<span>" + htmlEscape(message) + "</span>" + (actionLabel ? '<button type="button" data-toast-action="' + htmlEscape(actionName) + '">' + htmlEscape(actionLabel) + "</button>" : "");
    toast.hidden = false;
    toastTimer = window.setTimeout(function () { toast.hidden = true; }, actionLabel ? 5000 : 2300);
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
    document.querySelector(".advanced-fields").open = false;
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
      document.querySelector(".advanced-fields").open = Boolean(item.korean || item.address || item.slot || item.dish || item.note);
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
      version: 4,
      exportedAt: new Date().toISOString(),
      state
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const fileName = "jeju-olle-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    const file = new File([blob], fileName, { type: "application/json" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "济州偶来行程备份" });
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
    showToast("备份文件已导出");
  }

  async function importBackup(file) {
    try {
      if (!file || file.size > 2 * 1024 * 1024) throw new Error("文件过大");
      const parsed = JSON.parse(await file.text());
      const incoming = parsed && parsed.product === "jeju-olle-trip" ? parsed.state : parsed;
      let nextState;
      if (incoming && incoming.version === 4) nextState = normalizeState(incoming);
      else if (incoming && incoming.version === 3) nextState = migrateLegacy(incoming);
      else throw new Error("不支持的备份版本");
      localStorage.setItem(RECOVERY_KEY, JSON.stringify(state));
      state = nextState;
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
    status.lastChild.textContent = online ? "在线" : "离线可用";
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
      if (!updateReloadRequested) return;
      updateReloadRequested = false;
      window.location.reload();
    });
  }

  function bindEvents() {
    document.addEventListener("toggle", function (event) {
      const details = event.target;
      if (!details.matches || !details.matches("[data-route-disclosure]")) return;
      if (details.closest(".print-day")) return;
      const key = details.dataset.routeDisclosure;
      if (details.open) openRouteDetails.add(key);
      else openRouteDetails.delete(key);
    }, true);
    document.addEventListener("click", function (event) {
      const mapLink = event.target.closest("[data-map-app]");
      if (mapLink) {
        openMapApp(event, mapLink);
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
        state.checkinChecks[id] = !state.checkinChecks[id];
        saveState();
        renderAll();
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
        filterState.day = dayFilter.dataset.filterDay;
        renderCheckins();
        return;
      }
      const categoryFilter = event.target.closest("[data-filter-category]");
      if (categoryFilter) {
        filterState.category = categoryFilter.dataset.filterCategory;
        renderCheckins();
        return;
      }
      const toastAction = event.target.closest("[data-toast-action]");
      if (toastAction && toastAction.dataset.toastAction === "undo-delete") {
        undoDelete();
        return;
      }
      if (toastAction && toastAction.dataset.toastAction === "undo-expense") {
        undoExpenseDelete();
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
        state.stamps[event.target.dataset.stamp] = event.target.checked;
        saveState();
        renderAll();
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
    window.addEventListener("online", updateNetworkStatus);
    window.addEventListener("offline", updateNetworkStatus);
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
