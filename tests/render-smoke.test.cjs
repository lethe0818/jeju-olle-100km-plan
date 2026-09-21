"use strict";

// These are template integration checks, not DOM, layout, event or browser tests.
// Only string-output targets are provided; startup, network and browser APIs do not run.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const dataSource = fs.readFileSync(path.join(root, "data.js"), "utf8");
const logicSource = fs.readFileSync(path.join(root, "trip-logic.js"), "utf8");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const bootstrap = appSource.lastIndexOf("\n  populateCheckinDayOptions();");
assert.ok(bootstrap > 0, "app bootstrap marker must exist; do not accidentally run browser startup");
const renderSource = appSource.slice(0, bootstrap) + `
  window.__renderTest = {
    renderToday, renderHero, renderPlan, renderCheckins, renderMore, normalizeState,
    renderTodayAction, renderPlanDay,
    state: function () { return JSON.parse(JSON.stringify(state)); },
    setState: function (raw) { state = normalizeState(raw); filterState.day = state.activeDay; },
    setManualStep: function (dayId, stepId) { manualStepByDay[dayId] = stepId; }
  };
})();`;

function harness(rawState = {}, time = "2026-09-21T00:00:00Z") {
  const now = Date.parse(time);
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const nodes = Object.fromEntries([
    "today-content", "today-overview", "plan-content", "checkin-list", "more-content",
    "checkin-filter-summary", "checkin-day-filter", "checkin-category-filter", "checkin-search-input"
  ].map(id => [id, { innerHTML: "", textContent: "", value: "", hidden: false }]));
  const clearSearch = { hidden: true };
  const storage = new Map([["jeju-olle-plan-v5", JSON.stringify({ version: 5, ...rawState })]]);
  let writes = 0;
  const context = {
    Date: FixedDate, Intl, URL, URLSearchParams, console,
    document: {
      getElementById(id) {
        assert.ok(Object.hasOwn(nodes, id), "unexpected rendering target: " + id);
        return nodes[id];
      },
      querySelector(selector) {
        if (selector === "#today-content .other-cutoffs") return null; // No parsed DOM in this harness.
        assert.equal(selector, "[data-clear-checkin-search]", "unexpected DOM dependency in template smoke check");
        return clearSearch;
      }
    },
    localStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { writes++; storage.set(key, String(value)); },
      removeItem(key) { writes++; storage.delete(key); }
    },
    navigator: { userAgent: "render-smoke", maxTouchPoints: 0, onLine: true },
    matchMedia() { return { matches: false }; }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(dataSource, context, { filename: "data.js" });
  vm.runInContext(logicSource, context, { filename: "trip-logic.js" });
  vm.runInContext(renderSource, context, { filename: "app.js" });
  return {
    api: context.__renderTest, data: context.TRIP_DATA, nodes,
    writes: () => writes,
    render() {
      const before = JSON.stringify(context.__renderTest.state());
      for (const name of ["renderHero", "renderToday", "renderPlan", "renderCheckins", "renderMore"]) context.__renderTest[name]();
      assert.equal(JSON.stringify(context.__renderTest.state()), before, "rendering must not modify user state");
      assert.equal(writes, 0, "rendering must not write local storage");
      const output = Object.values(nodes).map(node => node.innerHTML).join("\n");
      assert.doesNotMatch(output, /\b(?:undefined|NaN)\b/);
      return output;
    }
  };
}

const dayIds = ["0923", "0924", "0925", "0926", "0927", "0928"];
for (const dayId of dayIds) {
  for (const status of ["active", "finished"]) {
    test(`real templates render ${dayId} with legacy ${status} state without reactivating it`, () => {
      const legacy = {
        status, activeStepId: dayId + "-step-02", stepStates: { [dayId + "-step-01"]: { done: true } },
        startedAt: "2026-09-23T00:00:00.000Z", finishedAt: status === "finished" ? "2026-09-28T10:00:00.000Z" : ""
      };
      const app = harness({
        activeDay: dayId, executions: { [dayId]: legacy }, notes: "保留旅行备忘",
        dayNotes: { [dayId]: "保留当天笔记" },
        stamps: { "1-start": true, "1-middle": true, "1-end": true, "8-start": true, "10-start": true, "10-middle": true },
        checkinChecks: { "cafe-salle": true }, cutoffChecks: { "0924-leave-hotel": true },
        expenses: [{ id: "bus", title: "公交", dayId, amount: 1500, currency: "KRW" }],
        confirmations: { "amantov-luggage": true }, fallbacks: { "0927": true }
      });
      const output = app.render();
      assert.match(app.nodes["today-content"].innerHTML, new RegExp('data-current-plan="' + dayId + '-step-01"'));
      assert.match(app.nodes["today-content"].innerHTML, /行程预览/);
      assert.doesNotMatch(output, /class="execution-current|data-start-execution|data-reopen-execution|data-complete-step/);
      assert.match(app.nodes["today-overview"].innerHTML, /15\.1/);
      assert.match(app.nodes["more-content"].innerHTML, /data-memory-route="1"/);
      assert.equal(JSON.stringify(app.api.state().executions[dayId]), JSON.stringify(legacy));
      assert.equal(app.api.state().expenses[0].amount, 1500);
      const iconPaths = [...output.matchAll(/--icon-url:url\((assets\/icons\/[a-z0-9-]+\.svg)\)/g)].map(match => match[1]);
      assert.ok(iconPaths.length > 10, "templates should use inherited-color local icon masks");
      for (const iconPath of new Set(iconPaths)) assert.ok(fs.existsSync(path.join(root, iconPath)), "missing local icon " + iconPath);
    });
  }
}

test("real arrival card and upcoming list do not repeat the earlier Beijing departure", () => {
  const app = harness({ activeDay: "0923" }, "2026-09-23T12:40:00Z");
  app.render();
  const today = app.nodes["today-content"].innerHTML;
  assert.match(today, /data-current-plan="0923-step-02"/);
  assert.match(today, /抵达济州国际机场/);
  assert.doesNotMatch(today, /北京大兴机场起飞/);
  assert.ok(today.indexOf("22:20") < today.indexOf("22:45"));
  app.api.setManualStep("0923", "0923-step-01");
  const before = JSON.stringify(app.api.state());
  const departure = app.api.renderTodayAction(app.data.days[0]);
  assert.match(departure, /正在查看/);
  assert.match(departure, /北京时间/);
  assert.match(departure, /18:55/);
  assert.equal(JSON.stringify(app.api.state()), before);
});

test("real home templates show next stamp and the later deadline while retaining overdue items", () => {
  const app = harness({ activeDay: "0924", stamps: { "1-start": true } }, "2026-09-24T02:00:00Z");
  app.render();
  const today = app.nodes["today-content"].innerHTML;
  assert.match(today, /data-current-plan="0924-step-05"/);
  assert.match(today, /下一枚章 · 1号线/);
  assert.match(today, /中间章 · 목화휴게소/);
  assert.match(today, /data-risk-deadline>12:35/);
  assert.match(today, /class="cutoff-row overdue" data-cutoff-id="0924-leave-hotel"/);
  assert.match(today, /精确坐标未核实，不计算距离/);
  assert.match(today, /Kakao 搜索/);
  assert.match(app.nodes["today-overview"].innerHTML, /0\.0/);
});

test("user names, addresses and notes stay escaped in real plan, check-in and ledger templates", () => {
  const attack = '<script>alert("旅行")</script><img src=x onerror="alert(1)">';
  const app = harness({
    activeDay: "0924", notes: attack, dayNotes: { "0924": "</textarea>" + attack },
    customCheckins: [{ id: "user-point", dayId: "0924", category: "scenic", name: attack, korean: attack, address: attack, note: attack }],
    expenses: [{ id: "user-cost", dayId: "0924", title: attack, note: attack, currency: "CNY", amount: 25.5 }]
  });
  const output = app.render();
  assert.doesNotMatch(output, /<script>|<img src=x/);
  assert.match(output, /&lt;script&gt;alert\(&quot;旅行&quot;\)&lt;\/script&gt;/);
  assert.match(app.nodes["plan-content"].innerHTML, /&lt;\/textarea&gt;/);
  assert.match(app.nodes["checkin-list"].innerHTML, /data-checkin-card="user-point"/);
  assert.match(app.nodes["more-content"].innerHTML, /¥25\.5/);
  assert.equal(app.api.state().customCheckins[0].name, attack);
});

test("actual data normalization and rendering retain valid records and discard invalid coordinates and step IDs", () => {
  const app = harness({ activeDay: "0928" });
  const raw = {
    version: 5, activeDay: "0928", activeView: "today", notes: "导入记录",
    customCheckins: [{ id: "import", name: "位置待确认", dayId: "0928", category: "scenic", lat: 100, lng: 200 }],
    cutoffChecks: { "0928-certificate": true },
    executions: { "0928": { status: "finished", activeStepId: "removed-step", stepStates: { "0928-step-01": { done: true }, "removed-step": { done: true } } } }
  };
  const before = JSON.stringify(raw);
  const normalized = app.api.normalizeState(raw);
  assert.equal(JSON.stringify(raw), before);
  assert.equal(normalized.customCheckins[0].lat, null);
  assert.equal(normalized.customCheckins[0].lng, null);
  assert.equal(normalized.executions["0928"].activeStepId, "");
  assert.deepEqual(Object.keys(normalized.executions["0928"].stepStates), ["0928-step-01"]);
  app.api.setState(normalized);
  app.render();
  assert.match(app.nodes["checkin-list"].innerHTML, /定位待补充/);
  assert.match(app.nodes["today-content"].innerHTML, /data-current-plan="0928-step-01"/);
  assert.equal(app.api.state().executions["0928"].status, "finished");
});

test("full core stamp collection renders 102.1 km and explicit onsite certificate instructions", () => {
  const app = harness({ activeDay: "0928" });
  const stamps = {};
  for (const route of Object.values(app.data.routes).filter(route => route.counts && !route.optional)) {
    for (const stage of route.stamps || ["start", "middle", "end"]) stamps[route.id + "-" + stage] = true;
  }
  app.api.setState({ activeDay: "0928", stamps });
  app.render();
  assert.match(app.nodes["today-overview"].innerHTML, /102\.1/);
  assert.match(app.nodes["today-overview"].innerHTML, /21\/21/);
  assert.match(app.nodes["today-content"].innerHTML, /下一枚章 · 10-1号线/);
  assert.match(app.nodes["more-content"].innerHTML, /class="memory-card goal"/);
  assert.match(app.nodes["more-content"].innerHTML, /正式证书需携纸质护照现场验章/);
  const print = app.api.renderPlanDay(app.data.days.find(day => day.id === "0928"), true);
  assert.match(print, /route-guide-disclosure[^>]*open/);
  assert.match(print, /data-stamp="10-end"/);
  assert.doesNotMatch(print, /data-stamp="10-1-middle"/);
});
