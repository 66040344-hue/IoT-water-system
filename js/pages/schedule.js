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

  // สรุปค่าที่ตารางนี้ใช้ (ตั้งเองหรือใช้ค่าของโซน)
  function detail(s, z) {
    const tanks = (down.settings || {}).tanks || {};
    const parts = [];
    if (XF.num(s.water_per_tree_l) > 0) parts.push(`น้ำ ${fmt(s.water_per_tree_l, 0)} ล./ต้น`);
    else if (s.end) parts.push(`${s.time}–${s.end} น.`);
    else parts.push(`น้ำ ${fmt(XF.zonePlan(z, down.settings, false).waterL, 0)} ลิตร (ค่าโซน)`);
    if (s.fert) {
      const own = s.fert_per_tree_ml != null;
      const tank = XF.num(s.tank) >= 1 ? XF.num(s.tank) : XF.zonePlan(z, down.settings, true).tank;
      const ml = own ? XF.num(s.fert_per_tree_ml) : XF.num(z.fert_per_tree_ml);
      parts.push(`ปุ๋ย ${fmt(ml, 0)} มล./ต้น · ${(tanks["t" + tank] || {}).name || "ถัง " + tank}`);
    }
    return parts.join(" · ");
  }

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
                        <span class="small muted">${esc(detail(s, z))}</span>
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

  // ช่องกรอกตัวเลขแบบมีปุ่ม − / + เหมือนหน้าควบคุม
  const stepper = (field, label, unit, value) => `<div class="field ctl-step-field"><span>${label}</span>
      <div class="ctl-stepper">
        <button type="button" data-step="-1" data-for="${field}" aria-label="ลด${label}">−</button>
        <input type="number" min="0" step="1" inputmode="decimal" data-field="${field}" value="${XF.num(value)}" aria-label="${label}">
        <em>${unit}</em>
        <button type="button" data-step="1" data-for="${field}" aria-label="เพิ่ม${label}">+</button>
      </div></div>`;

  function tankPicker(selected) {
    const tanks = (down.settings || {}).tanks || {};
    return `<div class="ctl-tanks" id="schTanks" role="radiogroup" aria-label="ถังปุ๋ย">${[1, 2, 3]
      .map((i) => {
        const t = tanks["t" + i] || {};
        const picture = t.product ? `<img src="${XF.productImage(t.product)}" alt="" loading="lazy">` : `<span class="ctl-tank-noimg">T${i}</span>`;
        return `<button type="button" class="ctl-tank ${selected === i ? "active" : ""}" role="radio" aria-checked="${selected === i}" data-tank="${i}">
          ${picture}<span class="ctl-tank-txt"><b>${esc(t.name || "ถัง " + i)}</b><small>${fmt(XF.num(t.n))}-${fmt(XF.num(t.p))}-${fmt(XF.num(t.k))}</small></span></button>`;
      })
      .join("")}</div>`;
  }

  function openEditor(id, sch) {
    const zone = (down.zones || {})[sch.zone] || {};
    const trees = XF.num(zone.trees);
    // ค่าเริ่มต้น: ตารางที่เคยตั้งไว้เอง ไม่ก็ใช้ค่าของโซนเหมือนหน้าควบคุม
    const tanks = (down.settings || {}).tanks || {};
    const tankProduct = (i) => (tanks["t" + i] || {}).product || "";
    const tankName = (i) => (tanks["t" + i] || {}).name || "ถัง " + i;
    const hasOwnWater = XF.num(sch.water_per_tree_l) > 0;
    const st = {
      fert: !!sch.fert,
      mode: !hasOwnWater && sch.end ? "time" : "amount", // amount = กำหนดปริมาณ, time = กำหนดเวลาเริ่ม-สิ้นสุด
      water: hasOwnWater ? XF.num(sch.water_per_tree_l) : XF.num(zone.water_per_tree_l),
      fertMl: sch.fert_per_tree_ml != null ? XF.num(sch.fert_per_tree_ml) : XF.num(zone.fert_per_tree_ml),
      tank: XF.num(sch.tank) >= 1 ? XF.num(sch.tank) : XF.num(zone.tank, 1) || 1,
      product: "",
      pickerOpen: false,
    };
    st.product = tankProduct(st.tank);
    // รูปแบบอยู่บนสุดตรงกลาง แล้วเรียง วัน > เวลา > วิธีกำหนดปริมาณ > ปุ๋ย
    const modal = XF.modal(`<div class="sch-form">
      <h2>${id ? "แก้ไขเวลา" : "เพิ่มเวลา"} · ${esc(zone.name || sch.zone)}</h2>
      <div class="field"><span>1. รูปแบบ</span>
        <div class="seg" id="schType"><button type="button" data-fert="0" class="${st.fert ? "" : "active"}">ให้น้ำ</button>
          <button type="button" data-fert="1" class="${st.fert ? "active" : ""}">ให้น้ำ + ปุ๋ย</button></div></div>
      <div class="field" style="margin-top:14px"><span>2. วันที่ทำงาน</span>
        <div class="row wrap" id="schDays">${XF.DAY_NAMES.map((d, i) => `<button type="button" class="chip ${(sch.days >> i) & 1 ? "active" : ""}" data-day="${i}">${d}</button>`).join("")}
          <button type="button" class="btn ghost sm" id="schEveryDay">ทุกวัน</button></div></div>
      <label class="field" style="margin-top:14px"><span>3. เวลาเริ่ม</span><input type="time" id="schTime" value="${esc(sch.time)}" required></label>
      <div class="field" style="margin-top:14px"><span>4. กำหนดการให้น้ำ</span>
        <div class="seg" id="schMode"><button type="button" data-mode="amount" class="${st.mode === "amount" ? "active" : ""}">กำหนดปริมาณ</button>
          <button type="button" data-mode="time" class="${st.mode === "time" ? "active" : ""}">กำหนดเวลาสิ้นสุด</button></div></div>
      <div class="ctl-steps" id="schAmounts">
        <div id="schWaterStep">${stepper("water", "น้ำต่อต้น", "ลิตร", st.water)}</div>
        <div id="schFertStep" class="ctl-fert">${stepper("fertMl", "ปุ๋ยต่อต้น", "มล.", st.fertMl)}</div>
        <label class="field" id="schEndWrap"><span>เวลาสิ้นสุด</span><input type="time" id="schEnd" value="${esc(sch.end || "")}"></label>
      </div>
      <p class="hint" id="schWaterHint"></p>
      <div id="schFertBox" style="margin-top:14px">
        <div class="ctl-label" style="margin-top:0">5. ปุ๋ยที่ใช้</div>
        <div class="reco" id="schProduct"></div>
        <button type="button" class="btn ghost block" id="schMoreProducts" style="margin-top:8px">เลือกสูตรปุ๋ยอื่น ๆ</button>
        <div class="pick-list" id="schPickList" style="margin-top:8px" hidden></div>
        <div class="ctl-label">จ่ายจากถังไหน</div>
        ${tankPicker(st.tank)}
        <div id="schTankNote" class="small" style="margin-top:8px"></div>
      </div>
      <p class="small muted" id="schSummary" style="margin-top:10px"></p>
      <div class="form-actions">
        ${id ? '<button class="btn danger" id="schDelete" style="margin-right:auto">ลบ</button>' : ""}
        <button class="btn ghost" data-close>ยกเลิก</button><button class="btn" id="schSave">บันทึก</button>
      </div></div>`);
    const el = modal.el;

    // คำนวณช่วงเวลา (นาที) จากเวลาเริ่ม-สิ้นสุด ข้ามเที่ยงคืนได้
    const spanMin = () => {
      const [a, b] = [$("#schTime", el).value, $("#schEnd", el).value];
      if (!/^\d{2}:\d{2}$/.test(a) || !/^\d{2}:\d{2}$/.test(b)) return 0;
      const diff = +b.slice(0, 2) * 60 + +b.slice(3) - (+a.slice(0, 2) * 60 + +a.slice(3));
      return diff > 0 ? diff : diff + 1440;
    };

    const productById = (pid) => XF.allProducts().find((p) => p.id === pid);
    const tankMatches = () => !st.product || tankProduct(st.tank) === st.product;

    function renderProduct() {
      const p = productById(st.product);
      $("#schProduct", el).innerHTML = p
        ? `<img src="${XF.productImage(p.id)}" alt=""><div><div class="small muted">ปุ๋ยที่เลือก</div><div class="reco-name">${esc(p.name)}</div>
            <div class="small muted">N-P-K ${p.n}-${p.p}-${p.k}</div></div>`
        : '<div class="small muted">ยังไม่ได้เลือกสูตรปุ๋ย (ใช้ปุ๋ยที่อยู่ในถังที่เลือกด้านล่าง)</div>';
      const list = $("#schPickList", el);
      list.hidden = !st.pickerOpen;
      $("#schMoreProducts", el).textContent = st.pickerOpen ? "ซ่อนรายการสูตรปุ๋ย" : "เลือกสูตรปุ๋ยอื่น ๆ";
      if (!st.pickerOpen) return;
      list.innerHTML = XF.allProducts()
        .map(
          (x) => `<button type="button" class="pick-row ${x.id === st.product ? "active" : ""}" data-product="${esc(x.id)}" aria-pressed="${x.id === st.product}">
            <img src="${XF.productImage(x.id)}" alt="" loading="lazy">
            <div class="pick-body"><div class="pick-name">${esc(x.name)}</div>
              <div class="small muted">N-P-K ${x.n}-${x.p}-${x.k}</div>
              <div class="small" style="margin-top:4px">${
                [1, 2, 3].filter((i) => tankProduct(i) === x.id).length
                  ? `<span style="color:var(--green-ink)">มีอยู่ใน${[1, 2, 3].filter((i) => tankProduct(i) === x.id).map((i) => esc(tankName(i))).join(", ")}</span>`
                  : '<span style="color:var(--orange-text)">ยังไม่มีในถังปุ๋ย ต้องเติมลงถังก่อนใช้</span>'
              }</div></div></button>`
        )
        .join("");
      $$(".pick-row", list).forEach((b) =>
        b.addEventListener("click", () => {
          st.product = b.dataset.product;
          // ถ้ามีถังที่ใส่สูตรนี้อยู่แล้ว ให้เลือกถังนั้นให้เลย
          const held = [1, 2, 3].filter((i) => tankProduct(i) === st.product);
          if (held.length && !held.includes(st.tank)) st.tank = held[0];
          st.pickerOpen = false;
          refresh();
        })
      );
    }

    function refresh() {
      const byTime = st.mode === "time";
      $$("#schMode button", el).forEach((b) => b.classList.toggle("active", b.dataset.mode === st.mode));
      $("#schWaterStep", el).hidden = byTime;
      $("#schEndWrap", el).hidden = !byTime;
      $("#schFertStep", el).hidden = !st.fert;
      $("#schFertBox", el).hidden = !st.fert;
      $("#schAmounts", el).style.gridTemplateColumns = st.fert && !byTime ? "" : "minmax(0, 1fr)";
      $("#schWaterHint", el).textContent = byTime
        ? "ให้น้ำตั้งแต่เวลาเริ่มจนถึงเวลาสิ้นสุด ไม่ใช้ปริมาณน้ำต่อต้น"
        : "";
      renderProduct();
      $$("#schTanks .ctl-tank", el).forEach((b) => {
        const active = +b.dataset.tank === st.tank;
        b.classList.toggle("active", active);
        b.setAttribute("aria-checked", active);
      });
      $("#schTankNote", el).innerHTML =
        st.product && !tankMatches()
          ? `<div class="notice">ระบบจะเปลี่ยนสูตรของ${esc(tankName(st.tank))} เป็น <b>${esc((productById(st.product) || {}).name || "")}</b> ให้ อย่าลืมเติมปุ๋ยสูตรนี้ลงถังจริงก่อนถึงเวลา</div>`
          : "";
      const parts = [];
      if (byTime) {
        const m = spanMin();
        parts.push(m ? `น้ำ ${fmt(m, 0)} นาที (${fmt((XF.zoneFlowLpm(zone, down.settings) * m), 0)} ลิตร โดยประมาณ)` : "เลือกเวลาสิ้นสุด");
      } else parts.push(`น้ำ ${fmt(st.water, 0)} × ${fmt(trees)} ต้น = ${fmt(st.water * trees, 0)} ลิตร`);
      if (st.fert && st.fertMl > 0) parts.push(`ปุ๋ย ${fmt(st.fertMl, 0)} × ${fmt(trees)} ต้น = ${XF.fmtVolume(st.fertMl * trees)}`);
      $("#schSummary", el).textContent = parts.join(" · ");
    }

    $$("[data-field]", el).forEach((input) =>
      input.addEventListener("input", () => {
        st[input.dataset.field] = Math.max(0, XF.num(input.value));
        refresh();
      })
    );
    $$("[data-step]", el).forEach((btn) =>
      btn.addEventListener("click", () => {
        const input = $(`[data-field="${btn.dataset.for}"]`, el);
        const next = Math.max(0, XF.num(input.value) + +btn.dataset.step);
        input.value = next;
        st[btn.dataset.for] = next;
        refresh();
      })
    );
    $$("#schTanks .ctl-tank", el).forEach((b) =>
      b.addEventListener("click", () => {
        st.tank = +b.dataset.tank;
        // ถังที่ใส่ปุ๋ยไว้แล้ว: ใช้สูตรของถังนั้น ถังว่างคงสูตรที่เลือกไว้
        if (tankProduct(st.tank)) st.product = tankProduct(st.tank);
        refresh();
      })
    );
    $$("#schMode button", el).forEach((b) =>
      b.addEventListener("click", () => {
        st.mode = b.dataset.mode;
        refresh();
      })
    );
    $("#schMoreProducts", el).addEventListener("click", () => {
      st.pickerOpen = !st.pickerOpen;
      refresh();
    });
    $("#schTime", el).addEventListener("input", refresh);
    $("#schEnd", el).addEventListener("input", refresh);
    $$("#schDays .chip", el).forEach((c) => c.addEventListener("click", () => c.classList.toggle("active")));
    $("#schEveryDay", el).addEventListener("click", () => $$("#schDays .chip", el).forEach((c) => c.classList.add("active")));
    $$("#schType button", el).forEach((b) =>
      b.addEventListener("click", () => {
        $$("#schType button", el).forEach((x) => x.classList.toggle("active", x === b));
        st.fert = b.dataset.fert === "1";
        refresh();
      })
    );
    refresh();

    $("#schSave", el).addEventListener("click", async () => {
      const time = $("#schTime", el).value;
      const end = $("#schEnd", el).value;
      const days = $$("#schDays .chip.active", el).reduce((mask, c) => mask | (1 << +c.dataset.day), 0);
      if (!/^\d{2}:\d{2}$/.test(time)) return XF.toast("กรุณาเลือกเวลา", true);
      if (!days) return XF.toast("กรุณาเลือกอย่างน้อย 1 วัน", true);
      const data = { zone: sch.zone, time, days, fert: st.fert, enabled: sch.enabled !== false };
      if (st.mode === "amount") {
        if (st.water <= 0) return XF.toast("กรุณากำหนดน้ำต่อต้น หรือเลือกกำหนดเวลาสิ้นสุด", true);
        data.water_per_tree_l = st.water;
      } else {
        if (!/^\d{2}:\d{2}$/.test(end)) return XF.toast("กรุณาเลือกเวลาสิ้นสุด", true);
        if (end === time) return XF.toast("เวลาสิ้นสุดต้องไม่ตรงกับเวลาเริ่ม", true);
        data.end = end;
      }
      let tankUpdate = null;
      const prevTankProduct = tankProduct(st.tank);
      if (st.fert) {
        if (st.fertMl <= 0) return XF.toast("กรุณากำหนดปุ๋ยต่อต้น", true);
        data.fert_per_tree_ml = st.fertMl;
        data.tank = st.tank;
        const p = productById(st.product);
        // สูตรที่เลือกยังไม่อยู่ในถังนี้ ตั้งให้ถังเหมือนที่หน้าคำนวณทำ
        if (p && !tankMatches()) tankUpdate = { name: tankName(st.tank), product: p.id, n: p.n, p: p.p, k: p.k };
      }
      const ok = await XF.run(async () => {
        if (tankUpdate) {
          await store.set(`${XF.root}/down/settings/tanks/t${st.tank}`, tankUpdate);
          // บันทึกทันทีที่ถังเปลี่ยนสำเร็จ แม้บันทึกตารางเวลาด้านล่างจะไม่สำเร็จ ประวัติจะได้ตรงกับค่าในถังจริง
          await XF.logTankProduct(st.tank, prevTankProduct, tankUpdate.product);
        }
        return id ? store.set(`${path}/${id}`, data) : store.push(path, data);
      }, "บันทึกแล้ว");
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
  XF.watchProducts(() => render()); // รูปสูตรปุ๋ยของผู้ใช้มาทีหลังข้อมูลโซน
});
