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
  await weather.locator("[data-refresh-weather]").click();
  await expect.poll(() => requests.length).toBe(beforeRefresh + 1);
  await waitForAppWorker(page);
  await context.setOffline(true);
  await page.reload();
  await expect(weather).toContainText("离线 · 上次更新");
  await expect(weather).toContainText("80%");
  await weather.locator("[data-refresh-weather]").click();
  await expect(weather).toContainText("80%");
  await context.setOffline(false);
  failWeather = true;
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
  await expect(page.locator("#weather-panel")).toContainText("尚未进入 16 天预报范围");
  expect(weatherRequests.some(url => new URL(url).searchParams.get("latitude") === "33.2096928")).toBe(false);
});

test("next-action map buttons are white and legible on mobile and desktop", async ({ page }) => {
  await page.goto(url);
  await page.locator('#view-today [data-day="0924"]').click();
  for (const width of [390, 769, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const buttons = page.locator("#today-content .next-card .map-button");
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
  await page.getByRole("button", { name: "计划" }).click();
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
  await expect(page.locator('#plan-content [data-toggle-checkin="route-1-malmi"] img')).toHaveAttribute("src", /bookmark\.svg$/);
  await page.locator("#plan-content .route-guide-list").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/route-guides-390.png" });
  await page.locator('#plan-content [data-toggle-checkin="route-1-malmi"]').click();
  await expect(routeDisclosure).toHaveAttribute("open", "");
  await expect(page.locator('#plan-content [data-toggle-checkin="route-1-malmi"] img')).toHaveAttribute("src", /check\.svg$/);
  await page.getByRole("button", { name: "打卡", exact: true }).click();
  await page.locator('#checkin-category-filter [data-filter-category="scenic"]').click();
  await expect(page.locator('#checkin-list .checkin-card.completed', { hasText: "马头岳" })).toBeVisible();
  await page.reload();
  await expect(page.locator('#checkin-list .checkin-card.completed', { hasText: "马头岳" })).toBeVisible();
  await page.getByRole("button", { name: "计划" }).click();
  await expect(page.locator("#plan-content .route-guide-disclosure")).not.toHaveAttribute("open", "");
  await page.getByRole("button", { name: "打卡", exact: true }).click();
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
  await page.getByRole("button", { name: "计划" }).click();
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
  await page.getByRole("button", { name: "计划" }).click();
  const expected = { "0924": 6, "0925": 6, "0926": 6, "0927": 5, "0928": 3 };
  for (const [dayId, count] of Object.entries(expected)) {
    await page.locator(`#view-plan [data-day="${dayId}"]`).click();
    await expect(page.locator("#plan-content .stamp-point")).toHaveCount(count);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  await page.locator('#view-plan [data-day="0924"]').click();
  await expect(page.locator('.route-stamps', { hasText: "1-1号线" }).locator('.stamp-source a')).toHaveAttribute("href", "https://www.jejuolle.org/trail#/road/01-1");
  await page.locator('#view-plan [data-day="0927"]').click();
  await expect(page.locator('.stamp-point', { hasText: "섯알오름 주차장 정자" })).toBeVisible();
  await page.locator("#plan-content .stamp-grid").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/mobile-stamps-390.png" });
  await page.locator('[data-stamp="10-middle"]').check();
  await page.locator('#view-plan [data-day="0928"]').click();
  await expect(page.locator('[data-stamp="10-middle"]')).toHaveCount(0);
  await expect(page.locator('[data-stamp="10-end"]')).toHaveCount(1);
  await expect(page.locator('[data-stamp="10-1-middle"]')).toHaveCount(0);
  await expect(page.locator('.stamp-point', { hasText: "가파치안센터" })).toBeVisible();
  const imageLinks = await page.locator('.stamp-map-link').evaluateAll(links => links.map(link => link.href));
  expect(imageLinks).toHaveLength(2);
  expect(imageLinks.every(link => link.startsWith("https://contents.ollepass.org/static/homepage/trail/img/road/"))).toBe(true);
  await page.locator('[data-stamp="10-1-start"]').check();
  await page.locator('[data-stamp="10-1-end"]').check();
  await page.reload();
  await expect(page.locator('[data-stamp="10-1-start"]')).toBeChecked();
  await expect(page.locator('[data-stamp="10-1-end"]')).toBeChecked();
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
  await expect(page.locator("#checkin-list .checkin-card.completed", { hasText: "测试海景台·已编辑" })).toBeVisible();
  await page.locator("#checkin-list .checkin-card", { hasText: "测试海景台·已编辑" }).locator("[data-delete-checkin]").click();
  await page.getByText("撤销", { exact: true }).click();
  await expect(page.locator("#checkin-list .checkin-card", { hasText: "测试海景台·已编辑" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/mobile-390.png" });
  await page.getByRole("button", { name: "今日", exact: true }).click();
  await expect(page.getByText("0/21", { exact: true })).toBeVisible();
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
  let state = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")));
  expect(state.customCheckins).toHaveLength(1);
  expect(state.expenses).toEqual([]);

  const mixedBackup = { version: 4, activeView: "more", expenses: [
    { id: "valid", title: "晚餐", dayId: "0928", category: "food", amount: 12000, currency: "KRW", payment: "cash" },
    { id: "bad", title: "异常金额", dayId: "0928", category: "food", amount: -5, currency: "KRW" },
    { id: "bad-day", title: "异常日期", dayId: "0930", category: "food", amount: 5, currency: "KRW" }
  ] };
  await page.locator("#import-file").setInputFiles({ name: "mixed.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(mixedBackup)) });
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

test("walk mode advances manually, resumes, goes back, finishes and reopens", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-09-24T00:00:00Z") });
  await page.route("https://api.open-meteo.com/v1/forecast?**", route => route.abort());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url);
  await expect(page.locator("[data-start-execution='0924']")).toBeVisible();
  await page.locator("[data-start-execution='0924']").click();
  await expect(page.locator("#today-overview")).toBeHidden();
  await expect(page.locator("#today-day-tabs")).toBeHidden();
  await expect(page.locator(".execution-current")).toContainText("退房，步行前往济州客运站");
  await expect(page.locator(".execution-stamp")).toContainText("1号线 · 起点章");
  await expect(page.locator(".execution-timeline")).not.toHaveAttribute("open", "");
  await page.screenshot({ path: "test-results/execution-mobile-390.png" });
  await page.locator("[data-complete-step]").click();
  await expect(page.locator(".execution-current")).toContainText("201路 → 古城换乘站");
  await page.reload();
  await expect(page.locator(".execution-current")).toContainText("201路 → 古城换乘站");
  await page.locator("[data-previous-step]").click();
  await expect(page.locator(".execution-current")).toContainText("退房，步行前往济州客运站");
  let stored = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")));
  expect(stored.executions["0924"].stepStates["0924-step-01"]).toBeUndefined();
  await page.locator(".execution-timeline summary").click();
  await expect(page.locator(".execution-timeline")).toHaveAttribute("open", "");
  await page.clock.fastForward(30000);
  await expect(page.locator(".execution-timeline")).toHaveAttribute("open", "");
  page.once("dialog", dialog => {
    expect(dialog.message()).toContain("11 个步骤未完成、6 枚章未盖");
    dialog.accept();
  });
  await page.locator(".execution-datebar [data-finish-execution]").click();
  await expect(page.locator("[data-reopen-execution='0924']")).toBeVisible();
  stored = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")));
  expect(stored.executions["0924"].status).toBe("finished");
  await page.locator("[data-reopen-execution='0924']").click();
  await expect(page.locator(".execution-current")).toContainText("退房，步行前往济州客运站");
  expect(errors).toEqual([]);
});

test("stamp-linked route steps require all stamps and next stamp follows day order", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-24T00:00:00Z") });
  await page.goto(url);
  await page.locator("[data-start-execution='0924']").click();
  for (let index = 0; index < 4; index++) await page.locator("[data-complete-step]").click();
  await expect(page.locator(".execution-current")).toContainText("1号线 · 始兴里");
  await page.locator("[data-complete-step]").click();
  await expect(page.locator("#toast")).toContainText("还缺 3 枚关联章");
  await page.locator(".execution-stamp-check").click();
  await expect(page.locator(".execution-stamp")).toContainText("목화휴게소");
  await expect(page.locator(".execution-stamp")).toContainText("精确坐标未核实");
  await expect(page.locator(".execution-stamp [data-update-execution-location]")).toHaveCount(0);
  await page.getByRole("button", { name: "计划" }).click();
  await page.locator("#plan-content [data-stamp='1-middle']").check();
  await page.locator("#plan-content [data-stamp='1-end']").check();
  await page.getByRole("button", { name: "今日", exact: true }).click();
  await expect(page.locator(".execution-current")).toContainText("抵达广峙其海边");
  await expect(page.locator(".execution-stamp")).toContainText("1-1号线 · 起点章");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")));
  expect(stored.executions["0924"].stepStates["0924-step-05"]).toEqual({ done: true });
  await page.locator("[data-previous-step]").click();
  await expect(page.locator("#toast")).toContainText("关联章已盖齐");
  await page.getByRole("button", { name: "计划" }).click();
  await page.locator("#plan-content [data-stamp='1-end']").uncheck();
  await page.getByRole("button", { name: "今日", exact: true }).click();
  await page.locator("[data-previous-step]").click();
  await expect(page.locator(".execution-current")).toContainText("1号线 · 始兴里");
});

test("Jeju clock suggests without advancing and cutoff changes tone at 60 minutes", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-24T00:00:00Z") });
  await page.goto(url);
  await page.locator("[data-start-execution='0924']").click();
  await expect(page.locator(".execution-current")).toContainText("退房，步行前往济州客运站");
  await expect(page.locator(".execution-suggestion")).toContainText("1号线 · 始兴里");
  await expect(page.locator(".execution-cutoff")).toHaveClass(/overdue/);
  for (let index = 0; index < 4; index++) await page.locator("[data-complete-step]").click();
  await expect(page.locator(".execution-cutoff")).toHaveClass(/normal/);
  await expect(page.locator(".execution-cutoff")).toHaveAttribute("data-cutoff-id", "0924-route-1");
  await page.clock.setFixedTime(new Date("2026-09-24T02:45:00Z"));
  await page.clock.fastForward(30000);
  await expect(page.locator(".execution-cutoff")).toHaveClass(/warning/);
  await expect(page.locator(".execution-cutoff")).toContainText("还剩 50 分");
  await page.clock.setFixedTime(new Date("2026-09-24T03:36:00Z"));
  await page.clock.fastForward(30000);
  await expect(page.locator(".execution-cutoff")).toHaveClass(/overdue/);
  await expect(page.locator(".execution-cutoff")).toContainText("已超时");
  await expect(page.locator(".execution-suggestion")).toContainText("抵达广峙其海边");
  await page.locator(".execution-suggestion button").click();
  await expect(page.locator(".execution-current")).toContainText("抵达广峙其海边");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")));
  expect(Object.keys(stored.executions["0924"].stepStates)).toHaveLength(4);
  await page.clock.setFixedTime(new Date("2026-09-24T15:30:00Z"));
  await page.clock.fastForward(30000);
  await expect(page.locator(".execution-suggestion")).toHaveCount(0);
  expect(Object.keys((await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")))).executions["0924"].stepStates)).toHaveLength(4);
});

test("on-demand location reports straight-line distance and accuracy without persisting", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 33.47098, longitude: 126.88892, accuracy: 180 });
  const page = await context.newPage();
  await page.goto(url);
  await page.locator('#view-today [data-day="0924"]').click();
  await page.locator("[data-start-execution='0924']").click();
  await expect(page.locator(".execution-location")).toContainText("点击后仅申请一次位置权限");
  await page.locator("[data-update-execution-location]").click();
  await expect(page.locator(".execution-location")).toContainText("直线约 0 m");
  await expect(page.locator(".execution-location")).toContainText("精度 ±180 m（低精度）");
  await page.getByRole("button", { name: "计划" }).click();
  await page.locator('#view-plan [data-day="0925"]').click();
  await page.locator('#view-plan [data-day="0924"]').click();
  await page.getByRole("button", { name: "今日", exact: true }).click();
  await expect(page.locator(".execution-location")).toContainText("点击后仅申请一次位置权限");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")));
  expect(JSON.stringify(stored)).not.toMatch(/executionLocation|33\.47098/);
  await page.getByRole("button", { name: "更多" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-button").click();
  const backup = JSON.parse(fs.readFileSync(await (await downloadPromise).path(), "utf8"));
  expect(backup.version).toBe(5);
  expect(backup.state.executions["0924"].status).toBe("active");
  expect(JSON.stringify(backup)).not.toMatch(/executionLocation|33\.47098/);
  await page.reload();
  await page.getByRole("button", { name: "今日", exact: true }).click();
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
  await page.locator("[data-start-execution='0924']").click();
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
  await page.locator("[data-start-execution='0924']").click();
  await page.locator("[data-update-execution-location]").click();
  await expect(page.locator(".execution-location")).toContainText("正在获取当前位置");
  await page.getByRole("button", { name: "计划" }).click();
  await page.locator('#view-plan [data-day="0925"]').click();
  await page.locator('#view-plan [data-day="0924"]').click();
  await page.getByRole("button", { name: "今日", exact: true }).click();
  await page.evaluate(() => window.resolveTripLocation({ coords: { latitude: 33.47098, longitude: 126.88892, accuracy: 25 } }));
  await expect(page.locator(".execution-location")).toContainText("点击后仅申请一次位置权限");
  expect(JSON.stringify(await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5"))))).not.toContain("33.47098");
});

test("version 4 migration and version 5 backup retain trip data and validate step IDs", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 768, height: 900 } });
  const page = await context.newPage();
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
  let stored = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")));
  expect(stored.version).toBe(5);
  expect(stored.stamps["8-start"]).toBe(true);
  expect(stored.checkinChecks.miyeong).toBe(true);
  expect(stored.customCheckins).toHaveLength(1);
  expect(stored.expenses).toHaveLength(1);
  expect(stored.notes).toBe("旧版备注");
  expect(stored.dayNotes["0927"]).toBe("旧版日记");
  expect(stored.confirmations["amantov-luggage"]).toBe(true);
  expect(stored.fallbacks["0927"]).toBe(true);
  expect(stored.executions).toEqual({});
  await page.locator("[data-start-execution='0927']").click();
  await page.locator("[data-complete-step]").click();
  await expect(page.locator(".execution-fallback")).toContainText("当天只完成8号线");
  await expect(page.locator(".execution-timeline-item")).toHaveCount(7);
  await page.getByRole("button", { name: "更多" }).click();
  const validBackup = { product: "jeju-olle-trip", version: 5, state: {
    version: 5, activeView: "today", activeDay: "0928", notes: "导入的执行进度",
    stamps: { "10-start": true, "10-middle": true },
    executions: { "0928": { status: "active", activeStepId: "0928-step-03",
      stepStates: { "0928-step-01": { done: true }, "bogus-step": { done: true }, "0928-step-02": { done: "yes" } },
      startedAt: "2026-09-28T00:00:00.000Z" } }
  } };
  await page.locator("#import-file").setInputFiles({ name: "v5.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(validBackup)) });
  await expect(page.locator(".execution-current")).toContainText("续走10号线");
  stored = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")));
  expect(stored.executions["0928"].stepStates).toEqual({ "0928-step-01": { done: true } });
  expect(stored.executions["0928"].activeStepId).toBe("0928-step-03");
  await page.getByRole("button", { name: "更多" }).click();
  await page.locator("#recovery-button").click();
  stored = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v5")));
  expect(stored.notes).toBe("旧版备注");
  expect(stored.executions["0927"].stepStates["0927-step-01"]).toEqual({ done: true });
  await context.close();
});

test("focused layout remains readable at phone, tablet and desktop sizes and print stays intact", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-09-27T00:00:00Z") });
  await page.goto(url);
  await page.locator('#view-today [data-day="0927"]').click();
  await page.locator("[data-start-execution='0927']").click();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await expect(page.locator(".execution-current")).toBeVisible();
    await expect(page.locator(".execution-stamp")).toBeVisible();
    await expect(page.locator(".execution-statusbar")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    const controls = await page.locator(".execution-controls button, .execution-location button, .execution-stamp-check, .execution-datebar button, .execution-timeline summary").evaluateAll(elements => elements.map(element => Math.round(element.getBoundingClientRect().height)));
    expect(controls.every(height => height >= 44)).toBe(true);
    await page.screenshot({ path: `test-results/execution-${width}.png` });
  }
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#view-plan")).toBeVisible();
  await expect(page.locator("#plan-content .route-stamps")).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("GitHub Pages subdirectory keeps install scope and offline walk-mode state", async ({ browser }) => {
  const server = await startStaticServer(4184, "/jeju-olle-100km-plan");
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const subpathUrl = "http://127.0.0.1:4184/jeju-olle-100km-plan/";
  try {
    await page.goto(subpathUrl);
    await waitForAppWorker(page);
    const config = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const manifest = await (await fetch(document.querySelector('link[rel="manifest"]').href)).json();
      return { scope: registration.scope, start: new URL(manifest.start_url, document.querySelector('link[rel="manifest"]').href).href, caches: await caches.keys() };
    });
    expect(config.scope).toBe(subpathUrl);
    expect(config.start).toBe(subpathUrl);
    expect(config.caches).toContain("jeju-olle-app-v5-execution-20260915-9");
    await page.locator('#view-today [data-day="0924"]').click();
    await page.locator("[data-start-execution='0924']").click();
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator(".execution-current")).toContainText("退房，步行前往济州客运站");
    await expect(page.locator("#network-status")).toContainText("离线可用");
  } finally {
    await context.close();
    await closeServer(server);
  }
});
