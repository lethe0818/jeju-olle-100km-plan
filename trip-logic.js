(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TripLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function dayKey(now) {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now));
    const value = Object.fromEntries(parts.map(function (part) { return [part.type, part.value]; }));
    return value.year + "-" + value.month + "-" + value.day;
  }

  function dateKey(dayId) { return "2026-" + dayId.slice(0, 2) + "-" + dayId.slice(2); }

  function timestamp(dayId, item) {
    const offset = item.timeZone === "Asia/Shanghai" ? "+08:00" : "+09:00";
    return Date.parse(dateKey(dayId) + "T" + item.time + ":00" + offset);
  }

  function selectedStep(day, now, manualStepId) {
    const preview = dayKey(now) !== dateKey(day.id);
    const manualIndex = day.timeline.findIndex(function (step) { return step.id === manualStepId; });
    let index = 0;
    let latest = -Infinity;
    if (!preview) day.timeline.forEach(function (step, stepIndex) {
      const instant = timestamp(day.id, step);
      if (instant <= Number(new Date(now)) && instant > latest) { index = stepIndex; latest = instant; }
    });
    if (manualIndex >= 0) index = manualIndex;
    const instants = day.timeline.map(function (step) { return timestamp(day.id, step); });
    return {
      step: day.timeline[index], index, preview, manual: manualIndex >= 0,
      beforeStart: !preview && Number(new Date(now)) < Math.min.apply(null, instants),
      afterLast: !preview && Number(new Date(now)) > Math.max.apply(null, instants)
    };
  }

  function cutoffGroups(day, state, now) {
    const preview = dayKey(now) !== dateKey(day.id);
    const resolved = [], pending = [];
    (day.cutoffs || []).forEach(function (cutoff) {
      const byStamps = cutoff.completionStamps && cutoff.completionStamps.length && cutoff.completionStamps.every(function (key) { return Boolean((state.stamps || {})[key]); });
      const byConfirmation = cutoff.confirmationIds && cutoff.confirmationIds.length && cutoff.confirmationIds.every(function (key) { return Boolean((state.confirmations || {})[key]); });
      if ((state.cutoffChecks || {})[cutoff.id] || byStamps || byConfirmation) {
        resolved.push(Object.assign({}, cutoff, { tone: "normal", countdown: "已确认" }));
        return;
      }
      const delta = timestamp(day.id, cutoff) - Number(new Date(now));
      const deltaMinutes = delta < 0 ? -Math.ceil(Math.abs(delta) / 60000) : Math.ceil(delta / 60000);
      const tone = preview ? "preview" : delta < 0 ? "overdue" : deltaMinutes <= 60 ? "warning" : "normal";
      const countdown = preview ? "当地 " + cutoff.time : delta < 0 ? "已过 " + Math.abs(deltaMinutes) + " 分钟 · 待确认" : deltaMinutes >= 60 ? "还剩 " + Math.floor(deltaMinutes / 60) + " 小时 " + deltaMinutes % 60 + " 分" : "还剩 " + deltaMinutes + " 分钟";
      pending.push(Object.assign({}, cutoff, { tone, countdown, deltaMinutes }));
    });
    pending.sort(function (a, b) { return timestamp(day.id, a) - timestamp(day.id, b); });
    return { next: pending.find(function (item) { return item.tone !== "overdue"; }) || null, overdue: pending.filter(function (item) { return item.tone === "overdue"; }), resolved, preview };
  }

  function routeComplete(route, stamps) {
    return (route.stamps || ["start", "middle", "end"]).every(function (stage) { return Boolean(stamps[route.id + "-" + stage]); });
  }

  return { dayKey, dateKey, timestamp, selectedStep, cutoffGroups, routeComplete };
});
