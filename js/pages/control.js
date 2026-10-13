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
    $$("#modeSeg button").forEach((b) => {
      const active = b.dataset.mode === m;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", active);
    });
    $("#modeHint").textContent =
      m === "manual" ? "เปิด/ปิดอุปกรณ์เองได้ ตารางเวลาจะไม่ทำงาน" : "ทำงานตามตารางเวลา สวิตช์อุปกรณ์ถูกล็อก";
    renderState();
  }

  // สถานะรวมบนแถบสั่งการ: ออฟไลน์ / กำลังทำงาน / ว่าง
  function renderState() {
    const el = $("#ctlState");
    const [cls, text] = !online ? ["off", "ออฟไลน์"] : running() ? ["run", "กำลังทำงาน"] : ["idle", "พร้อม"];
    el.className = "ctl-state " + cls;
    el.textContent = text;
  }

  // ---------------------------------------------------------------- งานที่กำลังทำ
  function renderJob() {
    const job = up.job || {};
    const card = $("#jobCard");
    card.hidden = !job.running;
    renderState();
    if (!job.running) return;

    const waterPct = job.water_target_l > 0 ? Math.min(100, (job.water_done_l / job.water_target_l) * 100) : 0;
    const fertPct = job.fert_target_ml > 0 ? Math.min(100, (job.fert_done_ml / job.fert_target_ml) * 100) : 0;
    card.innerHTML = `
      <div class="row between wrap">
        <div><div class="job-kicker">กำลังทำงาน</div>
          <div class="job-zone">${esc(job.zone_name || job.zone)}</div>
          <div class="small muted">${esc(XF.STEP_LABELS[job.step] || job.step)} · ${esc(XF.SOURCE_LABELS[job.source] || job.source)}
            · เหลือประมาณ <b>${XF.fmtDuration(job.eta_s)}</b>${job.queued ? ` · รอคิวอีก ${job.queued} งาน` : ""}</div></div>
        <button class="btn danger" id="stopJob">หยุดงานนี้</button>
      </div>
      <div class="job-bars">
        <div><div class="row between small"><span>น้ำ</span><span><b>${fmt(job.water_done_l, 0)}</b> / ${fmt(job.water_target_l, 0)} ลิตร</span></div>
          <div class="progress blue"><i style="width:${waterPct}%"></i></div></div>
        ${job.fert_target_ml > 0
          ? `<div><div class="row between small"><span>ปุ๋ย (${esc(tankName(job.tank))})</span><span><b>${fmt(job.fert_done_ml, 0)}</b> / ${fmt(job.fert_target_ml, 0)} มล.</span></div>
          <div class="progress orange"><i style="width:${fertPct}%"></i></div></div>`
          : ""}
      </div>`;
    $("#stopJob").addEventListener("click", () => {
      if (confirm("หยุดงานที่กำลังทำและยกเลิกคิวทั้งหมด?")) XF.run(() => XF.sendCmd({ type: "stop" }), "ส่งคำสั่งหยุดแล้ว");
    });
  }

  // ---------------------------------------------------------------- มอนิเตอร์น้ำและปุ๋ยสด
  let today = null; // { water, fert, n } รวมของวันนี้จากประวัติ
  async function loadToday() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const rows = await store.range(XF.root + "/history", "start", start.getTime() / 1000, Date.now() / 1000 + 60).catch(() => []);
    today = { water: rows.reduce((s, r) => s + num(r.water_l), 0), fert: rows.reduce((s, r) => s + num(r.fert_ml), 0), n: rows.length };
    renderMonitor();
  }

  function renderMonitor() {
    const lf = XF.liveFlow(up, down.zones, down.settings, online);
    const job = up.job || {};
    const dash = (v, d) => (online ? v : "–");
    const perTank = lf.tanks
      .map((v, i) => (v > 0.005 ? `${esc(tankName(i + 1))} ${fmt(v, 2)}` : ""))
      .filter(Boolean)
      .join(" · ");
    const waterText = !online ? "–" : lf.pumpOn ? fmt(lf.waterLpm, 0) : "0";
    $("#liveMon").innerHTML = `
      <div class="row between">
        <h2 class="card-title" style="margin:0">มอนิเตอร์น้ำและปุ๋ย</h2>
        <span class="badge ${online ? (running() ? "warn" : "on") : "soft"}">${!online ? "ออฟไลน์" : running() ? "กำลังทำงาน" : "ว่าง"}</span>
      </div>
      <div class="mon-grid">
        <div class="mon water"><div class="stat-label">น้ำที่จ่าย (ประมาณ)</div>
          <div class="num">${waterText}<small>ล./นาที</small></div>
          <div class="small muted">คำนวณจากอัตราปั๊ม ไม่มี flow meter น้ำ</div></div>
        <div class="mon fert"><div class="stat-label">ปุ๋ยที่จ่าย (วัดจริง)</div>
          <div class="num">${dash(fmt(lf.fertLpm, 2))}<small>ล./นาที</small></div>
          <div class="small muted">${perTank || "ไม่มีปุ๋ยไหลขณะนี้"}</div></div>
        <div class="mon"><div class="stat-label">สัดส่วนผสม</div>
          <div class="num">${online && lf.mlPerL > 0 ? fmt(lf.mlPerL, 1) : "–"}<small>มล./ลิตร</small></div>
          <div class="small muted">ปุ๋ยต่อน้ำ 1 ลิตรขณะนี้</div></div>
      </div>
      ${job.running ? `<div class="mon-job small">งานนี้ <b>${esc(job.zone_name || job.zone)}</b> · น้ำ <b>${fmt(job.water_done_l, 0)}</b>/${fmt(job.water_target_l, 0)} ลิตร${
        job.fert_target_ml > 0 ? ` · ปุ๋ย <b>${fmt(job.fert_done_ml, 0)}</b>/${fmt(job.fert_target_ml, 0)} มล.` : ""
      }</div>` : ""}
      <div class="mon-today small muted">${today ? `วันนี้รวม น้ำ <b>${fmt(today.water, 0)}</b> ลิตร · ปุ๋ย <b>${XF.fmtVolume(today.fert)}</b> · ${fmt(today.n)} ครั้ง` : "กำลังรวมยอดวันนี้…"}</div>`;
  }
  // ---------------------------------------------------------------- การ์ดโซน: กำหนดน้ำ/ปุ๋ย เลือกถัง แล้วสั่งงาน
  function tankPicker(zoneId, z) {
    return `<div class="ctl-tanks" role="radiogroup" aria-label="ถังปุ๋ย">${[1, 2, 3]
      .map((i) => {
        const t = tankInfo(i);
        const picture = t.product
          ? `<img src="${XF.productImage(t.product)}" alt="" loading="lazy">`
          : `<span class="ctl-tank-noimg">T${i}</span>`;
        return `<button type="button" class="ctl-tank ${z.tank === i ? "active" : ""}" role="radio" aria-checked="${z.tank === i}"
            data-tank="${i}" data-zone="${esc(zoneId)}" ${z.fert_enabled ? "" : "disabled"}>
          ${picture}<span class="ctl-tank-txt"><b>${esc(tankName(i))}</b><small>${fmt(num(t.n))}-${fmt(num(t.p))}-${fmt(num(t.k))}</small></span></button>`;
      })
      .join("")}</div>`;
  }

  // ช่องกรอกตัวเลขแบบมีปุ่ม − / + (กดง่ายบนมือถือ)
  function stepper(field, label, unit, value) {
    return `<div class="field ctl-step-field"><span>${label}</span>
      <div class="ctl-stepper">
        <button type="button" data-step="-1" data-for="${field}" aria-label="ลด${label}">−</button>
        <input type="number" min="0" step="1" inputmode="decimal" data-field="${field}" value="${num(value)}" aria-label="${label}">
        <em>${unit}</em>
        <button type="button" data-step="1" data-for="${field}" aria-label="เพิ่ม${label}">+</button>
      </div></div>`;
  }

  // สรุปผลลัพธ์รวมของโซน เป็นตัวเลขใหญ่ 3 ช่อง
  function zoneSummary(id) {
    const z = zoneView(id);
    const fertPlan = XF.zonePlan(z, down.settings, true);
    const waterPlan = XF.zonePlan(z, down.settings, false);
    return `<div><small>น้ำรวม</small><b>${fmt(fertPlan.waterL, 0)}</b><em>ลิตร</em></div>
      <div><small>ใช้เวลา</small><b>${XF.fmtDuration(waterPlan.seconds)}</b></div>
      <div><small>${fertPlan.fertMl > 0 ? "ปุ๋ยรวม · " + esc(tankName(z.tank)) : "ปุ๋ย"}</small>${
        fertPlan.fertMl > 0 ? `<b>${XF.fmtVolume(fertPlan.fertMl)}</b>` : `<b class="muted">ไม่ให้</b>`
      }</div>
      <p class="zone-formula">ค่าที่กรอกเป็นต่อต้น แล้วคูณจำนวนต้นของโซน (${fmt(z.trees)} ต้น):
        น้ำ ${fmt(z.water_per_tree_l, 0)} × ${fmt(z.trees)} = <b>${fmt(fertPlan.waterL, 0)} ลิตร</b>${
          fertPlan.fertMl > 0 ? ` · ปุ๋ย ${fmt(z.fert_per_tree_ml, 0)} × ${fmt(z.trees)} = <b>${XF.fmtVolume(fertPlan.fertMl)}</b>` : ""
        }</p>`;
  }

  // อัปเดตเฉพาะส่วนที่เปลี่ยนตามค่าที่พิมพ์ โดยไม่สร้างการ์ดใหม่ (ช่องที่กำลังพิมพ์จึงไม่หลุดโฟกัส)
  function refreshZone(id) {
    const card = $(`.zone-card[data-zone="${CSS.escape(id)}"]`);
    if (!card) return;
    const z = zoneView(id);
    const plan = XF.zonePlan(z, down.settings, true);
    $(".zone-summary", card).innerHTML = zoneSummary(id);
    $(".ctl-draft", card).hidden = !drafts[id];
    $('[data-run][data-fert="1"]', card).disabled = plan.fertMl <= 0;
    $('[data-run][data-fert="0"]', card).disabled = plan.waterL <= 0;
    $$(".ctl-fert", card).forEach((el) => el.classList.toggle("off", !z.fert_enabled));
    $$('[data-field="fert_per_tree_ml"], [data-for="fert_per_tree_ml"]', card).forEach((el) => (el.disabled = !z.fert_enabled));
    $$(".ctl-tank", card).forEach((b) => {
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
        return `<article class="card zone-card" data-zone="${esc(saved.id)}">
          <header class="ctl-zone-head">
            <div><h3>${esc(z.name)}</h3><div class="small muted">${fmt(z.trees)} ต้น</div></div>
            <label class="ctl-fert-toggle">ให้ปุ๋ย
              <span class="switch"><input type="checkbox" data-field="fert_enabled" ${z.fert_enabled ? "checked" : ""}><i></i></span></label>
          </header>
          <div class="ctl-steps">
            ${stepper("water_per_tree_l", "น้ำต่อต้น", "ลิตร", z.water_per_tree_l)}
            <div class="ctl-fert">${stepper("fert_per_tree_ml", "ปุ๋ยต่อต้น", "มล.", z.fert_per_tree_ml)}</div>
          </div>
          <div class="ctl-fert">
            <div class="ctl-label">ถังปุ๋ยที่ใช้</div>
            ${tankPicker(saved.id, z)}
          </div>
          <div class="zone-summary"></div>
          <div class="ctl-draft" hidden>
            <span>มีค่าที่ยังไม่บันทึก</span>
            <button class="btn ghost sm" data-save>บันทึกค่า</button>
          </div>
          <div class="ctl-actions">
            <button class="btn act-water" data-run data-fert="0">${XF.icon("drop")}<span>น้ำอย่างเดียว</span></button>
            <button class="btn act-fert" data-run data-fert="1">${XF.icon("drop")}${XF.icon("leaf")}<span>น้ำ + ปุ๋ย</span></button>
          </div>
        </article>`;
      })
      .join("");

    $$(".zone-card", box).forEach((card) => {
      const id = card.dataset.zone;
      $$("[data-field]", card).forEach((input) =>
        input.addEventListener("input", () => setDraft(id, input.dataset.field, input.type === "checkbox" ? input.checked : num(input.value)))
      );
      $$("[data-step]", card).forEach((btn) =>
        btn.addEventListener("click", () => {
          const input = $(`[data-field="${btn.dataset.for}"]`, card);
          const next = Math.max(0, num(input.value) + +btn.dataset.step);
          input.value = next;
          setDraft(id, btn.dataset.for, next);
        })
      );
      $$(".ctl-tank", card).forEach((btn) => btn.addEventListener("click", () => setDraft(id, "tank", +btn.dataset.tank)));
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
    const onCount = XF.RELAYS.filter((r) => online && XF.relayOn(up, r)).length;
    $("#relayBadge").textContent = `เปิดอยู่ ${onCount}/${XF.RELAYS.length}`;
    $("#relayBadge").className = "badge " + (onCount ? "on" : "soft");
    $("#relays").innerHTML = XF.RELAYS.map((r) => {
      const on = online && XF.relayOn(up, r);
      return `<div class="ctl-relay ${on ? "on" : ""} ${locked ? "locked" : ""}">
        <span class="ctl-relay-tag">${r.tag}</span>
        <span class="ctl-relay-name">${esc(r.name)}</span>
        <span class="ctl-relay-state">${on ? "ON" : "OFF"}</span>
        <label class="switch"><input type="checkbox" data-relay="${r.key}" aria-label="${esc(r.name)}" ${desired[r.key] ? "checked" : ""} ${locked ? "disabled" : ""}><i></i></label>
      </div>`;
    }).join("");
    $("#relayHint").textContent = running()
      ? "🔒 กำลังทำงานตามคำสั่ง สวิตช์ถูกล็อกจนกว่างานจะจบ"
      : mode() === "manual" ? "เปิด/ปิดทีละตัวได้ ระวังอย่าให้ปั๊มเดินโดยไม่มีน้ำ" : "🔒 เปลี่ยนเป็นโหมด Manual เพื่อเปิด/ปิดอุปกรณ์ทีละตัว";
    $$("[data-relay]").forEach((input) =>
      input.addEventListener("change", () =>
        XF.run(async () => {
          await store.set(`${controlPath}/relays/${input.dataset.relay}`, input.checked);
          XF.logAction("relay", { relay: input.dataset.relay, on: input.checked });
        })
      )
    );
  }

  function renderFlows() {
    const s = up.sensors || {};
    $("#flows").innerHTML = [1, 2, 3]
      .map(
        (i) => `<div class="ctl-flow"><div class="stat-label">${esc(tankName(i))}</div>
          <div class="num">${online ? fmt((s.flow_lpm || {})["f" + i], 2) : "–"}</div>
          <div class="small muted">ลิตร/นาที</div>
          <div class="small muted">สะสม ${XF.fmtVolume((s.flow_ml || {})["f" + i] || 0)}</div></div>`
      )
      .join("");
  }

  $$("#modeSeg button").forEach((btn) =>
    btn.addEventListener("click", () => {
      if (btn.dataset.mode === mode()) return;
      // เปลี่ยนโหมดทุกครั้งให้เริ่มจากรีเลย์ปิดทั้งหมด
      XF.run(async () => {
        await store.update(controlPath, { mode: btn.dataset.mode, relays: allRelaysOff() });
        XF.logAction("mode", { mode: btn.dataset.mode });
      });
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
    renderMonitor();
  });
  XF.watchProducts(() => zonesKey && renderZones()); // รูปสูตรปุ๋ยของผู้ใช้มาทีหลังข้อมูลโซน
  let wasRunning = null;
  XF.watchUp((v, isOnline) => {
    up = v;
    online = isOnline;
    renderAlerts();
    renderState();
    renderJob();
    renderRelays();
    renderFlows();
    renderMonitor();
    // งานจบ: รวมยอดวันนี้ใหม่ (ประวัติถูกเขียนหลังจบงานเล็กน้อย)
    if (wasRunning === true && !running()) setTimeout(loadToday, 3000);
    wasRunning = running();
  });
  loadToday();
});
