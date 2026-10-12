// หน้าหลัก: ภาพรวมของสวน เซนเซอร์ สถานะอุปกรณ์ พยากรณ์อากาศ และงานถัดไป
// หน้า view.html (ผู้เข้าชม) ใช้โค้ดชุดเดียวกัน แต่ดูได้อย่างเดียว: window.XF_PAGE = "view"
const VIEW_ONLY = window.XF_PAGE === "view";
XF.boot(VIEW_ONLY ? "view" : "home", function () {
  const { store, $, esc, fmt, num } = XF;
  let farm = {};
  let farmReady = false; // รอข้อมูลสวนก่อนสร้างแผนที่ จะได้ไม่เปิดที่พิกัดผิด
  let down = {};
  let up = {};
  let online = false;
  let weatherKey = "";
  let showAllDays = VIEW_ONLY;
  let forecastData = null;

  // รหัสสภาพอากาศ WMO ที่ Open-Meteo ใช้
  const wx = (code) => {
    if (code === 0) return ["☀️", "ท้องฟ้าแจ่มใส"];
    if (code === 1) return ["🌤️", "มีเมฆบางส่วน"];
    if (code === 2) return ["⛅", "มีเมฆเป็นส่วนมาก"];
    if (code === 3) return ["☁️", "เมฆมาก"];
    if (code === 45 || code === 48) return ["🌫️", "หมอก"];
    if (code >= 51 && code <= 57) return ["🌦️", "ฝนปรอย"];
    if (code >= 61 && code <= 67) return ["🌧️", "ฝนตก"];
    if (code >= 80 && code <= 82) return ["🌧️", "ฝนตกเป็นช่วง"];
    if (code >= 95) return ["⛈️", "ฝนฟ้าคะนอง"];
    return ["🌥️", "–"];
  };

  function renderHero() {
    const hour = new Date().getHours();
    const part = hour < 5 ? "ยามค่ำ" : hour < 12 ? "ยามเช้า" : hour < 17 ? "ยามบ่าย" : hour < 20 ? "ยามเย็น" : "ยามค่ำ";
    $("#farmPill").innerHTML = `${XF.icon("pin")}<span>${esc(farm.name || "ยังไม่ได้ตั้งชื่อสวน")}</span>`;
    $("#today").textContent = XF.fmtDate(Date.now());
    $("#greet").textContent = `สวัสดี${part} คุณ ${XF.user.name}`;
  }

  function spareValue() {
    const cfg = ((down.settings || {}).spare_adc) || {};
    const raw = (up.sensors || {}).adc;
    if (!cfg.enabled || raw == null) return null;
    const span = num(cfg.raw_max, 4095) - num(cfg.raw_min);
    const ratio = span ? Math.min(1, Math.max(0, (raw - num(cfg.raw_min)) / span)) : 0;
    return { name: cfg.name || "ช่องสำรอง", unit: cfg.unit || "", value: num(cfg.out_min) + ratio * (num(cfg.out_max, 100) - num(cfg.out_min)) };
  }

  function renderEnv() {
    const s = up.sensors || {};
    const tiles = [
      { icon: "temp", label: "อุณหภูมิอากาศ", value: online && s.dht_ok ? fmt(s.temp, 1) : "–", unit: "°C" },
      { icon: "drop", label: "ความชื้นสัมพัทธ์", value: online && s.dht_ok ? fmt(s.humi, 0) : "–", unit: "%" },
    ];
    const spare = spareValue();
    tiles.push(
      spare
        ? { icon: "leaf", label: spare.name, value: online ? fmt(spare.value, 0) : "–", unit: spare.unit }
        : { icon: "leaf", label: "ความชื้นในดิน", value: "–", unit: "%", note: "ยังไม่ได้ติดตั้ง" }
    );
    const rsCfg = (down.settings || {}).rs485 || {};
    ["s1", "s2"].forEach((k) => {
      if (!(rsCfg[k] || {}).enabled) return;
      const r = (s.rs485 || {})[k] || {};
      tiles.push({ icon: "chart", label: rsCfg[k].name || k, value: online && r.ok ? fmt(r.value, 1) : "–", unit: rsCfg[k].unit || "" });
    });
    $("#env").innerHTML = tiles
      .map(
        (t) => `<div class="card"><span class="stat-ico">${XF.icon(t.icon)}</span>
          <div><div class="stat-label">${esc(t.label)}</div>
          <div class="num">${t.value}<small>${esc(t.unit)}</small></div>
          ${t.note ? `<div class="small muted">${t.note}</div>` : ""}</div></div>`
      )
      .join("");
  }

  async function renderToday() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const rows = await store.range(XF.root + "/history", "start", start.getTime() / 1000, Date.now() / 1000 + 60).catch(() => []);
    const water = rows.reduce((sum, r) => sum + num(r.water_l), 0);
    const fert = rows.reduce((sum, r) => sum + num(r.fert_ml), 0);
    const trees = XF.sortedZones(down.zones).reduce((sum, z) => sum + num(z.trees), 0);
    const perTree = (v) => (trees ? fmt(v / trees, 1) : "–");
    $("#todayTotals").innerHTML = `
      <div class="card"><div class="stat-label">ปริมาณน้ำ (ลิตร)</div>
        <div class="num" style="color:var(--blue-ink)">${fmt(water, 0)}</div>
        <div class="small muted">เฉลี่ย ${perTree(water)} ลิตร/ต้น · ${rows.length} ครั้ง</div></div>
      <div class="card"><div class="stat-label">ปริมาณปุ๋ย (มิลลิลิตร)</div>
        <div class="num" style="color:var(--orange-text)">${fmt(fert, 0)}</div>
        <div class="small muted">เฉลี่ย ${perTree(fert)} มล./ต้น</div></div>`;
  }

  function renderDevice() {
    const st = up.status || {};
    const job = up.job || {};
    const mode = up.mode || (down.control || {}).mode || "auto";
    let jobHtml = "";
    if (job.running) {
      const pct = job.water_target_l > 0 ? Math.min(100, (job.water_done_l / job.water_target_l) * 100) : 0;
      jobHtml = `<div class="notice green" style="margin-top:12px">
          <div class="row between"><b>กำลังทำงาน: ${esc(job.zone_name || job.zone)}</b><span>${esc(XF.STEP_LABELS[job.step] || job.step)}</span></div>
          <div class="progress" style="margin:8px 0 4px"><i style="width:${pct}%"></i></div>
          <div class="small">น้ำ ${fmt(job.water_done_l, 0)} / ${fmt(job.water_target_l, 0)} ลิตร · ปุ๋ย ${fmt(job.fert_done_ml, 0)} / ${fmt(job.fert_target_ml, 0)} มล. · เหลือประมาณ ${XF.fmtDuration(job.eta_s)}</div>
        </div>`;
    }
    $("#device").innerHTML = `
      <div class="row between wrap">
        <div>
          <div class="row"><span class="dot ${online ? "on" : ""}"></span><b>${esc(XF.deviceId)}</b>
            <span class="badge ${mode === "manual" ? "warn" : "on"}">${mode === "manual" ? "Manual" : "Auto"}</span></div>
          <div class="small muted" style="margin-top:4px">
            <span class="dot ${online && st.stm_ok ? "on" : ""}" style="width:8px;height:8px"></span> STM32 ·
            WiFi: ${esc(st.wifi || "–")} ${st.rssi ? `(${st.rssi} dBm)` : ""}</div>
        </div>
        <div class="small muted" style="text-align:right">อัปเดตล่าสุด<br>${up.ts ? `${XF.fmtDate(up.ts * 1000, { day: "2-digit", month: "2-digit", year: "numeric" })} ${XF.fmtTime(up.ts * 1000)}` : "ยังไม่เคยเชื่อมต่อ"}</div>
      </div>
      ${online && st.failsafe ? '<div class="notice red" style="margin-top:12px">STM32 ตัดการทำงาน (failsafe) เพราะขาดการติดต่อกับ ESP32</div>' : ""}
      ${online && st.stm_ok === false ? '<div class="notice red" style="margin-top:12px">ESP32 ติดต่อ STM32 ไม่ได้ ตรวจสาย TX/RX และไฟเลี้ยงบอร์ด</div>' : ""}
      ${jobHtml}`;

    $("#deviceChips").innerHTML = XF.RELAYS.map((r) => {
      const on = online && XF.relayOn(up, r);
      return `<div class="dev-tile ${on ? "on" : ""}"><span class="dev-tag">${r.tag}</span><span class="dev-name">${esc(r.short)}</span><b>${on ? "ON" : "OFF"}</b></div>`;
    }).join("");

    XF.renderDiagram($("#diagram"), { zones: XF.sortedZones(down.zones), settings: down.settings, up, online });
    if (farmReady) XF.renderFarmView($("#farmMap"), $("#farmInfo"), { farm, zones: XF.sortedZones(down.zones), up, online });
  }

  function renderUpcoming() {
    const zones = down.zones || {};
    const runs = [];
    const now = new Date();
    Object.values(down.schedules || {}).forEach((sch) => {
      if (!sch.enabled || !zones[sch.zone]) return;
      const [h, m] = String(sch.time || "").split(":").map(Number);
      for (let d = 0; d < 7; d++) {
        const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, h, m);
        if (at > now && (sch.days >> at.getDay()) & 1) runs.push({ at, sch });
      }
    });
    runs.sort((a, b) => a.at - b.at);
    const manual = (down.control || {}).mode === "manual";
    $("#upcoming").innerHTML =
      (manual ? '<div class="notice" style="margin-bottom:6px">อยู่ในโหมด Manual ตารางเวลาจะไม่ทำงาน</div>' : "") +
      (runs.length
        ? runs
            .slice(0, 12)
            .map(
              ({ at, sch }, i) => `<div class="run-item ${i ? "" : "next"}"><div><div class="d">${XF.fmtDate(at, { day: "2-digit", month: "2-digit", year: "numeric" })}</div>
                <div class="t">${XF.fmtTime(at)}</div></div>
                <div><b>${sch.fert ? "ให้น้ำ + ปุ๋ย" : "ให้น้ำ"}</b> ${esc(zones[sch.zone].name)}</div></div>`
            )
            .join("")
        : '<div class="empty">ยังไม่มีการตั้งเวลา</div>');
  }

  function renderForecast() {
    const data = forecastData;
    if (!data) return;
    const cur = data.current;
    const daily = data.daily;
    const [icon, text] = wx(cur.weather_code);
    $("#wxNow").innerHTML = `${fmt(cur.temperature_2m, 0)}<small>°C</small>`;
    $("#wxChips").innerHTML = [
      cur.wind_speed_10m != null ? `${XF.icon("wind")}${fmt(cur.wind_speed_10m, 0)} กม./ชม.` : "",
      `${XF.icon("drop")}${fmt(cur.relative_humidity_2m, 0)}%`,
      `${icon} ${text}`,
      `${fmt(daily.temperature_2m_max[0], 0)}° / ${fmt(daily.temperature_2m_min[0], 0)}°`,
    ]
      .filter(Boolean)
      .map((c) => `<span class="hero-chip">${c}</span>`)
      .join("");

    const names = ["วันนี้", "พรุ่งนี้"];
    const count = showAllDays ? daily.time.length : 4;
    const days = daily.time.slice(0, count).map((date, i) => {
      const [dIcon] = wx(daily.weather_code[i]);
      const label = names[i] || XF.fmtDate(date, { weekday: "short" });
      return `<div class="wx-day"><div class="small">${label}</div><div class="wx-icon">${dIcon}</div>
        <b>${fmt(daily.temperature_2m_max[i], 0)}°</b><div class="small muted">${fmt(daily.temperature_2m_min[i], 0)}°</div>
        <div class="small" style="color:var(--blue-ink)">ฝน ${fmt(daily.precipitation_probability_max[i], 0)}%</div></div>`;
    });
    $("#forecast").className = "";
    $("#forecast").innerHTML = `<div class="row"><span style="font-size:2rem">${icon}</span>
        <div><b>${text}</b><div class="small muted">ความชื้น ${fmt(cur.relative_humidity_2m, 0)}% · ฝนวันนี้ ${fmt(daily.precipitation_sum[0], 1)} มม.</div></div></div>
      <div class="wx-days">${days.join("")}</div>
      <div style="text-align:center;margin-top:10px"><a class="btn ghost sm" data-allow href="weather.html">ดูพยากรณ์ละเอียด</a></div>
      <div class="small muted" style="margin-top:8px">ข้อมูลพยากรณ์จาก Open-Meteo ตามพิกัดสวน</div>`;
    const more = $("#moreDays");
    if (more) {
      more.addEventListener("click", () => {
        showAllDays = !showAllDays;
        renderForecast();
      });
    }
  }

  async function loadWeather() {
    const lat = num(farm.lat, NaN);
    const lng = num(farm.lng, NaN);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      $("#forecast").innerHTML = 'ยังไม่ได้กำหนดตำแหน่งสวน <a href="settings.html#farm">ตั้งค่าตำแหน่ง</a>';
      return;
    }
    const key = `xf_wx_${lat.toFixed(3)}_${lng.toFixed(3)}`;
    if (key === weatherKey) return;
    weatherKey = key;
    try {
      const cached = JSON.parse(sessionStorage.getItem(key) || "null");
      if (cached && Date.now() - cached.at < 30 * 60000) {
        forecastData = cached.data;
      } else {
        const url =
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
          "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m" +
          "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum" +
          "&timezone=Asia%2FBangkok&forecast_days=7";
        const res = await fetch(url);
        if (!res.ok) throw new Error("HTTP " + res.status);
        forecastData = await res.json();
        sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data: forecastData }));
      }
      renderForecast();
    } catch (err) {
      console.error(err);
      weatherKey = "";
      $("#forecast").textContent = "โหลดพยากรณ์อากาศไม่สำเร็จ";
    }
  }

  renderHero();
  store.watch(XF.root + "/farm", (v) => {
    farm = v || {};
    farmReady = true;
    renderHero();
    renderDevice();
    loadWeather();
  });
  store.watch(XF.root + "/down", (v) => {
    down = v || {};
    renderEnv();
    renderDevice();
    renderUpcoming();
    renderToday();
  });
  XF.watchUp((v, isOnline) => {
    up = v;
    online = isOnline;
    renderEnv();
    renderDevice();
  });
  // ประวัติเพิ่มเมื่อจบงาน: รีเฟรชยอดวันนี้เป็นระยะ
  setInterval(renderToday, 60000);
});
