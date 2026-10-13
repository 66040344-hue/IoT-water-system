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

  // ---------------------------------------------------------------- ท้องฟ้าตามช่วงเวลาจริง (เวลาประเทศไทย)
  // แบ่ง 8 ช่วงจากเวลาอาทิตย์ขึ้น-ตกของพิกัดสวน (ถ้ายังไม่มีพยากรณ์ใช้ 06:00 / 18:00)
  const PHASES = {
    predawn: { label: "เช้ามืด", greet: "สวัสดีตอนเช้ามืด" },
    morning: { label: "เช้า", greet: "สวัสดีตอนเช้า" },
    late: { label: "สาย", greet: "สวัสดีตอนสาย" },
    noon: { label: "เที่ยง", greet: "สวัสดีตอนเที่ยง" },
    afternoon: { label: "บ่าย", greet: "สวัสดีตอนบ่าย" },
    sunset: { label: "ใกล้ค่ำ", greet: "สวัสดีตอนใกล้ค่ำ" },
    dusk: { label: "ค่ำ", greet: "สวัสดีตอนค่ำ" },
    night: { label: "กลางคืน", greet: "สวัสดียามค่ำคืน" },
  };

  function bangkokMinutes() {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
    const h = +parts.find((p) => p.type === "hour").value % 24;
    return h * 60 + +parts.find((p) => p.type === "minute").value;
  }

  function skyState() {
    const hm = (iso) => {
      const [h, m] = String(iso).slice(11, 16).split(":").map(Number);
      return h * 60 + m;
    };
    const d = forecastData && forecastData.daily;
    let rise = 360;
    let set = 1080;
    if (d && d.sunrise && d.sunrise[0] && d.sunset && d.sunset[0]) {
      rise = hm(d.sunrise[0]);
      set = hm(d.sunset[0]);
    }
    const n = bangkokMinutes();
    const noon = (rise + set) / 2;
    let phase = "night";
    if (n >= rise - 90 && n < rise) phase = "predawn";
    else if (n >= rise && n < rise + 150) phase = "morning";
    else if (n >= rise + 150 && n < noon - 45) phase = "late";
    else if (n >= noon - 45 && n < noon + 45) phase = "noon";
    else if (n >= noon + 45 && n < set - 90) phase = "afternoon";
    else if (n >= set - 90 && n < set) phase = "sunset";
    else if (n >= set && n < set + 90) phase = "dusk";

    // ดวงอาทิตย์เคลื่อนเป็นโค้งจากขอบฟ้าตะวันออกไปตะวันตก ดวงจันทร์ใช้ช่วงกลางคืน
    const sunUp = n >= rise && n <= set;
    const t = Math.min(1, Math.max(0, (n - rise) / (set - rise)));
    const nightLen = 1440 - set + rise;
    const tn = Math.min(1, Math.max(0, (((n - set) % 1440) + 1440) % 1440 / nightLen));
    const moonUp = !sunUp || n - set < 20;
    const cloudBy = { 0: 0.12, 1: 0.35, 2: 0.6, 3: 0.88 };
    const code = forecastData && forecastData.current ? forecastData.current.weather_code : 0;
    const cloud = code in cloudBy ? cloudBy[code] : code >= 45 ? 0.95 : 0.6;
    const stars = { night: 1, dusk: 0.7, predawn: 0.6, sunset: 0.08 }[phase] || 0;
    return {
      phase,
      sx: 10 + 80 * t,
      sy: 80 - 64 * Math.sin(Math.PI * t),
      sunO: sunUp ? 1 : 0,
      mx: 12 + 76 * tn,
      my: 80 - 62 * Math.sin(Math.PI * tn),
      moonO: moonUp ? 1 : 0,
      stars: stars * (1 - cloud * 0.6),
      cloud,
    };
  }

  // ดวงจันทร์ตามข้างขึ้นข้างแรมจริง (รอบ 29.53 วัน นับจากวันเดือนดับ 6 ม.ค. 2000)
  function moonSvg() {
    const p = ((((Date.now() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000) % 29.530588) + 29.530588) % 29.530588 / 29.530588;
    const r = 20;
    const c = 24;
    const k = Math.cos(2 * Math.PI * p);
    const rx = Math.abs(k) * r;
    const lit = `M${c},${c - r} A${r},${r} 0 0 1 ${c},${c + r} A${rx.toFixed(2)},${r} 0 0 ${k > 0 ? 0 : 1} ${c},${c - r} Z`;
    return `<svg viewBox="0 0 48 48" width="48" height="48"><circle cx="${c}" cy="${c}" r="${r}" fill="rgba(210,225,255,.16)"/>
      <path d="${lit}" fill="#f6f1dc" transform="${p > 0.5 ? `rotate(180 ${c} ${c})` : ""}"/></svg>`;
  }

  function renderSky() {
    const hero = $(".hero");
    if (!hero) return;
    let sky = $(".sky", hero);
    if (!sky) {
      sky = document.createElement("div");
      sky.className = "sky";
      sky.setAttribute("aria-hidden", "true");
      sky.innerHTML = '<div class="sky-stars"></div><div class="sky-stars b"></div><div class="sky-sun"></div><div class="sky-moon"></div>' +
        '<div class="sky-cloud c1"></div><div class="sky-cloud c2"></div><div class="sky-cloud c3"></div>';
      hero.prepend(sky);
    }
    const s = skyState();
    hero.dataset.phase = s.phase;
    const st = hero.style;
    st.setProperty("--sx", s.sx.toFixed(1));
    st.setProperty("--sy", s.sy.toFixed(1));
    st.setProperty("--mx", s.mx.toFixed(1));
    st.setProperty("--my", s.my.toFixed(1));
    st.setProperty("--sun-o", s.sunO);
    st.setProperty("--moon-o", s.moonO);
    st.setProperty("--stars", s.stars.toFixed(2));
    st.setProperty("--cloud", s.cloud.toFixed(2));
    const moon = $(".sky-moon", sky);
    if (!moon.firstChild) moon.innerHTML = moonSvg();
    return s;
  }

  function renderHero() {
    const s = renderSky() || { phase: "morning" };
    const ph = PHASES[s.phase];
    $("#farmPill").innerHTML = `${XF.icon("pin")}<span>${esc(farm.name || "ยังไม่ได้ตั้งชื่อสวน")}</span>`;
    $("#today").textContent = `${XF.fmtDate(Date.now())} · ช่วง${ph.label}`;
    $("#greet").textContent = `${ph.greet} คุณ ${XF.user.name}`;
  }

  function spareValue() {
    const cfg = ((down.settings || {}).spare_adc) || {};
    const raw = (up.sensors || {}).adc;
    if (!cfg.enabled || raw == null) return null;
    const span = num(cfg.raw_max, 4095) - num(cfg.raw_min);
    const ratio = span ? Math.min(1, Math.max(0, (raw - num(cfg.raw_min)) / span)) : 0;
    return { name: cfg.name || "ช่องสำรอง", unit: cfg.unit || "", value: num(cfg.out_min) + ratio * (num(cfg.out_max, 100) - num(cfg.out_min)) };
  }

  // ---------------------------------------------------------------- VPD และความต้องการน้ำโดยประมาณ
  // VPD (kPa) = ความดันไอน้ำอิ่มตัว × (1 − RH/100) ใช้สูตร Tetens
  const vpdOf = (t, rh) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3)) * (1 - Math.min(100, Math.max(0, rh)) / 100);
  const vpdLevel = (v) =>
    v < 0.4 ? ["ต่ำมาก", "ชื้นจัด พืชคายน้ำน้อย เสี่ยงโรคราได้ง่าย"] :
    v < 0.8 ? ["ต่ำ", "คายน้ำน้อย"] :
    v < 1.6 ? ["เหมาะสม", "พืชคายน้ำได้ดี"] :
    v < 2.4 ? ["สูง", "อากาศแห้ง พืชคายน้ำมาก"] : ["สูงมาก", "อากาศแห้งจัด เสี่ยงเครียดน้ำ"];
  const pos = (v, fallback) => (num(v, 0) > 0 ? num(v) : fallback);

  // ลิตร/ต้น/วัน = ETo (มม./วัน) × Kc × พื้นที่ทรงพุ่ม (ตร.ม.) ÷ ประสิทธิภาพระบบให้น้ำ
  // ETo มาจากพยากรณ์ของพิกัดสวน ส่วนค่าจากเซนเซอร์ปรับตามอัตราส่วน VPD ในแปลง ÷ VPD ของพยากรณ์ขณะนี้
  function waterDemand(vpdSensor, vpdForecast) {
    const st = down.settings || {};
    const eto = forecastData && forecastData.daily && forecastData.daily.et0_fao_evapotranspiration ? +forecastData.daily.et0_fao_evapotranspiration[0] : NaN;
    if (!Number.isFinite(eto)) return null;
    const diameter = pos(st.canopy_diameter_m, 8);
    const kc = pos(st.crop_kc, 0.9);
    const eff = pos(st.irrigation_efficiency, 90);
    const forecastL = (eto * kc * Math.PI * Math.pow(diameter / 2, 2)) / (eff / 100);
    let sensorL = null;
    if (vpdSensor != null && vpdForecast != null) {
      const ratio = Math.min(1.6, Math.max(0.6, vpdSensor / Math.max(vpdForecast, 0.2)));
      sensorL = forecastL * ratio;
    }
    return { eto, diameter, kc, eff, forecastL, sensorL };
  }

  // น้ำต่อต้นที่ตารางเวลาของวันนี้จะให้ (เฉลี่ยถ่วงน้ำหนักด้วยจำนวนต้น)
  function plannedTodayPerTree() {
    const day = new Date().getDay();
    const schedules = Object.values(down.schedules || {});
    let litres = 0;
    let trees = 0;
    Object.entries(down.zones || {}).forEach(([id, z]) => {
      const runs = schedules.filter((s) => s.enabled && s.zone === id && (s.days >> day) & 1).length;
      litres += runs * num(z.water_per_tree_l) * num(z.trees);
      trees += num(z.trees);
    });
    return trees && litres > 0 ? litres / trees : null;
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
    // VPD + ความต้องการน้ำต่อต้น (จากเซนเซอร์ในแปลงเป็นหลัก ถ้าไม่มีใช้ค่าพยากรณ์ของพิกัดสวน)
    const fcur = forecastData && forecastData.current;
    const vpdSensor = online && s.dht_ok && Number.isFinite(+s.temp) && Number.isFinite(+s.humi) ? vpdOf(+s.temp, +s.humi) : null;
    const vpdForecast = fcur && Number.isFinite(+fcur.temperature_2m) && Number.isFinite(+fcur.relative_humidity_2m) ? vpdOf(+fcur.temperature_2m, +fcur.relative_humidity_2m) : null;
    const vpdMain = vpdSensor != null ? vpdSensor : vpdForecast;
    const lvl = vpdMain != null ? vpdLevel(vpdMain) : null;
    tiles.push({
      icon: "gauge",
      wide: true,
      label: "VPD ความต้องการไอน้ำของอากาศ",
      value: vpdMain != null ? fmt(vpdMain, 2) : "–",
      unit: "kPa",
      note: vpdMain == null ? "รอข้อมูลเซนเซอร์หรือพยากรณ์" : `${lvl[0]} · ${lvl[1]}<br>${vpdSensor != null ? "จากเซนเซอร์ในแปลง" : "จากพยากรณ์อากาศ"}${vpdSensor != null && vpdForecast != null ? ` · พยากรณ์ ${fmt(vpdForecast, 2)}` : ""}`,
    });
    const dem = waterDemand(vpdSensor, vpdForecast);
    const planned = plannedTodayPerTree();
    if (dem) {
      const main = dem.sensorL != null ? dem.sensorL : dem.forecastL;
      tiles.push({
        icon: "drop",
        wide: true,
        label: "ความต้องการน้ำโดยประมาณ ต่อต้น",
        value: fmt(main, 0),
        unit: "ลิตร/ต้น/วัน",
        note: `${dem.sensorL != null ? "ปรับตามเซนเซอร์ในแปลง" : "จากพยากรณ์อากาศ"}${dem.sensorL != null ? ` · ตามพยากรณ์ ${fmt(dem.forecastL, 0)}` : ""}${planned != null ? `<br>ตารางวันนี้ให้ ${fmt(planned, 0)} ลิตร/ต้น` : ""}`,
      });
    } else {
      tiles.push({ icon: "drop", wide: true, label: "ความต้องการน้ำโดยประมาณ ต่อต้น", value: "–", unit: "ลิตร/ต้น/วัน", note: "รอข้อมูลพยากรณ์ของพิกัดสวน" });
    }
    const noteEl = $("#envNote");
    if (noteEl) {
      noteEl.innerHTML = dem
        ? `ประมาณการ: ETo ${fmt(dem.eto, 1)} มม./วัน (พยากรณ์) × Kc ${fmt(dem.kc, 2)} × พื้นที่ทรงพุ่ม ⌀${fmt(dem.diameter, 1)} ม. ÷ ประสิทธิภาพ ${fmt(dem.eff, 0)}% ใช้เป็นแนวทาง ไม่ใช่ค่าวัดจริง ปรับ Kc และขนาดทรงพุ่มได้ที่ <a href="settings.html#sprinkler">ตั้งค่า &gt; หัวสปริงเกอร์</a>`
        : "";
    }
    $("#env").innerHTML = tiles
      .map(
        (t) => `<div class="card${t.wide ? " wide" : ""}"><span class="stat-ico">${XF.icon(t.icon)}</span>
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
      .join("") +
      `<a class="hero-chip" data-allow href="weather.html">ดูรายละเอียดสภาพอากาศ ›</a>`;

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
    const key = `xf_wx3_${lat.toFixed(3)}_${lng.toFixed(3)}`;
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
          "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,et0_fao_evapotranspiration,sunrise,sunset" +
          "&timezone=Asia%2FBangkok&forecast_days=7";
        const res = await fetch(url);
        if (!res.ok) throw new Error("HTTP " + res.status);
        forecastData = await res.json();
        sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data: forecastData }));
      }
      renderEnv();
      renderHero();
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
  // ท้องฟ้าขยับตามเวลา (ดวงอาทิตย์/จันทร์ และเปลี่ยนช่วงเวลา) ทุก 1 นาที
  setInterval(renderHero, 60000);
});
