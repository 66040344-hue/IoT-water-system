// สูตรคำนวณปุ๋ยน้ำทุเรียน (ค่าคงที่และขั้นตอนคำนวณตามไฟล์ตัวอย่าง Ex/calculator)
// เป็นฟังก์ชันล้วน ไม่แตะหน้าเว็บ: XF.calcFertigation(input) -> ผลลัพธ์
window.XF = window.XF || {};

(function () {
  const fertilizerRates = {
    "สร้างชุดใบ": { label: "ระยะสร้างชุดใบ", N: 3, P: 1, K: 1 },
    "สะสมอาหาร": { label: "ระยะสะสมอาหาร", N: 1, P: 5, K: 5 },
    "พัฒนาดอกเดือน1": { label: "ระยะพัฒนาดอกเดือน 1", N: 1, P: 5, K: 5 },
    "พัฒนาดอกเดือน2": { label: "ระยะพัฒนาดอกเดือน 2", N: 1, P: 1, K: 1 },
    "ติดผลเล็ก": { label: "ระยะติดผลเล็ก เดือน 1–2", N: 2, P: 1, K: 4 },
    "พัฒนาผล": { label: "ระยะพัฒนาผล เดือน 3", N: 3, P: 1, K: 6 },
    "ปรับปรุงคุณภาพ": { label: "ระยะปรับปรุงคุณภาพ เดือน 4", N: 1, P: 2, K: 8 },
  };

  const soilThresholds = {
    nitrogen: { medium: 20, high: 40, mediumFactor: 0.75, highFactor: 0.5 },
    phosphorus: { medium: 15, high: 30, mediumFactor: 0.75, highFactor: 0.5 },
    potassium: { medium: 100, high: 200, mediumFactor: 0.75, highFactor: 0.5 },
    ec: { warning: 2, high: 4, warningFactor: 0.75 },
  };

  const weatherRules = {
    "ปกติ": { factor: 1, description: "สภาพอากาศปกติ (เหมาะแก่การให้ปุ๋ย)" },
    "ฟ้าครึ้ม": { factor: 0.75, description: "ปรับปริมาณให้เหมาะกับสภาพฟ้าครึ้ม" },
    "เมฆมาก": { factor: 0.75, description: "ปรับปริมาณให้เหมาะกับสภาพเมฆมาก" },
    "อากาศแห้ง": { factor: 1, description: "ควรให้ในช่วงเช้าหรือเย็นและตรวจความชื้นดิน" },
    "หลังฝนตก": { factor: 1, description: "สามารถให้ได้เมื่อดินระบายน้ำดีและไม่แฉะ" },
    "ฝนชุก": { factor: 0, description: "ฝนตกชุกหรือตกต่อเนื่อง (งดจ่ายปุ๋ย)" },
  };

  const treeConditionRules = {
    "สมบูรณ์": { factor: 1, description: "ต้นสมบูรณ์ แข็งแรงตามปกติ" },
    "โทรม": { factor: 1, description: "ต้นโทรม สุขภาพไม่ดี (เน้น N ฟื้นฟูสภาพต้น)" },
    "เฝ้าระวัง": { factor: 1, description: "พบความผิดปกติเล็กน้อย ควรติดตามอาการ" },
    "เครียดเล็กน้อย": { factor: 0.75, description: "ต้นมีอาการเครียดเล็กน้อย" },
    "เครียดปานกลาง": { factor: 0.5, description: "ต้นมีอาการเครียดปานกลาง" },
    "เครียดรุนแรง": { factor: 0, description: "ต้นมีอาการเครียดรุนแรง (ระงับปุ๋ย)" },
    "รากวิกฤต": { factor: 0, description: "พบภาวะรากเน่า รากขาดอากาศ หรือระบบรากวิกฤต" },
  };

  const crisisRules = {
    "อาการใบไหม้": { factor: 0.5, advice: "อาการใบไหม้: ควรตรวจค่า EC ความเข้มข้นของปุ๋ยน้ำ การให้น้ำ และสภาพราก" },
    "แตกใบอ่อน": { factor: 0.75, advice: "แตกใบอ่อน: ควรหลีกเลี่ยงการเร่งปุ๋ยและติดตามความสมบูรณ์ของใบอ่อน" },
    "ผลร่วง": { factor: 0.5, advice: "ผลร่วง: ควรตรวจสมดุลน้ำ สภาพราก และความเหมาะสมของแคลเซียมกับโบรอน" },
    "ดอกร่วง": { factor: 0.5, advice: "ดอกร่วง: ควรตรวจสภาพอากาศ ความชื้น และการใช้สารเสริมในระยะดอก" },
  };

  const BASE_RATE_ML_PER_SQM = 1;

  function nutrientAssessment(value, threshold, name) {
    if (value > threshold.high) return { factor: threshold.highFactor, detail: `${name} (${value} mg/kg) อยู่ในระดับสูง ปรับลดกลุ่มนี้ 50%` };
    if (value > threshold.medium) return { factor: threshold.mediumFactor, detail: `${name} (${value} mg/kg) อยู่ในระดับค่อนข้างสูง ปรับลดกลุ่มนี้ 25%` };
    return { factor: 1, detail: `${name} (${value} mg/kg) อยู่ในระดับปกติ` };
  }

  function assessSoil(soil) {
    const n = nutrientAssessment(soil.n, soilThresholds.nitrogen, "ไนโตรเจน N");
    const p = nutrientAssessment(soil.p, soilThresholds.phosphorus, "ฟอสฟอรัส P");
    const k = nutrientAssessment(soil.k, soilThresholds.potassium, "โพแทสเซียม K");
    const details = [n.detail, p.detail, k.detail];
    const warnings = [];
    const stopReasons = [];
    let ecSafetyFactor = 1;

    if (soil.om != null) details.push(`OM (${soil.om}%) ใช้เป็นข้อมูลประกอบ โดยไม่ปรับลด N ซ้ำ`);
    if (soil.ec != null) {
      if (soil.ec >= soilThresholds.ec.high) {
        ecSafetyFactor = 0;
        stopReasons.push(`ค่า EC (${soil.ec} dS/m) สูงวิกฤต ห้ามจ่ายปุ๋ยเพื่อป้องกันรากเสียหาย`);
      } else if (soil.ec >= soilThresholds.ec.warning) {
        ecSafetyFactor = soilThresholds.ec.warningFactor;
        details.push(`ค่า EC (${soil.ec} dS/m) ค่อนข้างสูง ปรับลดปริมาณรวม 25%`);
      } else {
        details.push(`ค่า EC (${soil.ec} dS/m) อยู่ในเกณฑ์ปกติ`);
      }
    }
    if (soil.ph != null) {
      if (soil.ph < 5.0) warnings.push(`ค่า pH (${soil.ph}) เป็นกรดจัด ควรตรวจการปรับปรุงดิน`);
      else if (soil.ph > 7.0) warnings.push(`ค่า pH (${soil.ph}) เป็นด่าง อาจลดการดูดซึมธาตุอาหาร`);
    }
    return { nutrientFactors: { N: n.factor, P: p.factor, K: k.factor }, ecSafetyFactor, details, warnings, stopReasons };
  }

  // N (mg/kg) ของดินจาก OM (%) และ C:N ratio
  XF.soilNFromOM = (om, cn) => (Number.isFinite(om) && Number.isFinite(cn) && cn > 0 ? Math.round(((om * 0.58) / cn) * 10000) : null);

  // เลือกถังปุ๋ยที่สัดส่วน N:P:K ใกล้กับเป้าหมายที่สุด
  XF.nearestTank = (rate, tanks) => {
    const share = (n, p, k) => {
      const total = n + p + k;
      return total > 0 ? [n / total, p / total, k / total] : null;
    };
    const target = share(rate.N, rate.P, rate.K);
    let best = null;
    Object.keys(tanks || {}).forEach((key) => {
      const t = tanks[key] || {};
      const s = share(+t.n || 0, +t.p || 0, +t.k || 0);
      if (!s) return;
      const dist = Math.hypot(s[0] - target[0], s[1] - target[1], s[2] - target[2]);
      if (!best || dist < best.dist) best = { tank: parseInt(key.replace(/\D/g, ""), 10), name: t.name || key, n: t.n, p: t.p, k: t.k, dist };
    });
    return best;
  };

  // เรียงสูตรปุ๋ยทั้งหมดในรายการ (ไม่ว่าจะอยู่ในถังหรือไม่) จากสัดส่วน N:P:K ที่ใกล้เป้าหมายที่สุด
  XF.rankProducts = (rate, products) => {
    const share = (n, p, k) => {
      const total = n + p + k;
      return total > 0 ? [n / total, p / total, k / total] : [0, 0, 0];
    };
    const target = share(rate.N, rate.P, rate.K);
    return products
      .map((prod) => {
        const s = share(prod.n, prod.p, prod.k);
        return { ...prod, dist: Math.hypot(s[0] - target[0], s[1] - target[1], s[2] - target[2]) };
      })
      .sort((a, b) => a.dist - b.dist);
  };

  /*
   * input: { diameter, treeCount, growthStage, weather, soilStillWet, treeCondition, crisis: [],
   *          soil: null | { n, p, k, ph, om, ec }, baseWaterPerSqm, irrigationEfficiency }
   */
  XF.calcFertigation = (input) => {
    const rate = { ...(fertilizerRates[input.growthStage] || fertilizerRates["สร้างชุดใบ"]) };
    if (input.growthStage === "สร้างชุดใบ" && input.treeCondition === "โทรม") rate.N = 4;
    const weatherRule = weatherRules[input.weather] || weatherRules["ปกติ"];

    const canopyArea = Math.PI * Math.pow(input.diameter / 2, 2);
    const baseVolumePerTree = canopyArea * BASE_RATE_ML_PER_SQM;
    const totalRatio = rate.N + rate.P + rate.K;

    const soil = input.soil
      ? assessSoil(input.soil)
      : { nutrientFactors: { N: 1, P: 1, K: 1 }, ecSafetyFactor: 1, details: [], warnings: [], stopReasons: [] };

    const treeRule = treeConditionRules[input.treeCondition] || treeConditionRules["สมบูรณ์"];
    const treeFactors = [treeRule.factor];
    const advice = [];
    (input.crisis || []).forEach((c) => {
      if (!crisisRules[c]) return;
      treeFactors.push(crisisRules[c].factor);
      advice.push(crisisRules[c].advice);
    });
    const treeFactor = Math.min(...treeFactors);

    const wetSoil = input.weather === "หลังฝนตก" && !!input.soilStillWet;
    const rootSafetyFactor = Math.min(soil.ecSafetyFactor, wetSoil ? 0 : 1);
    const commonFactor = weatherRule.factor * treeFactor * rootSafetyFactor;

    const perTree = {
      N: baseVolumePerTree * (rate.N / totalRatio) * soil.nutrientFactors.N * commonFactor,
      P: baseVolumePerTree * (rate.P / totalRatio) * soil.nutrientFactors.P * commonFactor,
      K: baseVolumePerTree * (rate.K / totalRatio) * soil.nutrientFactors.K * commonFactor,
    };
    const fertPerTreeMl = perTree.N + perTree.P + perTree.K;

    const stopReasons = [];
    if (weatherRule.factor === 0) stopReasons.push(weatherRule.description);
    if (wetSoil) stopReasons.push("ดินยังแฉะ มีน้ำขัง หรือระบายน้ำไม่ทัน");
    if (treeFactor === 0) stopReasons.push(treeRule.description);
    soil.stopReasons.forEach((r) => stopReasons.push(r));
    const uniqueStops = Array.from(new Set(stopReasons));
    const isStop = commonFactor === 0 || uniqueStops.length > 0;

    const efficiency = input.irrigationEfficiency > 0 ? input.irrigationEfficiency : 90;
    const baseWater = input.baseWaterPerSqm > 0 ? input.baseWaterPerSqm : 5;
    const waterPerTreeL = isStop ? 0 : canopyArea * baseWater * (100 / efficiency) * commonFactor;

    return {
      rate,
      totalRatio,
      canopyArea,
      commonFactor,
      perTree,
      fertPerTreeMl: isStop ? 0 : fertPerTreeMl,
      fertTotalMl: isStop ? 0 : fertPerTreeMl * input.treeCount,
      waterPerTreeL,
      isStop,
      stopReasons: uniqueStops,
      weatherDescription: weatherRule.description,
      treeDescription: treeRule.description,
      advice,
      soilDetails: soil.details,
      soilWarnings: soil.warnings,
    };
  };
})();
