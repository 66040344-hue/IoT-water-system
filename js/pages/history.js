// หน้าประวัติ: รายการงานที่ ESP32 บันทึกไว้ที่ /history (start/end เป็นวินาที epoch)
XF.boot("history", function () {
  const { store, $, $$, esc, fmt, num } = XF;
  const STATUS = { done: ["สำเร็จ", "on"], stopped: ["ถูกสั่งหยุด", "warn"], error: ["ผิดพลาด", ""] };
  let rows = [];

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

    if (!rows.length) {
      $("#rows").innerHTML = '<div class="empty">ไม่มีประวัติการทำงานในช่วงเวลานี้</div>';
      return;
    }
    $("#rows").innerHTML = `<table class="data">
      <thead><tr><th>วันที่</th><th>เวลา</th><th>ระยะเวลา</th><th>โซน</th><th>ที่มา</th><th class="r">น้ำ (ลิตร)</th><th class="r">ปุ๋ย (มล.)</th><th>สถานะ</th></tr></thead>
      <tbody>${rows
        .map((r) => {
          const [label, cls] = STATUS[r.status] || [r.status || "–", "soft"];
          return `<tr>
            <td style="white-space:nowrap">${XF.fmtDate(r.start * 1000, { day: "2-digit", month: "2-digit", year: "numeric" })}</td>
            <td style="white-space:nowrap">${XF.fmtTime(r.start * 1000)} – ${XF.fmtTime(r.end * 1000)}</td>
            <td style="white-space:nowrap">${XF.fmtDuration(r.end - r.start)}</td>
            <td>${esc(r.zone_name || r.zone || "–")}</td>
            <td>${esc(XF.SOURCE_LABELS[r.source] || r.source || "–")}</td>
            <td class="r">${fmt(r.water_l, 1)}</td>
            <td class="r">${fmt(r.fert_ml, 0)}${r.tank ? `<div class="small muted">${esc(r.tank_name || "ถัง " + r.tank)}</div>` : ""}</td>
            <td><span class="badge ${cls}">${esc(label)}</span>${r.note ? `<div class="small muted">${esc(r.note)}</div>` : ""}</td>
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
    const lines = [["เริ่ม", "สิ้นสุด", "ระยะเวลา (วินาที)", "โซน", "ที่มา", "น้ำ (ลิตร)", "ปุ๋ย (มล.)", "ถังปุ๋ย", "สถานะ", "หมายเหตุ"].map(cell).join(",")];
    rows.forEach((r) =>
      lines.push(
        [stamp(r.start), stamp(r.end), Math.round(r.end - r.start), r.zone_name || r.zone, XF.SOURCE_LABELS[r.source] || r.source, r.water_l, r.fert_ml, r.tank_name || "", (STATUS[r.status] || [r.status])[0], r.note]
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

  load();
  // งานใหม่ที่เพิ่งจบจะปรากฏเองโดยไม่ต้องรีเฟรชหน้า
  setInterval(() => $("#rangeTabs .active").dataset.days !== "0" && load(), 60000);
});
