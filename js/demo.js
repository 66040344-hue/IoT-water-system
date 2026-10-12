// อุปกรณ์จำลองสำหรับโหมดสาธิต: ทำงานแทน ESP32 + STM32 ในเบราว์เซอร์
// ใช้ลำดับงานเดียวกับเฟิร์มแวร์ (ให้น้ำนำ -> จ่ายปุ๋ย -> ล้างท่อ -> ให้น้ำต่อจนครบ) ตามเวลาจริง
(function () {
  const R = { water: 1, fert: 2, main: 4, tank: (t) => 8 << (t - 1), flush: 64 };

  XF.startDemoDevice = function () {
    const store = XF.store;
    const root = XF.root;
    const SIM_KEY = "xf_demo_sim_" + XF.deviceId;
    const num = XF.num;

    let down = null;
    store.watch(root + "/down", (v) => (down = v || {}));

    const sim = JSON.parse(localStorage.getItem(SIM_KEY) || "null") || { queue: [], job: null, lastCmd: null, fired: {}, manual: null, flow: [0, 0, 0] };
    let lastTick = Date.now();

    const pushHistory = (rec) => store.push(root + "/history", rec);

    function enqueue(zoneId, source, withFert, amounts) {
      const s = down.settings || {};
      const zone = (down.zones || {})[zoneId];
      const plan = zone ? XF.zonePlan(zone, s, withFert) : { waterL: 0, fertMl: 0, flow: num((s.water_pump || {}).lpm), tank: 1 };
      const job = {
        zone: zoneId,
        zoneName: zone ? zone.name : zoneId,
        source,
        waterL: amounts ? num(amounts.water_l) : plan.waterL,
        fertMl: amounts ? num(amounts.fert_ml) : plan.fertMl,
        tank: amounts ? num(amounts.tank, 1) : plan.tank,
        flow: plan.flow,
      };
      const reject = (note) =>
        pushHistory({ start: Date.now() / 1000, end: Date.now() / 1000, zone: zoneId, zone_name: job.zoneName, source, water_l: 0, fert_ml: 0, tank: 0, status: "error", note });
      if (job.waterL <= 0 && job.fertMl <= 0) return reject("ไม่ได้กำหนดปริมาณน้ำ/ปุ๋ยของโซน");
      if (job.waterL > 0 && job.flow <= 0) return reject("ยังไม่ได้ตั้งค่าอัตราการไหลของปั๊มน้ำ");
      sim.queue.push(job);
    }

    function finish(status, note) {
      const j = sim.job;
      const tankInfo = ((down.settings || {}).tanks || {})["t" + j.tank] || {};
      pushHistory({
        start: Math.round(j.startMs / 1000),
        end: Math.round(Date.now() / 1000),
        zone: j.zone,
        zone_name: j.zoneName,
        source: j.source,
        water_l: Math.round(((Date.now() - j.startMs) / 60000) * j.flow * 10) / 10,
        fert_ml: Math.round(j.fertDone),
        tank: j.fertMl > 0 ? j.tank : 0,
        tank_name: j.fertMl > 0 ? tankInfo.name || "" : "",
        status,
        note: note || "",
      });
      sim.job = null;
    }

    function stepJob(now, dtMs) {
      const s = down.settings || {};
      if (!sim.job) {
        if (!sim.queue.length) return 0;
        const j = sim.queue.shift();
        const hasFert = j.fertMl > 0;
        sim.job = {
          ...j,
          startMs: now,
          stepStartMs: now,
          fertDone: 0,
          waterTargetMs: j.flow > 0 ? (j.waterL / j.flow) * 60000 : 0,
          step: hasFert ? (num(s.prewet_sec, 60) > 0 ? "prewet" : "inject") : "water",
        };
      }
      const j = sim.job;
      const stepMs = now - j.stepStartMs;
      const go = (step) => {
        j.step = step;
        j.stepStartMs = now;
      };
      if (j.step === "prewet") {
        if (stepMs >= num(s.prewet_sec, 60) * 1000) go("inject");
        return R.water;
      }
      if (j.step === "inject") {
        // เฟิร์มแวร์จริงอ่าน flow meter ทุก 250 ms จึงหยุดได้ใกล้เป้า ตัวจำลองจึงไม่จ่ายเกินเป้า
        const ml = Math.min((num((s.fert_pump || {}).lpm, 5) * 1000 * dtMs) / 60000, j.fertMl - j.fertDone);
        j.fertDone += ml;
        sim.flow[j.tank - 1] += ml;
        if (j.fertDone >= j.fertMl) go("flush");
        return R.water | R.fert | R.main | R.tank(j.tank);
      }
      if (j.step === "flush") {
        if (stepMs >= num(s.flush_sec, 60) * 1000) go("water");
        return R.water | R.fert | R.main | R.flush;
      }
      if (now - j.startMs >= j.waterTargetMs) {
        finish("done");
        return 0;
      }
      return R.water;
    }

    function stepManual(now, dtMs, mask) {
      const s = down.settings || {};
      const pumping = (mask & (R.water | R.fert)) !== 0;
      if (pumping && !sim.manual) sim.manual = { startMs: now, waterMs: 0, fertMl: 0, tank: 0 };
      const m = sim.manual;
      if (!m) return;
      if (mask & R.water) m.waterMs += dtMs;
      [1, 2, 3].forEach((t) => {
        if (mask & R.fert && mask & R.tank(t)) {
          const ml = (num((s.fert_pump || {}).lpm, 5) * 1000 * dtMs) / 60000;
          m.fertMl += ml;
          sim.flow[t - 1] += ml;
          m.tank = m.tank || t;
        }
      });
      if (!pumping) {
        if (now - m.startMs >= 5000) {
          pushHistory({
            start: Math.round(m.startMs / 1000),
            end: Math.round(now / 1000),
            zone: "",
            zone_name: "สั่งงานด้วยมือ",
            source: "manual",
            water_l: Math.round((m.waterMs / 60000) * num((s.water_pump || {}).lpm) * 10) / 10,
            fert_ml: Math.round(m.fertMl),
            tank: m.tank,
            tank_name: m.tank ? (((s.tanks || {})["t" + m.tank] || {}).name || "") : "",
            status: "done",
            note: "",
          });
        }
        sim.manual = null;
      }
    }

    function tick() {
      if (!down) return;
      const now = Date.now();
      const dtMs = Math.min(now - lastTick, 5000);
      lastTick = now;
      const control = down.control || {};
      const manualMode = control.mode === "manual";

      // คำสั่งจากเว็บ (ข้ามคำสั่งเก่าที่ค้างอยู่ตอนเริ่ม)
      const cmd = control.cmd;
      if (cmd && cmd.id !== sim.lastCmd) {
        if (sim.lastCmd !== null) {
          if (cmd.type === "stop") {
            sim.queue = [];
            if (sim.job) finish("stopped", "ผู้ใช้สั่งหยุด");
          } else if (cmd.type === "run") {
            enqueue(cmd.zone, cmd.source || "manual", true, cmd.water_l != null || cmd.fert_ml != null ? cmd : null);
          }
        }
        sim.lastCmd = cmd.id;
      } else if (sim.lastCmd === null) {
        sim.lastCmd = "";
      }

      // ตารางเวลา (เฉพาะโหมด Auto)
      if (!manualMode) {
        const d = new Date(now);
        const stamp = `${d.getDate()}-${d.getHours()}:${d.getMinutes()}`;
        const hhmm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
        Object.entries(down.schedules || {}).forEach(([id, sch]) => {
          if (!sch.enabled || sch.time !== hhmm || !((sch.days >> d.getDay()) & 1) || sim.fired[id] === stamp) return;
          sim.fired[id] = stamp;
          enqueue(sch.zone, "schedule", !!sch.fert, null);
        });
      }

      let mask = stepJob(now, dtMs);
      if (!sim.job) {
        mask = 0;
        if (manualMode) XF.RELAYS.forEach((r) => ((control.relays || {})[r.key] ? (mask |= 1 << r.bit) : 0));
        stepManual(now, dtMs, mask);
      }

      const s = down.settings || {};
      const j = sim.job;
      const fertLpm = num((s.fert_pump || {}).lpm, 5);
      const flowLpm = (t) => (mask & R.fert && mask & R.tank(t) ? fertLpm : 0);
      const wobble = (base, amp, period) => Math.round((base + amp * Math.sin(now / period)) * 10) / 10;
      store.set(root + "/up", {
        ts: Math.round(now / 1000),
        mode: manualMode ? "manual" : "auto",
        relays: mask,
        status: { fw: "demo", stm_fw: "demo", stm_ok: true, failsafe: false, wifi: "Demo-WiFi", rssi: -58, ip: "192.168.1.50", uptime: Math.round(performance.now() / 1000), time_ok: true },
        sensors: {
          dht_ok: true,
          temp: wobble(29, 1.5, 600000),
          humi: wobble(68, 5, 900000),
          adc: Math.round(wobble(2100, 150, 700000)),
          flow_lpm: { f1: flowLpm(1), f2: flowLpm(2), f3: flowLpm(3) },
          flow_ml: { f1: Math.round(sim.flow[0]), f2: Math.round(sim.flow[1]), f3: Math.round(sim.flow[2]) },
          rs485: { s1: { ok: false, value: 0 }, s2: { ok: false, value: 0 } },
        },
        job: j
          ? {
              running: true,
              queued: sim.queue.length,
              step: j.step,
              zone: j.zone,
              zone_name: j.zoneName,
              source: j.source,
              tank: j.tank,
              started: Math.round(j.startMs / 1000),
              water_target_l: Math.round(j.waterL * 10) / 10,
              water_done_l: Math.round(((now - j.startMs) / 60000) * j.flow * 10) / 10,
              fert_target_ml: Math.round(j.fertMl),
              fert_done_ml: Math.round(j.fertDone),
              eta_s: Math.max(0, Math.round((j.waterTargetMs - (now - j.startMs)) / 1000)),
            }
          : { running: false, queued: sim.queue.length },
      });
      localStorage.setItem(SIM_KEY, JSON.stringify(sim));
    }

    setInterval(tick, 1000);
  };
})();
