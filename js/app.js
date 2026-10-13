// ส่วนกลางของทุกหน้า: โครงหน้า (แถบบน/แถบนำทาง), ตรวจสิทธิ์, ค่าเริ่มต้น และฟังก์ชันช่วยเหลือ
(function () {
  const store = XF.store;

  // ---------------------------------------------------------------- ค่าคงที่
  XF.RELAYS = [
    { key: "r1", bit: 0, name: "ปั๊มน้ำ", short: "ปั๊มน้ำ", tag: "P1" },
    { key: "r2", bit: 1, name: "ปั๊มปุ๋ย", short: "ปั๊มปุ๋ย", tag: "P2" },
    { key: "r3", bit: 2, name: "วาล์วปล่อยปุ๋ยเข้าท่อประธาน", short: "วาล์วท่อประธาน", tag: "V" },
    { key: "r4", bit: 3, name: "วาล์วถังปุ๋ย 1", short: "ถังปุ๋ย 1", tag: "T1" },
    { key: "r5", bit: 4, name: "วาล์วถังปุ๋ย 2", short: "ถังปุ๋ย 2", tag: "T2" },
    { key: "r6", bit: 5, name: "วาล์วถังปุ๋ย 3", short: "ถังปุ๋ย 3", tag: "T3" },
    { key: "r7", bit: 6, name: "วาล์วน้ำล้างท่อปุ๋ย", short: "วาล์วล้างท่อ", tag: "F" },
  ];

  XF.FERT_PRODUCTS = [
    { id: "nutri-gold-k-10-3-21", name: "Nutri-Gold K 10-3-21", n: 10, p: 3, k: 21 },
    { id: "nutri-gold-k-3-0-25", name: "Nutri-Gold K 3-0-25", n: 3, p: 0, k: 25 },
    { id: "nutri-gold-k-3-15-20", name: "Nutri-Gold K 3-15-20", n: 3, p: 15, k: 20 },
    { id: "nutri-phoz-balance-13-13-13", name: "Nutri-Phoz Balance 13-13-13", n: 13, p: 13, k: 13 },
    { id: "nutri-phoz-k-0-25-30", name: "Nutri-Phoz K 0-25-30", n: 0, p: 25, k: 30 },
    { id: "nutri-phoz-k-0-3-30", name: "Nutri-Phoz K 0-3-30", n: 0, p: 3, k: 30 },
    { id: "nutri-phoz-k-0-30-35", name: "Nutri-Phoz K 0-30-35", n: 0, p: 30, k: 35 },
    { id: "nutri-phoz-k-10-5-20", name: "Nutri-Phoz K 10-5-20", n: 10, p: 5, k: 20 },
    { id: "nutri-phoz-k-4-24-24", name: "Nutri-Phoz K 4-24-24", n: 4, p: 24, k: 24 },
    { id: "nutri-phoz-k-6-24-6", name: "Nutri-Phoz K 6-24-6", n: 6, p: 24, k: 6 },
    { id: "nutri-phoz-n-20-4-4", name: "Nutri-Phoz N 20-4-4", n: 20, p: 4, k: 4 },
  ];
  // สูตรปุ๋ยที่ผู้ใช้เพิ่มเอง: /devices/<id>/products/<pid> = { name, n, p, k } ส่วนรูปเก็บแยกที่ /devices/<id>/product_img/<pid> (data URL ที่ย่อแล้ว)
  // แยกออกจาก /down เพื่อไม่ให้ทุกหน้าที่ฟัง /down ต้องดาวน์โหลดรูปไปด้วย
  XF.customProducts = {};
  XF.customImages = {};
  XF.PRODUCT_PLACEHOLDER =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#e4edf1"/><path d="M26 10h12v6l5 8v26a4 4 0 0 1-4 4H25a4 4 0 0 1-4-4V24l5-8z" fill="none" stroke="#587079" stroke-width="3" stroke-linejoin="round"/><path d="M24 36h16" stroke="#587079" stroke-width="3"/></svg>'
    );
  XF.isBuiltinProduct = (id) => XF.FERT_PRODUCTS.some((p) => p.id === id);
  // สูตรทั้งหมด = สูตรที่มากับระบบ + สูตรที่ผู้ใช้เพิ่ม (เรียงตามชื่อ)
  XF.allProducts = () => {
    const mine = Object.entries(XF.customProducts || {})
      .filter(([, p]) => p && typeof p.name === "string" && p.name)
      .map(([id, p]) => ({ id, name: p.name, n: XF.num(p.n), p: XF.num(p.p), k: XF.num(p.k), custom: true }))
      .sort((a, b) => a.name.localeCompare(b.name, "th"));
    return XF.FERT_PRODUCTS.concat(mine);
  };
  XF.productImage = (id) => (XF.isBuiltinProduct(id) ? `assets/fert/${id}.webp` : XF.customImages[id] || XF.PRODUCT_PLACEHOLDER);
  // บันทึกว่าถังปุ๋ยเปลี่ยนสูตร ณ เวลานี้ (ที่ /product_log) หน้าประวัติใช้ดูว่างานแต่ละครั้งใช้ปุ๋ยสูตรอะไร
  // เก็บชื่อสูตรไว้ในรายการด้วย เพื่อให้ยังอ่านได้แม้สูตรถูกลบหรือเปลี่ยนชื่อภายหลัง
  // บันทึกไม่สำเร็จไม่ถือเป็นข้อผิดพลาดของการตั้งค่า (เงียบไว้) · prevId = สูตรเดิมของถังก่อนเปลี่ยน ("" ถ้าไม่มี)
  XF.logTankProduct = async (tank, prevId, newId) => {
    prevId = prevId || "";
    newId = newId || "";
    if (!(tank >= 1 && tank <= 3) || prevId === newId) return;
    const nameOf = (id) => ((XF.allProducts().find((p) => p.id === id) || {}).name || "").slice(0, 40);
    try {
      await XF.store.push(XF.root + "/product_log", {
        tank,
        product: newId,
        name: nameOf(newId),
        prev: prevId,
        prev_name: nameOf(prevId),
        at: Math.floor(Date.now() / 1000),
      });
    } catch (err) {
      console.warn("บันทึกประวัติการเปลี่ยนสูตรไม่สำเร็จ", err);
    }
  };
  // เริ่มฟังสูตรของผู้ใช้ (เรียกเฉพาะหน้าที่ต้องใช้: คำนวณ ควบคุม ตั้งค่า) cb ถูกเรียกทุกครั้งที่สูตรหรือรูปเปลี่ยน
  XF.watchProducts = (cb) => {
    const offA = XF.store.watch(XF.root + "/products", (v) => {
      XF.customProducts = v || {};
      if (cb) cb();
    });
    const offB = XF.store.watch(XF.root + "/product_img", (v) => {
      XF.customImages = v || {};
      if (cb) cb();
    });
    return () => {
      offA();
      offB();
    };
  };

  // บัญชีที่ผู้ดูแลสร้างให้ใช้ "ชื่อผู้ใช้" แทนอีเมล (ระบบแปลงเป็นอีเมลภายในให้เอง)
  XF.USER_DOMAIN = "xactflow.app";
  XF.toEmail = (v) => {
    v = String(v || "").trim().toLowerCase();
    return v.includes("@") ? v : v + "@" + XF.USER_DOMAIN;
  };
  XF.isInternalEmail = (e) => String(e || "").endsWith("@" + XF.USER_DOMAIN);
  XF.usernameOf = (e) => (XF.isInternalEmail(e) ? String(e).split("@")[0] : e || "");
  XF.ROLE_LABELS = { owner: "เจ้าของสวน", member: "ผู้ใช้งาน", viewer: "ผู้เข้าชม", device: "ตู้ควบคุม" };

  XF.DAY_NAMES =["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
  XF.STEP_LABELS = { prewet: "ให้น้ำนำ", inject: "จ่ายปุ๋ย", flush: "ล้างท่อปุ๋ย", water: "ให้น้ำ" };
  XF.SOURCE_LABELS = { schedule: "ตั้งเวลา", manual: "สั่งด้วยมือ", calc: "จากหน้าคำนวณ" };

  XF.DEFAULT_FARM = { name: "สวนทุเรียน", address: "", lat: 12.6113, lng: 102.1039 };

  XF.DEFAULT_DOWN = {
    control: { mode: "auto" },
    zones: {
      z1: { name: "โซน A", order: 1, trees: 50, heads_per_tree: 1, water_per_tree_l: 120, fert_per_tree_ml: 50, tank: 1, fert_enabled: true },
      z2: { name: "โซน B", order: 2, trees: 50, heads_per_tree: 1, water_per_tree_l: 120, fert_per_tree_ml: 50, tank: 1, fert_enabled: true },
    },
    settings: {
      water_pump: { pipe_in: 2, lpm: 200 },
      fert_pump: { pipe_in: 0.5, lpm: 5 },
      sprinkler: { lph: 120 },
      prewet_sec: 60,
      flush_sec: 60,
      manual_max_min: 120,
      base_water_per_sqm: 5,
      irrigation_efficiency: 90,
      canopy_diameter_m: 8,
      crop_kc: 0.9,
      flow: { f1: { k: 430, full_lpm: 0 }, f2: { k: 430, full_lpm: 0 }, f3: { k: 430, full_lpm: 0 } },
      tanks: {
        t1: { name: "ถัง 1", product: "nutri-phoz-n-20-4-4", n: 20, p: 4, k: 4 },
        t2: { name: "ถัง 2", product: "nutri-phoz-k-4-24-24", n: 4, p: 24, k: 24 },
        t3: { name: "ถัง 3", product: "nutri-gold-k-3-0-25", n: 3, p: 0, k: 25 },
      },
      spare_adc: { enabled: false, name: "ความชื้นในดิน", unit: "%", raw_min: 0, raw_max: 4095, out_min: 0, out_max: 100 },
      rs485: {
        s1: { enabled: false, name: "RS485 #1", unit: "", slave: 1, fc: 3, reg: 0, scale: 1 },
        s2: { enabled: false, name: "RS485 #2", unit: "", slave: 2, fc: 3, reg: 0, scale: 1 },
      },
    },
  };

  // ---------------------------------------------------------------- ตัวช่วยทั่วไป
  XF.esc = (v) =>
    String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  XF.num = (v, fallback = 0) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  };
  XF.fmt = (v, digits = 0) =>
    Number.isFinite(+v) ? (+v).toLocaleString("th-TH", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "–";
  XF.fmtDate = (d, opts) => new Date(d).toLocaleDateString("th-TH", opts || { day: "numeric", month: "long", year: "numeric" });
  XF.fmtTime = (d) => new Date(d).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false });
  XF.fmtDuration = (sec) => {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h) return `${h} ชม. ${m} นาที`;
    if (m) return `${m} นาที${sec % 60 && m < 10 ? ` ${sec % 60} วิ` : ""}`;
    return `${sec} วินาที`;
  };
  XF.fmtVolume = (ml) => (ml >= 1000 ? `${XF.fmt(ml / 1000, 2)} ลิตร` : `${XF.fmt(ml, 0)} มล.`);
  XF.$ = (sel, root) => (root || document).querySelector(sel);
  XF.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  XF.sortedZones = (zones) =>
    Object.keys(zones || {})
      .map((id) => ({ id, ...zones[id] }))
      .sort((a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id));

  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    control: '<path d="M12 3v9"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/>',
    calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    history: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    settings: '<path d="M4 6h8M18 6h2M4 12h2M12 12h8M4 18h10"/><circle cx="15" cy="6" r="2.5"/><circle cx="9" cy="12" r="2.5"/><circle cx="17" cy="18" r="2.5"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    pin: '<path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    drop: '<path d="M12 2.7l5.7 5.6a8 8 0 1 1-11.4 0z"/>',
    wind: '<path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>',
    temp: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/>',
    leaf: '<path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 14zM5 19l7-7"/>',
    chart: '<path d="M4 19V9M10 19V5M16 19v-7M21 19H3"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    gauge: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="M12 17l4-6"/><path d="M7 8.5l.01 0M12 6l.01 0M17 8.5l.01 0"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  };
  XF.icon = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;

  XF.toast = (message, isError) => {
    XF.$$(".toast").forEach((t) => t.remove());
    const el = document.createElement("div");
    el.className = "toast" + (isError ? " error" : "");
    el.setAttribute("role", isError ? "alert" : "status");
    const ico = document.createElement("span");
    ico.className = "toast-ico";
    ico.textContent = isError ? "!" : "✓";
    const text = document.createElement("span");
    text.textContent = message;
    el.append(ico, text);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), isError ? 5000 : 3000);
  };

  // เรียกงานที่เขียนข้อมูล แล้วแจ้งผลให้ผู้ใช้
  XF.run = async (task, okMessage) => {
    try {
      await task();
      if (okMessage) XF.toast(okMessage);
      return true;
    } catch (err) {
      console.error(err);
      XF.toast("ไม่สำเร็จ: " + (err.code === "PERMISSION_DENIED" ? "ไม่มีสิทธิ์เข้าถึงอุปกรณ์นี้" : err.message), true);
      return false;
    }
  };

  XF.modal = (html) => {
    const back = document.createElement("div");
    back.className = "modal-back";
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    const close = () => back.remove();
    back.addEventListener("click", (e) => {
      if (e.target === back || e.target.closest("[data-close]")) close();
    });
    document.body.appendChild(back);
    return { el: back.firstElementChild, close };
  };

  // ---------------------------------------------------------------- ฟอร์มที่ผูกกับ path ในฐานข้อมูล
  // <input data-path="settings/water_pump/lpm" data-type="number">
  const dig = (obj, path) => path.split("/").reduce((o, k) => (o == null ? undefined : o[k]), obj);
  XF.fillForm = (root, data) => {
    XF.$$("[data-path]", root).forEach((el) => {
      const value = dig(data, el.dataset.path);
      if (el.type === "checkbox") el.checked = !!value;
      else el.value = value == null ? "" : value;
    });
  };
  XF.readForm = (root) => {
    const out = {};
    XF.$$("[data-path]", root).forEach((el) => {
      if (el.type === "checkbox") out[el.dataset.path] = el.checked;
      else if (el.dataset.type === "number") out[el.dataset.path] = XF.num(el.value);
      else out[el.dataset.path] = el.value.trim();
    });
    return out;
  };

  // ---------------------------------------------------------------- การคำนวณที่ใช้ร่วมกัน (ตรงกับเฟิร์มแวร์ ESP32)
  XF.zoneFlowLpm = (zone, settings) => {
    const s = settings || {};
    let flow = XF.num((s.water_pump || {}).lpm);
    const demand = (XF.num(zone.trees) * XF.num(zone.heads_per_tree) * XF.num((s.sprinkler || {}).lph)) / 60;
    if (demand > 0 && (flow <= 0 || demand < flow)) flow = demand;
    return flow;
  };

  XF.zonePlan = (zone, settings, withFert) => {
    const s = settings || {};
    const waterL = XF.num(zone.water_per_tree_l) * XF.num(zone.trees);
    const fertMl = withFert && zone.fert_enabled !== false ? XF.num(zone.fert_per_tree_ml) * XF.num(zone.trees) : 0;
    const flow = XF.zoneFlowLpm(zone, s);
    const fertLpm = XF.num((s.fert_pump || {}).lpm);
    let seconds = flow > 0 ? (waterL / flow) * 60 : 0;
    if (fertMl > 0) {
      const fertSeconds = XF.num(s.prewet_sec, 60) + XF.num(s.flush_sec, 60) + (fertLpm > 0 ? (fertMl / 1000 / fertLpm) * 60 : 0);
      seconds = Math.max(seconds, fertSeconds);
    }
    return { waterL, fertMl, flow, seconds, tank: zone.tank || 1 };
  };

  // บันทึกว่าใครสั่งอะไร ณ เวลาไหน (/action_log) หน้าประวัติใช้จับคู่กับงานที่ ESP32 บันทึก เพราะ ESP32 ไม่รู้ว่าใครเป็นผู้สั่ง
  // บันทึกไม่สำเร็จไม่กระทบคำสั่งจริง · type: run | stop | relay | mode
  XF.logAction = async (type, extra) => {
    if (!XF.user) return;
    try {
      await XF.store.push(XF.root + "/action_log", {
        uid: XF.user.uid,
        name: String(XF.user.name || "").slice(0, 40),
        type,
        at: Math.floor(Date.now() / 1000),
        ...extra,
      });
    } catch (err) {
      console.warn("บันทึกผู้สั่งงานไม่สำเร็จ", err);
    }
  };

  XF.sendCmd = async (cmd) => {
    await store.set(XF.root + "/down/control/cmd", { id: String(Date.now()), ...cmd });
    XF.logAction(cmd.type, cmd.zone ? { zone: String(cmd.zone).slice(0, 32) } : null);
  };

  // Cloud Functions ของอุปกรณ์นี้ (แจ้งเตือน/สรุปผลทาง LINE) ข้อความผิดพลาดมาจากเซิร์ฟเวอร์เป็นภาษาไทยอยู่แล้ว
  XF.lineCall = (name, data) => store.call(name, { device: XF.deviceId, ...data });
  XF.sendLineReport = async (range) => {
    try {
      const res = await XF.lineCall("lineSendReport", range);
      XF.toast(res.demo ? "โหมดสาธิต: ไม่ได้ส่งข้อความ LINE จริง" : `ส่งสรุปเข้า LINE แล้ว (${res.sent} บัญชี)`);
      return true;
    } catch (err) {
      console.error(err);
      XF.toast(err.message || "ส่งสรุปเข้า LINE ไม่สำเร็จ", true);
      return false;
    }
  };

  // สถานะสดของอุปกรณ์ + ตรวจว่าออนไลน์ (ESP32 ส่ง ts ทุก 2-5 วินาที)
  // ออนไลน์ = ได้รับสถานะภายใน 45 วินาที (ตู้ส่งทุก 15 วินาทีตอนว่าง 2 วินาทีตอนทำงาน)
  // แท็บที่ถูกซ่อนจะหยุดรับข้อมูลสด เพื่อไม่ให้เสียทราฟฟิกโดยไม่มีใครดู แล้วกลับมารับต่อเมื่อเปิดแท็บ
  XF.watchUp = (cb) => {
    let last = null;
    let off = null;
    let timer = null;
    const emit = () => {
      const up = last || {};
      cb(up, !!up.ts && Date.now() / 1000 - up.ts < 45);
    };
    const start = () => {
      if (off) return;
      off = store.watch(XF.root + "/up", (v) => {
        last = v;
        emit();
      });
      timer = setInterval(emit, 5000);
    };
    const stop = () => {
      if (off) off();
      off = null;
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) start();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  };  XF.relayOn = (up, relay) => (((up || {}).relays || 0) >> relay.bit) & 1;

  // ปริมาณน้ำ/ปุ๋ยสด: น้ำไม่มี flow meter จึงประมาณจากอัตราไหลของปั๊ม (สูตรเดียวกับเฟิร์มแวร์) ส่วนปุ๋ยวัดจริงจาก flow meter ของแต่ละถัง
  // zones เป็น array (จาก XF.sortedZones) หรือ object ที่ key เป็นรหัสโซนก็ได้
  XF.liveFlow = (up, zones, settings, online) => {
    up = up || {};
    const s = up.sensors || {};
    const job = up.job || {};
    const pumpOn = !!online && !!XF.relayOn(up, XF.RELAYS[0]);
    let waterLpm = 0;
    if (pumpOn) {
      const zone = job.running && job.zone ? (Array.isArray(zones) ? zones.find((z) => z.id === job.zone) : (zones || {})[job.zone]) : null;
      waterLpm = zone ? XF.zoneFlowLpm(zone, settings) : XF.num(((settings || {}).water_pump || {}).lpm);
    }
    const tanks = [1, 2, 3].map((i) => (online ? Math.max(0, XF.num((s.flow_lpm || {})["f" + i])) : 0));
    const fertLpm = tanks.reduce((a, b) => a + b, 0);
    const mlPerL = waterLpm > 0 && fertLpm > 0.005 ? (fertLpm * 1000) / waterLpm : 0;
    return { pumpOn, waterLpm, tanks, fertLpm, mlPerL };
  };

  // ---------------------------------------------------------------- แผนที่แปลง (ใช้ทั้งหน้าหลักและหน้าตั้งค่า)
  // สีแรกเป็นของขอบเขตสวน ที่เหลือเป็นของโซนตามลำดับ
  XF.MAP_COLORS = ["#f58220", "#1b84f5", "#e5262b", "#8e44ad", "#00a3a3", "#c2185b", "#6d4c41", "#3949ab", "#7cb342"];
  XF.zoneColor = (index) => XF.MAP_COLORS[1 + (Math.max(0, index) % (XF.MAP_COLORS.length - 1))];
  // พื้นที่รูปหลายเหลี่ยม (ตร.ม.) จากจุด [lat, lng] โดยแปลงพิกัดเป็นระยะทางบนระนาบรอบจุดแรก
  XF.polygonAreaSqm = (points) => {
    if (!points || points.length < 3) return 0;
    const lat0 = (points[0][0] * Math.PI) / 180;
    const xy = points.map(([lat, lng]) => [(lng - points[0][1]) * 111320 * Math.cos(lat0), (lat - points[0][0]) * 110540]);
    let sum = 0;
    xy.forEach(([x, y], i) => {
      const [nx, ny] = xy[(i + 1) % xy.length];
      sum += x * ny - nx * y;
    });
    return Math.abs(sum) / 2;
  };
  XF.cleanPolygon = (points) => (Array.isArray(points) ? points.filter((p) => Array.isArray(p) && p.length === 2).map((p) => [+p[0], +p[1]]) : []);

  // ---------------------------------------------------------------- จับคู่อุปกรณ์ด้วยรหัสประจำอุปกรณ์
  XF.pair = async (deviceId, code) => {
    const u = XF.user;
    await store.set(`/members/${deviceId}/${u.uid}`, { code, role: "member", name: u.name, email: u.email, joined: Date.now() });
    await store.set(`/user_devices/${u.uid}/${deviceId}`, true);
    if (!(await store.get("/owners/" + deviceId))) {
      await store.set("/owners/" + deviceId, u.uid).catch(() => {});
    }
    const root = "/devices/" + deviceId;
    // ผู้ใช้ที่ไม่ใช่เจ้าของเขียนค่าเริ่มต้นไม่ได้ (กฎความปลอดภัย) จึงข้ามไปเงียบ ๆ
    if (!(await store.get(root + "/down/settings").catch(() => null))) {
      await store
        .update(root + "/down", {
          settings: XF.DEFAULT_DOWN.settings,
          zones: XF.DEFAULT_DOWN.zones,
          "control/mode": "auto",
        })
        .catch(() => {});
    }
    if (!(await store.get(root + "/farm").catch(() => null))) await store.set(root + "/farm", XF.DEFAULT_FARM).catch(() => {});
    localStorage.setItem("xf_device", deviceId);
  };

  // ---------------------------------------------------------------- โครงหน้า
  const NAV = [
    { key: "home", href: "index.html", label: "ภาพรวม", icon: "home" },
    { key: "control", href: "control.html", label: "ควบคุม", icon: "control" },
    { key: "calc", href: "calculator.html", label: "คำนวณ", icon: "calc" },
    { key: "schedule", href: "schedule.html", label: "ตั้งเวลา", icon: "clock" },
    { key: "history", href: "history.html", label: "ประวัติ", icon: "history" },
    { key: "settings", href: "settings.html", label: "ตั้งค่า", icon: "settings" },
  ];

  XF.brandHtml = () =>
    `<a class="brand" href="index.html"><span class="brand-name">Xact<span>Flow</span></span><span class="brand-sub">Precision Fertigation System</span></a>`;

  // ปุ่มสลับธีมสว่าง/มืด (js/theme.js เป็นผู้เก็บค่าและตั้ง data-theme)
  const themeBtnHtml = () => {
    const dark = window.xfTheme && window.xfTheme.current() === "dark";
    const label = dark ? "เปลี่ยนเป็นธีมสว่าง" : "เปลี่ยนเป็นธีมมืด";
    return `<button class="icon-btn theme-btn" id="xfTheme" title="${label}" aria-label="${label}">${XF.icon(dark ? "sun" : "moon")}</button>`;
  };
  const bindThemeBtn = () => {
    const btn = XF.$("#xfTheme");
    if (!btn || !window.xfTheme) return;
    btn.addEventListener("click", () => {
      window.xfTheme.toggle();
      btn.outerHTML = themeBtnHtml();
      bindThemeBtn();
    });
  };

  function renderShell(page) {
    const top = document.createElement("header");
    top.className = "topbar";
    const viewOnly = page === "view" || XF.role === "viewer";
    top.innerHTML = `${XF.brandHtml()}
      <div class="topbar-actions">
        <span class="conn" id="xfConn" role="status" aria-live="polite">ออฟไลน์</span>
        ${themeBtnHtml()}
        ${XF.isAdmin ? `<a class="icon-btn" href="admin.html" title="ผู้ดูแลระบบ" aria-label="ผู้ดูแลระบบ">${XF.icon("shield")}</a>` : ""}
        <button class="icon-btn" id="xfLogout" title="ออกจากระบบ" aria-label="ออกจากระบบ">${XF.icon("logout")}</button>
      </div>`;
    document.body.prepend(top);

    if (store.demo) {
      const banner = document.createElement("div");
      banner.className = "demo-banner";
      banner.textContent = "โหมดสาธิต: ยังไม่ได้ตั้งค่า Firebase ข้อมูลและอุปกรณ์ถูกจำลองในเบราว์เซอร์นี้";
      top.after(banner);
    }
    if (viewOnly) {
      const banner = document.createElement("div");
      banner.className = "demo-banner view-banner";
      banner.innerHTML = `${XF.icon("eye")}<span>โหมดผู้เข้าชม · ดูข้อมูลสดของสวนได้อย่างเดียว ไม่สามารถสั่งงานหรือแก้ไขได้</span>`;
      top.after(banner);
    } else {
      const nav = document.createElement("nav");
      nav.className = "tabbar";
      nav.setAttribute("aria-label", "เมนูหลัก");
      // เมนูซ้ายบนจอกว้าง: โลโก้ด้านบน รายการเมนู และข้อมูลอุปกรณ์/ผู้ใช้ด้านล่าง (บนมือถือซ่อนทั้งสองส่วน)
      nav.innerHTML =
        `<div class="side-brand"><img src="icon.svg" alt="" width="36" height="36"><span>Xact<b>Flow</b></span></div>` +
        NAV.map((n) => { const on = n.key === page || (page === "weather" && n.key === "home"); return `<a href="${n.href}" class="${on ? "active" : ""}"${on ? ' aria-current="page"' : ""}>${XF.icon(n.icon)}<span>${n.label}</span></a>`; }).join("") +
        `<div class="side-foot"><span class="side-dot" id="xfSideDot"></span>
          <div><b>${XF.esc(XF.deviceId)}</b><small>${XF.esc(XF.user.name || "")} · ${XF.esc(XF.ROLE_LABELS[XF.role] || "")}</small></div></div>`;
      document.body.appendChild(nav);
    }

    bindThemeBtn();
    XF.$("#xfLogout").addEventListener("click", () => {
      if (confirm("ออกจากระบบ?")) store.signOut();
    });
    XF.watchUp((up, online) => {
      const el = XF.$("#xfConn");
      el.classList.toggle("on", online);
      el.textContent = online ? "ออนไลน์" : "ออฟไลน์";
      const dot = XF.$("#xfSideDot");
      if (dot) dot.classList.toggle("on", online);
    });
  }

  // เรียกจากทุกหน้า (ยกเว้น login): ต้องล็อกอิน + เป็นสมาชิกของอุปกรณ์ (ผ่านรหัสประจำอุปกรณ์) จึงเข้าได้
  // ผลตรวจสิทธิ์ครั้งล่าสุดถูกจำไว้ใน localStorage: หน้าถัดไปจึงแสดงได้ทันที แล้วตรวจซ้ำกับเซิร์ฟเวอร์อยู่เบื้องหลัง
  const SESSION_KEY = "xf_session";
  const readSession = () => {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch (err) {
      return null;
    }
  };
  XF.saveSession = () =>
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ deviceId: XF.deviceId, user: XF.user, owner: XF.ownerUid, role: XF.role, admin: XF.isAdmin })
    );
  const dropSession = () => {
    localStorage.removeItem(SESSION_KEY);
    store.clearCache();
  };

  // สิทธิ์: viewer เข้าได้เฉพาะหน้าผู้เข้าชม (view) ส่วนกฎใน database.rules.json เป็นตัวบังคับจริง
  XF.boot = (page, init) => {
    const deviceId = localStorage.getItem("xf_device");
    let started = false;
    let checked = false;
    const start = (user, owner, role, admin) => {
      XF.user = user;
      XF.deviceId = deviceId;
      XF.root = "/devices/" + deviceId;
      XF.ownerUid = owner;
      XF.isOwner = owner === user.uid;
      XF.role = role || "member";
      XF.isAdmin = !!admin;
      if (XF.role === "viewer" && page !== "view" && page !== "weather") return location.replace("view.html");
      started = true;
      renderShell(page);
      if (store.demo && XF.startDemoDevice) XF.startDemoDevice();
      init();
    };

    const session = readSession();
    if (session && deviceId && session.deviceId === deviceId) start(session.user, session.owner, session.role, session.admin);

    store.onAuth(async (user) => {
      if (!user) {
        dropSession();
        return location.replace("login.html");
      }
      if (checked) return;
      checked = true;
      if (started && XF.user.uid !== user.uid) {
        dropSession();
        return location.reload();
      }

      // undefined = อ่านไม่สำเร็จ (เช่น เน็ตหลุด), null = ไม่ได้เป็นสมาชิกแล้ว
      const [member, owner, admin] = await Promise.all([
        deviceId ? store.get(`/members/${deviceId}/${user.uid}`).catch(() => undefined) : null,
        deviceId ? store.get("/owners/" + deviceId).catch(() => undefined) : null,
        store.get("/admins/" + user.uid).catch(() => null),
      ]);
      const isAdmin = admin === true;
      if (member === null || (!member && !started)) {
        dropSession();
        return location.replace(isAdmin ? "admin.html" : "login.html#device");
      }
      if (!member) return;

      const ownerUid = owner === undefined ? (started ? XF.ownerUid : null) : owner;
      const role = member.role || "member";
      const changed = started && (ownerUid !== XF.ownerUid || role !== XF.role || isAdmin !== XF.isAdmin);
      XF.user = XF.user || user;
      XF.ownerUid = ownerUid;
      XF.role = role;
      XF.isAdmin = isAdmin;
      XF.deviceId = deviceId;
      XF.saveSession();
      if (!started) start(user, ownerUid, role, isAdmin);
      else if (changed) location.reload();
    });
  };

  // หน้าผู้ดูแล: ไม่ต้องเป็นสมาชิกของอุปกรณ์ แต่ต้องอยู่ใน /admins
  XF.bootAdmin = (init) => {
    store.onAuth(async (user) => {
      if (!user) return location.replace("login.html");
      if (XF.user) return;
      XF.user = user;
      XF.isAdmin = (await store.get("/admins/" + user.uid).catch(() => null)) === true;
      const top = document.createElement("header");
      top.className = "topbar";
      top.innerHTML = `${XF.brandHtml()}
        <div class="topbar-actions">
          <a class="btn ghost sm" href="index.html">หน้าหลัก</a>
          ${themeBtnHtml()}
          <button class="icon-btn" id="xfLogout" title="ออกจากระบบ" aria-label="ออกจากระบบ">${XF.icon("logout")}</button>
        </div>`;
      document.body.prepend(top);
      bindThemeBtn();
      XF.$("#xfLogout").addEventListener("click", () => {
        if (confirm("ออกจากระบบ?")) store.signOut();
      });
      init(XF.isAdmin);
    });
  };

  // ติดตั้ง Service Worker: เก็บหน้าเว็บและสคริปต์ไว้ในเครื่อง เปิดซ้ำได้เร็วและเปิดโครงหน้าได้แม้เน็ตหลุด
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();