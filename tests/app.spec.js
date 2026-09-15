const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const url = "http://127.0.0.1:4183/";
let testServer;

function startStaticServer(port) {
  const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg" };
  const root = process.cwd();
  const server = http.createServer((request, response) => {
    const requestPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
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
  let stored = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v4")));
  expect(stored.version).toBe(4);
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
  const migrated = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v4")));
  const coreKm = await page.evaluate(() => Object.values(window.TRIP_DATA.routes).filter(route => route.counts && !route.optional).reduce((sum, route) => sum + route.km, 0));
  expect(migrated.version).toBe(4);
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
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v4")));
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
  let state = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v4")));
  expect(state.customCheckins).toHaveLength(1);
  expect(state.expenses).toEqual([]);

  const mixedBackup = { version: 4, activeView: "more", expenses: [
    { id: "valid", title: "晚餐", dayId: "0928", category: "food", amount: 12000, currency: "KRW", payment: "cash" },
    { id: "bad", title: "异常金额", dayId: "0928", category: "food", amount: -5, currency: "KRW" },
    { id: "bad-day", title: "异常日期", dayId: "0930", category: "food", amount: 5, currency: "KRW" }
  ] };
  await page.locator("#import-file").setInputFiles({ name: "mixed.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(mixedBackup)) });
  state = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v4")));
  expect(state.expenses).toHaveLength(1);
  await page.locator("#recovery-button").click();
  state = await page.evaluate(() => JSON.parse(localStorage.getItem("jeju-olle-plan-v4")));
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
