(function () {
  "use strict";

  const STORAGE_KEY = "jeju-olle-plan-v3";
  const trip = { plannedWalkKm: 106.3, plannedBikeKm: 13.2 };

  const places = {
    airport: { name: "济州国际机场", korean: "제주국제공항", address: "제주특별자치도 제주시 공항로 2" },
    newStar: { name: "New Star Hotel", korean: "뉴 스타 호텔", address: "제주특별자치도 제주시 서사로 102" },
    jejuTerminal: { name: "济州客运站", korean: "제주버스터미널", address: "제주특별자치도 제주시 서광로 174" },
    siheung: { name: "始兴里 · 1号线起点", korean: "시흥리 제주올레 1코스 시작점", address: "제주특별자치도 서귀포시 성산읍 시흥리" },
    gwangchigi: { name: "广峙其海边", korean: "광치기해변", address: "제주특별자치도 서귀포시 성산읍 고성리" },
    seongsanPort: { name: "城山港客运码头", korean: "성산포항 종합여객터미널", address: "제주특별자치도 서귀포시 성산읍 성산등용로 112-7" },
    udo: { name: "牛岛天津港", korean: "우도 천진항", address: "제주특별자치도 제주시 우도면 연평리" },
    playce: { name: "Playce Camp Jeju", korean: "플레이스캠프 제주", address: "제주특별자치도 서귀포시 성산읍 동류암로 20" },
    namwon: { name: "南元浦口", korean: "남원포구", address: "제주특별자치도 서귀포시 남원읍 남태해안로" },
    soesokkak: { name: "牛沼河口", korean: "쇠소깍", address: "제주특별자치도 서귀포시 쇠소깍로 104" },
    traveler: { name: "济州偶来旅行者中心", korean: "제주올레 여행자센터", address: "제주특별자치도 서귀포시 중정로 22" },
    kenny: { name: "Kenny Stay Jeju Seogwipo", korean: "케니 스테이 제주 서귀포", address: "제주특별자치도 서귀포시 동문로 42" },
    seogwipoTerminal: { name: "西归浦客运站", korean: "서귀포버스터미널", address: "제주특별자치도 서귀포시 일주동로 9217" },
    wolpyeong: { name: "月坪偶来起点", korean: "월평아왜낭목 쉼터", address: "제주특별자치도 서귀포시 월평동" },
    daepyeong: { name: "大坪浦口", korean: "대평포구", address: "제주특별자치도 서귀포시 안덕면 창천리" },
    amantov: { name: "Amantov Pension", korean: "아만토브 펜션", address: "제주특별자치도 서귀포시 예래로 446" },
    hwasun: { name: "和顺金沙滩", korean: "화순금모래해수욕장", address: "제주특별자치도 서귀포시 안덕면 화순해안로 69" },
    seotal: { name: "Seotal Oreum停车场亭子", korean: "섯알오름 주차장 정자", address: "제주특별자치도 서귀포시 대정읍 상모리 1590-3" },
    hamo: { name: "摹瑟浦运动场", korean: "하모체육공원", address: "제주특별자치도 서귀포시 대정읍 최남단해안로29번길 14" },
    unjin: { name: "云津港", korean: "운진항", address: "제주특별자치도 서귀포시 대정읍 최남단해안로 120" },
    gapado: { name: "加波岛上洞浦口", korean: "가파도 상동포구", address: "제주특별자치도 서귀포시 대정읍 가파리" }
  };

  const routes = {
    "1": { id: "1", km: 15.1, mode: "徒步", counts: true },
    "1-1": { id: "1-1", km: 13.2, mode: "骑行", counts: false },
    "5": { id: "5", km: 13.4, mode: "徒步", counts: true },
    "6": { id: "6", km: 10.1, mode: "徒步", counts: true },
    "7": { id: "7", km: 12.9, mode: "徒步", counts: true },
    "7-1": { id: "7-1", km: 15.7, mode: "徒步", counts: true },
    "8": { id: "8", km: 19.3, mode: "徒步", counts: true },
    "10": { id: "10", km: 15.6, mode: "徒步", counts: true },
    "10-1": { id: "10-1", km: 4.2, mode: "徒步", counts: true }
  };

  const days = [
    {
      id: "0923", date: "9月23日", weekday: "周三", label: "抵达济州", walkKm: 0, routeIds: [],
      lead: "落地后只做一件事：尽快入住并把明早补给准备好。",
      next: { time: "21:35", title: "抵达济州国际机场", detail: "取行李、入境后直接前往出租车乘车区", mode: "航班", place: "airport" },
      timeline: [
        { time: "21:35", title: "航班落地", detail: "预留 45–65 分钟取行李和入境。", type: "航班", place: "airport" },
        { time: "22:20", title: "机场出租车 → New Star Hotel", detail: "车程约 10–15 分钟；向司机出示韩文酒店名和地址。", type: "打车", place: "newStar" },
        { time: "22:45", title: "办理入住", detail: "确认次日 05:35 退房；买好早餐、饮水、电解质和便携午餐。", type: "住宿", place: "newStar" }
      ],
      hotel: "newStar"
    },
    {
      id: "0924", date: "9月24日", weekday: "周四", label: "1 + 牛岛", walkKm: 15.1, bikeKm: 13.2, routeIds: ["1", "1-1"],
      lead: "先坐201路到Playce Camp寄存行李，再返回古城站换反方向201路去始兴里起点。",
      next: { time: "05:35", title: "New Star Hotel → Playce Camp寄存行李", detail: "步行到济州客运站，目标搭05:55左右的201路前往古城换乘站", mode: "201 BUS", place: "playce" },
      timeline: [
        { time: "05:35", title: "退房，步行前往济州客运站", detail: "约10–15分钟；携带全部行李。", type: "步行", place: "jejuTerminal" },
        { time: "05:55", title: "201路 → 古城换乘站", detail: "预计07:20–07:35抵达；此时间为计划窗口，前一晚复核中秋班次。", type: "公交", place: "playce" },
        { time: "07:35", title: "步行前往Playce Camp", detail: "从古城换乘站步行约5–10分钟到酒店。", type: "步行", place: "playce" },
        { time: "07:45", title: "酒店寄存行李", detail: "只做快速寄存，必须提前联系酒店确认清晨可接收行李。", type: "行李", place: "playce" },
        { time: "07:55", title: "返回古城站，搭201路去始兴里", detail: "在反方向站台乘车；目标08:15–08:25抵达1号线起点。", type: "公交", place: "siheung" },
        { time: "08:25", title: "1号线 · 始兴里 → 广峙其海边", detail: "15.1 km，按约4小时快走；起点、中间、终点章都要盖。", type: "徒步", place: "siheung" },
        { time: "12:20", title: "抵达广峙其海边", detail: "盖完终点章后，在广峙其海边站搭211、212或295路前往城山港。", type: "转场", place: "gwangchigi" },
        { time: "13:00", title: "城山港购票、候船", detail: "预留约1小时办理乘船手续并简单补给，现场确认17:30返程船班。", type: "船班", place: "seongsanPort" },
        { time: "14:00", title: "乘船前往牛岛", detail: "约15分钟抵达，租车时确认17:10前还车。", type: "船班", place: "udo" },
        { time: "14:30", title: "牛岛 1-1 号线骑行", detail: "13.2 km，骑行目标约2.5小时；骑行不计入本页认证步行里程。", type: "骑行", place: "udo" },
        { time: "17:10", title: "回到牛岛码头", detail: "还车后搭17:30返程船；18:00末班只作为紧急备用。", type: "截止", place: "udo", risk: true },
        { time: "18:00", title: "城山港 → Playce Camp", detail: "搭211、212或295路，在古城换乘站附近下车；到酒店取行李并办理入住。", type: "公交", place: "playce" }
      ],
      cutoff: "前一晚必须确认Playce Camp可在07:45左右寄存。08:05仍未离开酒店就打车去始兴里；12:35尚未走完1号线则取消牛岛骑行。",
      fallback: "牛岛取消后，从广峙其海边搭201、211、212或295路返回古城换乘站，步行到Playce Camp取行李并入住。",
      hotel: "playce"
    },
    {
      id: "0925", date: "9月25日", weekday: "周五 · 中秋", label: "5 + 6", walkKm: 23.5, routeIds: ["5", "6"],
      lead: "中秋当天以出租车保证早出发，早餐、午餐和水必须前一晚备好。",
      next: { time: "05:45", title: "Playce Camp → 南元浦口", detail: "主方案打车 45–55 分钟；201 路只在确认合适早班后使用", mode: "TAXI", place: "namwon" },
      timeline: [
        { time: "05:45", title: "退房，打车前往南元浦口", detail: "携带全部行李；给司机看韩文地点名。", type: "打车", place: "namwon" },
        { time: "06:45", title: "5 号线 · 南元 → 牛沼河口", detail: "13.4 km，快走目标约 3.5–4 小时；完成三章。", type: "徒步", place: "namwon" },
        { time: "10:30", title: "牛沼河口短休整", detail: "补水、进食后接走 6 号线，不安排正式午餐店。", type: "补给", place: "soesokkak" },
        { time: "10:45", title: "6 号线 · 牛沼河口 → 旅行者中心", detail: "10.1 km，快走目标约 2.5–3 小时；完成三章。", type: "徒步", place: "soesokkak" },
        { time: "14:30", title: "抵达济州偶来旅行者中心", detail: "最晚目标 15:30；步行约 10–15 分钟去酒店。", type: "到达", place: "traveler" },
        { time: "15:00", title: "入住 Kenny Stay", detail: "9月25日与26日连住两晚，整理次日轻装。", type: "住宿", place: "kenny" }
      ],
      cutoff: "当天为中秋正日：不要把沿途餐厅、便利店或游客中心正常营业作为前提。",
      fallback: "若出租车难叫，先到城山 / 古城主路站点，确认南向 201 路实时到站后乘车；出发时间随之顺延。",
      hotel: "kenny"
    },
    {
      id: "0926", date: "9月26日", weekday: "周六", label: "7 + 7-1", walkKm: 28.6, routeIds: ["7", "7-1"],
      lead: "利用酒店与线路闭环位置，全天不做长距离乘车，集中完成 28.6 km。",
      next: { time: "06:15", title: "Kenny Stay → 旅行者中心", detail: "步行约 10–15 分钟，06:30 准时开走", mode: "WALK", place: "traveler" },
      timeline: [
        { time: "06:15", title: "从酒店步行出发", detail: "行李留在连住酒店，只带徒步装备。", type: "步行", place: "kenny" },
        { time: "06:30", title: "7 号线 · 旅行者中心 → 西归浦客运站", detail: "12.9 km，目标约 3–3.5 小时；完成三章。", type: "徒步", place: "traveler" },
        { time: "09:45", title: "客运站补给与盖章", detail: "预留 20–30 分钟补水、吃东西，确认 7-1 起点章。", type: "补给", place: "seogwipoTerminal" },
        { time: "10:15", title: "7-1 号线 · 客运站 → 旅行者中心", detail: "15.7 km，目标约 4–4.5 小时；完成三章。", type: "徒步", place: "seogwipoTerminal" },
        { time: "14:30", title: "回到旅行者中心", detail: "最晚目标 15:00；之后步行返回 Kenny Stay。", type: "到达", place: "traveler" }
      ],
      hotel: "kenny"
    },
    {
      id: "0927", date: "9月27日", weekday: "周日", label: "8 + 10前段", walkKm: 30.7, routeIds: ["8", "10"],
      stampPlan: [
        { routeId: "8", stamps: ["start", "middle", "end"], note: "完成三章" },
        { routeId: "10", stamps: ["start", "middle"], note: "本日盖起点、中间章" }
      ],
      lead: "走完8号线后，只走10号线前11.4 km，到Seotal Oreum中间章结束。",
      next: { time: "05:35", title: "Kenny Stay → 月坪起点", detail: "退房后打车约 20–25 分钟，目标 06:10 开走", mode: "TAXI", place: "wolpyeong" },
      timeline: [
        { time: "05:35", title: "退房，打车前往月坪", detail: "携带全部行李；520 / 600 路仅作非早班备选。", type: "打车", place: "wolpyeong" },
        { time: "06:10", title: "8 号线 · 月坪 → 大坪", detail: "19.3 km，快走目标 4.5–5 小时；完成三章。", type: "徒步", place: "wolpyeong" },
        { time: "11:00", title: "大坪 → Amantov Pension", detail: "打车约 10–20 分钟，只做快速寄存。需事先获得民宿确认。", type: "行李", place: "amantov" },
        { time: "11:30", title: "民宿 → 和顺金沙滩", detail: "打车约 15–20 分钟；最迟 12:00 开始 10 号线。", type: "打车", place: "hwasun" },
        { time: "12:00", title: "10 号线前段 · 和顺 → Seotal Oreum", detail: "本日走约11.4 km；依次完成起点章与中间章。", type: "徒步", place: "hwasun" },
        { time: "15:45", title: "抵达10号线中间章", detail: "在Seotal Oreum停车场亭子盖中间章，到此停止，不继续赶终点。", type: "盖章", place: "seotal" },
        { time: "16:05", title: "中间章 → Amantov Pension", detail: "建议直接打车返回，约20–30分钟；次日清晨回到同一点续走。", type: "打车", place: "amantov" }
      ],
      cutoff: "13:00 仍未从和顺开始10号线，就不要硬赶中间章。",
      fallback: "当天只完成8号线；9月28日取消加波岛，清晨完整走10号线，终点直接领证。认证步行仍约102.1 km。",
      hotel: "amantov"
    },
    {
      id: "0928", date: "9月28日", weekday: "周一", label: "续10 + 10-1", walkKm: 8.4, routeIds: ["10-1"],
      stampPlan: [
        { routeId: "10", stamps: ["end"], note: "续走并盖终点章" },
        { routeId: "10-1", stamps: ["start", "middle", "end"], note: "完成三章" }
      ],
      lead: "清晨续走10号线剩余4.2 km，达到102.1 km后先领证，再搭10:00船去加波岛。",
      next: { time: "06:30", title: "起床，整理行李准备退房", detail: "简单早餐并完成整理，07:00准时退房", mode: "WAKE", place: "amantov" },
      timeline: [
        { time: "06:30", title: "起床、早餐与整理行李", detail: "早餐从简，全部行李在07:00前整理完成。", type: "准备", place: "amantov" },
        { time: "07:00", title: "退房，打车返回中间章", detail: "携带全部行李；车程约20–30分钟，回到前一日停止点。", type: "打车", place: "seotal" },
        { time: "07:25", title: "续走10号线 · Seotal Oreum → 摹瑟浦", detail: "剩余约4.2 km，快走目标约1小时10分钟；抵达后盖10号线终点章。", type: "徒步", place: "seotal" },
        { time: "08:35", title: "抵达摹瑟浦运动场", detail: "至此认证步行约102.1 km；服务点已于08:30开放。", type: "到达", place: "hamo" },
        { time: "08:40", title: "领取100 km证书", detail: "无排队时先办理；若抵达较晚或需要等待，改为返港后领取。", type: "证书", place: "hamo" },
        { time: "09:00", title: "摹瑟浦运动场 → 云津港", detail: "打车约5–10分钟，目标09:10抵达，最迟09:20前完成取票。", type: "打车", place: "unjin" },
        { time: "10:00", title: "乘船前往加波岛", detail: "约10分钟抵达；返程时间以往返订单为准，优先选择12:20返港组合。", type: "船班", place: "gapado" },
        { time: "10:20", title: "10-1 号线 · 加波岛环线", detail: "4.2 km，预计1–1.5小时；完成起点、中间、终点章。", type: "徒步", place: "gapado" },
        { time: "12:20", title: "乘船返回云津港", detail: "具体返程由订票班次绑定；若需等待，仍保留充足机场余量。", type: "船班", place: "unjin" },
        { time: "13:10", title: "云津港 → 济州机场", detail: "选择明确标注途经机场的151系列班次，预留70–90分钟；无合适班次则打车。", type: "公交", place: "airport" },
        { time: "15:00", title: "抵达济州机场", detail: "距离22:40起飞有充足余量，可在机场休整和用餐。", type: "航班", place: "airport" },
        { time: "22:40", title: "离开济州岛", detail: "结束本次偶来小路行程。", type: "航班", place: "airport" }
      ],
      cutoff: "08:45后才走完10号线就跳过上午领证，直接去云津港；证书改在返港并等到13:00午休结束后办理。09:00仍未走完则取消加波岛。",
      fallback: "加波岛停航：完成10号线并领取证书后直接去机场。若前日没到中间章：取消加波岛，清晨从和顺完整走完10号线。",
      hotel: null
    }
  ];

  function initialDayId() {
    const now = new Date();
    const key = String(now.getMonth() + 1).padStart(2, "0") + String(now.getDate()).padStart(2, "0");
    if (now.getFullYear() !== 2026 || key < "0923") return "0923";
    if (key > "0928") return "0928";
    return key;
  }

  const defaults = { version: 3, activeDay: initialDayId(), theme: "timeline", compact: false, reducedMotion: false, notes: "", dayNotes: {}, stamps: {}, fallbacks: {} };
  let state = loadState();
  let printRestoreDay = null;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && saved.version === defaults.version) return { ...defaults, ...saved };
    } catch (error) {
      console.info("未读取到有效的本地计划，将使用默认值。", error.message);
    }
    return { ...defaults };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    const status = document.getElementById("autosave-status");
    if (status) {
      status.textContent = "刚刚保存";
      window.clearTimeout(saveState.timer);
      saveState.timer = window.setTimeout(function () { status.textContent = "已自动保存"; }, 1200);
    }
  }

  function htmlEscape(value) {
    return String(value).replace(/[&<>"]/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char];
    });
  }

  function mapLinks(placeKey) {
    const place = places[placeKey];
    if (!place) return "";
    const query = encodeURIComponent(place.korean + " " + place.address);
    const kakaoWeb = `https://map.kakao.com/link/search/${query}`;
    const naverWeb = `https://map.naver.com/p/search/${query}`;
    const kakaoApp = `kakaomap://search?q=${query}`;
    const naverApp = `nmap://search?query=${query}&appname=jeju.olle.plan`;
    const kakaoIntent = `intent://search?q=${query}#Intent;scheme=kakaomap;package=net.daum.android.map;S.browser_fallback_url=${encodeURIComponent(kakaoWeb)};end`;
    const naverIntent = `intent://search?query=${query}&appname=jeju.olle.plan#Intent;scheme=nmap;package=com.nhn.android.nmap;S.browser_fallback_url=${encodeURIComponent(naverWeb)};end`;
    return `<div class="map-actions"><a class="map-link" href="${htmlEscape(kakaoWeb)}" target="_blank" rel="noopener" data-map-app="Kakao Map" data-app-url="${htmlEscape(kakaoApp)}" data-android-intent="${htmlEscape(kakaoIntent)}" aria-label="使用Kakao Map打开${htmlEscape(place.name)}">KAKAO MAP</a><a class="map-link" href="${htmlEscape(naverWeb)}" target="_blank" rel="noopener" data-map-app="Naver Map" data-app-url="${htmlEscape(naverApp)}" data-android-intent="${htmlEscape(naverIntent)}" aria-label="使用Naver Map打开${htmlEscape(place.name)}">NAVER MAP</a></div>`;
  }

  function isMobileDevice() {
    const mobileUa = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const ipadDesktopUa = /Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
    return mobileUa || ipadDesktopUa;
  }

  function showMapStatus(message) {
    let status = document.getElementById("map-app-status");
    if (!status) {
      status = document.createElement("div");
      status.id = "map-app-status";
      status.className = "map-app-status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      document.body.appendChild(status);
    }
    status.textContent = message;
    status.dataset.visible = "true";
    window.clearTimeout(showMapStatus.timer);
    showMapStatus.timer = window.setTimeout(function () { status.dataset.visible = "false"; }, 2200);
  }

  function openMapApp(event, link) {
    if (!isMobileDevice()) return;
    event.preventDefault();
    const fallbackUrl = link.href;
    const appName = link.dataset.mapApp;
    const launchUrl = /Android/i.test(navigator.userAgent) ? link.dataset.androidIntent : link.dataset.appUrl;
    let fallbackTimer = null;

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
    showMapStatus(`正在打开 ${appName}…`);
    fallbackTimer = window.setTimeout(function () {
      stopFallback();
      if (document.hidden) return;
      showMapStatus(`未检测到 ${appName}，正在打开网页版`);
      window.location.href = fallbackUrl;
    }, 1200);
    window.location.href = launchUrl;
  }

  function completedKm() {
    return Object.values(routes).reduce(function (total, route) {
      if (!route.counts) return total;
      const complete = ["start", "middle", "end"].every(function (stamp) { return Boolean(state.stamps[route.id + "-" + stamp]); });
      return total + (complete ? route.km : 0);
    }, 0);
  }

  function completeStampCount() {
    const total = Object.values(routes).reduce(function (sum, route) { return sum + (route.counts ? 3 : 0); }, 0);
    const checked = Object.keys(state.stamps).filter(function (key) { return state.stamps[key] && !key.startsWith("1-1-"); }).length;
    return { checked: checked, total: total };
  }

  function renderSummary() {
    const km = completedKm();
    const stampCount = completeStampCount();
    const percent = Math.min(100, km);
    const remaining = Math.max(0, 100 - km);
    document.getElementById("trip-summary").innerHTML = `<div class="summary-inner"><div class="summary-intro"><strong>${km >= 100 ? "已达到证书里程" : "距离 100 km 证书还差 " + remaining.toFixed(1) + " km"}</strong><p>认证按整条路线三章齐全计算；牛岛骑行单独记录。</p><div class="progress-track" aria-label="认证里程进度"><div class="progress-fill" style="width:${percent}%"></div></div></div><div class="metric"><span>计划徒步</span><strong>${trip.plannedWalkKm}<small> km</small></strong></div><div class="metric"><span>已认证</span><strong>${km.toFixed(1)}<small> km</small></strong></div><div class="metric"><span>纸质盖章</span><strong>${stampCount.checked}<small> / ${stampCount.total}</small></strong></div></div>`;
  }

  function renderTabs() {
    document.getElementById("day-tabs").innerHTML = days.map(function (day) {
      return `<button class="day-tab" type="button" role="tab" data-day="${day.id}" aria-selected="${state.activeDay === day.id}"><time datetime="2026-${day.id.slice(0,2)}-${day.id.slice(2)}">${day.date.replace("月", "/").replace("日", "")}</time><span>${day.label}</span></button>`;
    }).join("");
  }

  function renderStampRows(day) {
    const stampPlans = day.stampPlan || day.routeIds.map(function (routeId) { return { routeId: routeId, stamps: ["start", "middle", "end"] }; });
    if (!stampPlans.length) return "";
    const stampLabels = { start: "起点", middle: "中间", end: "终点" };
    return `<div class="section-heading" data-section="stamps"><div><p class="section-kicker">PAPER PASSPORT</p><h2>盖章检查</h2></div><span>三章齐全才计入</span></div><div class="stamp-grid">${stampPlans.map(function (plan) {
      const route = routes[plan.routeId];
      const note = plan.note || (route.counts ? "计入认证" : "骑行记录");
      return `<div class="route-stamps stamp-count-${plan.stamps.length}"><div class="route-label"><strong>${route.id} 号线</strong><span>${route.km} km · ${htmlEscape(note)}</span></div>${plan.stamps.map(function (stamp) {
        const key = plan.routeId + "-" + stamp;
        return `<label class="stamp-check"><input type="checkbox" data-stamp="${key}" ${state.stamps[key] ? "checked" : ""}><span>${stampLabels[stamp]}</span></label>`;
      }).join("")}</div>`;
    }).join("")}</div>`;
  }

  function renderTimeline(day) {
    return `<div class="section-heading" data-section="timeline"><div><p class="section-kicker">TIMELINE</p><h2>时间与交通</h2></div><span>${day.timeline.length} 个节点</span></div><div class="timeline">${day.timeline.map(function (item) {
      const place = item.place ? places[item.place] : null;
      return `<article class="timeline-item"><time class="timeline-time">${htmlEscape(item.time)}</time><div class="timeline-card"><div class="timeline-top"><h3>${htmlEscape(item.title)}</h3><span class="type-tag ${item.risk ? "risk" : (item.type === "徒步" ? "walk" : "")}">${htmlEscape(item.type)}</span></div><p>${htmlEscape(item.detail)}</p>${place ? `<p class="place-address"><b>${htmlEscape(place.korean)}</b> · ${htmlEscape(place.address)}</p>${mapLinks(item.place)}` : ""}</div></article>`;
    }).join("")}</div>`;
  }

  function renderDay(day, printMode) {
    const dayDistance = day.walkKm + (day.bikeKm || 0);
    const hotel = day.hotel ? places[day.hotel] : null;
    const dayNumber = String(days.findIndex(function (item) { return item.id === day.id; }) + 1).padStart(2, "0");
    return `<article class="${printMode ? "print-day" : "active-day"}" data-rendered-day="${day.id}" data-section="day"><header class="day-heading"><div><p class="day-meta"><span>DAY ${dayNumber} / ${String(days.length).padStart(2, "0")}</span><span>${htmlEscape(day.weekday)} · ${htmlEscape(day.date)}</span></p><h2>${htmlEscape(day.label)}</h2><p>${htmlEscape(day.lead)}</p></div><div class="distance-stamp">${dayDistance.toFixed(1)}<small>${day.bikeKm ? day.walkKm + " WALK + " + day.bikeKm + " BIKE" : "KM WALK"}</small></div></header><section class="next-move" aria-label="下一步交通"><time class="time">${htmlEscape(day.next.time)}</time><div><span class="next-label">NEXT</span><strong>${htmlEscape(day.next.title)}</strong><p>${htmlEscape(day.next.detail)}</p>${mapLinks(day.next.place)}</div><span class="mode">${htmlEscape(day.next.mode)}</span></section>${renderTimeline(day)}${day.cutoff ? `<section class="cutoff-box"><strong>硬截止 · ${htmlEscape(day.cutoff)}</strong><p>${htmlEscape(day.fallback)}</p><label class="fallback-control"><input type="checkbox" data-fallback="${day.id}" ${state.fallbacks[day.id] ? "checked" : ""}><span>${state.fallbacks[day.id] ? "已启用备选方案" : "启用备选方案"}</span></label></section>` : ""}${renderStampRows(day)}${hotel ? `<div class="section-heading"><div><p class="section-kicker">STAY</p><h2>今晚住宿</h2></div></div><section class="hotel-strip"><div><h3>${htmlEscape(hotel.name)}</h3><p><b>${htmlEscape(hotel.korean)}</b> · ${htmlEscape(hotel.address)}</p></div>${mapLinks(day.hotel)}</section>` : ""}<div class="section-heading"><div><p class="section-kicker">NOTES</p><h2>当天备注</h2></div><span>自动保存</span></div><textarea class="day-notes" data-day-note="${day.id}" rows="4" placeholder="记录天气、班次、身体状态和临时变更……">${htmlEscape(state.dayNotes[day.id] || "")}</textarea></article>`;
  }

  function renderActiveDay() {
    const day = days.find(function (item) { return item.id === state.activeDay; }) || days[0];
    document.getElementById("day-view").innerHTML = renderDay(day, false);
    updateMobileNav();
  }

  function updateMobileNav() {
    document.querySelectorAll(".mobile-jump-nav [data-jump]").forEach(function (button) {
      const target = button.dataset.jump === "certificate"
        ? document.getElementById("certificate-panel")
        : document.querySelector(`[data-section="${button.dataset.jump}"]`);
      button.disabled = !target;
    });
    syncMobileNav();
  }

  function syncMobileNav() {
    const buttons = Array.from(document.querySelectorAll(".mobile-jump-nav [data-jump]"));
    if (!buttons.length) return;
    const sections = buttons.map(function (button) {
      const target = button.dataset.jump === "certificate"
        ? document.getElementById("certificate-panel")
        : document.querySelector(`[data-section="${button.dataset.jump}"]`);
      return { button: button, target: target };
    }).filter(function (item) { return item.target; });
    const marker = Math.min(window.innerHeight * 0.38, 300);
    let current = sections[0];
    sections.forEach(function (item) {
      if (item.target.getBoundingClientRect().top <= marker) current = item;
    });
    buttons.forEach(function (button) { button.removeAttribute("aria-current"); });
    if (current) current.button.setAttribute("aria-current", "true");
  }

  function jumpToSection(section) {
    const target = section === "certificate"
      ? document.getElementById("certificate-panel")
      : document.querySelector(`[data-section="${section}"]`);
    if (!target) return;
    const tabs = document.getElementById("day-tabs");
    const offset = tabs ? tabs.offsetHeight + 10 : 10;
    const top = target.getBoundingClientRect().top + window.scrollY - offset;
    document.querySelectorAll(".mobile-jump-nav [data-jump]").forEach(function (button) {
      if (button.dataset.jump === section) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });
    window.scrollTo({ top: Math.max(0, top), behavior: state.reducedMotion ? "auto" : "smooth" });
  }

  function renderCertificate() {
    const km = completedKm();
    document.getElementById("certificate-panel").innerHTML = `<div class="certificate-top"><div><p class="section-kicker">CERTIFICATE</p><h2>100 km 证书</h2></div><div class="certificate-seal">${km >= 100 ? "READY" : km.toFixed(1)}<small>${km >= 100 ? "100 KM" : "KM"}</small></div></div><p>9月28日在摹瑟浦运动场官方服务点办理。纸质护照与电子护照不可混用。</p><ul class="rail-list"><li><span>服务时间</span><strong>08:30–17:00</strong></li><li><span>午休</span><strong>12:00–13:00</strong></li><li><span>停航后里程</span><strong>102.1 km</strong></li></ul>${mapLinks("hamo")}`;
  }

  function renderQuickLinks() {
    const links = [["济州实时公交", "https://bus.jeju.go.kr/"], ["牛岛船运公告", "http://www.udoship.com/"], ["加波岛预约 / 船班", "https://www.wonderfulis.co.kr/"], ["济州偶来官网", "https://www.jejuolle.org/"]];
    document.getElementById("quick-links").innerHTML = `<p class="section-kicker">LIVE CHECK</p><h2>出发前复核</h2><p>中秋期间交通与营业时间可能调整，每晚检查下一日。</p>${links.map(function (link) { return `<a class="quick-link" href="${link[1]}" target="_blank" rel="noopener"><span>${link[0]}</span></a>`; }).join("")}`;
  }

  function renderAll() {
    document.body.dataset.theme = state.theme;
    document.body.dataset.density = state.compact ? "compact" : "comfortable";
    document.body.dataset.reducedMotion = String(state.reducedMotion);
    renderSummary(); renderTabs(); renderActiveDay(); renderCertificate(); renderQuickLinks();
    document.getElementById("trip-notes").value = state.notes;
    document.getElementById("theme-select").value = state.theme;
    document.getElementById("density-toggle").checked = state.compact;
    document.getElementById("motion-toggle").checked = state.reducedMotion;
  }

  function selectDay(dayId) {
    state.activeDay = dayId; saveState(); renderTabs(); renderActiveDay();
    window.scrollTo({ top: document.getElementById("day-tabs").offsetTop, behavior: state.reducedMotion ? "auto" : "smooth" });
  }

  function initControls() {
    const tweaks = document.getElementById("tweaks");
    let scrollFrame = null;
    window.addEventListener("scroll", function () {
      if (scrollFrame) return;
      scrollFrame = window.requestAnimationFrame(function () { scrollFrame = null; syncMobileNav(); });
    }, { passive: true });
    document.addEventListener("click", function (event) {
      const mapLink = event.target.closest("[data-map-app]");
      if (mapLink) openMapApp(event, mapLink);
      const tab = event.target.closest("[data-day]");
      if (tab) selectDay(tab.dataset.day);
      const jump = event.target.closest("[data-jump]");
      if (jump) jumpToSection(jump.dataset.jump);
    });
    document.addEventListener("change", function (event) {
      if (event.target.matches("[data-stamp]")) { state.stamps[event.target.dataset.stamp] = event.target.checked; saveState(); renderSummary(); renderCertificate(); }
      if (event.target.matches("[data-fallback]")) { state.fallbacks[event.target.dataset.fallback] = event.target.checked; saveState(); renderActiveDay(); }
    });
    document.addEventListener("input", function (event) { if (event.target.matches("[data-day-note]")) { state.dayNotes[event.target.dataset.dayNote] = event.target.value; saveState(); } });
    document.getElementById("tweaks-open").addEventListener("click", function () { tweaks.hidden = false; document.getElementById("tweaks-open").hidden = true; });
    document.getElementById("mobile-settings-open").addEventListener("click", function () { tweaks.hidden = false; document.getElementById("tweaks-open").hidden = true; });
    document.getElementById("tweaks-close").addEventListener("click", function () { tweaks.hidden = true; document.getElementById("tweaks-open").hidden = false; });
    document.getElementById("theme-select").addEventListener("change", function (event) { state.theme = event.target.value; document.body.dataset.theme = state.theme; saveState(); });
    document.getElementById("density-toggle").addEventListener("change", function (event) { state.compact = event.target.checked; document.body.dataset.density = state.compact ? "compact" : "comfortable"; saveState(); });
    document.getElementById("motion-toggle").addEventListener("change", function (event) { state.reducedMotion = event.target.checked; document.body.dataset.reducedMotion = String(state.reducedMotion); saveState(); });
    document.getElementById("trip-notes").addEventListener("input", function (event) { state.notes = event.target.value; saveState(); });
    document.getElementById("print-button").addEventListener("click", function () { window.print(); });
    document.getElementById("reset-button").addEventListener("click", function () { if (!window.confirm("确认清除所有盖章、备注和显示设置，恢复初始计划？")) return; localStorage.removeItem(STORAGE_KEY); state = { ...defaults }; renderAll(); tweaks.hidden = true; document.getElementById("tweaks-open").hidden = false; });
  }

  function configurePrint() {
    window.addEventListener("beforeprint", function () { printRestoreDay = state.activeDay; document.getElementById("day-view").innerHTML = days.map(function (day) { return renderDay(day, true); }).join(""); });
    window.addEventListener("afterprint", function () { state.activeDay = printRestoreDay || state.activeDay; renderActiveDay(); printRestoreDay = null; });
  }

  document.getElementById("day-view").appendChild(document.getElementById("loading-template").content.cloneNode(true));
  initControls(); configurePrint(); renderAll();
})();
