const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const url = "http://127.0.0.1:4183/";
let testServer;

function startStaticServer(port, basePath = "") {
  const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg" };
  const root = process.cwd();
  const server = http.createServer((request, response) => {
    const requestPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (basePath && requestPath !== basePath && !requestPath.startsWith(basePath + "/")) {
      response.writeHead(404).end();
      return;
    }
    const scopedPath = basePath ? requestPath.slice(basePath.length) : requestPath;
    const relativePath = scopedPath === "/" || scopedPath === "" ? "index.html" : scopedPath.replace(/^\/+/, "");
    const filePath = path.resolve(root, relativePath);
    if (!filePath.startsWith(root) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": mime[path.extname(filePath)] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(response);
  });
  return new Promise(resolve => server.listen(port, "127.0.0.1", () => resolve(server)));
}

function closeServer(server) {
  return new Promise(resolve => server.close(resolve));
}

async function waitForAppWorker(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
}

async function seedLegacyExecution(page, dayId, status = "active") {
  await page.evaluate(({ dayId, status }) => {
    const state = JSON.parse(localStorage.getItem("jeju-olle-plan-v5")) || { version: 5 };
    state.activeView = "today";
    state.activeDay = dayId;
    state.executions = state.executions || {};
    state.executions[dayId] = {
      status, activeStepId: dayId + "-step-02",
      stepStates: { [dayId + "-step-01"]: { done: true } },
      startedAt: "2026-09-24T00:00:00.000Z",
      finishedAt: status === "finished" ? "2026-09-24T10:00:00.000Z" : ""
    };
    state.notes = "保留我的旅行备注";
    state.stamps = state.stamps || {};
    state.stamps["1-start"] = true;
    localStorage.setItem("jeju-olle-plan-v5", JSON.stringify(state));
    localStorage.setItem("jeju-olle-execution-focus-reset-v1", "1");
  }, { dayId, status });
  await page.reload();
}

async function expandDetails(page, selector) {
  const details = page.locator(selector);
  if (await details.count() && !await details.evaluate(element => element.open)) {
    await details.locator("summary").first().click();
  }
}

test.beforeAll(async () => { testServer = await startStaticServer(4183); });
test.afterAll(async () => { await closeServer(testServer); });

test("weather follows the walking region, refreshes, and survives offline or failed requests", async ({ page, context }) => {
  const errors = [];
  const requests = [];
  let failWeather = false;
  const days = ["2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28"];
  const forecast = {
    daily: {
      time: days, weather_code: [2, 3, 61, 0, 80, 1],
      temperature_2m_max: [25, 27.4, 24, 26, 23, 28], temperature_2m_min: [18, 19.3, 17, 19, 16, 20],
      precipitation_probability_max: [10, 45, 80, 0, 70, 20], wind_gusts_10m_max: [30, 48.2, 44, 18, 53, 22]
    },
    current: { time: "2026-09-24T09:00", temperature_2m: 21.6, weather_code: 2, wind_speed_10m: 17.3 }
  };
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-09-24T00:00:00Z") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://api.open-meteo.com/v1/forecast?**", async route => {
    requests.push(new URL(route.request().url()));
    if (failWeather) await route.abort();
    else await route.fulfill({ contentType: "application/json", body: JSON.stringify(forecast) });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  const weather = page.locator("#weather-panel");
  await expect(weather).toContainText("城山 · 牛岛");
  await expect(weather).toContainText("当前气温");
  await expect(weather).toContainText("22°");
  await expect(weather).toContainText("晴间多云 · 当前天气为模型估计");
  await expect(weather).toContainText("45%");
  await expect(weather).toContainText("48km/h");
  await expect(weather).toContainText("当前风速 17 km/h");
  expect(requests[0].searchParams.get("latitude")).toBe("33.4719127");
  expect(requests[0].searchParams.get("timezone")).toBe("Asia/Seoul");
  await page.screenshot({ path: "test-results/weather-today-390.png" });
  for (const width of [768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: `test-results/weather-today-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const beforeAutoRefresh = requests.length;
  await page.clock.fastForward(25 * 60 * 1000);
  await expect.poll(() => requests.length).toBe(beforeAutoRefresh + 1);
  await page.locator('#view-today [data-day="0925"]').click();
  await expect(weather).toContainText("南元 · 西归浦");
  await expect(weather).toContainText("预计最高");
  await expect(weather).toContainText("80%");
  expect(requests.at(-1).searchParams.get("latitude")).toBe("33.2778081");
  const beforeRefresh = requests.length;
  await expandDetails(page, ".today-risk");
  await weather.locator("[data-refresh-weather]").click();
  await expect.poll(() => requests.length).toBe(beforeRefresh + 1);
  await waitForAppWorker(page);
  await context.setOffline(true);
  await page.reload();
  await expect(weather).toContainText("离线 · 上次更新");
  await expect(weather).toContainText("80%");
  await expandDetails(page, ".today-risk");
  await weather.locator("[data-refresh-weather]").click();
  await expect(weather).toContainText("80%");
  await context.setOffline(false);
  failWeather = true;
  await expandDetails(page, ".today-risk");
  await weather.locator("[data-refresh-weather]").click();
  await expect(weather).toContainText("更新失败 · 上次更新");
  await expect(weather).toContainText("80%");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
});

test("weather outside the 16-day horizon stays explicitly unavailable", async ({ page }) => {
  const weatherRequests = [];
  await page.clock.install({ time: new Date("2026-09-10T00:00:00Z") });
  await page.route("https://api.open-meteo.com/v1/forecast?**", route => {
    weatherRequests.push(route.request().url());
    return route.abort();
  });
  await page.goto(url);
  await page.locator('#view-today [data-day="0928"]').click();
  await expandDetails(page, ".today-risk");
  await expect(page.locator("#weather-panel")).toContainText("尚未进入 16 天预报范围");
  expect(weatherRequests.some(url => new URL(url).searchParams.get("latitude") === "33.2096928")).toBe(false);
});

test("merged today-action map buttons are white and legible on mobile and desktop", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-21T00:00:00Z") });
  await page.goto(url);
  await page.locator('#view-today [data-day="0924"]').click();
  for (const width of [390, 769, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const buttons = page.locator("#today-content .today-action-card .map-button");
    await expect(buttons).toHaveCount(2);
    for (const button of await buttons.all()) {
      await expect(button).toBeVisible();
      const appearance = await button.evaluate(element => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, color: style.color, height: element.getBoundingClientRect().height };
      });
      expect(appearance.background).toBe("rgb(255, 255, 255)");
      expect(appearance.color).toBe("rgb(7, 63, 67)");
      expect(appearance.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    if (width !== 1440) await page.screenshot({ path: `test-results/next-card-white-buttons-${width}.png` });
  }
});

test("route features and scenic check-ins stay in walking order and share progress", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  await page.getByRole("button", { name: "计划", exact: true }).click();
  await page.locator('#view-plan [data-day="0924"]').click();
  const routeDisclosure = page.locator("#plan-content .route-guide-disclosure");
  await expect(routeDisclosure).not.toHaveAttribute("open", "");
  await expect(page.locator("#plan-content .route-guide-list")).toBeHidden();
  await routeDisclosure.locator("summary").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/route-guides-collapsed-390.png" });
  await routeDisclosure.locator("summary").click();
  await expect(routeDisclosure).toHaveAttribute("open", "");
  await expect(page.locator("#plan-content .route-guide")).toHaveCount(2);
  await expect(page.locator("#plan-content .route-highlight")).toHaveCount(4);
  await expect(page.locator("#plan-content .route-guide-head a").first()).toHaveAttribute("href", "https://www.jejuolle.org/trail#/road/01");
  await expect(page.locator("#plan-content .route-highlight", { hasText: "马头岳" }).locator(".map-button").first()).toHaveAttribute("href", /map\.kakao\.com\/link\/search/);
  await expect(page.locator('#plan-content [data-toggle-checkin="route-1-malmi"] .ui-icon')).toHaveAttribute("style", /bookmark\.svg/);
  await page.locator("#plan-content .route-guide-list").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/route-guides-390.png" });
  await page.locator('#plan-content [data-toggle-checkin="route-1-malmi"]').click();
  await expect(routeDisclosure).toHaveAttribute("open", "");
  await expect(page.locator('#plan-content [data-toggle-checkin="route-1-malmi"] .ui-icon')).toHaveAttribute("style", /check\.svg/);
  await page.locator('.app-dock [data-view-target="checkins"]').click();
  await expandDetails(page, ".checkin-filters");
  await page.locator('#checkin-category-filter [data-filter-category="scenic"]').click();
  await expandDetails(page, "#checkin-list .completed-checkins");
  await expect(page.locator('#checkin-list .checkin-card.completed', { hasText: "马头岳" })).toBeVisible();
  await page.reload();
  await expandDetails(page, "#checkin-list .completed-checkins");
  await expect(page.locator('#checkin-list .checkin-card.completed', { hasText: "马头岳" })).toBeVisible();
  await page.getByRole("button", { name: "计划", exact: true }).click();
  await expect(page.locator("#plan-content .route-guide-disclosure")).not.toHaveAttribute("open", "");
  await page.locator('.app-dock [data-view-target="checkins"]').click();
  await expect(page.locator('#checkin-list .checkin-card.completed', { hasText: "马头岳" }).locator(".location-warning")).toContainText("按韩文地名搜索");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")).checkinChecks["route-1-malmi"])).toBe(true);
  await page.getByRole("button", { name: "今日", exact: true }).click();
  const teaser = page.locator("#today-content .route-teaser");
  await expect(teaser).not.toHaveAttribute("open", "");
  await expect(teaser.locator(".route-teaser-content")).toBeHidden();
  await teaser.locator("summary").click();
  await expect(page.locator("#today-content .route-teaser")).toContainText("山丘到海岸");
  await page.locator("#today-content .route-teaser").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/route-teaser-today-390.png" });
  await page.getByRole("button", { name: "计划", exact: true }).click();
  await page.locator('#view-plan [data-day="0927"]').click();
  await page.locator("#plan-content .route-guide-summary").click();
  await expect(page.locator("#plan-content .route-highlight")).toHaveCount(4);
  await expect(page.locator("#plan-content .route-highlight", { hasText: "下摹海滩" })).toHaveCount(0);
  await page.locator('#view-plan [data-day="0928"]').click();
  await page.locator("#plan-content .route-guide-summary").click();
  await expect(page.locator("#plan-content .route-highlight")).toHaveCount(3);
  await expect(page.locator("#plan-content .route-highlight", { hasText: "下摹海滩" })).toBeVisible();
  const guideData = await page.evaluate(() => window.TRIP_DATA.routeGuides);
  expect(Object.keys(guideData)).toHaveLength(9);
  for (const guide of Object.values(guideData)) {
    expect(guide.highlights.map(point => point.km)).toEqual(guide.highlights.map(point => point.km).sort((a, b) => a - b));
  }
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator("#plan-content .route-guide-list").scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    if (width !== 390) await page.screenshot({ path: `test-results/route-guides-${width}.png` });
  }
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#plan-content .route-highlight")).toHaveCount(3);
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await expect(page.locator("#plan-content .print-day .route-guide-disclosure")).toHaveCount(5);
  await expect(page.locator("#plan-content .print-day .route-guide-disclosure:not([open])")).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(page.locator("#plan-content .route-guide-disclosure")).toHaveAttribute("open", "");
  expect(errors).toEqual([]);
});

test("official stamp locations, split route 10, and two-stamp Gapado course", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  await page.getByRole("button", { name: "计划", exact: true }).click();
  const plan = page.locator("#plan-content");
  const expected = { "0924": 6, "0925": 6, "0926": 6, "0927": 5, "0928": 3 };
  for (const [dayId, count] of Object.entries(expected)) {
    await page.locator(`#view-plan [data-day="${dayId}"]`).click();
    await expect(page.locator("#plan-content .stamp-point")).toHaveCount(count);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  await page.locator('#view-plan [data-day="0924"]').click();
  await expect(plan.locator('.route-stamps', { hasText: "1-1号线" }).locator('.stamp-source a')).toHaveAttribute("href", "https://www.jejuolle.org/trail#/road/01-1");
  await page.locator('#view-plan [data-day="0927"]').click();
  await expect(plan.locator('.stamp-point', { hasText: "섯알오름 주차장 정자" })).toBeVisible();
  await page.locator("#plan-content .stamp-grid").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/mobile-stamps-390.png" });
  await plan.locator('[data-stamp="10-middle"]').check();
  await page.locator('#view-plan [data-day="0928"]').click();
  await expect(plan.locator('[data-stamp="10-middle"]')).toHaveCount(0);
  await expect(plan.locator('[data-stamp="10-end"]')).toHaveCount(1);
  await expect(plan.locator('[data-stamp="10-1-middle"]')).toHaveCount(0);
  await expect(plan.locator('.stamp-point', { hasText: "가파치안센터" })).toBeVisible();
  const imageLinks = await plan.locator('.stamp-map-link').evaluateAll(links => links.map(link => link.href));
  expect(imageLinks).toHaveLength(2);
  expect(imageLinks.every(link => link.startsWith("https://contents.ollepass.org/static/homepage/trail/img/road/"))).toBe(true);
  await plan.locator('[data-stamp="10-1-start"]').check();
  await plan.locator('[data-stamp="10-1-end"]').check();
  await page.reload();
  await expect(plan.locator('[data-stamp="10-1-start"]')).toBeChecked();
  await expect(plan.locator('[data-stamp="10-1-end"]')).toBeChecked();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")).stamps["10-middle"])).toBe(true);
  const routeData = await page.evaluate(() => window.TRIP_DATA);
  expect(Object.keys(routeData.stampLocations)).toHaveLength(9);
  expect(routeData.routes["10-1"].stamps).toEqual(["start", "end"]);
  for (const width of [768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('#view-plan [data-day="0927"]').click();
    await page.locator("#plan-content .stamp-grid").scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.screenshot({ path: `test-results/stamps-${width}.png` });
  }
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#plan-content .stamp-point")).toHaveCount(5);
  await expect(page.locator("#plan-content .stamp-map-link").first()).toBeHidden();
});

test("mobile custom check-in flow", async ({ page }) => {
  const errors = [];
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  await expect(page.locator("#today-title")).toBeVisible();
  await waitForAppWorker(page);
  await page.locator("[data-open-quick-add]").click();
  await page.locator("[data-quick-checkin]").click();
  await page.locator("#checkin-name").fill("测试海景台");
  await page.locator("#checkin-day").selectOption("0926");
  await page.locator('input[name="category"][value="scenic"] + span').click();
  await page.locator(".checkin-details summary").click();
  await page.locator("#checkin-map-input").fill("https://map.kakao.com/link/to/test,33.2501234,126.5601234");
  await page.locator("#parse-location").click();
  await expect(page.locator("#location-state")).toContainText("已解析");
  await page.locator("#checkin-form button[type=submit]").click();
  const createdCard = page.locator("#checkin-list .checkin-card", { hasText: "测试海景台" });
  await expect(createdCard).toBeVisible();
  await expect(createdCard.locator('[data-map-app="Kakao Map"]')).toHaveAttribute("data-app-url", /^kakaomap:\/\/route\?ep=33\.2501234,126\.5601234/);
  await expect(createdCard.locator('[data-map-app="Naver Map"]')).toHaveAttribute("data-app-url", /^nmap:\/\/route\/walk\?/);
  let stored = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")));
  expect(stored.version).toBe(5);
  expect(stored.customCheckins[0].lat).toBeCloseTo(33.2501234);
  await page.reload();
  const card = page.locator("#checkin-list .checkin-card", { hasText: "测试海景台" });
  await expect(card).toBeVisible();
  await card.locator("[data-edit-checkin]").click();
  await page.locator("#checkin-name").fill("测试海景台·已编辑");
  await page.locator("#checkin-form button[type=submit]").click();
  const edited = page.locator("#checkin-list .checkin-card", { hasText: "测试海景台·已编辑" });
  await edited.locator("[data-toggle-checkin]").click();
  await expandDetails(page, "#checkin-list .completed-checkins");
  await expect(page.locator("#checkin-list .checkin-card.completed", { hasText: "测试海景台·已编辑" })).toBeVisible();
  await page.locator("#checkin-list .checkin-card", { hasText: "测试海景台·已编辑" }).locator("[data-delete-checkin]").click();
  await page.getByText("撤销", { exact: true }).click();
  await expect(page.locator("#checkin-list .checkin-card", { hasText: "测试海景台·已编辑" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/mobile-390.png" });
  await page.getByRole("button", { name: "今日", exact: true }).click();
  await expect(page.locator(".trip-summary-progress")).toContainText("0/21");
  await page.screenshot({ path: "test-results/mobile-today-390.png" });
});

test("migration, corrected content, tablet layout", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 768, height: 900 } });
  const page = await context.newPage();
  await page.goto(url);
  await waitForAppWorker(page);
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("jeju-olle-plan-v3", JSON.stringify({
      version: 3, activeDay: "0928", notes: "legacy note",
      stamps: { "1-start": true }, foodChecks: { miyeong: true },
      dayNotes: { "0928": "legacy day" }, fallbacks: { "0928": true }
    }));
  });
  await page.reload();
  const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")));
  const coreKm = await page.evaluate(() => Object.values(window.TRIP_DATA.routes).filter(route => route.counts && !route.optional).reduce((sum, route) => sum + route.km, 0));
  expect(migrated.version).toBe(5);
  expect(migrated.notes).toBe("legacy note");
  expect(migrated.checkinChecks.miyeong).toBe(true);
  expect(coreKm).toBeCloseTo(102.1);
  await page.getByRole("button", { name: "更多" }).click();
  await expect(page.locator("#more-content .fact-list strong").filter({ hasText: "09:00–11:30" })).toContainText("13:00–16:30");
  await expect(page.locator("#more-content").getByText("9C7205", { exact: true })).toBeVisible();
  await expect(page.locator("#more-content").getByText("7C8133", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: "test-results/tablet-768.png" });
  await context.close();
});

test("desktop layout and offline shell", async ({ browser }) => {
  const offlinePort = 4182;
  const server = await startStaticServer(offlinePort);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${offlinePort}/`);
  await waitForAppWorker(page);
  const offlineReady = await page.evaluate(async () => ({
    controller: Boolean(navigator.serviceWorker.controller),
    hasIndex: Boolean(await caches.match("./index.html")),
    hasRoot: Boolean(await caches.match("./"))
  }));
  expect(offlineReady).toEqual({ controller: true, hasIndex: true, hasRoot: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: "test-results/desktop-1440.png" });
  await page.evaluate(() => { document.body.dataset.offlineTest = "before-reload"; });
  await closeServer(server);
  await page.reload();
  await expect(page.locator("#today-title")).toBeVisible();
  expect(await page.evaluate(() => document.body.dataset.offlineTest)).toBeUndefined();
  expect(errors).toEqual([]);
  await context.close();
});

test("backup validation, coordinate fallback, and location denial", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: [] });
  const page = await context.newPage();
  await page.goto(url);
  await page.getByRole("button", { name: "更多" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-button").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^jeju-olle-backup-.*\.json$/);

  await page.locator("#import-file").setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"version":9}') });
  await expect(page.locator("#toast")).toContainText("导入失败");

  const imported = {
    product: "jeju-olle-trip", version: 4,
    state: {
      version: 4, activeView: "checkins", activeDay: "0927", customCheckins: [{
        id: "imported", name: "导入测试点", dayId: "0927", category: "scenic",
        lat: 133, lng: 226, mapInput: "https://kko.to/example-short-link"
      }]
    }
  };
  await page.locator("#import-file").setInputFiles({ name: "valid.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(imported)) });
  await expect(page.locator("#checkin-list .checkin-card", { hasText: "导入测试点" })).toBeVisible();
  await expect(page.locator("#checkin-list .checkin-card", { hasText: "导入测试点" })).toContainText("定位待补充");
  await expect(page.locator("#checkin-list .checkin-card", { hasText: "导入测试点" }).locator('[data-map-app="Kakao Map"]')).toHaveAttribute("href", "https://kko.to/example-short-link");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")));
  expect(saved.customCheckins[0].lat).toBeNull();
  expect(saved.customCheckins[0].lng).toBeNull();

  await page.locator("[data-open-quick-add]").click();
  await page.locator("[data-quick-checkin]").click();
  await page.locator(".checkin-details summary").click();
  await page.locator("#use-location").click();
  await expect(page.locator("#location-state")).toContainText("未获得定位权限");
  await context.close();
});

test("mobile travel ledger, dual currency, edit, undo, filters and backup", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(url);
  await waitForAppWorker(page);

  await page.locator("[data-open-quick-add]").click();
  await expect(page.locator("#quick-add-dialog")).toBeVisible();
  await page.locator("[data-quick-expense]").click();
  await expect(page.locator("#expense-dialog")).toBeVisible();
  await page.waitForTimeout(260);
  await page.screenshot({ path: "test-results/ledger-form-mobile-390.png" });
  await page.locator("#expense-title").fill("机场出租车");
  await page.locator("#expense-amount").fill("0x10");
  await page.locator("#expense-form button[type=submit]").click();
  await expect(page.locator("#expense-form-error")).toContainText("韩元请输入");
  await page.locator("#expense-amount").fill("18,500");
  await page.locator("#expense-day").selectOption("0924");
  await page.locator("#expense-form button[type=submit]").click();
  await expect(page.locator("[data-expense-row]", { hasText: "机场出租车" })).toBeVisible();
  await expect(page.locator(".expense-total-grid")).toContainText("₩18,500");

  await page.locator(".expense-ledger [data-open-expense]").click();
  await page.locator("#expense-title").fill("花生曲奇");
  await page.locator("#expense-amount").fill("25.50");
  await page.locator('input[name="currency"][value="CNY"] + span').click();
  await page.locator('input[name="expenseCategory"][value="food"] + span').click();
  await page.locator("#expense-day").selectOption("0925");
  await page.locator("#expense-form button[type=submit]").click();
  await expect(page.locator(".expense-total-grid")).toContainText("¥25.5");
  await expect(page.locator(".expense-total-grid")).toContainText("₩18,500");
  await page.locator('[data-expense-filter="0924"]').click();
  await expect(page.locator("[data-expense-row]", { hasText: "机场出租车" })).toBeVisible();
  await expect(page.locator("[data-expense-row]", { hasText: "花生曲奇" })).toHaveCount(0);
  await page.locator('[data-expense-filter="all"]').click();

  await page.locator("[data-expense-row]", { hasText: "机场出租车" }).locator("[data-edit-expense]").click();
  await page.locator("#expense-amount").fill("20000");
  await page.locator("#expense-form button[type=submit]").click();
  await expect(page.locator(".expense-total-grid")).toContainText("₩20,000");
  await page.locator("[data-expense-row]", { hasText: "机场出租车" }).locator("[data-delete-expense]").click();
  await page.locator('[data-toast-action="undo-expense"]').click();
  await expect(page.locator("[data-expense-row]", { hasText: "机场出租车" })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-button").click();
  const download = await downloadPromise;
  const backup = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
  expect(backup.state.expenses).toHaveLength(2);
  expect(backup.state.expenses.find(expense => expense.title === "机场出租车").amount).toBe(20000);

  await page.reload();
  await page.getByRole("button", { name: "更多" }).click();
  await expect(page.locator("[data-expense-row]")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: "test-results/ledger-mobile-390.png" });
  await page.setViewportSize({ width: 390, height: 600 });
  await page.locator(".expense-ledger [data-open-expense]").click();
  await page.locator("#expense-note").fill("短屏幕表单滚动检查");
  await page.locator("#expense-form button[type=submit]").click();
  await expect(page.locator("#expense-form-error")).toContainText("请填写项目");
  expect(await page.evaluate(() => document.querySelector("#expense-dialog form").scrollHeight > document.querySelector("#expense-dialog form").clientHeight)).toBe(true);
  await page.screenshot({ path: "test-results/ledger-form-short-390.png" });
  await context.close();
});

test("expense import validation preserves earlier version 4 data", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 768, height: 900 } });
  const page = await context.newPage();
  await page.goto(url);
  await page.getByRole("button", { name: "更多" }).click();

  const oldBackup = { version: 4, activeView: "more", activeDay: "0928", customCheckins: [{ id: "old", name: "原有打卡点", dayId: "0928", category: "food" }] };
  await page.locator("#import-file").setInputFiles({ name: "old.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(oldBackup)) });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")).customCheckins.length)).toBe(1);
  let state = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")));
  expect(state.customCheckins).toHaveLength(1);
  expect(state.expenses).toEqual([]);

  const mixedBackup = { version: 4, activeView: "more", expenses: [
    { id: "valid", title: "晚餐", dayId: "0928", category: "food", amount: 12000, currency: "KRW", payment: "cash" },
    { id: "bad", title: "异常金额", dayId: "0928", category: "food", amount: -5, currency: "KRW" },
    { id: "bad-day", title: "异常日期", dayId: "0930", category: "food", amount: 5, currency: "KRW" }
  ] };
  await page.locator("#import-file").setInputFiles({ name: "mixed.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(mixedBackup)) });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")).expenses.length)).toBe(1);
  state = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")));
  expect(state.expenses).toHaveLength(1);
  await page.locator("#recovery-button").click();
  state = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")));
  expect(state.customCheckins).toHaveLength(1);
  expect(state.expenses).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: "test-results/ledger-tablet-768.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: "test-results/ledger-desktop-1440.png" });
  await context.close();
});

test("expense currency choices align with the amount input at phone and tablet widths", async ({ page }) => {
  await page.setViewportSize({ width: 628, height: 1272 });
  await page.goto(url);
  await page.locator("[data-open-quick-add]").click();
  await page.locator("[data-quick-expense]").click();
  await expect(page.locator("#expense-form .currency-field > span")).toBeVisible();

  await page.waitForTimeout(260);
  for (const width of [628, 390, 768]) {
    await page.setViewportSize({ width, height: width === 628 ? 1272 : width === 390 ? 844 : 900 });
    const boxes = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      return {
        amount: rect("#expense-amount"),
        picker: rect("#expense-form .currency-picker"),
        choices: [...document.querySelectorAll("#expense-form .currency-picker label span")].map(node => node.getBoundingClientRect())
      };
    });
    expect(Math.abs(boxes.amount.top - boxes.picker.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(boxes.amount.bottom - boxes.picker.bottom)).toBeLessThanOrEqual(1);
    for (const choice of boxes.choices) {
      expect(choice.height).toBeGreaterThanOrEqual(44);
      expect(Math.abs(choice.bottom - boxes.picker.bottom)).toBeLessThanOrEqual(2);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    if (width !== 768) await page.screenshot({ path: `test-results/currency-aligned-${width}.png` });
  }
  await page.locator('input[name="currency"][value="CNY"] + span').click();
  await expect(page.locator('input[name="currency"][value="CNY"]')).toBeChecked();
});

test("on-demand location reports straight-line distance and accuracy without persisting", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 33.47098, longitude: 126.88892, accuracy: 180 });
  const page = await context.newPage();
  await page.goto(url);
  await page.locator('#view-today [data-day="0924"]').click();
  await expandDetails(page, ".today-stamp");
  await expect(page.locator(".execution-location")).toContainText("点击后仅申请一次位置权限");
  await page.locator("[data-update-execution-location]").click();
  await expect(page.locator(".execution-location")).toContainText("直线约 0 m");
  await expect(page.locator(".execution-location")).toContainText("精度 ±180 m（低精度）");
  await page.getByRole("button", { name: "计划", exact: true }).click();
  await page.locator('#view-plan [data-day="0925"]').click();
  await page.locator('#view-plan [data-day="0924"]').click();
  await page.getByRole("button", { name: "今日", exact: true }).click();
  await expandDetails(page, ".today-stamp");
  await expect(page.locator(".execution-location")).toContainText("点击后仅申请一次位置权限");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")));
  expect(JSON.stringify(stored)).not.toMatch(/executionLocation|33\.47098/);
  await page.getByRole("button", { name: "更多" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-button").click();
  const backup = JSON.parse(fs.readFileSync(await (await downloadPromise).path(), "utf8"));
  expect(backup.version).toBe(5);
  expect(backup.state.executions).toEqual({});
  expect(JSON.stringify(backup)).not.toMatch(/executionLocation|33\.47098/);
  await page.reload();
  await page.getByRole("button", { name: "今日", exact: true }).click();
  await expandDetails(page, ".today-stamp");
  await expect(page.locator(".execution-location")).toContainText("点击后仅申请一次位置权限");
  await context.close();
});

test("location denial and timeout are visible, and unverified stamp has no distance", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      getCurrentPosition: (_success, failure) => failure({ code: 1 })
    } });
  });
  await page.goto(url);
  await page.locator('#view-today [data-day="0924"]').click();
  await expandDetails(page, ".today-stamp");
  await page.locator("[data-update-execution-location]").click();
  await expect(page.locator(".execution-location")).toContainText("定位权限被拒绝");
  await page.evaluate(() => {
    navigator.geolocation.getCurrentPosition = (_success, failure) => failure({ code: 3 });
  });
  await page.locator("[data-update-execution-location]").click();
  await expect(page.locator(".execution-location")).toContainText("定位超时，请重试");
  await page.locator(".execution-stamp-check").click();
  await expect(page.locator(".execution-location")).toContainText("精确坐标未核实，不计算距离");
  await expect(page.locator(".execution-stamp [data-update-execution-location]")).toHaveCount(0);
});

test("late location response is ignored after changing day and initial day uses Jeju midnight", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-23T15:30:00Z") });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      getCurrentPosition: success => { window.resolveTripLocation = success; }
    } });
  });
  await page.goto(url);
  await expect(page.locator('#view-today [data-day="0924"]')).toHaveAttribute("aria-selected", "true");
  await expandDetails(page, ".today-stamp");
  await page.locator("[data-update-execution-location]").click();
  await expect(page.locator(".execution-location")).toContainText("正在获取当前位置");
  await page.getByRole("button", { name: "计划", exact: true }).click();
  await page.locator('#view-plan [data-day="0925"]').click();
  await page.locator('#view-plan [data-day="0924"]').click();
  await page.getByRole("button", { name: "今日", exact: true }).click();
  await page.evaluate(() => window.resolveTripLocation({ coords: { latitude: 33.47098, longitude: 126.88892, accuracy: 25 } }));
  await expandDetails(page, ".today-stamp");
  await expect(page.locator(".execution-location")).toContainText("点击后仅申请一次位置权限");
  expect(JSON.stringify(await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5"))))).not.toContain("33.47098");
});

test("merged today card, plan anchors and quick check-in stay usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.install({ time: new Date("2026-09-21T00:00:00Z") });
  await page.goto(url);
  await page.locator('#view-today [data-day="0924"]').click();
  const action = page.locator(".today-action-card");
  await expect(action).toContainText("退房，步行前往济州客运站");
  await expect(action).toContainText("行程预览");
  await expect(action.locator("[data-start-execution]")).toHaveCount(0);
  await expect(page.locator(".today-risk > summary")).toContainText("9/24 08:05");
  await expect(page.locator(".today-stamp summary")).toContainText("下一枚章");
  await expect(page.locator(".trip-summary-progress")).toContainText("0.0");
  await expect(action.locator(".map-button")).toHaveCount(2);
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/ux-today-390.png" });
  await page.locator('.app-dock [data-view-target="plan"]').click();
  await expect(page.locator(".plan-section-nav [data-plan-section]")).toHaveCount(4);
  await expect(page.locator(".plan-section-nav [data-return-advisory]")).toContainText("返回今日");
  await page.locator('[data-plan-section="plan-stamps-0924"]').click();
  await expect(page.locator('#plan-stamps-0924')).toBeVisible();
  await expect.poll(() => page.locator("#plan-stamps-0924").evaluate(element => {
    const section = element.getBoundingClientRect();
    const nav = document.querySelector(".plan-section-nav").getBoundingClientRect();
    return section.top >= nav.bottom - 1 && section.top < innerHeight / 2;
  })).toBe(true);
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/ux-plan-stamps-390.png" });
  await page.locator('.app-dock [data-view-target="checkins"]').click();
  await expect(page.locator('#checkin-day-filter [data-filter-day="0924"]')).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/ux-checkins-390.png" });
  await page.locator("#view-checkins [data-open-checkin]").click();
  await expect(page.locator(".checkin-details")).not.toHaveAttribute("open", "");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/ux-quick-checkin-390.png" });
  const touchSizes = await page.locator("#checkin-dialog .category-picker label > span, #checkin-dialog .checkin-details > summary, #checkin-form button[type=submit]").evaluateAll(elements => elements.map(element => Math.round(element.getBoundingClientRect().height)));
  expect(touchSizes.every(height => height >= 44)).toBe(true);
  await page.locator("#checkin-name").fill("临时记下的地点");
  await page.locator("#checkin-form button[type=submit]").click();
  await expect(page.locator('#checkin-list .checkin-card', { hasText: "临时记下的地点" })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")));
  expect(stored.customCheckins[0].dayId).toBe("0924");
  expect(stored.customCheckins[0].mode).toBe("步行");
  expect(stored.customCheckins[0].lat).toBeNull();
});

test("search combines date and category and completed matches stay discoverable", async ({ page }) => {
  await page.goto(url);
  await page.locator('#view-today [data-day="0924"]').click();
  await page.locator('.app-dock [data-view-target="checkins"]').click();
  await expandDetails(page, ".checkin-filters");
  await page.locator('#checkin-category-filter [data-filter-category="cafe"]').click();
  await page.locator("#checkin-search-input").fill("카페살레");
  const cafe = page.locator('#checkin-list .checkin-card', { hasText: "Cafe Salle" });
  await expect(cafe).toHaveCount(1);
  await cafe.locator("[data-toggle-checkin]").click();
  await expect(cafe).toContainText("已到访");
  await expect(cafe).toBeVisible();
  await page.locator("[data-clear-checkin-search]").click();
  await expect(page.locator("#checkin-search-input")).toHaveValue("");
  await page.reload();
  await expect(page.locator('#checkin-day-filter [data-filter-day="0924"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".completed-checkins")).not.toHaveAttribute("open", "");
  await expect(page.locator('#checkin-list .checkin-card.completed', { hasText: "Cafe Salle" })).toHaveCount(1);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")));
  expect(stored.checkinChecks["cafe-salle"]).toBe(true);
  expect(stored).not.toHaveProperty("filterState");
});

test("risk details stay collapsed in preview and expand for urgent cutoff or weather", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-15T00:00:00Z") });
  await page.route("https://api.open-meteo.com/v1/forecast?**", route => route.abort());
  await page.goto(url);
  await page.locator('#view-today [data-day="0924"]').click();
  await expandDetails(page, ".today-stamp");
  await expect(page.locator(".today-risk > summary")).toContainText("9/24 08:05");
  await expect(page.locator(".today-risk")).not.toHaveAttribute("open", "");
  await page.clock.setFixedTime(new Date("2026-09-23T22:20:00Z"));
  await page.clock.fastForward(30000);
  await expect(page.locator(".today-risk")).toHaveAttribute("open", "");
  await expect(page.locator('.cutoff-row[data-cutoff-id="0924-leave-hotel"]')).toHaveClass(/warning/);
  await page.clock.setFixedTime(new Date("2026-09-24T00:00:00Z"));
  await page.clock.fastForward(30000);
  await expect(page.locator('.cutoff-row[data-cutoff-id="0924-leave-hotel"]')).toHaveClass(/overdue/);
});

test("high rain or gust expands weather detail and refresh can collapse it", async ({ page }) => {
  let highRisk = true;
  await page.clock.install({ time: new Date("2026-09-23T21:00:00Z") });
  await page.route("https://api.open-meteo.com/v1/forecast?**", route => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      daily: {
        time: ["2026-09-24"], weather_code: [2], temperature_2m_max: [25], temperature_2m_min: [18],
        precipitation_probability_max: [highRisk ? 80 : 20], wind_gusts_10m_max: [highRisk ? 50 : 20]
      },
      current: { time: "2026-09-24T09:00", temperature_2m: 22, weather_code: 2, wind_speed_10m: 10 }
    })
  }));
  await page.goto(url);
  await expandDetails(page, ".today-stamp");
  await expect(page.locator(".today-risk > summary")).toContainText("雨 80%");
  await expect(page.locator(".today-risk")).toHaveAttribute("open", "");
  highRisk = false;
  await page.locator(".today-risk [data-refresh-weather]").click();
  await expect(page.locator(".today-risk > summary")).toContainText("雨 20%");
  await expect(page.locator(".today-risk")).not.toHaveAttribute("open", "");
});

test("GitHub Pages subdirectory caches advisory logic and restores saved stamps offline", async ({ browser }) => {
  const server = await startStaticServer(4184, "/jeju-olle-100km-plan");
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const subpathUrl = "http://127.0.0.1:4184/jeju-olle-100km-plan/";
  try {
    await page.clock.install({ time: new Date("2026-09-21T00:00:00Z") });
    await page.goto(subpathUrl);
    await waitForAppWorker(page);
    const config = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const manifest = await (await fetch(document.querySelector('link[rel="manifest"]').href)).json();
      return { scope: registration.scope, start: new URL(manifest.start_url, document.querySelector('link[rel="manifest"]').href).href, caches: await caches.keys() };
    });
    expect(config.scope).toBe(subpathUrl);
    expect(config.start).toBe(subpathUrl);
    expect(config.caches).toContain(/const CACHE_NAME = "([^"]+)"/.exec(fs.readFileSync("sw.js", "utf8"))[1]);
    await page.locator('#view-today [data-day="0924"]').click();
    await expandDetails(page, ".today-stamp");
    await page.locator('.today-stamp [data-stamp="1-start"]').click();
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator(".today-action-card")).toContainText("退房，步行前往济州客运站");
    expect(await page.evaluate(() => typeof window.TripLogic.selectedStep)).toBe("function");
    await expect(page.locator(".today-stamp summary")).toContainText("中间章");
    await expect(page.locator("#network-status")).toContainText("离线可用");
  } finally {
    await context.close();
    await closeServer(server);
  }
});


test("legacy active and finished records cannot reopen retired execution mode or erase progress", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-21T00:00:00Z") });
  await page.goto(url);
  for (const status of ["active", "finished"]) {
    await seedLegacyExecution(page, "0924", status);
    await expect(page.locator(".today-action-card")).toHaveAttribute("data-current-plan", "0924-step-01");
    await expect(page.locator(".execution-current, [data-start-execution], [data-complete-step], [data-reopen-execution]")).toHaveCount(0);
    await expect(page.locator("#view-today [data-day]")).toHaveCount(6);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")));
    expect(saved.executions["0924"].status).toBe(status);
    expect(saved.executions["0924"].activeStepId).toBe("0924-step-02");
    expect(saved.executions["0924"].stepStates["0924-step-01"]).toEqual({ done: true });
    expect(saved.stamps["1-start"]).toBe(true);
    expect(saved.notes).toBe("保留我的旅行备注");
  }
});

test("time suggestion, manual plan browsing and reload never mark steps complete", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-24T00:00:00Z") });
  await page.goto(url);
  const card = page.locator(".today-action-card");
  await expect(card).toHaveAttribute("data-current-plan", "0924-step-05");
  await expect(card).toContainText("此时计划");
  const initial = await page.evaluate(() => (JSON.parse(localStorage.getItem("jeju-olle-plan-v5")) || {}).executions || {});
  await card.locator('[data-browse-step="3"]').click();
  await expect(card).toHaveAttribute("data-current-plan", "0924-step-04");
  await expect(card).toContainText("正在查看");
  await page.clock.setFixedTime(new Date("2026-09-24T05:45:00Z"));
  await page.clock.fastForward(30000);
  await expect(card).toHaveAttribute("data-current-plan", "0924-step-04");
  await card.locator("[data-reset-advisory]").click();
  await expect(card).toHaveAttribute("data-current-plan", "0924-step-09");
  await expect(page.locator(".quick-timeline")).not.toContainText("退房");
  await page.reload();
  await expect(card).toHaveAttribute("data-current-plan", "0924-step-09");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")) || {});
  expect(saved.executions || {}).toEqual(initial);
  expect(saved.stamps || {}).toEqual({});
  expect(saved).not.toHaveProperty("manualStepByDay");
});

test("arrival no longer suggests the earlier flight and labels departure's Beijing timezone", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-23T12:40:00Z") });
  await page.goto(url);
  await expect(page.locator(".today-action-card")).toHaveAttribute("data-current-plan", "0923-step-02");
  await expect(page.locator(".quick-timeline")).not.toContainText("北京大兴机场起飞");
  await expect(page.locator(".quick-timeline")).toContainText("22:20");
  await page.locator('.today-action-card [data-browse-step="0"]').click();
  await expect(page.locator(".today-action-card")).toContainText("18:55");
  await expect(page.locator(".today-action-card")).toContainText("北京时间");
});

test("home stamp entry saves instantly, follows chapter order and offers an eight-second undo", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-21T00:00:00Z") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(url);
  await page.locator('#view-today [data-day="0924"]').click();
  await expect(page.locator(".today-stamp")).not.toHaveAttribute("open", "");
  await expandDetails(page, ".today-stamp");
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.locator('.today-stamp [data-stamp="1-start"]').click();
  await expect(page.locator(".today-stamp summary")).toContainText("中间章");
  await expect(page.locator(".today-stamp summary")).toContainText("1/6");
  await expect(page.locator("#celebration-layer")).toBeHidden();
  await expect(page.locator('[data-toast-action="undo-stamp"]')).toBeVisible();
  await page.clock.fastForward(7999);
  await expect(page.locator('[data-toast-action="undo-stamp"]')).toBeVisible();
  await page.locator('[data-toast-action="undo-stamp"]').click();
  await expect(page.locator(".today-stamp summary")).toContainText("起点章");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")).stamps["1-start"])).toBe(false);
  await page.locator('.today-stamp [data-stamp="1-start"]').click();
  await page.clock.fastForward(8001);
  await expect(page.locator("#toast")).toBeHidden();
  await page.reload();
  await expect(page.locator(".today-stamp summary")).toContainText("中间章");
  await expandDetails(page, ".today-stamp");
  await expect(page.locator(".execution-location")).toContainText("精确坐标未核实");
});

test("a full route creates a memory, undo removes its kilometer credit, and 100 km has distinct feedback", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-21T00:00:00Z") });
  await page.goto(url);
  await page.locator('#view-today [data-day="0924"]').click();
  await expandDetails(page, ".today-stamp");
  for (const stamp of ["start", "middle", "end"]) await page.locator('.today-stamp [data-stamp="1-' + stamp + '"]').click();
  await expect(page.locator("#celebration-layer .celebration-milestone")).toBeVisible();
  await expect(page.locator(".trip-summary-progress")).toContainText("15.1");
  await page.locator('#celebration-layer [data-toast-action="undo-stamp"]').click();
  await expect(page.locator(".trip-summary-progress")).toContainText("0.0");
  await expect(page.locator("#celebration-layer")).toBeHidden();
  await page.locator('.today-stamp [data-stamp="1-end"]').click();
  await page.getByRole("button", { name: "更多", exact: true }).click();
  await expect(page.locator('[data-memory-route="1"]')).toContainText("15.1");
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("jeju-olle-plan-v5"));
    for (const route of Object.values(window.TRIP_DATA.routes).filter(route => route.counts && !route.optional)) {
      for (const stage of route.stamps || ["start", "middle", "end"]) state.stamps[route.id + "-" + stage] = true;
    }
    state.stamps["10-end"] = false;
    state.activeDay = "0928";
    state.activeView = "today";
    localStorage.setItem("jeju-olle-plan-v5", JSON.stringify(state));
  });
  await page.reload();
  await expandDetails(page, ".today-stamp");
  await page.locator('.today-stamp [data-stamp="10-end"]').click();
  await expect(page.locator("#celebration-layer .celebration-goal")).toBeVisible();
  await expect(page.locator("#celebration-layer")).toContainText("100");
  await expect(page.locator(".trip-summary-progress")).toContainText("102.1");
});

test("milestone undo owns its eight-second window and cannot undo a newer stamp", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-21T00:00:00Z") });
  await page.goto(url);
  await page.locator('#view-today [data-day="0924"]').click();
  await expandDetails(page, ".today-stamp");
  await page.locator('.today-stamp [data-stamp="1-start"]').click();
  await page.clock.fastForward(1000);
  await page.locator('.today-stamp [data-stamp="1-middle"]').click();
  await page.clock.fastForward(1000);
  await page.locator('.today-stamp [data-stamp="1-end"]').click();
  await page.clock.fastForward(7200);
  await page.locator('#celebration-layer [data-toast-action="undo-stamp"]').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")).stamps["1-end"])).toBe(false);
  await page.locator('.today-stamp [data-stamp="1-end"]').click();
  await page.locator('.today-stamp [data-stamp="1-1-start"]').click();
  await expect(page.locator("#celebration-layer")).toBeHidden();
  await page.locator('#toast [data-toast-action="undo-stamp"]').click();
  const stamps = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")).stamps);
  expect(stamps["1-end"]).toBe(true);
  expect(stamps["1-1-start"]).toBe(false);
});

test("clock refresh preserves nested cutoff disclosure and its focus", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-23T21:00:00Z") });
  await page.route("https://api.open-meteo.com/v1/forecast?**", route => route.abort());
  await page.goto(url);
  await expandDetails(page, ".today-risk");
  await expandDetails(page, ".other-cutoffs");
  await page.locator(".other-cutoffs > summary").focus();
  await page.clock.fastForward(30000);
  await expect(page.locator(".other-cutoffs")).toHaveAttribute("open", "");
  await expect(page.locator(".other-cutoffs > summary")).toBeFocused();
  await expect(page.locator(".today-action-card")).toHaveAttribute("data-current-plan", "0924-step-02");
});

test("an overdue item does not hide the next deadline and explicit confirmation survives backup", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-24T02:00:00Z") });
  await page.route("https://api.open-meteo.com/v1/forecast?**", route => route.abort());
  await page.goto(url);
  await expect(page.locator(".today-risk > summary")).toContainText("12:35");
  await expect(page.locator('.risk-overdue [data-cutoff-id="0924-leave-hotel"]')).toBeVisible();
  await page.locator('[data-cutoff-check="0924-leave-hotel"]').check();
  await expect(page.locator('.risk-overdue [data-cutoff-id="0924-leave-hotel"]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".today-risk > summary")).toContainText("12:35");
  await page.getByRole("button", { name: "更多", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.locator("#export-button").click();
  const backup = JSON.parse(fs.readFileSync(await (await pending).path(), "utf8"));
  expect(backup.state.cutoffChecks["0924-leave-hotel"]).toBe(true);
  expect(backup.state.executions).toEqual({});
});

test("visit feedback stays readable in place, can be undone, and becomes a collected memory", async ({ page }) => {
  await page.goto(url);
  await page.locator('#view-today [data-day="0924"]').click();
  await page.locator('.app-dock [data-view-target="checkins"]').click();
  await expandDetails(page, ".checkin-filters");
  await page.locator('#checkin-category-filter [data-filter-category="scenic"]').click();
  const point = page.locator('#checkin-list [data-checkin-card="route-1-malmi"]');
  await point.locator("[data-toggle-checkin]").click();
  await expect(point).toBeVisible();
  await expect(point).toContainText("已到访");
  await expect(point).toHaveClass(/completed/);
  const appearance = await point.evaluate(element => ({
    opacity: getComputedStyle(element).opacity,
    decoration: getComputedStyle(element.querySelector("h2")).textDecorationLine
  }));
  expect(appearance.opacity).toBe("1");
  expect(appearance.decoration).not.toContain("line-through");
  await page.locator('[data-toast-action="undo-visit"]').click();
  await expect(point).not.toHaveClass(/completed/);
  await point.locator("[data-toggle-checkin]").click();
  await page.reload();
  await expect(page.locator(".completed-checkins")).not.toHaveAttribute("open", "");
  await expandDetails(page, ".completed-checkins");
  await expect(point).toBeVisible();
  await expect(page.locator(".completed-checkins summary")).toContainText("收藏");
});

test("version 4 migration and version 5 import keep records while old execution never takes focus", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-21T00:00:00Z") });
  await page.goto(url);
  await page.evaluate(() => {
    localStorage.setItem("jeju-olle-plan-v5", "{damaged-json");
    localStorage.setItem("jeju-olle-plan-v4", JSON.stringify({
      version: 4, activeView: "today", activeDay: "0927", compact: true,
      stamps: { "8-start": true }, checkinChecks: { miyeong: true },
      customCheckins: [{ id: "old-food", name: "老打卡点", dayId: "0927", category: "food" }],
      expenses: [{ id: "old-cost", title: "公交车", dayId: "0927", amount: 1500, currency: "KRW" }],
      notes: "旧版备注", dayNotes: { "0927": "旧版日记" },
      confirmations: { "amantov-luggage": true }, fallbacks: { "0927": true }
    }));
  });
  await page.reload();
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")));
  expect(saved.version).toBe(5);
  expect(saved.stamps["8-start"]).toBe(true);
  expect(saved.checkinChecks.miyeong).toBe(true);
  expect(saved.customCheckins).toHaveLength(1);
  expect(saved.expenses).toHaveLength(1);
  expect(saved.notes).toBe("旧版备注");
  expect(saved.dayNotes["0927"]).toBe("旧版日记");
  expect(saved.confirmations["amantov-luggage"]).toBe(true);
  expect(saved.fallbacks["0927"]).toBe(true);
  await page.getByRole("button", { name: "更多", exact: true }).click();
  const backup = { product: "jeju-olle-trip", version: 5, state: {
    version: 5, activeView: "today", activeDay: "0928", notes: "导入的进度",
    stamps: { "10-start": true, "10-middle": true }, cutoffChecks: { "0928-route-10": true },
    executions: { "0928": { status: "active", activeStepId: "0928-step-03",
      stepStates: { "0928-step-01": { done: true }, "bogus-step": { done: true }, "0928-step-02": { done: "yes" } },
      startedAt: "2026-09-28T00:00:00.000Z" } }
  } };
  await page.locator("#import-file").setInputFiles({ name: "v5.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.locator(".today-action-card")).toHaveAttribute("data-current-plan", "0928-step-01");
  await expect(page.locator(".execution-current")).toHaveCount(0);
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")));
  expect(saved.executions["0928"].stepStates).toEqual({ "0928-step-01": { done: true } });
  expect(saved.executions["0928"].activeStepId).toBe("0928-step-03");
  expect(saved.cutoffChecks["0928-route-10"]).toBe(true);
  await page.getByRole("button", { name: "更多", exact: true }).click();
  await page.locator("#recovery-button").click();
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")));
  expect(saved.notes).toBe("旧版备注");
  expect(saved.expenses).toHaveLength(1);
});

test("route food snapshots preserve visits and support precise route search and offline reload", async ({ page, context }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-09-22T00:00:00Z") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(url);
  await waitForAppWorker(page);
  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("jeju-olle-plan-v5")) || { version: 5 };
    state.activeDay = "0924";
    state.activeView = "checkins";
    state.checkinChecks = state.checkinChecks || {};
    state.checkinChecks["cafe-salle"] = true;
    state.checkinChecks.angeori = true;
    state.notes = "我的美食记录";
    state.customCheckins = [{ id: "my-food", name: "我的私藏小店", dayId: "0924", category: "food" }];
    localStorage.setItem("jeju-olle-plan-v5", JSON.stringify(state));
  });
  await page.reload();
  const bakery = page.locator('#checkin-list [data-checkin-card="boryong"]');
  await expect(bakery).toContainText("4.8");
  await expect(bakery).toContainText("743人评分");
  await expect(bakery).toContainText("2026-09-22 查询 · 非实时评分");
  await expect(bakery.locator(".food-rating-link")).toHaveAttribute("href", "https://place.map.kakao.com/10375136");
  await expect(bakery.locator(".food-reference")).not.toHaveAttribute("open", "");
  await bakery.locator(".food-reference > summary").click();
  await expect(bakery.locator(".food-reference")).toContainText("10:00–22:00");
  await expect(bakery.locator(".food-reference > a")).toHaveAttribute("href", /^https:\/\/search\.daum\.net\/search\?w=tot&q=/);
  await expect(page.locator('#checkin-list [data-checkin-card="my-food"]')).toBeVisible();
  await expect(page.locator('#checkin-list [data-checkin-card="cafe-salle"]')).toHaveClass(/completed/);
  await expandDetails(page, ".checkin-filters");
  await page.locator('[data-filter-day="all"]').click();
  await page.locator("#checkin-search-input").fill("1号线");
  await expect(page.locator('#checkin-list [data-checkin-card="boryong"]')).toBeVisible();
  await expect(page.locator('#checkin-list [data-checkin-card="peanut-caramel"]')).toHaveCount(0);
  await expect(page.locator('#checkin-list [data-checkin-card="nammae-newtown"]')).toHaveCount(0);
  await page.locator("#checkin-search-input").fill("7-1号线");
  await expect(page.locator('#checkin-list [data-checkin-card="nammae-newtown"]')).toContainText("时间冲突");
  await expect(page.locator('#checkin-list [data-checkin-card="yeongeun"]')).toHaveCount(0);
  await page.locator("#checkin-search-input").fill("8号线");
  const noodles = page.locator('#checkin-list [data-checkin-card="suduri"]');
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await expect(noodles).toContainText("800人评分");
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(await noodles.locator(".food-rating-link").evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await noodles.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/food-ratings-" + width + ".png" });
  }
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#network-status")).toContainText("离线可用");
  await expect(page.locator('#checkin-list [data-checkin-card="boryong"]')).toContainText("743人评分");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")));
  expect(saved.checkinChecks["cafe-salle"]).toBe(true);
  expect(saved.checkinChecks.angeori).toBe(true);
  expect(saved.customCheckins[0].id).toBe("my-food");
  expect(saved.notes).toBe("我的美食记录");
  expect(errors).toEqual([]);
});

test("ordinary home works across viewports with inherited icon colors, touch targets and print", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-09-21T00:00:00Z") });
  await page.goto(url);
  await page.locator('#view-today [data-day="0924"]').click();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await expect(page.locator(".today-action-card")).toBeVisible();
    await expect(page.locator(".today-stamp summary")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    const controls = await page.locator(".today-action-card button, .today-action-card .map-button, .today-stamp > summary, .today-risk > summary, .app-dock button").evaluateAll(elements =>
      elements.filter(element => element.getBoundingClientRect().height > 0).map(element => element.getBoundingClientRect().height));
    expect(controls.every(height => height >= 44)).toBe(true);
    const icons = await page.locator(".today-action-card .map-button .ui-icon").evaluateAll(elements => elements.map(element => ({
      color: getComputedStyle(element).backgroundColor,
      text: getComputedStyle(element.parentElement).color,
      mask: getComputedStyle(element).maskImage
    })));
    expect(icons).toHaveLength(2);
    for (const icon of icons) {
      expect(icon.color).toBe(icon.text);
      expect(icon.mask).not.toBe("none");
    }
    await page.screenshot({ path: "test-results/journey-home-" + width + ".png" });
  }
  await page.getByRole("button", { name: "计划", exact: true }).click();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#view-plan")).toBeVisible();
  await expect(page.locator("#plan-content .route-stamps")).toHaveCount(2);
  expect(errors).toEqual([]);
});
