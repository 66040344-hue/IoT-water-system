// หน้าพยากรณ์อากาศละเอียด: รายชั่วโมง รายวัน (มีกราฟอุณหภูมิของแต่ละวัน) ความชื้น AQI UV ลม ความกดอากาศ ทัศนวิสัย อาทิตย์ขึ้น-ลง
// แหล่งข้อมูล: Open-Meteo Forecast API + Open-Meteo Air Quality API (ไม่ต้องใช้คีย์) ตามพิกัดสวน
XF.boot("weather", function () {
  const { store, $, esc, fmt, num } = XF;
  const TTL = 15 * 60 * 1000;
  let farm = {};

  if (XF.role === "viewer") $("#wxBack").setAttribute("href", "view.html");

  // ---------------------------------------------------------------- ตัวช่วย
  const wxInfo = (code, day) => {
    const d = day !== 0;
    if (code === 0) return [d ? "☀️" : "🌙", "ท้องฟ้าแจ่มใส"];
    if (code === 1) return [d ? "🌤️" : "🌙", "มีเมฆบางส่วน"];
    if (code === 2) return [d ? "⛅" : "☁️", "มีเมฆเป็นส่วนมาก"];
    if (code === 3) return ["☁️", "เมฆมาก"];
    if (code === 45 || code === 48) return ["🌫️", "หมอก"];
    if (code >= 51 && code <= 57) return ["🌦️", "ฝนปรอย"];
    if (code >= 61 && code <= 67) return ["🌧️", "ฝนตก"];
    if (code >= 80 && code <= 82) return ["🌧️", "ฝนตกเป็นช่วง"];
    if (code >= 95) return ["⛈️", "ฝนฟ้าคะนอง"];
    return ["🌥️", "–"];
  };

  // ดัชนีคุณภาพอากาศ US AQI
  const AQI_LEVELS = [
    { max: 50, label: "ดี", color: "#2fb457", ink: "#fff", tip: "อากาศดี ทำกิจกรรมกลางแจ้งได้ตามปกติ" },
    { max: 100, label: "ปานกลาง", color: "#f2c230", ink: "#2a2000", tip: "ยอมรับได้ ผู้ที่แพ้ง่ายมากควรระวัง" },
    { max: 150, label: "เริ่มมีผลต่อกลุ่มเสี่ยง", color: "#f08a24", ink: "#2a1400", tip: "กลุ่มเสี่ยงควรลดกิจกรรมกลางแจ้งที่ใช้แรงมาก" },
    { max: 200, label: "มีผลต่อสุขภาพ", color: "#e0443e", ink: "#fff", tip: "ควรสวมหน้ากากกันฝุ่นเมื่ออยู่กลางแจ้ง" },
    { max: 300, label: "มีผลต่อสุขภาพมาก", color: "#8e3fa8", ink: "#fff", tip: "หลีกเลี่ยงการทำงานกลางแจ้งนาน ๆ" },
    { max: Infinity, label: "อันตราย", color: "#7a1f2b", ink: "#fff", tip: "งดกิจกรรมกลางแจ้ง" },
  ];
  const aqiLevel = (v) => AQI_LEVELS.find((l) => v <= l.max) || AQI_LEVELS[AQI_LEVELS.length - 1];

  const UV_LEVELS = [
    { max: 2.9, label: "ต่ำ", color: "#2fb457", tip: "ปลอดภัย ไม่ต้องป้องกันเป็นพิเศษ" },
    { max: 5.9, label: "ปานกลาง", color: "#f2c230", tip: "ควรสวมหมวกและครีมกันแดดเมื่ออยู่กลางแจ้งนาน" },
    { max: 7.9, label: "สูง", color: "#f08a24", tip: "ลดการอยู่กลางแดดช่วง 10:00–15:00" },
    { max: 10.9, label: "สูงมาก", color: "#e0443e", tip: "ควรทำงานในร่มหรือใช้เสื้อคลุมแขนยาวช่วงเที่ยง" },
    { max: Infinity, label: "รุนแรงสุดขีด", color: "#8e3fa8", tip: "หลีกเลี่ยงการอยู่กลางแดด" },
  ];
  const uvLevel = (v) => UV_LEVELS.find((l) => v <= l.max) || UV_LEVELS[UV_LEVELS.length - 1];

  const COMPASS = ["เหนือ", "ตะวันออกเฉียงเหนือ", "ตะวันออก", "ตะวันออกเฉียงใต้", "ใต้", "ตะวันตกเฉียงใต้", "ตะวันตก", "ตะวันตกเฉียงเหนือ"];
  const compassName = (deg) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

  const hhmm = (iso) => String(iso || "").slice(11, 16);
  const minutesOf = (iso) => {
    const [h, m] = hhmm(iso).split(":").map(Number);
    return h * 60 + m;
  };
  const dayLabel = (dateStr, i) => (i === 0 ? "วันนี้" : i === 1 ? "พรุ่งนี้" : XF.fmtDate(dateStr + "T00:00:00", { weekday: "short" }));
  const dateShort = (dateStr) => XF.fmtDate(dateStr + "T00:00:00", { day: "numeric", month: "short" });
  const r0 = (v) => (Number.isFinite(+v) ? Math.round(+v) : "–");

  // เส้นโค้งเรียบผ่านจุด
  function smooth(pts) {
    if (pts.length < 2) return "";
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const cx = ((x0 + x1) / 2).toFixed(1);
      d += ` C${cx},${y0.toFixed(1)} ${cx},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
    }
    return d;
  }

  // ---------------------------------------------------------------- ดึงข้อมูล
  async function getJson(url, key) {
    try {
      const cached = JSON.parse(sessionStorage.getItem(key) || "null");
      if (cached && Date.now() - cached.at < TTL) return cached;
    } catch (err) {
      /* ไม่มีแคชก็ดึงใหม่ */
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const entry = { at: Date.now(), data: await res.json() };
    try {
      sessionStorage.setItem(key, JSON.stringify(entry));
    } catch (err) {
      /* เต็ม/ปิดใช้ ก็ข้ามไป */
    }
    return entry;
  }

  async function load(force) {
    const lat = num(farm.lat, NaN);
    const lng = num(farm.lng, NaN);
    const body = $("#wxBody");
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      body.innerHTML = '<div class="card empty">ยังไม่ได้กำหนดตำแหน่งสวน <a href="settings.html#farm">ตั้งค่าตำแหน่งสวน</a> เพื่อดูพยากรณ์อากาศ</div>';
      return;
    }
    const k = `${lat.toFixed(3)}_${lng.toFixed(3)}`;
    if (force) {
      sessionStorage.removeItem("xf_wxp_" + k);
      sessionStorage.removeItem("xf_aqp_" + k);
    }
    const fUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      "&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m" +
      "&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m,uv_index,visibility,pressure_msl,is_day" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,daylight_duration,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max" +
      "&timezone=Asia%2FBangkok&past_days=1&forecast_days=7";
    const aUrl =
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}` +
      "&current=us_aqi,pm2_5,pm10,ozone,nitrogen_dioxide&hourly=us_aqi,pm2_5&timezone=Asia%2FBangkok&past_days=1&forecast_days=3";
    body.setAttribute("aria-busy", "true");
    const [w, a] = await Promise.allSettled([getJson(fUrl, "xf_wxp_" + k), getJson(aUrl, "xf_aqp_" + k)]);
    body.removeAttribute("aria-busy");
    if (w.status !== "fulfilled") {
      console.error(w.reason);
      body.innerHTML = '<div class="card empty">โหลดพยากรณ์อากาศไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วกด "รีเฟรช"</div>';
      return;
    }
    if (a.status !== "fulfilled") console.warn("AQI unavailable", a.reason);
    render(w.value.data, a.status === "fulfilled" ? a.value.data : null, w.value.at);
  }

  // ---------------------------------------------------------------- ส่วนแสดงผล
  function render(wx, aq, fetchedAt) {
    const cur = wx.current;
    const H = wx.hourly;
    const D = wx.daily;
    const nowKey = cur.time.slice(0, 13);
    let ni = H.time.findIndex((t) => t.slice(0, 13) === nowKey);
    if (ni < 0) ni = 0;
    const todayStr = cur.time.slice(0, 10);
    let di = D.time.indexOf(todayStr);
    if (di < 0) di = 0;
    const isDay = cur.is_day;
    const [icon, text] = wxInfo(cur.weather_code, isDay);
    const vis = H.visibility ? H.visibility[ni] : null;
    const uvNow = H.uv_index ? H.uv_index[ni] : null;

    $("#wxPlace").textContent = `${farm.name || "สวน"} · ${farm.address || `${num(farm.lat).toFixed(3)}, ${num(farm.lng).toFixed(3)}`} · อัปเดต ${XF.fmtTime(fetchedAt)}`;

    $("#wxBody").innerHTML = [
      heroHtml(cur, icon, text, D, di),
      adviceHtml(cur, H, ni, D, di),
      metricsHtml(cur, H, ni, D, di, aq, vis, uvNow),
      hourlyHtml(H, ni),
      dailyHtml(H, D, di, todayStr, num(cur.time.slice(11, 13))),
    ].join("");

    // ปุ่มเลื่อนแถบรายชั่วโมง
    const strip = $("#hourStrip");
    XF.$$("[data-scroll]").forEach((b) =>
      b.addEventListener("click", () => strip.scrollBy({ left: +b.dataset.scroll * 280, behavior: "smooth" }))
    );
  }

  function heroHtml(cur, icon, text, D, di) {
    return `<section class="card wx-now">
      <div class="wx-now-main">
        <div class="wx-now-icon" aria-hidden="true">${icon}</div>
        <div>
          <div class="wx-now-temp num">${r0(cur.temperature_2m)}<small>°C</small></div>
          <div class="wx-now-text">${esc(text)}</div>
        </div>
      </div>
      <div class="wx-now-side">
        <div><small>รู้สึกเหมือน</small><b>${r0(cur.apparent_temperature)}°</b></div>
        <div><small>สูงสุด / ต่ำสุด</small><b>${r0(D.temperature_2m_max[di])}° / ${r0(D.temperature_2m_min[di])}°</b></div>
        <div><small>โอกาสฝนวันนี้</small><b>${r0(D.precipitation_probability_max[di])}%</b></div>
        <div><small>ปริมาณฝนวันนี้</small><b>${fmt(D.precipitation_sum[di], 1)} มม.</b></div>
      </div>
    </section>`;
  }

  // ข้อแนะนำสั้น ๆ สำหรับงานในสวน จากพยากรณ์ 24 ชม. ข้างหน้า
  function adviceHtml(cur, H, ni, D, di) {
    const next = (arr) => arr.slice(ni, ni + 24).map(Number).filter(Number.isFinite);
    const maxRain = Math.max(0, ...next(H.precipitation_probability));
    const sumRain = next(H.precipitation).reduce((s, v) => s + v, 0);
    const maxTemp = Math.max(...next(H.temperature_2m));
    const maxWind = Math.max(0, ...next(H.wind_speed_10m), num(cur.wind_gusts_10m));
    const tips = [];
    if (maxRain >= 60 || sumRain >= 5) tips.push(["💧", `มีโอกาสฝนสูง (สูงสุด ${r0(maxRain)}% · รวม ${fmt(sumRain, 1)} มม. ใน 24 ชม.) พิจารณาลดหรือเลื่อนการให้น้ำ`]);
    else if (maxRain < 20 && sumRain < 1) tips.push(["☀️", "24 ชม. ข้างหน้าแทบไม่มีฝน ให้น้ำตามแผนได้ตามปกติ"]);
    if (maxTemp >= 35) tips.push(["🌡️", `อุณหภูมิสูงสุด ${r0(maxTemp)}° ควรให้น้ำช่วงเช้าหรือเย็น เลี่ยงช่วงเที่ยง`]);
    if (maxWind >= 25) tips.push(["💨", `ลมแรงถึง ${r0(maxWind)} กม./ชม. ไม่เหมาะกับการฉีดพ่นทางใบ`]);
    if (!tips.length) tips.push(["🌿", "สภาพอากาศอยู่ในเกณฑ์ปกติสำหรับงานในสวน"]);
    return `<section class="card wx-advice"><div class="card-title">ข้อแนะนำสำหรับสวนใน 24 ชั่วโมงข้างหน้า</div>
      <ul>${tips.map(([i, t]) => `<li><span aria-hidden="true">${i}</span><span>${esc(t)}</span></li>`).join("")}</ul></section>`;
  }

  function metricsHtml(cur, H, ni, D, di, aq, vis, uvNow) {
    return `<div class="wx-metrics">
      ${humidityCard(cur, H, ni)}
      ${aqiCard(aq)}
      ${uvCard(uvNow, D, di)}
      ${windCard(cur)}
      ${pressureCard(cur, H, ni)}
      ${visibilityCard(vis)}
      ${sunCard(D, di, cur.time)}
    </div>`;
  }

  const metric = (title, value, unit, sub, visual, wide) =>
    `<section class="card wx-metric${wide ? " wide" : ""}"><div class="stat-label">${title}</div>
      <div class="num">${value}<small>${unit}</small></div>
      ${sub ? `<div class="wx-sub">${sub}</div>` : ""}${visual || ""}</section>`;

  function humidityCard(cur, H, ni) {
    const h = num(cur.relative_humidity_2m);
    const desc = h >= 85 ? "ชื้นมาก (เสี่ยงโรคราได้ง่าย)" : h >= 70 ? "ค่อนข้างชื้น" : h >= 40 ? "สบาย" : "แห้ง";
    // จุดน้ำค้างโดยประมาณ (Magnus)
    const t = num(cur.temperature_2m);
    const g = Math.log(Math.max(h, 1) / 100) + (17.62 * t) / (243.12 + t);
    const dew = (243.12 * g) / (17.62 - g);
    const bar = `<div class="wx-scale"><i style="width:${Math.min(100, h)}%;background:var(--blue)"></i></div>`;
    return metric("ความชื้นสัมพัทธ์", r0(h), "%", `${desc} · จุดน้ำค้าง ${r0(dew)}°`, bar);
  }

  function aqiCard(aq) {
    if (!aq || !aq.current || aq.current.us_aqi == null) return metric("คุณภาพอากาศ (AQI)", "–", "", "ไม่มีข้อมูลคุณภาพอากาศ ณ พิกัดนี้");
    const v = Math.round(aq.current.us_aqi);
    const lv = aqiLevel(v);
    const pos = Math.min(100, (v / 300) * 100);
    const scale = `<div class="wx-scale seg6" aria-hidden="true">${AQI_LEVELS.slice(0, 5)
      .map((l, i) => `<span style="background:${l.color};flex:${[50, 50, 50, 50, 100][i]}"></span>`)
      .join("")}<em style="left:${pos}%"></em></div>`;
    const idx = aq.hourly ? aq.hourly.time.findIndex((t) => t.slice(0, 13) === (aq.current.time || "").slice(0, 13)) : -1;
    const bars =
      idx >= 0
        ? `<div class="wx-aqbars" aria-label="AQI 24 ชั่วโมงข้างหน้า">${aq.hourly.us_aqi
            .slice(idx, idx + 24)
            .map((x, i) => `<i title="${hhmm(aq.hourly.time[idx + i])} · AQI ${Math.round(x)}" style="height:${Math.max(6, Math.min(100, (x / 200) * 100))}%;background:${aqiLevel(x).color}"></i>`)
            .join("")}</div>`
        : "";
    return `<section class="card wx-metric wide"><div class="stat-label">คุณภาพอากาศ (US AQI)</div>
      <div class="row wrap" style="gap:12px;align-items:center">
        <div class="num">${v}</div>
        <span class="wx-chip" style="background:${lv.color};color:${lv.ink}">${esc(lv.label)}</span>
      </div>
      <div class="wx-sub">${esc(lv.tip)}</div>
      ${scale}
      <div class="wx-pm">
        <span>PM2.5 <b>${fmt(aq.current.pm2_5, 1)}</b> µg/m³</span>
        <span>PM10 <b>${fmt(aq.current.pm10, 1)}</b> µg/m³</span>
        ${aq.current.ozone != null ? `<span>โอโซน <b>${fmt(aq.current.ozone, 0)}</b> µg/m³</span>` : ""}
      </div>
      ${bars}<div class="wx-axis"><span>ตอนนี้</span><span>+12 ชม.</span><span>+24 ชม.</span></div>
    </section>`;
  }

  function uvCard(uvNow, D, di) {
    const max = D.uv_index_max ? D.uv_index_max[di] : null;
    const v = uvNow != null ? uvNow : max;
    if (v == null) return metric("ดัชนี UV", "–", "", "ไม่มีข้อมูล");
    const lv = uvLevel(v);
    const pos = Math.min(100, (v / 12) * 100);
    const scale = `<div class="wx-scale seg6" aria-hidden="true">${UV_LEVELS.map((l, i) => `<span style="background:${l.color};flex:${[3, 3, 2, 3, 1][i]}"></span>`).join("")}<em style="left:${pos}%"></em></div>`;
    return metric(
      "ดัชนี UV",
      fmt(v, 1),
      "",
      `<b style="color:${lv.color}">${esc(lv.label)}</b> · ${esc(lv.tip)}${max != null ? `<br>สูงสุดวันนี้ ${fmt(max, 1)}` : ""}`,
      scale
    );
  }

  function windCard(cur) {
    const deg = num(cur.wind_direction_10m);
    const dial = `<svg class="wx-compass" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="44" class="wx-ring"/>
        ${[0, 90, 180, 270].map((a, i) => `<text x="${50 + 35 * Math.sin((a * Math.PI) / 180)}" y="${50 - 35 * Math.cos((a * Math.PI) / 180) + 4}" text-anchor="middle" class="wx-cardinal">${"NESW"[i]}</text>`).join("")}
        <g transform="rotate(${(deg + 180) % 360} 50 50)"><path d="M50 18 L58 52 L50 46 L42 52 Z" class="wx-arrow"/></g>
      </svg>`;
    return `<section class="card wx-metric"><div class="stat-label">ลม</div>
      <div class="wx-wind">
        <div><div class="num">${r0(cur.wind_speed_10m)}<small>กม./ชม.</small></div>
          <div class="wx-sub">พัดจากทิศ${compassName(deg)} (${r0(deg)}°)<br>กระโชกสูงสุด ${r0(cur.wind_gusts_10m)} กม./ชม.</div></div>
        ${dial}
      </div></section>`;
  }

  function pressureCard(cur, H, ni) {
    const p = num(cur.pressure_msl);
    const past = H.pressure_msl ? H.pressure_msl[Math.max(0, ni - 3)] : null;
    let trend = "คงที่";
    if (past != null) {
      const d = p - past;
      trend = d > 1 ? "กำลังสูงขึ้น (อากาศมักแจ่มใส)" : d < -1 ? "กำลังลดลง (อาจมีฝน/พายุ)" : "คงที่";
    }
    const level = p < 1009 ? "ต่ำกว่าปกติ" : p > 1020 ? "สูงกว่าปกติ" : "ปกติ";
    const pos = Math.min(100, Math.max(0, ((p - 990) / 50) * 100));
    const scale = `<div class="wx-scale"><i style="left:${pos}%" class="mark"></i></div>`;
    return metric("ความกดอากาศ", fmt(p, 0), "hPa", `${level} · ${trend}`, scale);
  }

  function visibilityCard(vis) {
    if (vis == null) return metric("ทัศนวิสัย", "–", "", "ไม่มีข้อมูล");
    const km = vis / 1000;
    const desc = km >= 20 ? "ไกลมาก มองเห็นชัดเจน" : km >= 10 ? "ดี" : km >= 5 ? "ปานกลาง" : km >= 2 ? "ต่ำ (อาจมีหมอก/ฝุ่น)" : "ต่ำมาก ควรระวัง";
    return metric("ทัศนวิสัย", fmt(km, km >= 10 ? 0 : 1), "กม.", desc, `<div class="wx-scale"><i style="width:${Math.min(100, (km / 30) * 100)}%;background:var(--green)"></i></div>`);
  }

  function sunCard(D, di, nowIso) {
    const rise = D.sunrise[di];
    const set = D.sunset[di];
    const a = minutesOf(rise);
    const b = minutesOf(set);
    const n = minutesOf(nowIso);
    const t = Math.min(1, Math.max(0, (n - a) / (b - a)));
    const cx = 110;
    const cy = 100;
    const r = 84;
    const sx = cx - r * Math.cos(Math.PI * t);
    const sy = cy - r * Math.sin(Math.PI * t);
    const lenMin = Math.round(num(D.daylight_duration[di]) / 60) || b - a;
    const arc = `<svg class="wx-sun" viewBox="0 0 220 120" aria-hidden="true">
        <path d="M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}" class="wx-sun-track"/>
        <path d="M${cx - r},${cy} A${r},${r} 0 0 1 ${sx.toFixed(1)},${sy.toFixed(1)}" class="wx-sun-done"/>
        <line x1="${cx - r - 12}" y1="${cy}" x2="${cx + r + 12}" y2="${cy}" class="wx-sun-ground"/>
        <circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="8" class="wx-sun-dot"/>
      </svg>`;
    return `<section class="card wx-metric wide"><div class="stat-label">อาทิตย์ขึ้น – อาทิตย์ตก</div>
      <div class="wx-sunrow">
        <div class="wx-suntime"><small>ขึ้น</small><b>${hhmm(rise)}</b></div>
        ${arc}
        <div class="wx-suntime"><small>ตก</small><b>${hhmm(set)}</b></div>
      </div>
      <div class="wx-sub">กลางวันยาว ${Math.floor(lenMin / 60)} ชม. ${lenMin % 60} นาที</div>
    </section>`;
  }

  // กราฟรายชั่วโมง 48 ชม.: เส้นอุณหภูมิ + แท่งโอกาสฝน (เลื่อนซ้ายขวาได้)
  function hourlyHtml(H, ni) {
    const N = 48;
    const idx = Array.from({ length: N }, (_, i) => ni + i).filter((i) => i < H.time.length);
    const temps = idx.map((i) => H.temperature_2m[i]);
    const step = 30;
    const padL = 24;
    const W = padL * 2 + step * (idx.length - 1);
    const top = 34;
    const base = 138;
    const lo = Math.floor(Math.min(...temps) - 1);
    const hi = Math.ceil(Math.max(...temps) + 1);
    const y = (t) => base - ((t - lo) / (hi - lo || 1)) * (base - top);
    const pts = idx.map((_, i) => [padL + i * step, y(temps[i])]);
    const line = smooth(pts);
    const area = `${line} L${pts[pts.length - 1][0]},${base} L${pts[0][0]},${base} Z`;
    const rainBars = idx
      .map((hi2, i) => {
        const p = num(H.precipitation_probability[hi2]);
        const h = (p / 100) * 40;
        return `<rect x="${padL + i * step - 8}" y="${190 - h}" width="16" height="${Math.max(h, p > 0 ? 2 : 0)}" rx="3" class="wx-rainbar"><title>${hhmm(H.time[hi2])} ฝน ${r0(p)}%</title></rect>`;
      })
      .join("");
    const labels = idx
      .map((hi2, i) => {
        const x = padL + i * step;
        const out = [];
        if (i % 3 === 0) {
          out.push(`<text x="${x}" y="${pts[i][1] - 10}" text-anchor="middle" class="wx-tl">${r0(temps[i])}°</text>`);
          out.push(`<text x="${x}" y="212" text-anchor="middle" class="wx-xl">${i === 0 ? "ตอนนี้" : hhmm(H.time[hi2])}</text>`);
          out.push(`<circle cx="${x}" cy="${pts[i][1]}" r="3.5" class="wx-pt"/>`);
        }
        if (H.time[hi2].slice(11, 13) === "00" && i > 0) out.push(`<line x1="${x}" y1="${top - 16}" x2="${x}" y2="196" class="wx-midnight"/><text x="${x + 4}" y="${top - 6}" class="wx-xl">${dateShort(H.time[hi2].slice(0, 10))}</text>`);
        return out.join("");
      })
      .join("");
    const grid = [lo, (lo + hi) / 2, hi].map((t) => `<line x1="0" y1="${y(t).toFixed(1)}" x2="${W}" y2="${y(t).toFixed(1)}" class="wx-grid"/>`).join("");
    const chart = `<svg class="wx-chart" viewBox="0 0 ${W} 222" width="${W}" height="222" role="img" aria-label="กราฟอุณหภูมิและโอกาสฝนราย 48 ชั่วโมง">
        <defs><linearGradient id="wxArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--orange)" stop-opacity=".35"/><stop offset="1" stop-color="var(--orange)" stop-opacity="0"/></linearGradient></defs>
        ${grid}<path d="${area}" fill="url(#wxArea)"/>${rainBars}<path d="${line}" class="wx-line"/>${labels}
        <text x="${padL}" y="${base + 26}" class="wx-xl wx-note">แท่งฟ้า = โอกาสฝน</text>
      </svg>`;

    const strip = idx
      .slice(0, 24)
      .map((i2, k) => {
        const [ic] = wxInfo(H.weather_code[i2], H.is_day ? H.is_day[i2] : 1);
        const p = r0(H.precipitation_probability[i2]);
        return `<div class="wx-hour${k === 0 ? " now" : ""}"><small>${k === 0 ? "ตอนนี้" : hhmm(H.time[i2])}</small>
          <span class="wx-hicon" aria-hidden="true">${ic}</span><b>${r0(H.temperature_2m[i2])}°</b>
          <small class="rain">${p}%</small><small>${r0(H.wind_speed_10m[i2])} กม./ชม.</small></div>`;
      })
      .join("");

    return `<section class="card wx-block"><div class="row between"><div class="card-title">รายชั่วโมง</div>
        <div class="row no-print"><button class="icon-btn" data-scroll="-1" aria-label="เลื่อนไปก่อนหน้า">‹</button><button class="icon-btn" data-scroll="1" aria-label="เลื่อนไปถัดไป">›</button></div></div>
      <div class="wx-strip" id="hourStrip" tabindex="0" aria-label="พยากรณ์รายชั่วโมง 24 ชั่วโมง">${strip}</div>
      <div class="card-title" style="margin-top:16px">กราฟ 48 ชั่วโมง</div>
      <div class="wx-chart-wrap" tabindex="0">${chart}</div></section>`;
  }

  // รายวัน: ไอคอน ช่วงอุณหภูมิ โอกาสฝน UV ลม และกราฟอุณหภูมิ 24 ชม. ของแต่ละวัน
  function dailyHtml(H, D, di, todayStr, nowHour) {
    const days = D.time.slice(di);
    const gMin = Math.min(...days.map((_, i) => D.temperature_2m_min[di + i]));
    const gMax = Math.max(...days.map((_, i) => D.temperature_2m_max[di + i]));
    const rows = days
      .map((date, i) => {
        const k = di + i;
        const hours = H.time.map((t, idx) => [t, idx]).filter(([t]) => t.slice(0, 10) === date);
        const temps = hours.map(([, idx]) => H.temperature_2m[idx]);
        const lo = D.temperature_2m_min[k];
        const hi = D.temperature_2m_max[k];
        const [ic, txt] = wxInfo(D.weather_code[k], 1);
        const left = ((lo - gMin) / (gMax - gMin || 1)) * 100;
        const width = Math.max(6, ((hi - lo) / (gMax - gMin || 1)) * 100);
        let spark = "";
        if (temps.length > 2) {
          const mn = Math.min(...temps);
          const mx = Math.max(...temps);
          const w = 168;
          const h = 44;
          const p = temps.map((t, j) => [4 + (j / (temps.length - 1)) * (w - 8), h - 6 - ((t - mn) / (mx - mn || 1)) * (h - 14)]);
          const nowDot =
            date === todayStr
              ? (() => {
                  const hr = Math.min(temps.length - 1, nowHour);
                  return `<circle cx="${p[hr][0].toFixed(1)}" cy="${p[hr][1].toFixed(1)}" r="3.4" class="wx-pt"/>`;
                })()
              : "";
          const iMax = temps.indexOf(mx);
          const iMin = temps.indexOf(mn);
          spark = `<svg class="wx-spark" viewBox="0 0 ${w} ${h}" aria-label="กราฟอุณหภูมิ 24 ชั่วโมงของ${dayLabel(date, i)}">
              <path d="${smooth(p)}" class="wx-line thin"/>
              <circle cx="${p[iMax][0].toFixed(1)}" cy="${p[iMax][1].toFixed(1)}" r="2.8" class="wx-max"/>
              <circle cx="${p[iMin][0].toFixed(1)}" cy="${p[iMin][1].toFixed(1)}" r="2.8" class="wx-min"/>${nowDot}</svg>`;
        }
        const uv = D.uv_index_max ? D.uv_index_max[k] : null;
        return `<div class="wx-day-row${i === 0 ? " today" : ""}">
          <div class="wx-d-name"><b>${dayLabel(date, i)}</b><small>${dateShort(date)}</small></div>
          <div class="wx-d-icon" title="${esc(txt)}"><span aria-hidden="true">${ic}</span><small>${esc(txt)}</small></div>
          <div class="wx-d-range"><span>${r0(lo)}°</span>
            <div class="wx-range"><i style="left:${left}%;width:${width}%"></i></div><span><b>${r0(hi)}°</b></span></div>
          <div class="wx-d-spark">${spark}</div>
          <div class="wx-d-meta">
            <span class="rain" title="โอกาสฝน / ปริมาณฝน">ฝน ${r0(D.precipitation_probability_max[k])}% · ${fmt(D.precipitation_sum[k], 1)} มม.</span>
            <span title="ดัชนี UV สูงสุด">UV ${uv != null ? fmt(uv, 0) : "–"}</span>
            <span title="ความเร็วลมสูงสุด">ลม ${r0(D.wind_speed_10m_max[k])} กม./ชม.</span>
          </div></div>`;
      })
      .join("");
    return `<section class="card wx-block"><div class="card-title">รายวัน 7 วัน</div>
      <div class="wx-days-list">${rows}</div>
      <div class="small muted" style="margin-top:8px">เส้นโค้งคืออุณหภูมิตลอด 24 ชั่วโมงของวันนั้น จุดส้ม = สูงสุด จุดฟ้า = ต่ำสุด</div></section>`;
  }

  // ---------------------------------------------------------------- เริ่มทำงาน
  $("#wxRefresh").addEventListener("click", () => load(true));
  store
    .get(XF.root + "/farm")
    .catch(() => null)
    .then((f) => {
      farm = f || {};
      return load(false);
    });
});
