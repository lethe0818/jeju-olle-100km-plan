"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const TripLogic = require("../trip-logic.js");

const dataContext = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../data.js"), "utf8"), dataContext);
const data = JSON.parse(JSON.stringify(dataContext.window.TRIP_DATA));
const dayById = id => data.days.find(day => day.id === id);
const at = text => new Date(text).getTime();
const freeze = value => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

test("flight departure uses Beijing time while arrival and ordinary steps use Jeju time", () => {
  const departure = { time: "18:55", timeZone: "Asia/Shanghai" };
  assert.equal(TripLogic.timestamp("0923", departure), at("2026-09-23T10:55:00Z"));
  assert.equal(TripLogic.timestamp("0923", { time: "19:55" }), TripLogic.timestamp("0923", departure));
  assert.equal(TripLogic.timestamp("0923", { time: "21:35" }), at("2026-09-23T12:35:00Z"));
});

test("actual flight data explicitly identifies the Beijing departure timezone", () => {
  const departure = dayById("0923").timeline[0];
  assert.equal(departure.timeZone, "Asia/Shanghai");
  assert.equal(TripLogic.timestamp("0923", departure), at("2026-09-23T10:55:00Z"));
});

test("preview selects the first plan item on both earlier and later non-trip dates", () => {
  const day = dayById("0924");
  for (const now of [at("2026-09-21T03:00:00Z"), at("2026-09-25T03:00:00Z")]) {
    const result = TripLogic.selectedStep(day, now);
    assert.equal(result.preview, true);
    assert.equal(result.manual, false);
    assert.equal(result.index, 0);
    assert.equal(result.step.id, day.timeline[0].id);
  }
});

test("trip-day suggestion follows the latest planned start, including exact boundaries", () => {
  const day = dayById("0924");
  const before = TripLogic.selectedStep(day, at("2026-09-23T20:00:00Z"));
  assert.equal(before.preview, false);
  assert.equal(before.beforeStart, true);
  assert.equal(before.index, 0);
  const atDeparture = TripLogic.selectedStep(day, at("2026-09-23T20:55:00Z"));
  assert.equal(atDeparture.step.id, "0924-step-02");
  assert.equal(atDeparture.beforeStart, false);
  const afternoon = TripLogic.selectedStep(day, at("2026-09-24T05:45:00Z"));
  assert.equal(afternoon.step.id, "0924-step-09");
  const after = TripLogic.selectedStep(day, at("2026-09-24T14:00:00Z"));
  assert.equal(after.step.id, "0924-step-11");
  assert.equal(after.afterLast, true);
});

test("Jeju midnight controls preview even when Beijing is still on the preceding day", () => {
  const midnight = at("2026-09-23T15:00:00Z");
  assert.equal(TripLogic.selectedStep(dayById("0924"), midnight - 1).preview, true);
  assert.equal(TripLogic.selectedStep(dayById("0924"), midnight).preview, false);
  assert.equal(TripLogic.selectedStep(dayById("0923"), midnight).preview, true);
});

test("flight ordering uses converted instants rather than local clock strings or title matching", () => {
  const day = {
    id: "0923",
    next: { time: "21:35", title: "9C7205抵达济州国际机场" },
    timeline: [
      { id: "beijing-flight", time: "18:55", timeZone: "Asia/Shanghai", title: "北京大兴机场起飞" },
      { id: "jeju-update", time: "19:30", title: "济州当地安排" },
      { id: "arrival", time: "21:35", title: "抵达济州国际机场" }
    ]
  };
  assert.equal(TripLogic.selectedStep(day, at("2026-09-23T10:40:00Z")).step.id, "jeju-update");
  assert.equal(TripLogic.selectedStep(day, at("2026-09-23T11:00:00Z")).step.id, "beijing-flight");
  const arrived = TripLogic.selectedStep(day, at("2026-09-23T12:40:00Z"));
  assert.equal(arrived.step.id, "arrival");
  assert.equal(arrived.index, 2);
});

test("manual plan browsing uses stable IDs and never changes recorded completion", () => {
  const day = freeze(structuredClone(dayById("0924")));
  const before = JSON.stringify(day);
  const result = TripLogic.selectedStep(day, at("2026-09-24T06:00:00Z"), "0924-step-04");
  assert.equal(result.manual, true);
  assert.equal(result.index, 3);
  assert.equal(result.step.id, "0924-step-04");
  assert.equal(JSON.stringify(day), before);
  const unknown = TripLogic.selectedStep(day, at("2026-09-24T06:00:00Z"), "removed-step");
  assert.equal(unknown.manual, false);
  assert.equal(unknown.step.id, "0924-step-09");
});

test("manual preview remains a preview and returning to time suggestion is stateless", () => {
  const day = dayById("0924");
  const now = at("2026-09-21T03:00:00Z");
  assert.equal(TripLogic.selectedStep(day, now, "0924-step-08").step.id, "0924-step-08");
  assert.equal(TripLogic.selectedStep(day, now, "0924-step-08").preview, true);
  assert.equal(TripLogic.selectedStep(day, now).step.id, "0924-step-01");
});

test("completed stamps and legacy execution fields cannot skip the time-suggested plan item", () => {
  const day = structuredClone(dayById("0924"));
  day.stamps = { "1-start": true, "1-middle": true, "1-end": true };
  day.executions = { "0924": { status: "finished", activeStepId: "0924-step-11", stepStates: {} } };
  const before = JSON.stringify(day);
  assert.equal(TripLogic.selectedStep(day, at("2026-09-24T00:00:00Z")).step.id, "0924-step-05");
  assert.equal(JSON.stringify(day), before);
});

const cutoffDay = () => ({
  id: "0924",
  cutoffs: [
    { id: "morning", time: "08:05", title: "离开酒店", resolveStepId: "old-step" },
    { id: "route", time: "12:35", title: "完成1号线", completionStamps: ["1-start", "1-middle", "1-end"] },
    { id: "ferry", time: "17:10", title: "回到码头" }
  ]
});
const emptyState = () => ({ stamps: {}, confirmations: {}, cutoffChecks: {}, executions: {} });

test("an unresolved morning cutoff remains visible without blocking the upcoming ferry or route deadline", () => {
  const groups = TripLogic.cutoffGroups(cutoffDay(), emptyState(), at("2026-09-24T02:00:00Z"));
  assert.equal(groups.preview, false);
  assert.equal(groups.next.id, "route");
  assert.equal(groups.next.tone, "normal");
  assert.equal(groups.next.deltaMinutes, 95);
  assert.equal(typeof groups.next.countdown, "string");
  assert.deepEqual(groups.overdue.map(item => item.id), ["morning"]);
  assert.equal(groups.overdue[0].tone, "overdue");
  assert.deepEqual(groups.resolved, []);
});

test("deadline tones change at exactly 60 minutes and the deadline is urgent at zero", () => {
  const day = { id: "0924", cutoffs: [{ id: "route", time: "12:35", title: "完成1号线" }] };
  const deadline = at("2026-09-24T03:35:00Z");
  assert.equal(TripLogic.cutoffGroups(day, emptyState(), deadline - 61 * 60000).next.tone, "normal");
  assert.equal(TripLogic.cutoffGroups(day, emptyState(), deadline - 60 * 60000).next.tone, "warning");
  const due = TripLogic.cutoffGroups(day, emptyState(), deadline);
  assert.equal(due.next.tone, "warning");
  assert.equal(due.next.deltaMinutes, 0);
  assert.equal(due.overdue.length, 0);
  assert.equal(TripLogic.cutoffGroups(day, emptyState(), deadline + 1000).overdue[0].tone, "overdue");
  const late = TripLogic.cutoffGroups(day, emptyState(), deadline + 60000);
  assert.equal(late.next, null);
  assert.equal(late.overdue[0].tone, "overdue");
  assert.equal(late.overdue[0].deltaMinutes, -1);
});

test("explicitly confirmed past cutoffs resolve without writing to execution progress", () => {
  const state = emptyState();
  state.cutoffChecks.morning = true;
  const before = JSON.stringify(state);
  const groups = TripLogic.cutoffGroups(cutoffDay(), freeze(state), at("2026-09-24T02:00:00Z"));
  assert.deepEqual(groups.resolved.map(item => item.id), ["morning"]);
  assert.deepEqual(groups.overdue, []);
  assert.equal(groups.next.id, "route");
  assert.equal(JSON.stringify(state), before);
});

test("a route deadline resolves only after every associated stamp is recorded", () => {
  const state = emptyState();
  state.stamps = { "1-start": true, "1-middle": true };
  const now = at("2026-09-24T04:00:00Z");
  assert.ok(TripLogic.cutoffGroups(cutoffDay(), state, now).overdue.some(item => item.id === "route"));
  state.stamps["1-end"] = true;
  const groups = TripLogic.cutoffGroups(cutoffDay(), state, now);
  assert.ok(groups.resolved.some(item => item.id === "route"));
  assert.equal(groups.next.id, "ferry");
  state.stamps["1-end"] = false;
  assert.ok(TripLogic.cutoffGroups(cutoffDay(), state, now).overdue.some(item => item.id === "route"));
});

test("confirmation-linked cutoffs require every confirmation and empty requirements do not auto-resolve", () => {
  const day = { id: "0924", cutoffs: [
    { id: "luggage", time: "08:00", confirmationIds: ["hotel", "delivery"] },
    { id: "plain", time: "09:00", confirmationIds: [], completionStamps: [] }
  ] };
  const state = emptyState();
  state.confirmations.hotel = true;
  const now = at("2026-09-24T01:00:00Z");
  assert.equal(TripLogic.cutoffGroups(day, state, now).resolved.length, 0);
  state.confirmations.delivery = true;
  const groups = TripLogic.cutoffGroups(day, state, now);
  assert.deepEqual(groups.resolved.map(item => item.id), ["luggage"]);
  assert.deepEqual(groups.overdue.map(item => item.id), ["plain"]);
});

test("legacy active or finished execution records never silently dismiss a deadline", () => {
  for (const status of ["active", "finished", "not-started"]) {
    const state = emptyState();
    state.executions["0924"] = { status, activeStepId: "old-step", stepStates: { "old-step": { done: true } } };
    const groups = TripLogic.cutoffGroups(cutoffDay(), state, at("2026-09-24T02:00:00Z"));
    assert.deepEqual(groups.overdue.map(item => item.id), ["morning"]);
    assert.equal(groups.resolved.length, 0);
    assert.equal(groups.next.id, "route");
  }
});

test("non-current dates display preview deadlines instead of false overdue alarms", () => {
  for (const now of [at("2026-09-21T03:00:00Z"), at("2026-09-28T03:00:00Z")]) {
    const groups = TripLogic.cutoffGroups(cutoffDay(), emptyState(), now);
    assert.equal(groups.preview, true);
    assert.equal(groups.next.id, "morning");
    assert.equal(groups.next.tone, "preview");
    assert.deepEqual(groups.overdue, []);
  }
});

test("days with no cutoff and days with everything confirmed have no next reminder", () => {
  assert.equal(TripLogic.cutoffGroups({ id: "0924", cutoffs: [] }, emptyState(), at("2026-09-24T01:00:00Z")).next, null);
  const state = emptyState();
  state.cutoffChecks = { morning: true, route: true, ferry: true };
  const groups = TripLogic.cutoffGroups(cutoffDay(), state, at("2026-09-24T10:00:00Z"));
  assert.equal(groups.next, null);
  assert.equal(groups.resolved.length, 3);
  assert.deepEqual(groups.overdue, []);
});

test("standard courses require three stamps while optional Gapado requires exactly its two published stamps", () => {
  assert.equal(TripLogic.routeComplete(data.routes["1"], {}), false);
  assert.equal(TripLogic.routeComplete(data.routes["1"], { "1-start": true, "1-end": true }), false);
  assert.equal(TripLogic.routeComplete(data.routes["1"], { "1-start": true, "1-middle": true, "1-end": true }), true);
  assert.equal(TripLogic.routeComplete(data.routes["10-1"], { "10-1-start": true }), false);
  assert.equal(TripLogic.routeComplete(data.routes["10-1"], { "10-1-start": true, "10-1-end": true }), true);
});

test("core certificate total stays 102.1 km and the Udo cycling course is excluded", () => {
  const core = Object.values(data.routes).filter(route => route.counts && !route.optional);
  const total = core.reduce((sum, route) => sum + route.km, 0);
  assert.equal(Number(total.toFixed(1)), 102.1);
  assert.equal(data.trip.coreCertificateKm, 102.1);
  assert.equal(data.routes["1-1"].counts, false);
  assert.equal(data.routes["1-1"].mode, "骑行");
  assert.equal(Number(Object.values(data.routes).filter(route => route.counts).reduce((sum, route) => sum + route.km, 0).toFixed(1)), 106.3);
});

test("split course 10 only earns its full distance after the next-day finish stamp", () => {
  const firstDay = dayById("0927").stampPlan.find(plan => plan.routeId === "10");
  const secondDay = dayById("0928").stampPlan.find(plan => plan.routeId === "10");
  assert.deepEqual(firstDay.stamps, ["start", "middle"]);
  assert.deepEqual(secondDay.stamps, ["end"]);
  const stamps = Object.fromEntries(firstDay.stamps.map(stamp => ["10-" + stamp, true]));
  assert.equal(TripLogic.routeComplete(data.routes["10"], stamps), false);
  secondDay.stamps.forEach(stamp => { stamps["10-" + stamp] = true; });
  assert.equal(TripLogic.routeComplete(data.routes["10"], stamps), true);
  assert.equal(data.routes["10"].km, 15.6);
  assert.deepEqual(dayById("0928").stampPlan.find(plan => plan.routeId === "10-1").stamps, ["start", "end"]);
});

test("all itinerary steps retain globally unique stable IDs", () => {
  const ids = data.days.flatMap(day => day.timeline.map(step => step.id));
  assert.equal(ids.length, new Set(ids).size);
  assert.ok(ids.every(id => /^092[3-8]-step-\d{2}$/.test(id)));
});
