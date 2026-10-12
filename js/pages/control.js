// หน้าควบคุม: โหมด Auto/Manual, กำหนดน้ำ/ปุ๋ยและเลือกถังของแต่ละโซนแล้วสั่งงานได้ทันที, สวิตช์รีเลย์ 7 ตัว
XF.boot("control", function () {
  const { store, $, $$, esc, fmt, num } = XF;
  const controlPath = XF.root + "/down/control";
  const ZONE_FIELDS = ["water_per_tree_l", "fert_per_tree_ml", "tank", "fert_enabled"];
  let down = {};
  let up = {};
  let online = false;
  // ค่าที่ผู้ใช้แก้บนหน้านี้แต่ยังไม่ได้บันทึก: { zoneId: { water_per_tree_l, fert_per_tree_ml, tank, fert_enabled } }
  const drafts = {};
  let zonesKey = "";

  const mode = () => (down.control || {}).mode || "auto";
  const running = () => !!(up.job || {}).running;
  const allRelaysOff = () => Object.fromEntries(XF.RELAYS.map((r) => [r.key, false]));
  const tankInfo = (i) => ((down.settings || {}).tanks || {})["t" + i] || {};
  const tankName = (i) => tankInfo(i).name || "ถัง " + i;
  // โซนตามที่เห็นบนจอ = ค่าที่บันทึกไว้ + ค่าที่กำลังแก้
  const zoneView = (id) => {
    const z = { ...(down.zones || {})[id], ...(drafts[id] || {}) };
    return { ...z, tank: z.tank || 1, fert_enabled: z.fert_enabled !== false };
  };

  function renderAlerts() {
    const st = up.status || {};
    const items = [];
    if (!online) items.push("อุปกรณ์ออฟไลน์ คำสั่งจะยังไม่ถูกส่งถึงตู้ควบคุมจนกว่าจะกลับมาออนไลน์");
    else if (st.stm_ok === false) items.push("ESP32 ติดต่อ STM32 ไม่ได้ รีเลย์จะไม่ทำงาน");
    else if (st.time_ok === false) items.push("ESP32 ยังไม่ได้เวลาจากอินเทอร์เน็ต ตารางเวลาจะยังไม่ทำงาน");
    $("#alerts").innerHTML = items.map((t) => `<div class="notice red" style="margin-bottom:12px">${t}</div>`).join("");
  }

  function renderMode() {
    const m = mode();
    $$("#modeSeg button").forEach((b) => b.classList.toggle("active", b.dataset.mode === m));
    $("#modeHint").textContent =
      m === "manual" ? "เปิด/ปิดอุปกรณ์เองได้ ตารางเวลาจะไม่ทำงาน" : "ทำงานตามตารางเวลา สวิตช์อุปกรณ์ถูกล็อก";
  }

  // ---------------------------------------------------------------- งานที่กำลังทำ
  function renderJob() {
    const job = up.job || {};
    const card = $("#jobCard");
    card.hidden = !job.running;
    if (!job.running) return;

    const waterPct = job.water_target_l > 0 ? Math.min(100, (job.water_done_l / job.water_target_l) * 100) : 0;
    const fertPct = job.fert_target_ml > 0 ? Math.min(100, (job.fert_done_ml / job.fert_target_ml) * 100) : 0;
    card.innerHTML = `
      <div class="row between wrap">
        <div><div class="card-title" style="margin-bottom:2px">กำลังทำงาน: ${esc(job.zone_name || job.zone)}</div>
          <div class="small muted">ขั้นตอน: ${esc(XF.STEP_LABELS[job.step] || job.step)} · ${esc(XF.SOURCE_LABELS[job.source] || job.source)}
            · เหลือประมาณ ${XF.fmtDuration(job.eta_s)}${job.queued ? ` · รอคิวอีก ${job.queued} งาน` : ""}</div></div>
        <button class="btn danger" id="stopJob">หยุดงาน</button>
      </div>
      <div style="margin-top:14px"><div class="row between small"><span>น้ำ</span><span>${fmt(job.water_done_l, 0)} / ${fmt(job.water_target_l, 0)} ลิตร</span></div>
        <div class="progress blue"><i style="width:${waterPct}%"></i></div></div>
      ${job.fert_target_ml > 0
        ? `<div style="margin-top:10px"><div class="row between small"><span>ปุ๋ย (${esc(tankName(job.tank))})</span><span>${fmt(job.fert_done_ml, 0)} / ${fmt(job.fert_target_ml, 0)} มล.</span></div>
        <div class="progress orange"><i style="width:${fertPct}%"></i></div></div>`
        : ""}`;
    $("#stopJob").addEventListener("click", () => {
      if (confirm("หยุดงานที่กำลังทำและยกเลิกคิวทั้งหมด?")) XF.run(() => XF.sendCmd({ type: "stop" }), "ส่งคำสั่งหยุดแล้ว");
    });
  }

  // ---------------------------------------------------------------- การ์ดโซน: กำหนดน้ำ/ปุ๋ย เลือกถัง แล้วสั่งงาน
  function tankPicker(zoneId, z) {
    return `<div class="tank-opts" role="radiogroup" aria-label="ถังปุ๋ย">${[1, 2, 3]
      .map((i) => {
        const t = tankInfo(i);
        const picture = t.product
          ? `<img src="${XF.productImage(t.product)}" alt="" loading="lazy">`
          : `<div class="tank-noimg">T${i}</div>`;
        return `<button type="button" class="tank-opt ${z.tank === i ? "active" : ""}" role="radio" aria-checked="${z.tank === i}"
            data-tank="${i}" data-zone="${esc(zoneId)}" ${z.fert_enabled ? "" : "disabled"}>
          ${picture}<b>${esc(tankName(i))}</b><span>${fmt(num(t.n))}-${fmt(num(t.p))}-${fmt(num(t.k))}</span></button>`;
      })
      .join("")}</div>`;
  }

  function zoneSummary(id) {
    const z = zoneView(id);
    const fertPlan = XF.zonePlan(z, down.settings, true);
    const waterPlan = XF.zonePlan(z, down.settings, false);
    return `<span>น้ำรวม <b>${fmt(fertPlan.waterL, 0)} ลิตร</b> · ประมาณ ${XF.fmtDuration(waterPlan.seconds)}</span>
      <span>${fertPlan.fertMl > 0 ? `ปุ๋ยรวม <b>${XF.fmtVolume(fertPlan.fertMl)}</b> จาก${esc(tankName(z.tank))}` : "ไม่ให้ปุ๋ย"}</span>`;
  }

  // อัปเดตเฉพาะส่วนที่เปลี่ยนตามค่าที่พิมพ์ โดยไม่สร้างการ์ดใหม่ (ช่องที่กำลังพิมพ์จึงไม่หลุดโฟกัส)
  function refreshZone(id) {
    const card = $(`.zone-card[data-zone="${CSS.escape(id)}"]`);
    if (!card) return;
    const z = zoneView(id);
    const plan = XF.zonePlan(z, down.settings, true);
    $(".zone-summary", card).innerHTML = zoneSummary(id);
    $("[data-save]", card).hidden = !drafts[id];
    $('[data-run][data-fert="1"]', card).disabled = plan.fertMl <= 0;
    $('[data-run][data-fert="0"]', card).disabled = plan.waterL <= 0;
    $('[data-field="fert_per_tree_ml"]', card).disabled = !z.fert_enabled;
    $$(".tank-opt", card).forEach((b) => {
      const active = +b.dataset.tank === z.tank;
      b.classList.toggle("active", active);
      b.setAttribute("aria-checked", active);
      b.disabled = !z.fert_enabled;
    });
  }

  function setDraft(id, field, value) {
    const saved = (down.zones || {})[id] || {};
    const draft = { ...(drafts[id] || {}), [field]: value };
    // ค่าที่กลับไปเท่ากับที่บันทึกไว้ ไม่ถือว่าเป็นการแก้ไข
    const same = (f) => (f === "fert_enabled" ? (saved[f] !== false) === draft[f] : num(saved[f], f === "tank" ? 1 : 0) === draft[f]);
    Object.keys(draft).forEach((f) => same(f) && delete draft[f]);
    if (Object.keys(draft).length) drafts[id] = draft;
    else delete drafts[id];
    refreshZone(id);
  }

  async function saveZone(id) {
    if (!drafts[id]) return true;
    const z = zoneView(id);
    const updates = {};
    ZONE_FIELDS.forEach((f) => (updates[`${id}/${f}`] = z[f]));
    const ok = await XF.run(() => store.update(XF.root + "/down/zones", updates));
    if (ok) {
      // ตัวฟังข้อมูลทำงานก่อนบรรทัดนี้ (ตอนที่ยังมีค่าแก้ค้างอยู่) จึงต้องอัปเดตการ์ดอีกครั้งหลังล้างค่า
      delete drafts[id];
      refreshZone(id);
    }
    return ok;
  }

  function renderZones() {
    const zones = XF.sortedZones(down.zones);
    const box = $("#zoneCards");
    if (!zones.length) {
      box.innerHTML = '<div class="card empty">ยังไม่มีโซน เพิ่มได้ที่หน้า <a href="settings.html#zones">ตั้งค่า &gt; โซน</a></div>';
      return;
    }
    box.innerHTML = zones
      .map((saved) => {
        const z = zoneView(saved.id);
        return `<div class="card zone-card" data-zone="${esc(saved.id)}">
          <div class="row between">
            <div><div class="card-title" style="margin:0">${esc(z.name)}</div><div class="small muted">${fmt(z.trees)} ต้น</div></div>
            <label class="row small" style="gap:8px">ให้ปุ๋ย
              <span class="switch"><input type="checkbox" data-field="fert_enabled" ${z.fert_enabled ? "checked" : ""}><i></i></span></label>
          </div>
          <div class="form-grid" style="margin-top:12px">
            <label class="field"><span>น้ำต่อต้นต่อครั้ง (ลิตร)</span><input type="number" min="0" step="1" inputmode="decimal" data-field="water_per_tree_l" value="${num(z.water_per_tree_l)}"></label>
            <label class="field"><span>ปุ๋ยต่อต้นต่อครั้ง (มล.)</span><input type="number" min="0" step="1" inputmode="decimal" data-field="fert_per_tree_ml" value="${num(z.fert_per_tree_ml)}"></label>
          </div>
          <div class="field" style="margin-top:12px"><span>ปุ๋ยที่ใช้ (เลือกถัง)</span>${tankPicker(saved.id, z)}</div>
          <div class="zone-summary"></div>
          <div class="row wrap zone-actions">
            <button class="btn ghost sm" data-save hidden>บันทึกค่า</button>
            <span style="flex:1"></span>
            <button class="btn ghost" data-run data-fert="0">ให้น้ำ</button>
            <button class="btn" data-run data-fert="1">ให้น้ำ + ปุ๋ย</button>
          </div>
        </div>`;
      })
      .join("");

    $$(".zone-card", box).forEach((card) => {
      const id = card.dataset.zone;
      $$("[data-field]", card).forEach((input) =>
        input.addEventListener("input", () => setDraft(id, input.dataset.field, input.type === "checkbox" ? input.checked : num(input.value)))
      );
      $$(".tank-opt", card).forEach((btn) => btn.addEventListener("click", () => setDraft(id, "tank", +btn.dataset.tank)));
      $("[data-save]", card).addEventListener("click", async () => {
        if (await saveZone(id)) XF.toast("บันทึกค่าของโซนแล้ว");
      });
      $$("[data-run]", card).forEach((btn) =>
        btn.addEventListener("click", async () => {
          const withFert = btn.dataset.fert === "1";
          const z = zoneView(id);
          const plan = XF.zonePlan(z, down.settings, withFert);
          const what = withFert
            ? `ให้น้ำ ${fmt(plan.waterL, 0)} ลิตร + ปุ๋ย ${XF.fmtVolume(plan.fertMl)} จาก${tankName(plan.tank)}`
            : `ให้น้ำ ${fmt(plan.waterL, 0)} ลิตร`;
          if (!confirm(`${running() ? "เพิ่มเข้าคิว: " : "เริ่ม"}${what} ที่ ${z.name}?`)) return;
          // ค่าที่แก้บนจอถูกบันทึกเป็นค่าของโซนด้วย ตารางเวลาจึงใช้ค่าเดียวกัน
          if (!(await saveZone(id))) return;
          XF.run(
            () => XF.sendCmd({ type: "run", zone: id, water_l: plan.waterL, fert_ml: plan.fertMl, tank: plan.tank, source: "manual" }),
            "ส่งคำสั่งแล้ว"
          );
        })
      );
      refreshZone(id);
    });
  }

  // ---------------------------------------------------------------- อุปกรณ์
  function renderRelays() {
    const desired = (down.control || {}).relays || {};
    const locked = mode() !== "manual" || running();
    $("#relays").innerHTML = XF.RELAYS.map((r) => {
      const on = online && XF.relayOn(up, r);
      return `<div class="card relay-card ${on ? "on" : ""}">
        <div class="relay-ico">${r.tag}</div>
        <div class="grow"><div class="relay-name">${esc(r.name)}</div>
          <span class="badge ${on ? "on" : "soft"}">${on ? "ON" : "OFF"}</span></div>
        <label class="switch"><input type="checkbox" data-relay="${r.key}" aria-label="${esc(r.name)}" ${desired[r.key] ? "checked" : ""} ${locked ? "disabled" : ""}><i></i></label>
      </div>`;
    }).join("");
    $("#relayHint").textContent = running()
      ? "กำลังทำงานตามคำสั่ง สวิตช์ถูกล็อกจนกว่างานจะจบ"
      : mode() === "manual" ? "" : "เปลี่ยนเป็นโหมด Manual เพื่อเปิด/ปิดอุปกรณ์ทีละตัว";
    $$("[data-relay]").forEach((input) =>
      input.addEventListener("change", () => XF.run(() => store.set(`${controlPath}/relays/${input.dataset.relay}`, input.checked)))
    );
  }

  function renderFlows() {
    const s = up.sensors || {};
    $("#flows").innerHTML = [1, 2, 3]
      .map(
        (i) => `<div class="card"><div class="stat-label">${esc(tankName(i))}</div>
          <div class="num" style="font-size:1.7rem">${online ? fmt((s.flow_lpm || {})["f" + i], 2) : "–"}</div>
          <div class="small muted">ลิตร/นาที</div>
          <div class="small muted">สะสม ${XF.fmtVolume((s.flow_ml || {})["f" + i] || 0)}</div></div>`
      )
      .join("");
  }

  $$("#modeSeg button").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (btn.dataset.mode === mode()) return;
      // เปลี่ยนโหมดทุกครั้งให้เริ่มจากรีเลย์ปิดทั้งหมด
      XF.run(() => store.update(controlPath, { mode: btn.dataset.mode, relays: allRelaysOff() }));
    })
  );

  $("#allOff").addEventListener("click", () =>
    XF.run(async () => {
      await store.update(controlPath, { relays: allRelaysOff() });
      await XF.sendCmd({ type: "stop" });
    }, "สั่งหยุดและปิดอุปกรณ์ทั้งหมดแล้ว")
  );

  store.watch(XF.root + "/down", (v) => {
    down = v || {};
    // โซนที่ถูกลบไปแล้วไม่ต้องเก็บค่าที่แก้ค้างไว้
    Object.keys(drafts).forEach((id) => (down.zones || {})[id] || delete drafts[id]);
    renderMode();
    // สร้างการ์ดโซนใหม่เฉพาะเมื่อโซน/การตั้งค่าเปลี่ยน (การกดสวิตช์หรือเปลี่ยนโหมดไม่ทำให้ช่องที่กำลังพิมพ์หลุดโฟกัส)
    const key = JSON.stringify([down.zones, down.settings]);
    if (key !== zonesKey) {
      zonesKey = key;
      renderZones();
    }
    renderRelays();
    renderFlows();
  });
  XF.watchUp((v, isOnline) => {
    up = v;
    online = isOnline;
    renderAlerts();
    renderJob();
    renderRelays();
    renderFlows();
  });
});
