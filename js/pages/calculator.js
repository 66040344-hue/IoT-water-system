// หน้าคำนวณ: รับค่าจากฟอร์ม -> XF.calcFertigation -> แสดงผล และส่งค่าไปตั้งให้โซน
XF.boot("calc", function () {
  const { store, $, $$, esc, fmt, num } = XF;
  let down = {};
  let result = null;
  let treeCount = 0;
  let ranked = []; // สูตรปุ๋ยเรียงจากใกล้เป้าหมายที่สุด
  let selectedProduct = ""; // สูตรที่ผู้ใช้เลือก (เริ่มจากสูตรที่แนะนำ)
  let modalRender = null; // วาดรายการในหน้าต่างเลือกสูตรใหม่เมื่อสูตรของผู้ใช้เปลี่ยน

  const tanksHolding = (productId) => {
    const tanks = (down.settings || {}).tanks || {};
    return [1, 2, 3].filter((i) => (tanks["t" + i] || {}).product === productId);
  };
  const tankLabel = (i) => (((down.settings || {}).tanks || {})["t" + i] || {}).name || "ถัง " + i;

  // ความใกล้เคียงกับสัดส่วน N:P:K เป้าหมาย (0-100%) จากระยะห่าง dist ใน XF.rankProducts
  const matchOf = (p) => Math.max(0, Math.round((1 - p.dist / 0.8) * 100));
  const matchInfo = (pct) =>
    pct >= 90 ? ["ใกล้เคียงมาก", "on", "var(--green)"] : pct >= 70 ? ["ใกล้เคียง", "on", "var(--green)"] : pct >= 45 ? ["พอใช้ได้", "warn", "var(--orange)"] : ["ต่างจากเป้าหมาย", "", "var(--red)"];
  const matchBadge = (p) => {
    const pct = matchOf(p);
    const [text, cls] = matchInfo(pct);
    return `<span class="badge ${cls}">${pct}% · ${text}</span>`;
  };
  const matchBar = (p) => `<div class="match-bar"><i style="width:${matchOf(p)}%;background:${matchInfo(matchOf(p))[2]}"></i></div>`;
  const tankNote = (p) => {
    const held = tanksHolding(p.id);
    return held.length
      ? `<span style="color:var(--green-ink)">มีอยู่ใน${held.map((i) => esc(tankLabel(i))).join(", ")}</span>`
      : '<span style="color:var(--orange-text)">ยังไม่มีในถังปุ๋ย ต้องเติมลงถังก่อนใช้</span>';
  };

  // การ์ดสูตรปุ๋ยที่เลือก + ปุ่มเปิดหน้าต่างเลือกสูตรอื่น
  function renderProductPicker() {
    const box = $("#productPicker");
    if (!box) return;
    const chosen = ranked.find((p) => p.id === selectedProduct);
    const isBest = chosen.id === ranked[0].id;
    box.innerHTML = `
      <div class="reco">
        <img src="${XF.productImage(chosen.id)}" alt="">
        <div>
          <span class="badge ${isBest ? "on" : "warn"}">${isBest ? "สูตรที่แนะนำ" : "สูตรที่เลือกเอง"}</span>
          <div class="reco-name">${esc(chosen.name)}</div>
          <div class="small muted">N-P-K ${chosen.n}-${chosen.p}-${chosen.k}</div>
          <div style="margin-top:6px">${matchBadge(chosen)}</div>
          <div class="small" style="margin-top:4px">${tankNote(chosen)}</div>
        </div>
      </div>
      <button type="button" class="btn ghost block" id="moreProducts" style="margin-top:10px">เลือกสูตรปุ๋ยอื่น ๆ</button>`;
    $("#moreProducts", box).addEventListener("click", openProductModal);
  }

  // หน้าต่างเลือกสูตร: รูปซ้าย รายละเอียดขวา กดเลือกแล้วต้องกดยืนยัน
  function openProductModal() {
    let pending = selectedProduct;
    const r = result.rate;
    const modal = XF.modal(`
      <h2>เลือกสูตรปุ๋ย</h2>
      <p class="small muted" style="margin:-8px 0 12px">เป้าหมาย N : P : K = <b>${r.N} : ${r.P} : ${r.K}</b> · เรียงจากใกล้เคียงที่สุด</p>
      <div class="pick-list" id="pickList"></div>
      <div class="pick-add">
        ${XF.isOwner || XF.isAdmin
          ? `<button type="button" class="btn ghost block" id="addMine">+ เพิ่มปุ๋ยของคุณ</button>
             <p class="small muted">ใส่รูป ชื่อ และสัดส่วน N-P-K ของปุ๋ยที่ไม่มีในรายการ · แก้ไขหรือลบสูตรได้ที่ ตั้งค่า &gt; ถังปุ๋ย</p>`
          : `<p class="small muted">ต้องการเพิ่มสูตรปุ๋ยอื่น ให้เจ้าของสวนเพิ่มที่ ตั้งค่า &gt; ถังปุ๋ย</p>`}
      </div>
      <div class="pick-foot"><button class="btn ghost" data-close>ยกเลิก</button><button class="btn" id="pickConfirm" style="flex:1"></button></div>`);

    function render() {
      $("#pickList", modal.el).innerHTML = ranked
        .map(
          (p, i) => `<button type="button" class="pick-row ${p.id === pending ? "active" : ""}" data-product="${p.id}" aria-pressed="${p.id === pending}">
            <img src="${XF.productImage(p.id)}" alt="" loading="lazy">
            <div class="pick-body">
              <div class="pick-name">${esc(p.name)}${i === 0 ? ' <span class="badge on" style="min-width:0;padding:0 8px">แนะนำ</span>' : ""}</div>
              <div class="small muted">N-P-K ${p.n}-${p.p}-${p.k}</div>
              <div style="margin-top:6px">${matchBadge(p)}</div>
              ${matchBar(p)}
              <div class="small" style="margin-top:6px">${tankNote(p)}</div>
            </div></button>`
        )
        .join("");
      $$(".pick-row", modal.el).forEach((btn) =>
        btn.addEventListener("click", () => {
          pending = btn.dataset.product;
          render();
        })
      );
      const same = pending === selectedProduct;
      const p = ranked.find((x) => x.id === pending);
      const confirm = $("#pickConfirm", modal.el);
      confirm.textContent = same ? "ใช้สูตรนี้อยู่แล้ว" : `ยืนยันใช้ ${p.name}`;
      confirm.disabled = same;
    }
    render();
    modalRender = () => document.body.contains(modal.el) && render();
    const addBtn = $("#addMine", modal.el);
    if (addBtn) {
      addBtn.addEventListener("click", () =>
        XF.productForm.open(null, {
          tanks: () => (down.settings || {}).tanks || {},
          // สูตรใหม่ถูกจัดอันดับเข้ารายการแล้ว (ตัวฟังสูตรด้านล่าง) เลือกให้อัตโนมัติและวาดรายการใหม่
          onSaved: (pid) => {
            if (ranked.some((p) => p.id === pid)) pending = pid;
            render();
          },
        })
      );
    }
    $("#pickConfirm", modal.el).addEventListener("click", () => {
      selectedProduct = pending;
      modal.close();
      renderProductPicker();
    });
  }

  const value = (id) => {
    const v = parseFloat($("#" + id).value);
    return Number.isFinite(v) ? v : null;
  };

  function showError(message) {
    const box = $("#errorBox");
    box.textContent = message;
    box.hidden = !message;
    if (message) box.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ---- ตัวช่วยของฟอร์ม
  $$("[data-preset] .chip").forEach((chip) =>
    chip.addEventListener("click", () => ($("#" + chip.parentElement.dataset.preset).value = chip.dataset.v))
  );
  $$("#crisisGroup .chip").forEach((chip) => chip.addEventListener("click", () => chip.classList.toggle("active")));
  $("#weather").addEventListener("change", () => {
    const afterRain = $("#weather").value === "หลังฝนตก";
    $("#wetSoilBox").hidden = !afterRain;
    if (!afterRain) $("#soilStillWet").checked = false;
  });
  $("#hasSoilAnalysis").addEventListener("change", () => ($("#soilFields").hidden = !$("#hasSoilAnalysis").checked));
  ["soilOM", "soilCN"].forEach((id) =>
    $("#" + id).addEventListener("input", () => {
      const n = XF.soilNFromOM(value("soilOM"), value("soilCN"));
      $("#soilN").value = n == null ? "" : n;
    })
  );

  function renderZonePresets() {
    $("#zonePresets").innerHTML = XF.sortedZones(down.zones)
      .map((z) => `<button type="button" class="chip" data-trees="${num(z.trees)}">${esc(z.name)} ${fmt(z.trees)} ต้น</button>`)
      .join("");
    $$("#zonePresets .chip").forEach((chip) => chip.addEventListener("click", () => ($("#treeCount").value = chip.dataset.trees)));
  }

  // ---- คำนวณ
  function calculate() {
    showError("");
    const diameter = value("canopyDiameter");
    treeCount = value("treeCount");
    if (diameter === null || diameter <= 0) return showError("กรุณากรอกเส้นผ่านศูนย์กลางทรงพุ่มให้มากกว่า 0 เมตร");
    if (treeCount === null || treeCount < 1 || !Number.isInteger(treeCount)) return showError("กรุณากรอกจำนวนต้นเป็นจำนวนเต็มอย่างน้อย 1 ต้น");

    let soil = null;
    if ($("#hasSoilAnalysis").checked) {
      soil = { n: value("soilN"), p: value("soilP"), k: value("soilK"), ph: value("soilPH"), om: value("soilOM"), ec: value("soilEC") };
      if ([soil.n, soil.p, soil.k].some((v) => v === null || v < 0)) {
        return showError("กรุณากรอกค่า OM, C:N, P, K ในผลวิเคราะห์ดินให้ครบถ้วนและถูกต้อง");
      }
    }

    const settings = down.settings || {};
    result = XF.calcFertigation({
      diameter,
      treeCount,
      growthStage: $("#growthStage").value,
      weather: $("#weather").value,
      soilStillWet: $("#soilStillWet").checked,
      treeCondition: $("#treeCondition").value,
      crisis: $$("#crisisGroup .chip.active").map((c) => c.dataset.crisis),
      soil,
      baseWaterPerSqm: num(settings.base_water_per_sqm, 5),
      irrigationEfficiency: num(settings.irrigation_efficiency, 90),
    });
    // แนะนำจากสูตรปุ๋ยทั้งหมดในรายการ โดยไม่ขึ้นกับว่าตอนนี้มีอยู่ในถังหรือไม่
    ranked = XF.rankProducts(result.rate, XF.allProducts());
    selectedProduct = ranked[0].id;
    renderResult(soil !== null);
  }

  function renderResult(hasSoil) {
    const r = result;
    const rate = r.rate;
    const nPct = Math.round((rate.N / r.totalRatio) * 100);
    const pPct = Math.round((rate.P / r.totalRatio) * 100);
    const kPct = 100 - nPct - pPct;
    const vol = (ml) => (r.isStop ? "0 มล." : XF.fmtVolume(ml));
    const list = (items) => `<ul class="result-list">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
    const group = (label, color, ml) =>
      `<div class="kpi group" style="border-top:3px solid ${color}"><div class="small muted">${label}</div>
        <b style="color:${color}">${vol(ml)}</b><div class="small muted">รวม ${vol(ml * treeCount)}</div></div>`;

    let html = `
      <div class="row between wrap" style="margin-bottom:12px">
        <div class="card-title" style="margin:0">สรุปผลคำนวณและอัตราจ่ายปุ๋ยน้ำ</div>
        <span class="badge ${r.isStop ? "" : "on"}">${r.isStop ? "ระงับการจ่าย" : "พร้อมใช้งาน"}</span>
      </div>
      <div class="small muted">พิมพ์เมื่อ ${XF.fmtDate(Date.now())} ${XF.fmtTime(Date.now())} น. · ทรงพุ่ม ${fmt($("#canopyDiameter").value, 1)} ม. · ${fmt(treeCount)} ต้น</div>

      <div class="row between npk-head"><b>สัดส่วนธาตุอาหารเป้าหมาย (N : P : K)</b>
        <span class="badge on npk-ratio">${rate.N} : ${rate.P} : ${rate.K}</span></div>
      <div class="npk-bar"><div class="npk-n" style="width:${nPct}%">N ${nPct}%</div><div class="npk-p" style="width:${pPct}%">P ${pPct}%</div><div class="npk-k" style="width:${kPct}%">K ${kPct}%</div></div>`;

    if (r.isStop) {
      html += `<div class="notice red" style="margin-top:14px"><b>ระงับการจ่ายปุ๋ยชั่วคราว</b>
        <div>เนื่องจากพบเงื่อนไขที่ไม่ปลอดภัยต่อระบบรากหรือต้นทุเรียน:</div>${list(r.stopReasons)}</div>`;
    } else {
      html += `<div class="kpi-grid">
          <div class="kpi main"><div class="stat-label">ปุ๋ยน้ำต่อต้น</div><div class="num">${XF.fmtVolume(r.fertPerTreeMl)}</div></div>
          <div class="kpi"><div class="stat-label">ปุ๋ยน้ำทั้งแปลง (${fmt(treeCount)} ต้น)</div><div class="num" style="color:var(--orange-text)">${XF.fmtVolume(r.fertTotalMl)}</div></div>
          <div class="kpi"><div class="stat-label">น้ำต่อต้น</div><div class="num" style="color:var(--blue-ink)">${fmt(r.waterPerTreeL, 0)}<small>ลิตร</small></div></div>
          <div class="kpi"><div class="stat-label">พื้นที่ทรงพุ่ม ต่อต้น</div><div class="num">${fmt(r.canopyArea, 1)}<small>m²</small></div>
            <div class="small muted">รวม ${fmt(r.canopyArea * treeCount, 0)} m²</div></div>
        </div>`;
    }

    html += `<div class="result-h">ปุ๋ยน้ำแยกกลุ่มธาตุ (ต่อต้น / รวมทั้งแปลง)</div>
      <div class="kpi-grid three">${group("N ไนโตรเจน", "var(--brand-ink)", r.perTree.N)}${group("P ฟอสฟอรัส", "var(--orange-text)", r.perTree.P)}${group("K โพแทสเซียม", "var(--blue-ink)", r.perTree.K)}</div>`;

    if (!r.isStop) {
      html += `<div class="result-h">ปุ๋ยที่ควรใช้</div><div id="productPicker"></div>`;
    }
    if (hasSoil && r.soilDetails.length) html += `<div class="result-h"><b>การปรับตามผลวิเคราะห์ดิน</b>${list(r.soilDetails)}</div>`;
    if (r.soilWarnings.length || r.advice.length) {
      html += `<div class="notice" style="margin-top:14px"><b>คำแนะนำและข้อควรระวัง</b>${list([...r.soilWarnings, ...r.advice])}</div>`;
    }
    html += `<div class="result-h"><b>ข้อมูลประกอบการคำนวณ</b>${list([
      `ระยะพืช: ${rate.label} (N:P:K = ${rate.N}:${rate.P}:${rate.K})`,
      `สภาพอากาศ: ${r.weatherDescription}`,
      `สภาพต้น: ${r.treeDescription}`,
      `ผลวิเคราะห์ดิน: ${hasSoil ? "นำมาประเมินและปรับแล้ว" : "ไม่ได้ระบุ (ใช้สัดส่วนมาตรฐาน)"}`,
    ])}</div>
      <div class="btn-row no-print">
        <button class="btn" id="applyBtn" ${r.isStop ? "disabled" : ""}>นำผลไปตั้งค่าให้โซน</button>
        <button class="btn ghost" id="printBtn">พิมพ์</button>
        <button class="btn ghost" id="resetBtn">คำนวณใหม่</button>
      </div>`;

    const card = $("#resultCard");
    card.innerHTML = html;
    card.hidden = false;
    renderProductPicker();
    $("#applyBtn").addEventListener("click", openApply);
    $("#printBtn").addEventListener("click", () => window.print());
    $("#resetBtn").addEventListener("click", () => {
      $("#calcForm").reset();
      $$("#crisisGroup .chip").forEach((c) => c.classList.remove("active"));
      $("#wetSoilBox").hidden = true;
      $("#soilFields").hidden = true;
      card.hidden = true;
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---- ส่งค่าไปตั้งให้โซน (ปริมาณต่อต้น + ถังปุ๋ย) แล้วใช้กับหน้าควบคุมและตารางเวลา
  function openApply() {
    const zones = XF.sortedZones(down.zones);
    const tanks = (down.settings || {}).tanks || {};
    const water = Math.round(result.waterPerTreeL);
    const fert = Math.round(result.fertPerTreeMl);
    const product = ranked.find((p) => p.id === selectedProduct);
    const held = tanksHolding(product.id);
    let tank = held[0] || 1;

    const modal = XF.modal(`
      <h2>ตั้งค่าให้โซน</h2>
      <p class="muted small" style="margin-bottom:12px">บันทึก น้ำ <b>${fmt(water)} ลิตร/ต้น</b> และปุ๋ย <b>${fmt(fert)} มล./ต้น</b> เป็นค่าของโซนที่เลือก</p>
      <div class="grid">${zones
        .map(
          (z) => `<label class="check-row"><input type="checkbox" value="${esc(z.id)}" checked>
            <span><b>${esc(z.name)}</b><br><span class="small muted">${fmt(z.trees)} ต้น · ${z.fert_enabled === false ? "ให้น้ำอย่างเดียว" : "ให้น้ำและปุ๋ย"}</span></span></label>`
        )
        .join("")}</div>
      <div class="reco" style="margin-top:14px"><img src="${XF.productImage(product.id)}" alt="">
        <div><div class="small muted">ปุ๋ยที่เลือก</div><div class="reco-name">${esc(product.name)}</div></div></div>
      <div class="field" style="margin-top:12px"><span>จ่ายจากถังไหน</span>
        <div class="tank-opts" role="radiogroup" aria-label="ถังปุ๋ย">${[1, 2, 3]
          .map((i) => {
            const t = tanks["t" + i] || {};
            const picture = t.product ? `<img src="${XF.productImage(t.product)}" alt="">` : `<div class="tank-noimg">T${i}</div>`;
            return `<button type="button" class="tank-opt" role="radio" data-tank="${i}">${picture}<b>${esc(tankLabel(i))}</b>
              <span>${fmt(XF.num(t.n))}-${fmt(XF.num(t.p))}-${fmt(XF.num(t.k))}</span></button>`;
          })
          .join("")}</div></div>
      <div id="applyNote" style="margin-top:10px"></div>
      <div class="form-actions"><button class="btn ghost" data-close>ยกเลิก</button><button class="btn" id="applyConfirm">บันทึกและไปหน้าควบคุม</button></div>`);

    const tankMatches = () => (tanks["t" + tank] || {}).product === product.id;
    function refreshTank() {
      $$(".tank-opt", modal.el).forEach((b) => {
        const active = +b.dataset.tank === tank;
        b.classList.toggle("active", active);
        b.setAttribute("aria-checked", active);
      });
      $("#applyNote", modal.el).innerHTML = tankMatches()
        ? `<div class="notice green">${esc(tankLabel(tank))} ใส่ ${esc(product.name)} อยู่แล้ว</div>`
        : `<div class="notice">ระบบจะเปลี่ยนสูตรของ${esc(tankLabel(tank))} เป็น <b>${esc(product.name)}</b> ให้ อย่าลืมเติมปุ๋ยสูตรนี้ลงถังจริงก่อนสั่งงาน</div>`;
    }
    $$(".tank-opt", modal.el).forEach((b) =>
      b.addEventListener("click", () => {
        tank = +b.dataset.tank;
        refreshTank();
      })
    );
    refreshTank();

    $("#applyConfirm", modal.el).addEventListener("click", async () => {
      const selected = $$("input[type=checkbox]:checked", modal.el).map((el) => el.value);
      if (!selected.length) return XF.toast("กรุณาเลือกอย่างน้อย 1 โซน", true);
      const updates = {};
      selected.forEach((id) => {
        updates[`zones/${id}/water_per_tree_l`] = water;
        if ((down.zones[id] || {}).fert_enabled !== false) {
          updates[`zones/${id}/fert_per_tree_ml`] = fert;
          updates[`zones/${id}/tank`] = tank;
        }
      });
      const prevProduct = (((down.settings || {}).tanks || {})["t" + tank] || {}).product;
      if (!tankMatches()) {
        updates[`settings/tanks/t${tank}`] = { name: tankLabel(tank), product: product.id, n: product.n, p: product.p, k: product.k };
      }
      if (await XF.run(() => store.update(XF.root + "/down", updates), "บันทึกค่าให้โซนแล้ว")) {
        await XF.logTankProduct(tank, prevProduct, product.id);
        location.href = "control.html";
      }
    });
  }

  $("#calculateBtn").addEventListener("click", calculate);
  // สูตรที่ผู้ใช้เพิ่ม/ลบในหน้าตั้งค่า: จัดอันดับใหม่ทันทีถ้าคำนวณไปแล้ว
  XF.watchProducts(() => {
    if (!result) return;
    ranked = XF.rankProducts(result.rate, XF.allProducts());
    if (!ranked.some((p) => p.id === selectedProduct)) selectedProduct = ranked[0].id;
    renderProductPicker();
    if (modalRender) modalRender();
  });
  store.watch(XF.root + "/down", (v) => {
    down = v || {};
    renderZonePresets();
  });
});
