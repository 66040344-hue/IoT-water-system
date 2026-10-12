// หน้าตั้งเวลา: รายการเวลาแยกตามโซน เก็บที่ down/schedules/<id> = { zone, time "HH:MM", days (bitmask อา=bit0), fert, enabled }
XF.boot("schedule", function () {
  const { store, $, $$, esc, fmt } = XF;
  const MAX_SCHEDULES = 32; // ตรงกับ MAX_SCHEDULES ในเฟิร์มแวร์ ESP32
  const ALL_DAYS = 127;
  const path = XF.root + "/down/schedules";
  let down = {};

  const dayChips = (mask) =>
    mask === ALL_DAYS
      ? '<span class="chip static active" style="min-width:52px">ทุกวัน</span>'
      : XF.DAY_NAMES.map((d, i) => `<span class="chip static ${(mask >> i) & 1 ? "active" : ""}">${d}</span>`).join("");

  function render() {
    const zones = XF.sortedZones(down.zones);
    const schedules = down.schedules || {};
    const tanks = (down.settings || {}).tanks || {};
    const count = Object.keys(schedules).length;

    $("#alerts").innerHTML =
      (down.control || {}).mode === "manual"
        ? '<div class="notice" style="margin-bottom:12px">ขณะนี้อยู่ในโหมด Manual ตารางเวลาจะไม่ทำงานจนกว่าจะเปลี่ยนเป็น Auto ที่หน้า <a href="control.html">ควบคุม</a></div>'
        : "";

    if (!zones.length) {
      $("#zones").innerHTML = '<div class="card empty">ยังไม่มีโซน เพิ่มได้ที่หน้า <a href="settings.html#zones">ตั้งค่า &gt; โซน</a></div>';
      return;
    }

    $("#zones").innerHTML = zones
      .map((z) => {
        const items = Object.keys(schedules)
          .filter((id) => schedules[id].zone === z.id)
          .sort((a, b) => String(schedules[a].time).localeCompare(schedules[b].time));
        const waterPlan = XF.zonePlan(z, down.settings, false);
        const fertPlan = XF.zonePlan(z, down.settings, true);
        const tankName = (tanks["t" + fertPlan.tank] || {}).name || "ถัง " + fertPlan.tank;
        return `<div class="card">
          <div class="row between wrap">
            <div><div class="card-title" style="margin-bottom:2px">${esc(z.name)}</div>
              <div class="small muted">${fmt(z.trees)} ต้น · น้ำ ${fmt(waterPlan.waterL, 0)} ลิตร/ครั้ง (~${XF.fmtDuration(waterPlan.seconds)})
              ${fertPlan.fertMl > 0 ? ` · ปุ๋ย ${XF.fmtVolume(fertPlan.fertMl)}/ครั้ง จาก${esc(tankName)}` : ""}</div></div>
            <button class="btn sm" data-add="${esc(z.id)}" ${count >= MAX_SCHEDULES ? "disabled" : ""}>+ เพิ่มเวลา</button>
          </div>
          <div class="list" style="margin-top:6px">${
            items.length
              ? items
                  .map((id) => {
                    const s = schedules[id];
                    return `<div class="list-item" style="flex-wrap:wrap">
                      <div class="num" style="font-size:1.7rem;min-width:84px">${esc(s.time)}</div>
                      <div class="grow"><span class="badge ${s.fert ? "warn" : "on"}" style="${s.fert ? "" : "background:var(--blue)"}">${s.fert ? "น้ำ + ปุ๋ย" : "ให้น้ำ"}</span>
                        <div class="row wrap" style="gap:4px;margin-top:6px">${dayChips(s.days)}</div></div>
                      <label class="switch"><input type="checkbox" data-toggle="${esc(id)}" aria-label="เปิดใช้งาน" ${s.enabled ? "checked" : ""}><i></i></label>
                      <button class="btn ghost sm" data-edit="${esc(id)}">แก้ไข</button>
                    </div>`;
                  })
                  .join("")
              : '<div class="empty">ยังไม่ได้ตั้งเวลาให้โซนนี้</div>'
          }</div></div>`;
      })
      .join("");

    $$("[data-add]").forEach((b) => b.addEventListener("click", () => openEditor(null, { zone: b.dataset.add, time: "06:00", days: ALL_DAYS, fert: false, enabled: true })));
    $$("[data-edit]").forEach((b) => b.addEventListener("click", () => openEditor(b.dataset.edit, schedules[b.dataset.edit])));
    $$("[data-toggle]").forEach((input) =>
      input.addEventListener("change", () => XF.run(() => store.set(`${path}/${input.dataset.toggle}/enabled`, input.checked)))
    );
  }

  function openEditor(id, sch) {
    const zone = (down.zones || {})[sch.zone] || {};
    const canFert = zone.fert_enabled !== false && XF.num(zone.fert_per_tree_ml) > 0;
    const modal = XF.modal(`
      <h2>${id ? "แก้ไขเวลา" : "เพิ่มเวลา"} · ${esc(zone.name || sch.zone)}</h2>
      <label class="field"><span>เวลาเริ่ม</span><input type="time" id="schTime" value="${esc(sch.time)}" required></label>
      <div class="field" style="margin-top:12px"><span>วันที่ทำงาน</span>
        <div class="row wrap" id="schDays">${XF.DAY_NAMES.map((d, i) => `<button type="button" class="chip ${(sch.days >> i) & 1 ? "active" : ""}" data-day="${i}">${d}</button>`).join("")}
          <button type="button" class="btn ghost sm" id="schEveryDay">ทุกวัน</button></div></div>
      <div class="field" style="margin-top:12px"><span>รูปแบบ</span>
        <div class="seg" id="schType"><button type="button" data-fert="0" class="${sch.fert ? "" : "active"}">ให้น้ำ</button>
          <button type="button" data-fert="1" class="${sch.fert ? "active" : ""}" ${canFert ? "" : "disabled"}>ให้น้ำ + ปุ๋ย</button></div>
        ${canFert ? "" : '<span class="hint">โซนนี้ยังไม่ได้กำหนดปริมาณปุ๋ย จึงเลือกให้ปุ๋ยไม่ได้</span>'}</div>
      <div class="form-actions">
        ${id ? '<button class="btn danger" id="schDelete" style="margin-right:auto">ลบ</button>' : ""}
        <button class="btn ghost" data-close>ยกเลิก</button><button class="btn" id="schSave">บันทึก</button>
      </div>`);
    const el = modal.el;

    $$("#schDays .chip", el).forEach((c) => c.addEventListener("click", () => c.classList.toggle("active")));
    $("#schEveryDay", el).addEventListener("click", () => $$("#schDays .chip", el).forEach((c) => c.classList.add("active")));
    $$("#schType button", el).forEach((b) =>
      b.addEventListener("click", () => $$("#schType button", el).forEach((x) => x.classList.toggle("active", x === b)))
    );

    $("#schSave", el).addEventListener("click", async () => {
      const time = $("#schTime", el).value;
      const days = $$("#schDays .chip.active", el).reduce((mask, c) => mask | (1 << +c.dataset.day), 0);
      if (!/^\d{2}:\d{2}$/.test(time)) return XF.toast("กรุณาเลือกเวลา", true);
      if (!days) return XF.toast("กรุณาเลือกอย่างน้อย 1 วัน", true);
      const data = { zone: sch.zone, time, days, fert: $("#schType .active", el).dataset.fert === "1", enabled: sch.enabled !== false };
      const ok = await XF.run(() => (id ? store.set(`${path}/${id}`, data) : store.push(path, data)), "บันทึกแล้ว");
      if (ok) modal.close();
    });

    if (id) {
      $("#schDelete", el).addEventListener("click", async () => {
        if (confirm("ลบเวลานี้?") && (await XF.run(() => store.remove(`${path}/${id}`), "ลบแล้ว"))) modal.close();
      });
    }
  }

  store.watch(XF.root + "/down", (v) => {
    down = v || {};
    render();
  });
});
