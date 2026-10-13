// หน้าประวัติ: รายการงานที่ ESP32 บันทึกไว้ที่ /history (start/end เป็นวินาที epoch)
XF.boot("history", function () {
  const { store, $, $$, esc, fmt, num } = XF;
  const STATUS = { done: ["สำเร็จ", "on"], stopped: ["ถูกสั่งหยุด", "warn"], error: ["ผิดพลาด", ""] };
  let rows = [];
  let tankSettings = {};
  let actions = []; // /action_log ที่ใกล้ช่วงเวลาที่เลือก เรียงตามเวลา

  // ผู้สั่งงาน: ESP32 ไม่รู้ว่าใครสั่ง จึงจับคู่จาก /action_log (งานตามตารางเวลาไม่มีผู้สั่ง)
  //  - starter = คำสั่งเริ่มล่าสุดก่อนงานเริ่ม (run ของโซนเดียวกันภายใน 2 ชม. เผื่อรอคิว / สวิตช์รีเลย์ภายใน 10 นาที)
  //  - stopper = คำสั่งหยุดที่ใกล้เวลางานจบ (เฉพาะงานที่ถูกสั่งหยุด)
  function usersOf(r) {
    const out = { starter: "", stopper: "" };
    const start = num(r.start) || num(r.end);
    const end = num(r.end) || start;
    if (r.source !== "schedule") {
      const pick = (pred) => actions.filter((a) => pred(a) && num(a.at) <= start + 30).pop();
      const hit =
        r.source === "manual" && !r.zone
          ? pick((a) => a.type === "relay" && a.on !== false && num(a.at) >= start - 600)
          : pick((a) => a.type === "run" && a.zone === r.zone && num(a.at) >= start - 7200);
      if (hit) out.starter = hit.name || "";
    }
    if (r.status === "stopped") {
      const stop = actions
        .filter((a) => (a.type === "stop" || a.type === "mode" || (a.type === "relay" && a.on === false)) && Math.abs(num(a.at) - end) <= 90)
        .sort((a, b) => Math.abs(num(a.at) - end) - Math.abs(num(b.at) - end))[0];
      if (stop) out.stopper = stop.name || "";
    }
    return out;
  }

  let productLog = {}; // tank(1..3) -> [{ at, product, name, prev, prev_name }] เรียงตามเวลา

  function indexLog(v) {
    productLog = {};
    Object.values(v || {}).forEach((e) => {
      if (!e || !(e.tank >= 1 && e.tank <= 3)) return;
      (productLog[e.tank] = productLog[e.tank] || []).push(e);
    });
    Object.values(productLog).forEach((list) => list.sort((a, b) => num(a.at) - num(b.at)));
  }

  // สูตรปุ๋ยของงาน: ดูจากประวัติการเปลี่ยนสูตรของถัง (/product_log) ว่า ณ เวลาเริ่มงานถังนั้นใช้สูตรอะไร
  // ถังที่ยังไม่เคยมีบันทึกการเปลี่ยนเลย ใช้สูตรที่ตั้งไว้ในถังตอนนี้ (assumed = true แสดงเครื่องหมาย *)
  function productOf(r) {
    const none = { id: "", name: "", assumed: false };
    if (!r.tank) return none;
    const list = productLog[r.tank] || [];
    const t = num(r.start) || num(r.end);
    let id = "";
    let logged = "";
    let assumed = false;
    if (!list.length) {
      id = (tankSettings["t" + r.tank] || {}).product || "";
      assumed = true;
    } else {
      let hit = null;
      list.forEach((e) => {
        if (num(e.at) <= t) hit = e;
      });
      if (hit) [id, logged] = [hit.product || "", hit.name || ""];
      else [id, logged] = [list[0].prev || "", list[0].prev_name || ""]; // งานก่อนการเปลี่ยนครั้งแรก = สูตรเดิมก่อนเปลี่ยน
    }
    if (!id) return { ...none, assumed };
    const p = XF.allProducts().find((x) => x.id === id);
    return { id, name: p ? p.name : logged || id, assumed };
  }
  const productLabel = (r) => {
    const p = productOf(r);
    return p.name ? esc(p.name) + (p.assumed ? ' <span class="muted" title="ยังไม่มีบันทึกการเปลี่ยนสูตร แสดงสูตรที่ตั้งไว้ในถังขณะนี้">*</span>' : "") : "";
  };

  const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  function currentRange() {
    const days = +$("#rangeTabs .active").dataset.days;
    const now = new Date();
    if (days > 0) return [dayStart(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1))), now];
    const from = $("#fromDate").value ? new Date($("#fromDate").value + "T00:00:00") : dayStart(now);
    const to = $("#toDate").value ? new Date($("#toDate").value + "T23:59:59") : now;
    return [from, to];
  }

  async function load() {
    const [from, to] = currentRange();
    if (!rows.length) $("#rows").innerHTML = '<div class="empty">กำลังโหลด…</div>';
    try {
      rows = await store.range(XF.root + "/history", "start", from.getTime() / 1000, to.getTime() / 1000 + 60);
      rows.sort((a, b) => b.start - a.start);
      // ผู้สั่งงานเป็นข้อมูลเสริม: โหลดไม่ได้ก็ยังแสดงประวัติได้ตามปกติ (เผื่อ 2 ชม. ก่อนช่วง เพราะงานอาจรอคิวหลังสั่ง)
      actions = (await store.range(XF.root + "/action_log", "at", from.getTime() / 1000 - 7200, to.getTime() / 1000 + 120).catch(() => [])).sort(
        (a, b) => num(a.at) - num(b.at)
      );
      render();
    } catch (err) {
      console.error(err);
      $("#rows").innerHTML = '<div class="empty">โหลดประวัติไม่สำเร็จ</div>';
    }
  }

  function render() {
    const water = rows.reduce((sum, r) => sum + num(r.water_l), 0);
    const fert = rows.reduce((sum, r) => sum + num(r.fert_ml), 0);
    $("#summary").innerHTML = `
      <div class="card"><div class="stat-label">จำนวนครั้ง</div><div class="num" style="font-size:1.8rem">${fmt(rows.length)}</div></div>
      <div class="card"><div class="stat-label">น้ำรวม (ลิตร)</div><div class="num" style="font-size:1.8rem;color:var(--blue-ink)">${fmt(water, 0)}</div></div>
      <div class="card"><div class="stat-label">ปุ๋ยรวม</div><div class="num" style="font-size:1.8rem;color:var(--orange-text)">${XF.fmtVolume(fert)}</div></div>`;

    renderBreakdown();
    renderFertByZone();

    if (!rows.length) {
      $("#rows").innerHTML = '<div class="empty">ไม่มีประวัติการทำงานในช่วงเวลานี้</div>';
      return;
    }
    $("#rows").innerHTML = `<table class="data">
      <thead><tr><th>วันที่</th><th>เวลา</th><th>ระยะเวลา</th><th>โซน</th><th>ที่มา</th><th class="r">น้ำ (ลิตร)</th><th class="r">ปุ๋ย (มล.)</th><th>สถานะ</th></tr></thead>
      <tbody>${rows
        .map((r) => {
          const [label, cls] = STATUS[r.status] || [r.status || "–", "soft"];
          const who = usersOf(r);
          return `<tr>
            <td style="white-space:nowrap">${XF.fmtDate(r.start * 1000, { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
            <td style="white-space:nowrap">${XF.fmtTime(r.start * 1000)} – ${XF.fmtTime(r.end * 1000)}</td>
            <td style="white-space:nowrap">${XF.fmtDuration(r.end - r.start)}</td>
            <td>${esc(r.zone_name || r.zone || "–")}</td>
            <td>${esc(XF.SOURCE_LABELS[r.source] || r.source || "–")}${who.starter ? `<div class="small muted">โดย ${esc(who.starter)}</div>` : ""}</td>
            <td class="r">${fmt(r.water_l, 1)}</td>
            <td class="r">${fmt(r.fert_ml, 0)}${r.tank ? `<div class="small muted">${esc(r.tank_name || "ถัง " + r.tank)}</div>` : ""}${
              productLabel(r) ? `<div class="small">${productLabel(r)}</div>` : ""
            }</td>
            <td><span class="badge ${cls}">${esc(label)}</span>${r.note ? `<div class="small muted">${esc(r.note)}</div>` : ""}${who.stopper ? `<div class="small muted">หยุดโดย ${esc(who.stopper)}</div>` : ""}</td>
          </tr>`;
        })
        .join("")}</tbody></table>`;
  }

  // สรุปตามโซน / ถังปุ๋ย / รายวัน (ใช้ตรรกะชุดเดียวกับข้อความสรุปที่ส่งเข้า LINE)
  function renderBreakdown() {
    const box = $("#breakdown");
    box.hidden = !rows.length;
    if (!rows.length) return;
    const [from, to] = currentRange();
    const s = XF.report.summarize(rows, {
      tzOffsetMin: -new Date().getTimezoneOffset(),
      fromSec: from.getTime() / 1000,
      toSec: to.getTime() / 1000,
    });
    const maxWater = Math.max(1, ...s.byDay.map((d) => d.waterL));
    const failed = s.error ? `<span class="badge">ผิดพลาด ${fmt(s.error)}</span>` : "";

    const zoneRows = s.byZone
      .map(
        (z) => `<tr><td>${esc(z.name)}</td><td class="r">${fmt(z.jobs)}</td><td class="r">${fmt(z.waterL, 0)}</td>
          <td class="r">${fmt(z.fertMl, 0)}</td><td class="r">${z.errors ? fmt(z.errors) : "–"}</td></tr>`
      )
      .join("");
    const tankRows = s.byTank
      .map((t) => `<tr><td>${esc(t.name)}</td><td class="r">${fmt(t.jobs)}</td><td class="r">${fmt(t.fertMl, 0)}</td></tr>`)
      .join("");
    const dayBars =
      s.byDay.length > 1
        ? `<div class="card-title" style="margin:18px 0 8px">น้ำรายวัน (ลิตร)</div>
        <div class="day-bars">${s.byDay
          .map((d) => {
            const [, mo, da] = d.key.split("-");
            return `<div class="day-bar" title="${esc(d.key)}: ${fmt(d.jobs)} ครั้ง · น้ำ ${fmt(d.waterL, 0)} ลิตร · ปุ๋ย ${esc(XF.fmtVolume(d.fertMl))}">
              <i style="height:${Math.max(d.waterL > 0 ? 4 : 0, (d.waterL / maxWater) * 100)}%"></i><b>${+da}/${+mo}</b></div>`;
          })
          .join("")}</div>`
        : "";

    box.innerHTML = `<div class="row between wrap"><div class="card-title" style="margin:0">สรุปตามโซนและถังปุ๋ย</div>${failed}</div>
      <div class="table-wrap" style="margin-top:8px"><table class="data">
        <thead><tr><th>โซน</th><th class="r">ครั้ง</th><th class="r">น้ำ (ลิตร)</th><th class="r">ปุ๋ย (มล.)</th><th class="r">ผิดพลาด</th></tr></thead>
        <tbody>${zoneRows}</tbody></table></div>
      ${
        tankRows
          ? `<div class="table-wrap" style="margin-top:14px"><table class="data">
        <thead><tr><th>ถังปุ๋ย</th><th class="r">ครั้ง</th><th class="r">ปุ๋ยที่ใช้ (มล.)</th></tr></thead>
        <tbody>${tankRows}</tbody></table></div>`
          : ""
      }
      ${dayBars}`;
  }

  // ปุ๋ยที่ใช้ของแต่ละถัง แยกตามสวน (โซน): กลุ่มตามสวน แล้วแสดงปริมาณของแต่ละถังในสวนนั้น
  function renderFertByZone() {
    const box = $("#fertByZone");
    const used = rows.filter((r) => num(r.fert_ml) > 0);
    box.hidden = !used.length;
    if (!used.length) return;

    const zones = new Map();
    const tankTotals = new Map();
    used.forEach((r) => {
      const zKey = r.zone || r.zone_name || "-";
      const prod = productOf(r);
      // แยกตามสูตรด้วย: ถังเดียวกันที่เปลี่ยนสูตรระหว่างช่วงจะไม่ถูกรวมกัน
      const tKey = `${r.tank || 0}|${prod.id}`;
      const tName = (r.tank ? r.tank_name || "ถัง " + r.tank : "ไม่ระบุถัง") + (prod.name ? ` · ${prod.name}` : "");
      const ml = num(r.fert_ml);
      if (!zones.has(zKey)) zones.set(zKey, { name: r.zone_name || r.zone || "-", total: 0, tanks: new Map() });
      const z = zones.get(zKey);
      z.total += ml;
      if (!z.tanks.has(tKey)) z.tanks.set(tKey, { key: tKey, name: tName, jobs: 0, ml: 0 });
      const t = z.tanks.get(tKey);
      t.jobs++;
      t.ml += ml;
      if (!tankTotals.has(tKey)) tankTotals.set(tKey, { key: tKey, name: tName, ml: 0 });
      tankTotals.get(tKey).ml += ml;
    });

    const grand = [...zones.values()].reduce((s, z) => s + z.total, 0);
    const zoneList = [...zones.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), "th"));
    const body = zoneList
      .map((z) => {
        const tanks = [...z.tanks.values()].sort((a, b) => parseInt(a.key, 10) - parseInt(b.key, 10) || a.name.localeCompare(b.name, "th"));
        return (
          `<tr class="sub"><td><b>${esc(z.name)}</b></td><td></td><td class="r"><b>${fmt(z.total, 0)}</b></td><td class="r muted">${fmt((z.total / grand) * 100, 0)}%</td></tr>` +
          tanks
            .map(
              (t) => `<tr><td class="muted" style="padding-left:24px">${esc(t.name)}</td><td class="r">${fmt(t.jobs)}</td>
              <td class="r">${fmt(t.ml, 0)}</td><td class="r muted">${XF.fmtVolume(t.ml)}</td></tr>`
            )
            .join("")
        );
      })
      .join("");
    const totals = [...tankTotals.values()]
      .sort((a, b) => parseInt(a.key, 10) - parseInt(b.key, 10) || a.name.localeCompare(b.name, "th"))
      .map((t) => `<span class="badge soft">${esc(t.name)}: ${esc(XF.fmtVolume(t.ml))}</span>`)
      .join(" ");

    box.innerHTML = `<div class="card-title" style="margin:0">ปุ๋ยที่ใช้แยกตามสวนและถัง</div>
      <div class="row wrap" style="gap:6px;margin-top:8px">${totals}</div>
      <div class="table-wrap" style="margin-top:8px"><table class="data">
        <thead><tr><th>สวน / ถังปุ๋ย</th><th class="r">ครั้ง</th><th class="r">ปุ๋ยที่ใช้ (มล.)</th><th class="r">สัดส่วน / ปริมาณ</th></tr></thead>
        <tbody>${body}</tbody></table></div>`;
  }

  $("#sendLine").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const [from, to] = currentRange();
    btn.disabled = true;
    try {
      await XF.sendLineReport({ from: Math.floor(from.getTime() / 1000), to: Math.floor(to.getTime() / 1000) });
    } finally {
      btn.disabled = false;
    }
  });

  function exportCsv() {
    if (!rows.length) return XF.toast("ไม่มีข้อมูลให้ดาวน์โหลด", true);
    const cell = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const stamp = (sec) => {
      const d = new Date(sec * 1000);
      return `${isoDate(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
    };
    const lines = [["เริ่ม", "สิ้นสุด", "ระยะเวลา (วินาที)", "โซน", "ที่มา", "น้ำ (ลิตร)", "ปุ๋ย (มล.)", "ถังปุ๋ย", "สูตรปุ๋ย", "สถานะ", "หมายเหตุ", "ผู้สั่ง", "ผู้สั่งหยุด"].map(cell).join(",")];
    rows.forEach((r) =>
      lines.push(
        [stamp(r.start), stamp(r.end), Math.round(r.end - r.start), r.zone_name || r.zone, XF.SOURCE_LABELS[r.source] || r.source, r.water_l, r.fert_ml, r.tank_name || "", productOf(r).name, (STATUS[r.status] || [r.status])[0], r.note, usersOf(r).starter, usersOf(r).stopper]
          .map(cell)
          .join(",")
      )
    );
    // BOM เพื่อให้ Excel อ่านภาษาไทยถูกต้อง
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `xactflow-history-${isoDate(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  $$("#rangeTabs button").forEach((btn) =>
    btn.addEventListener("click", () => {
      $$("#rangeTabs button").forEach((b) => b.classList.toggle("active", b === btn));
      $("#customRange").hidden = btn.dataset.days !== "0";
      load();
    })
  );
  $("#fromDate").value = $("#toDate").value = isoDate(new Date());
  $("#fromDate").addEventListener("change", load);
  $("#toDate").addEventListener("change", load);
  $("#exportCsv").addEventListener("click", exportCsv);

  // สูตรของผู้ใช้ และสูตรที่ตั้งไว้ในถังตอนนี้ (ใช้แสดงชื่อปุ๋ย) โหลดมาแล้ววาดใหม่
  XF.watchProducts(() => rows.length && render());
  store.watch(XF.root + "/down/settings/tanks", (v) => {
    tankSettings = v || {};
    if (rows.length) render();
  });
  store.watch(XF.root + "/product_log", (v) => {
    indexLog(v);
    if (rows.length) render();
  });

  load();
  // งานใหม่ที่เพิ่งจบจะปรากฏเองโดยไม่ต้องรีเฟรชหน้า: โหลดซ้ำเฉพาะตอนสถานะงานเปลี่ยนจากกำลังทำ -> ว่าง (ไม่ดึงทุก 60 วินาที)
  let wasRunning = null;
  XF.watchUp((up) => {
    const running = !!(up.job && up.job.running);
    if (wasRunning === true && !running && $("#rangeTabs .active").dataset.days !== "0") setTimeout(load, 3000);
    wasRunning = running;
  });
});
