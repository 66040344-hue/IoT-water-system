// สรุปผลการให้น้ำ/ปุ๋ยจากประวัติงาน (/history) ใช้ร่วมกันทั้งหน้าประวัติในเว็บและ Cloud Functions ที่ส่ง LINE
// ไฟล์ต้นฉบับอยู่ที่ web/js/report-core.js แล้วคัดลอกไป functions/lib/ ด้วย scripts/sync-report-core.js (ทำให้เองตอน deploy)
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else (root.XF = root.XF || {}).report = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const n = (v) => {
    const x = parseFloat(v);
    return Number.isFinite(x) ? x : 0;
  };
  const pad = (v) => String(v).padStart(2, "0");
  const DAY = 86400;

  // tzOffsetMin: ส่วนต่างจาก UTC เป็นนาที เช่นไทย = 420 (ไม่มีเวลาออมแสง จึงใช้ค่าคงที่ได้)
  function dayKey(sec, tzOffsetMin) {
    const d = new Date((sec + tzOffsetMin * 60) * 1000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }

  function dayStart(sec, tzOffsetMin) {
    const off = tzOffsetMin * 60;
    return Math.floor((sec + off) / DAY) * DAY - off;
  }

  // days = 1 คือ "วันนี้" (ตั้งแต่เที่ยงคืนถึงตอนนี้), 7 = วันนี้ย้อนหลัง 7 วัน
  function periodRange(days, nowSec, tzOffsetMin) {
    return [dayStart(nowSec, tzOffsetMin) - (Math.max(1, days) - 1) * DAY, nowSec];
  }

  function bucket(map, key, name) {
    if (!map.has(key)) map.set(key, { key, name, jobs: 0, waterL: 0, fertMl: 0, errors: 0 });
    return map.get(key);
  }

  // rows: รายการจาก /history  opts: { tzOffsetMin, fromSec, toSec } (fromSec/toSec ใช้เติมวันที่ไม่มีงานให้ครบ)
  function summarize(rows, opts) {
    const tz = (opts && opts.tzOffsetMin) || 0;
    const total = { jobs: 0, done: 0, stopped: 0, error: 0, waterL: 0, fertMl: 0, runSec: 0 };
    const zones = new Map();
    const tanks = new Map();
    const days = new Map();

    if (opts && opts.fromSec != null && opts.toSec != null) {
      const last = dayStart(opts.toSec, tz);
      for (let t = dayStart(opts.fromSec, tz); t <= last; t += DAY) bucket(days, dayKey(t, tz), dayKey(t, tz));
    }

    (rows || []).forEach((r) => {
      const water = n(r.water_l);
      const fert = n(r.fert_ml);
      const status = r.status === "done" || r.status === "stopped" || r.status === "error" ? r.status : "done";
      total.jobs++;
      total[status]++;
      total.waterL += water;
      total.fertMl += fert;
      total.runSec += Math.max(0, n(r.end) - n(r.start));

      const targets = [bucket(zones, r.zone || r.zone_name || "-", r.zone_name || r.zone || "-")];
      targets.push(bucket(days, dayKey(n(r.start) || n(r.end), tz), dayKey(n(r.start) || n(r.end), tz)));
      if (fert > 0 && r.tank) {
        const t = bucket(tanks, String(r.tank), r.tank_name || "ถัง " + r.tank);
        t.jobs++;
        t.fertMl += fert;
      }
      targets.forEach((t) => {
        t.jobs++;
        t.waterL += water;
        t.fertMl += fert;
        if (status === "error") t.errors++;
      });
    });

    const byName = (a, b) => String(a.name).localeCompare(String(b.name), "th");
    return {
      ...total,
      byZone: [...zones.values()].sort(byName),
      byTank: [...tanks.values()].sort((a, b) => Number(a.key) - Number(b.key)),
      byDay: [...days.values()].sort((a, b) => a.key.localeCompare(b.key)),
    };
  }

  return { summarize, periodRange, dayKey, dayStart };
});
