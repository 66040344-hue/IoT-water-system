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
  XF.productImage = (id) => `assets/fert/${id}.webp`;

  XF.DAY_NAMES = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
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
      flow: { f1: { k: 450, full_lpm: 0 }, f2: { k: 450, full_lpm: 0 }, f3: { k: 450, full_lpm: 0 } },
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
  };
  XF.icon = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;

  XF.toast = (message, isError) => {
    XF.$$(".toast").forEach((t) => t.remove());
    const el = document.createElement("div");
    el.className = "toast" + (isError ? " error" : "");
    el.setAttribute("role", "status");
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), isError ? 5000 : 2600);
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

  XF.sendCmd = (cmd) => store.set(XF.root + "/down/control/cmd", { id: String(Date.now()), ...cmd });

  // สถานะสดของอุปกรณ์ + ตรวจว่าออนไลน์ (ESP32 ส่ง ts ทุก 2-5 วินาที)
  XF.watchUp = (cb) => {
    let last = null;
    const emit = () => {
      const up = last || {};
      cb(up, !!up.ts && Date.now() / 1000 - up.ts < 30);
    };
    const off = store.watch(XF.root + "/up", (v) => {
      last = v;
      emit();
    });
    const timer = setInterval(emit, 5000);
    return () => {
      off();
      clearInterval(timer);
    };
  };
  XF.relayOn = (up, relay) => (((up || {}).relays || 0) >> relay.bit) & 1;

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
    if (!(await store.get(root + "/down/settings"))) {
      await store.update(root + "/down", {
        settings: XF.DEFAULT_DOWN.settings,
        zones: XF.DEFAULT_DOWN.zones,
        "control/mode": "auto",
      });
    }
    if (!(await store.get(root + "/farm"))) await store.set(root + "/farm", XF.DEFAULT_FARM);
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

  function renderShell(page) {
    const top = document.createElement("header");
    top.className = "topbar";
    top.innerHTML = `${XF.brandHtml()}
      <div class="topbar-actions">
        <span class="conn" id="xfConn">ออฟไลน์</span>
        <button class="icon-btn" id="xfLogout" title="ออกจากระบบ" aria-label="ออกจากระบบ">${XF.icon("logout")}</button>
      </div>`;
    document.body.prepend(top);

    if (store.demo) {
      const banner = document.createElement("div");
      banner.className = "demo-banner";
      banner.textContent = "โหมดสาธิต: ยังไม่ได้ตั้งค่า Firebase ข้อมูลและอุปกรณ์ถูกจำลองในเบราว์เซอร์นี้";
      top.after(banner);
    }

    const nav = document.createElement("nav");
    nav.className = "tabbar";
    nav.setAttribute("aria-label", "เมนูหลัก");
    nav.innerHTML = NAV.map(
      (n) => `<a href="${n.href}" class="${n.key === page ? "active" : ""}">${XF.icon(n.icon)}<span>${n.label}</span></a>`
    ).join("");
    document.body.appendChild(nav);

    XF.$("#xfLogout").addEventListener("click", () => {
      if (confirm("ออกจากระบบ?")) store.signOut();
    });
    XF.watchUp((up, online) => {
      const el = XF.$("#xfConn");
      el.classList.toggle("on", online);
      el.textContent = online ? "ออนไลน์" : "ออฟไลน์";
    });
  }

  // เรียกจากทุกหน้า (ยกเว้น login): ต้องล็อกอิน + เป็นสมาชิกของอุปกรณ์ (ผ่านรหัสประจำอุปกรณ์) จึงเข้าได้
  XF.boot = (page, init) => {
    let started = false;
    store.onAuth(async (user) => {
      if (!user) return location.replace("login.html");
      if (started) return;
      XF.user = user;

      const deviceId = localStorage.getItem("xf_device");
      let member = null;
      if (deviceId) member = await store.get(`/members/${deviceId}/${user.uid}`).catch(() => null);
      if (!member) return location.replace("login.html#device");

      started = true;
      XF.deviceId = deviceId;
      XF.root = "/devices/" + deviceId;
      XF.isOwner = (await store.get("/owners/" + deviceId).catch(() => null)) === user.uid;
      renderShell(page);
      if (store.demo && XF.startDemoDevice) XF.startDemoDevice();
      init();
    });
  };
})();
