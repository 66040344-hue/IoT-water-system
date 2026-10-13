// หน้าตั้งค่า: บัญชีผู้ใช้, ปั๊ม, หัวสปริงเกอร์, โซน, ถังปุ๋ย, เซนเซอร์, ตำแหน่งสวน
XF.boot("settings", function () {
  const { store, $, $$, esc, fmt, num } = XF;
  const MAX_ZONES = 8; // ตรงกับ MAX_ZONES ในเฟิร์มแวร์ ESP32
  const downPath = XF.root + "/down";
  let down = {};
  let ownerUid = null;
  let farmLoaded = false;

  // ---------------------------------------------------------------- แท็บ
  function showTab(name) {
    if (!$(`[data-panel="${name}"]`)) name = "account";
    $$("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    $$("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== name));
    history.replaceState(null, "", "#" + name);
    if (name === "farm") XF.farmMap.show();
  }
  $$("#tabs button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

  // ---------------------------------------------------------------- ฟอร์มที่ผูกกับ down/... โดยตรง
  $("#rs485Fields").innerHTML = ["s1", "s2"]
    .map(
      (k, i) => `<label class="check-row" style="margin:10px 0"><input type="checkbox" data-path="settings/rs485/${k}/enabled"><span>ใช้งานเซนเซอร์ RS485 ตัวที่ ${i + 1} <span class="small muted" data-rs="${k}"></span></span></label>
      <div class="form-grid">
        <label class="field"><span>ชื่อที่แสดง</span><input data-path="settings/rs485/${k}/name"></label>
        <label class="field"><span>หน่วย</span><input data-path="settings/rs485/${k}/unit"></label>
        <label class="field"><span>Slave ID</span><input type="number" min="1" max="247" data-path="settings/rs485/${k}/slave" data-type="number"></label>
        <label class="field"><span>Function code</span><select data-path="settings/rs485/${k}/fc" data-type="number"><option value="3">03 Holding register</option><option value="4">04 Input register</option></select></label>
        <label class="field"><span>Register</span><input type="number" min="0" max="65535" data-path="settings/rs485/${k}/reg" data-type="number"></label>
        <label class="field"><span>ตัวคูณ</span><input type="number" step="any" data-path="settings/rs485/${k}/scale" data-type="number"><span class="hint">เช่น 0.1 เมื่อเซนเซอร์ส่งค่า ×10</span></label>
      </div>`
    )
    .join("");

  const downForms = $$('form[data-save="down"]');
  downForms.forEach((form) => {
    form.addEventListener("input", () => (form.dataset.dirty = "1"));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (await XF.run(() => store.update(downPath, XF.readForm(form)), "บันทึกแล้ว")) delete form.dataset.dirty;
    });
  });
  // ไม่เขียนทับสิ่งที่ผู้ใช้กำลังพิมพ์ค้างอยู่
  const fillDownForms = () => downForms.forEach((form) => form.dataset.dirty || XF.fillForm(form, down));

  // ---------------------------------------------------------------- บัญชีผู้ใช้
  function renderAccount(members) {
    $("#accName").value = XF.user.name;
    $("#accEmail").value = XF.user.email;
    $("#accRole").value = XF.isOwner ? "เจ้าของสวน" : XF.ROLE_LABELS[XF.role] || "ผู้ใช้งาน";
    $("#accDevice").value = XF.deviceId;

    // รายชื่อผู้เข้าถึงอุปกรณ์: แสดงเฉพาะเจ้าของสวนและผู้ดูแลระบบ (ผู้ใช้งานและผู้เข้าชมไม่ต้องเห็น)
    const canSeeMembers = XF.isOwner || XF.isAdmin;
    $("#membersCard").hidden = !canSeeMembers;
    if (!canSeeMembers) return;

    const list = Object.keys(members || {}).map((uid) => ({ uid, ...members[uid] }));
    list.sort((a, b) => (a.joined || 0) - (b.joined || 0));
    $("#members").innerHTML = list
      .map((m) => {
        const role = m.uid === ownerUid ? "เจ้าของสวน" : XF.ROLE_LABELS[m.role] || "ผู้ใช้งาน";
        const removable = XF.isOwner && m.uid !== XF.user.uid && m.role !== "device";
        return `<div class="list-item"><div class="grow"><b>${esc(m.name || "–")}</b><div class="small muted">${esc(m.email || "")}</div></div>
          <span class="badge ${m.uid === ownerUid ? "on" : "soft"}">${role}</span>
          ${removable ? `<button class="btn ghost sm" data-remove="${esc(m.uid)}">ลบสิทธิ์</button>` : ""}</div>`;
      })
      .join("");
    $$("[data-remove]").forEach((btn) =>
      btn.addEventListener("click", () => {
        if (confirm("ลบสิทธิ์ผู้ใช้นี้ออกจากอุปกรณ์?")) XF.run(() => store.remove(`/members/${XF.deviceId}/${btn.dataset.remove}`), "ลบสิทธิ์แล้ว");
      })
    );
  }

  $("#accSave").addEventListener("click", () => {
    const name = $("#accName").value.trim();
    if (!name) return XF.toast("กรุณากรอกชื่อ", true);
    XF.run(async () => {
      await store.setName(name);
      await store.set(`/members/${XF.deviceId}/${XF.user.uid}/name`, name);
      XF.user.name = name;
      XF.saveSession();
    }, "บันทึกชื่อแล้ว");
  });
  $("#accLogout").addEventListener("click", () => store.signOut());

  // ---------------------------------------------------------------- โซน
  function renderZones() {
    const zones = XF.sortedZones(down.zones);
    const tanks = (down.settings || {}).tanks || {};
    $("#addZone").disabled = zones.length >= MAX_ZONES;
    $("#zoneList").innerHTML = zones.length
      ? zones
          .map(
            (z) => `<div class="list-item"><div class="grow"><b>${esc(z.name)}</b>
              <div class="small muted">${fmt(z.trees)} ต้น · ${fmt(z.heads_per_tree)} หัว/ต้น · น้ำ ${fmt(z.water_per_tree_l, 0)} ลิตร/ต้น ·
              ${z.fert_enabled === false ? "ไม่ให้ปุ๋ย" : `ปุ๋ย ${fmt(z.fert_per_tree_ml, 0)} มล./ต้น จาก${esc((tanks["t" + (z.tank || 1)] || {}).name || "ถัง " + (z.tank || 1))}`}</div></div>
              <button class="btn ghost sm" data-zone="${esc(z.id)}">แก้ไข</button></div>`
          )
          .join("")
      : '<div class="empty">ยังไม่มีโซน</div>';
    $$("[data-zone]").forEach((btn) => btn.addEventListener("click", () => openZone(btn.dataset.zone)));

    $("#zoneFlows").innerHTML = zones
      .map((z) => {
        const s = down.settings || {};
        const demand = (num(z.trees) * num(z.heads_per_tree) * num((s.sprinkler || {}).lph)) / 60;
        return `<div class="list-item"><div class="grow"><b>${esc(z.name)}</b><div class="small muted">หัวสปริงเกอร์รวม ${fmt(demand, 1)} ลิตร/นาที</div></div>
          <b>${fmt(XF.zoneFlowLpm(z, s), 1)} ลิตร/นาที</b></div>`;
      })
      .join("");
    XF.farmMap.setZones(zones.map((z) => ({ id: z.id, name: z.name })));
  }

  function openZone(id) {
    const zones = XF.sortedZones(down.zones);
    const tanks = (down.settings || {}).tanks || {};
    const z = id
      ? down.zones[id]
      : { name: `โซน ${zones.length + 1}`, order: (zones.reduce((m, x) => Math.max(m, x.order || 0), 0) || 0) + 1, trees: 50, heads_per_tree: 1, water_per_tree_l: 120, fert_per_tree_ml: 50, tank: 1, fert_enabled: true };
    const modal = XF.modal(`
      <h2>${id ? "แก้ไขโซน" : "เพิ่มโซน"}</h2>
      <div class="form-grid">
        <label class="field"><span>ชื่อโซน</span><input data-path="name" maxlength="20"></label>
        <label class="field"><span>จำนวนต้น</span><input type="number" min="0" data-path="trees" data-type="number"></label>
        <label class="field"><span>หัวสปริงเกอร์ต่อต้น</span><input type="number" min="0" data-path="heads_per_tree" data-type="number"></label>
        <label class="field"><span>น้ำต่อต้นต่อครั้ง (ลิตร)</span><input type="number" min="0" step="0.1" data-path="water_per_tree_l" data-type="number"></label>
        <label class="field"><span>ปุ๋ยต่อต้นต่อครั้ง (มล.)</span><input type="number" min="0" step="0.1" data-path="fert_per_tree_ml" data-type="number"></label>
        <label class="field"><span>ถังปุ๋ย</span><select data-path="tank" data-type="number">${[1, 2, 3]
          .map((i) => `<option value="${i}">${esc((tanks["t" + i] || {}).name || "ถัง " + i)}</option>`)
          .join("")}</select></label>
      </div>
      <label class="check-row" style="margin-top:12px"><input type="checkbox" data-path="fert_enabled"><span>โซนนี้ให้ปุ๋ยทางน้ำ</span></label>
      <div class="form-actions">
        ${id ? '<button class="btn danger" id="zoneDelete" style="margin-right:auto">ลบโซน</button>' : ""}
        <button class="btn ghost" data-close>ยกเลิก</button><button class="btn" id="zoneSave">บันทึก</button>
      </div>`);
    XF.fillForm(modal.el, { ...z, fert_enabled: z.fert_enabled !== false, tank: z.tank || 1 });

    $("#zoneSave", modal.el).addEventListener("click", async () => {
      const data = { ...XF.readForm(modal.el), order: z.order || 0 };
      if (!data.name) return XF.toast("กรุณากรอกชื่อโซน", true);
      const zoneId = id || "z" + Date.now().toString(36);
      if (await XF.run(() => store.set(`${downPath}/zones/${zoneId}`, data), "บันทึกโซนแล้ว")) modal.close();
    });

    if (id) {
      $("#zoneDelete", modal.el).addEventListener("click", async () => {
        if (!confirm(`ลบ "${z.name}" พร้อมตารางเวลาและกรอบแปลงของโซนนี้?`)) return;
        const updates = { [`down/zones/${id}`]: null, [`farm/zone_polygons/${id}`]: null };
        Object.keys(down.schedules || {}).forEach((sid) => {
          if (down.schedules[sid].zone === id) updates[`down/schedules/${sid}`] = null;
        });
        if (await XF.run(() => store.update(XF.root, updates), "ลบโซนแล้ว")) modal.close();
      });
    }
  }
  $("#addZone").addEventListener("click", () => openZone(null));

  // ---------------------------------------------------------------- ถังปุ๋ย
  function renderTanks() {
    const box = $("#tankCards");
    if (box.dataset.dirty) return;
    const tanks = (down.settings || {}).tanks || {};
    box.innerHTML = [1, 2, 3]
      .map((i) => {
        const t = tanks["t" + i] || {};
        return `<form class="card" data-tank="t${i}">
          <div class="tank-pick"><img src="${t.product ? XF.productImage(t.product) : ""}" alt="" ${t.product ? "" : "hidden"}>
            <div class="card-title" style="margin:0">ถังปุ๋ย ${i} <span class="small muted">(วาล์วรีเลย์ ${i + 3}, flow meter ${i})</span></div></div>
          <input type="hidden" data-path="product">
          <div class="form-grid" style="margin-top:12px">
            <label class="field"><span>ชื่อที่แสดง</span><input data-path="name" maxlength="20" required></label>
            <label class="field"><span>N</span><input type="number" min="0" step="0.1" data-path="n" data-type="number"></label>
            <label class="field"><span>P</span><input type="number" min="0" step="0.1" data-path="p" data-type="number"></label>
            <label class="field"><span>K</span><input type="number" min="0" step="0.1" data-path="k" data-type="number"></label>
          </div>
          <div class="small muted" style="margin:12px 0 6px">เลือกสูตรปุ๋ยที่ใส่ในถังนี้ (กรอก N-P-K เองได้ถ้าใช้สูตรอื่น)</div>
          <div class="product-grid">${XF.allProducts().map(
            (p) => `<button type="button" class="product ${t.product === p.id ? "active" : ""}" data-product="${p.id}"><img src="${XF.productImage(p.id)}" alt="" loading="lazy">${esc(p.name)}</button>`
          ).join("")}</div>
          <div class="form-actions"><button class="btn">บันทึกถัง ${i}</button></div>
        </form>`;
      })
      .join("");

    $$("form[data-tank]", box).forEach((form) => {
      const key = form.dataset.tank;
      XF.fillForm(form, tanks[key] || {});
      form.addEventListener("input", () => (box.dataset.dirty = "1"));
      $$("[data-product]", form).forEach((btn) =>
        btn.addEventListener("click", () => {
          const p = XF.allProducts().find((x) => x.id === btn.dataset.product);
          XF.fillForm(form, { ...XF.readForm(form), product: p.id, n: p.n, p: p.p, k: p.k });
          $$("[data-product]", form).forEach((b) => b.classList.toggle("active", b === btn));
          const img = $("img", form);
          img.src = XF.productImage(p.id);
          img.hidden = false;
          box.dataset.dirty = "1";
        })
      );
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = XF.readForm(form);
        const prevProduct = (((down.settings || {}).tanks || {})[key] || {}).product;
        if (await XF.run(() => store.set(`${downPath}/settings/tanks/${key}`, data), "บันทึกถังปุ๋ยแล้ว")) {
          await XF.logTankProduct(+key.slice(1), prevProduct, data.product);
          delete box.dataset.dirty;
          renderTanks();
        }
      });
    });
  }

  // ---------------------------------------------------------------- สูตรปุ๋ยของฉัน (ฟอร์มเพิ่ม/แก้/ลบอยู่ใน js/products.js ใช้ร่วมกับหน้าคำนวณ)
  const canEditProducts = () => XF.isOwner || XF.isAdmin;
  const ratioText = XF.productForm.ratioText;
  const formOpts = { tanks: () => (down.settings || {}).tanks || {} };
  const openProduct = (id) => XF.productForm.open(id, formOpts);
  const deleteProduct = (id) => XF.productForm.remove(id, formOpts);
  function renderMyProducts() {
    const box = $("#myProducts");
    if (!box) return;
    const mine = XF.allProducts().filter((p) => p.custom);
    const editable = canEditProducts();
    box.innerHTML = `
      <div class="row between">
        <div class="card-title" style="margin:0">สูตรปุ๋ยของฉัน</div>
        ${editable ? '<button type="button" class="btn sm" id="addProduct">+ เพิ่มสูตรปุ๋ย</button>' : ""}
      </div>
      <p class="small muted" style="margin:6px 0 8px">เพิ่มสูตรปุ๋ยที่ไม่มีในรายการของระบบ ใส่รูป ชื่อ และสัดส่วน N-P-K เพื่อใช้เลือกใส่ถังและให้หน้าคำนวณนำไปแนะนำ</p>
      ${
        mine.length
          ? `<div class="list">${mine
              .map(
                (p) => `<div class="list-item" data-pid="${esc(p.id)}">
                  <img class="myprod-img" src="${XF.productImage(p.id)}" alt="">
                  <div class="grow"><b>${esc(p.name)}</b>
                    <div class="small muted">N-P-K ${fmt(p.n, 1)}-${fmt(p.p, 1)}-${fmt(p.k, 1)} · สัดส่วน ${ratioText(p.n, p.p, p.k)}</div></div>
                  ${editable ? '<button type="button" class="btn ghost sm" data-edit>แก้ไข</button><button type="button" class="btn ghost sm" data-del>ลบ</button>' : ""}
                </div>`
              )
              .join("")}</div>`
          : '<div class="empty">ยังไม่มีสูตรที่เพิ่มเอง</div>'
      }`;
    if (!editable) return;
    $("#addProduct", box).addEventListener("click", () => openProduct(null));
    $$("[data-pid]", box).forEach((row) => {
      const id = row.dataset.pid;
      $("[data-edit]", row).addEventListener("click", () => openProduct(id));
      $("[data-del]", row).addEventListener("click", () => deleteProduct(id));
    });
  }

  XF.watchProducts(() => {
    renderMyProducts();
    renderTanks();
  });
  // ---------------------------------------------------------------- ตำแหน่งสวน
  XF.farmMap.init();
  $("#farmForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const farm = XF.farmMap.getFarm();
    if (!farm.name) return XF.toast("กรุณากรอกชื่อสวน", true);
    if (await XF.run(() => store.update(XF.root + "/farm", farm), "บันทึกตำแหน่งสวนแล้ว")) XF.farmMap.finishDrawing();
  });

  // ---------------------------------------------------------------- LINE แจ้งเตือน/สรุปผล
  // ค่าเริ่มต้นต้องตรงกับ DEFAULT_PREFS ใน functions/lib/alerts.js
  const NOTIFY_DEFAULTS = { offline: true, offline_min: 10, hardware: true, job_error: true, job_done: false };
  const NOTIFY_ITEMS = [
    ["offline", "อุปกรณ์ออฟไลน์", "แจ้งเมื่อตู้ควบคุมขาดการเชื่อมต่อนานเกินกำหนด และแจ้งอีกครั้งเมื่อกลับมา"],
    ["hardware", "ฮาร์ดแวร์ผิดปกติ", "ESP32 ติดต่อ STM32 ไม่ได้ หรือยังไม่ได้เวลาจากอินเทอร์เน็ต (ตารางเวลาไม่ทำงาน)"],
    ["job_error", "งานให้น้ำ/ปุ๋ยผิดพลาด", "เช่น flow meter ไม่ขยับระหว่างจ่ายปุ๋ย พร้อมสาเหตุ"],
    ["job_done", "งานเสร็จเรียบร้อย", "แจ้งทุกครั้งที่ให้น้ำ/ปุ๋ยเสร็จ (ข้อความจะเยอะ ปิดไว้เป็นค่าเริ่มต้น)"],
  ];
  let lineStatus = null;
  let notifyKey = null;

  function renderNotifyPrefs() {
    const prefs = { ...NOTIFY_DEFAULTS, ...(down.notify || {}) };
    const editable = XF.isOwner || XF.isAdmin;
    $("#notifyPrefs").innerHTML =
      NOTIFY_ITEMS.map(
        ([key, title, hint]) => `<div class="pref-row"><div><div style="font-weight:500">${title}</div><div class="small muted">${hint}</div></div>
          <label class="switch"><input type="checkbox" data-notify="${key}" aria-label="${title}" ${prefs[key] ? "checked" : ""} ${editable ? "" : "disabled"}><i></i></label></div>`
      ).join("") +
      `<div class="pref-row"><div><div style="font-weight:500">นับว่าออฟไลน์เมื่อขาดการเชื่อมต่อนาน</div>
        <div class="small muted">ตั้งนานขึ้นถ้าสัญญาณที่สวนไม่ค่อยเสถียร จะได้ไม่เตือนบ่อย (3–1,440 นาที)</div></div>
        <label class="field" style="width:110px"><input type="number" min="3" max="1440" data-notify-min value="${prefs.offline_min}" ${editable ? "" : "disabled"} aria-label="นาที"></label></div>`;
    $("#notifyHint").textContent = editable ? "" : "เฉพาะเจ้าของสวนที่เปลี่ยนการตั้งค่าแจ้งเตือนได้";
    $$("[data-notify]").forEach((input) =>
      input.addEventListener("change", () => XF.run(() => store.update(downPath + "/notify", { [input.dataset.notify]: input.checked }), "บันทึกการแจ้งเตือนแล้ว"))
    );
    const minInput = $("[data-notify-min]");
    minInput.addEventListener("change", () => {
      const v = Math.min(1440, Math.max(3, Math.round(num(minInput.value, 10))));
      minInput.value = v;
      XF.run(() => store.update(downPath + "/notify", { offline_min: v }), "บันทึกการแจ้งเตือนแล้ว");
    });
  }

  function renderLine() {
    const st = lineStatus;
    if (!st) return;
    const intro = $("#lineIntro");
    if (st.demo) intro.textContent = "โหมดสาธิตไม่เชื่อมต่อ LINE จริง หน้านี้แสดงตัวอย่างเท่านั้น";
    else if (!st.configured) intro.textContent = "ยังไม่ได้ตั้งค่า LINE ฝั่งเซิร์ฟเวอร์ ให้ผู้ดูแลระบบทำตามคู่มือหัวข้อ \"8. แจ้งเตือนและสรุปผลทาง LINE\"";
    else if (!st.recipients.length) intro.textContent = "ยังไม่มีบัญชี LINE ที่เชื่อมไว้ กด \"เพิ่มบัญชี LINE\" แล้วทำตามขั้นตอน";
    else intro.textContent = "บัญชีเหล่านี้จะได้รับแจ้งเตือนเมื่อมีปัญหา และขอสรุปผลได้โดยพิมพ์ในแชท LINE";

    $("#lineRecipients").innerHTML = st.recipients
      .map(
        (r) => `<div class="list-item"><div class="grow"><b>${esc(r.name)}</b>${r.mine ? ' <span class="badge on">บัญชีของคุณ</span>' : ""}
          <div class="small muted">เชื่อมเมื่อ ${r.linked ? XF.fmtDate(r.linked * 1000, { day: "numeric", month: "short", year: "numeric" }) : "–"}</div></div>
          ${r.removable ? `<button class="btn ghost sm" data-unlink="${esc(r.key)}">ลบ</button>` : ""}</div>`
      )
      .join("");
    $$("[data-unlink]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (!confirm("เลิกส่งแจ้งเตือนไปที่บัญชี LINE นี้?")) return;
        if (await XF.run(() => XF.lineCall("lineUnlink", { key: btn.dataset.unlink }), "ลบบัญชี LINE แล้ว")) loadLine();
      })
    );
    const ready = st.configured || st.demo;
    $("#lineLink").disabled = !ready;
    $("#lineTest").disabled = !ready || !st.recipients.length;
    $$("[data-line-report]").forEach((b) => (b.disabled = !ready || !st.recipients.length));
  }

  async function loadLine() {
    try {
      lineStatus = await XF.lineCall("lineStatus");
    } catch (err) {
      console.error(err);
      lineStatus = null;
      $("#lineIntro").textContent = "เชื่อมต่อฟังก์ชัน LINE ไม่ได้ (ยังไม่ได้ deploy Cloud Functions หรือไม่มีสิทธิ์)";
      return;
    }
    renderLine();
  }

  function openLinkDialog() {
    const modal = XF.modal(`<h2>เพิ่มบัญชี LINE</h2><div id="linkBody"><div class="empty">กำลังขอรหัส…</div></div>
      <div class="form-actions"><button class="btn ghost" data-close>ปิด</button></div>`);
    let timer = null;
    const stop = () => clearInterval(timer);
    const knownKeys = new Set((lineStatus ? lineStatus.recipients : []).map((r) => r.key));

    XF.lineCall("lineCreateLinkCode")
      .then((res) => {
        const bot = lineStatus && lineStatus.botUrl;
        modal.el.querySelector("#linkBody").innerHTML = `
          <ol class="line-steps">
            <li>${bot ? `เพิ่มเพื่อน LINE ของระบบ: <a href="${esc(bot)}" target="_blank" rel="noopener">กดที่นี่</a>` : "เพิ่มเพื่อน LINE Official Account ของระบบ (สอบถามผู้ดูแลระบบ)"}</li>
            <li>พิมพ์ข้อความนี้ในแชท LINE นั้น</li>
          </ol>
          <div class="line-code"><b>ผูก ${esc(res.code)}</b><span class="small muted">ใช้ได้ ${Math.round(res.expiresInSec / 60)} นาที · หน้านี้จะอัปเดตเองเมื่อเชื่อมสำเร็จ</span></div>`;
        let ticks = 0;
        timer = setInterval(async () => {
          // หน้าต่างถูกปิดแล้วหรือรอนานเกินอายุรหัส: หยุดถาม
          if (++ticks > 200 || !modal.el.isConnected) return stop();
          try {
            const st = await XF.lineCall("lineStatus");
            if (st.recipients.some((r) => !knownKeys.has(r.key))) {
              stop();
              lineStatus = st;
              renderLine();
              modal.close();
              XF.toast("เชื่อมบัญชี LINE สำเร็จ");
            }
          } catch (err) {
            /* ลองใหม่รอบหน้า */
          }
        }, 3000);
      })
      .catch((err) => {
        modal.el.querySelector("#linkBody").innerHTML = `<div class="notice red">${esc(err.message || "ขอรหัสไม่สำเร็จ")}</div>`;
      });
  }

  $("#lineLink").addEventListener("click", openLinkDialog);
  $("#lineTest").addEventListener("click", async (e) => {
    e.currentTarget.disabled = true;
    try {
      const res = await XF.lineCall("lineTest");
      XF.toast(res.demo ? "โหมดสาธิต: ไม่ได้ส่งข้อความ LINE จริง" : `ส่งข้อความทดสอบแล้ว (${res.sent} บัญชี)`);
    } catch (err) {
      XF.toast(err.message || "ส่งไม่สำเร็จ", true);
    }
    renderLine();
  });
  $$("[data-line-report]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await XF.sendLineReport({ days: +btn.dataset.lineReport });
      renderLine();
    })
  );

  // ---------------------------------------------------------------- ข้อมูล
  store.watch(downPath, (v) => {
    down = v || {};
    fillDownForms();
    renderZones();
    renderTanks();
    // วาดใหม่เฉพาะเมื่อค่าแจ้งเตือนเปลี่ยน (กันช่องตัวเลขที่กำลังพิมพ์หลุดโฟกัส)
    const key = JSON.stringify(down.notify || null);
    if (key !== notifyKey) {
      notifyKey = key;
      renderNotifyPrefs();
    }
  });
  loadLine();
  // ใช้ค่าจริงจากเซิร์ฟเวอร์เท่านั้น (cache: false) เพราะรับแค่ครั้งแรก ถ้าเป็นค่าเก่าจะบันทึกทับของใหม่
  store.watch(
    XF.root + "/farm",
    (v) => {
      // โหลดครั้งแรกเท่านั้น เพื่อไม่ให้ทับกรอบที่กำลังวาดค้างอยู่
      if (farmLoaded) return;
      farmLoaded = true;
      XF.farmMap.setFarm(v || XF.DEFAULT_FARM);
    },
    { cache: false }
  );
  ownerUid = XF.ownerUid;
  renderAccount(null);
  // รายชื่อสมาชิกอ่านได้เฉพาะเจ้าของสวน/ผู้ดูแล (กฎความปลอดภัย)
  if (XF.isOwner || XF.isAdmin) store.watch("/members/" + XF.deviceId, renderAccount);
  else {
    $("main").classList.add("ro");
    $("main").insertAdjacentHTML(
      "afterbegin",
      '<div class="notice" style="margin-bottom:12px">เฉพาะเจ้าของสวนที่แก้ค่าระบบได้ บัญชีของคุณดูได้และใช้หน้าควบคุม ตั้งเวลา และคำนวณได้ตามปกติ</div>'
    );
  }
  XF.watchUp((up, online) => {
    const s = up.sensors || {};
    $("#adcRaw").textContent = online && s.adc != null ? `(ค่า ADC ปัจจุบัน ${s.adc})` : "";
    ["s1", "s2"].forEach((k) => {
      const r = (s.rs485 || {})[k] || {};
      const el = $(`[data-rs="${k}"]`);
      if (el) el.textContent = online && r.ok ? `(ค่าปัจจุบัน ${fmt(r.value, 1)})` : "";
    });
  });

  showTab(location.hash.slice(1) || "account");
});
