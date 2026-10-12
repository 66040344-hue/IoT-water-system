// ฟอร์มเพิ่ม/แก้ไข/ลบสูตรปุ๋ยของผู้ใช้ ใช้ร่วมกันระหว่างหน้าตั้งค่าและหน้าคำนวณ
// ข้อมูล: /devices/<id>/products/<pid> และรูป /devices/<id>/product_img/<pid> (ดูคำอธิบายใน app.js)
(function () {
  const { store, $, esc, num } = XF;

  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  // สัดส่วนจำนวนเต็มอย่างต่ำ เช่น 20-20-20 -> "1 : 1 : 1"
  const ratioText = (n, p, k) => {
    const ints = [n, p, k].map((v) => Math.round(num(v) * 10));
    const g = ints.reduce((a, b) => gcd(a, b), 0);
    return g ? ints.map((v) => v / g).join(" : ") : "–";
  };

  // ย่อรูปเป็นไม่เกิน 256 px แล้วเก็บเป็น data URL (WebP ถ้าเบราว์เซอร์รองรับ) ขนาดไม่เกิน ~60 KB
  async function resizeImage(file) {
    if (!file.type.startsWith("image/")) throw new Error("ไฟล์ที่เลือกไม่ใช่รูปภาพ");
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("เปิดรูปไม่ได้ ลองใช้ไฟล์ JPG หรือ PNG"));
        el.src = url;
      });
      const scale = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      let type = "image/webp";
      let q = 0.85;
      let out = canvas.toDataURL(type, q);
      if (!out.startsWith("data:image/webp")) {
        type = "image/jpeg";
        out = canvas.toDataURL(type, q);
      }
      while (out.length > 60000 && q > 0.35) {
        q -= 0.15;
        out = canvas.toDataURL(type, q);
      }
      if (out.length > 65000) throw new Error("รูปมีรายละเอียดมากเกินไป ลองใช้รูปที่เรียบกว่านี้");
      return out;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const tanksUsing = (tanks, id) => [1, 2, 3].filter((i) => ((tanks || {})["t" + i] || {}).product === id);

  // opts.tanks: () => ค่า settings/tanks ปัจจุบัน (ไว้ปรับถังที่ใช้สูตรนี้) · opts.onSaved(pid): เรียกหลังบันทึกสำเร็จ
  function open(id, opts) {
    opts = opts || {};
    const tanks = () => (opts.tanks ? opts.tanks() : {});
    const cur = id ? XF.customProducts[id] : null;
    let image; // undefined = ไม่เปลี่ยน, null = ลบรูป, string = รูปใหม่
    const modal = XF.modal(`
      <h2>${cur ? "แก้ไขสูตรปุ๋ย" : "เพิ่มปุ๋ยของคุณ"}</h2>
      <form id="prodForm" novalidate>
        <div class="prod-photo">
          <img id="prodPreview" alt="" src="${cur ? XF.productImage(id) : XF.PRODUCT_PLACEHOLDER}">
          <div>
            <label class="btn ghost sm">เลือกรูป<input type="file" id="prodFile" accept="image/*" hidden></label>
            <button type="button" class="btn ghost sm" id="prodClear" ${cur && XF.customImages[id] ? "" : "hidden"}>ลบรูป</button>
            <div class="small muted" style="margin-top:6px">รูปผลิตภัณฑ์ (ไม่บังคับ) ระบบย่อให้อัตโนมัติ</div>
          </div>
        </div>
        <label class="field" style="margin-top:14px"><span>ชื่อสูตรปุ๋ย *</span>
          <input id="prodName" maxlength="40" required autocomplete="off" placeholder="เช่น ปุ๋ยน้ำ 20-20-20 ยี่ห้อ …" value="${esc(cur ? cur.name : "")}"></label>
        <div class="small muted" style="margin:12px 0 6px">สัดส่วนธาตุอาหาร N-P-K (ตามที่ระบุบนฉลาก) *</div>
        <div class="form-grid prod-npk">
          <label class="field"><span>N ไนโตรเจน</span><input type="number" id="prodN" min="0" max="100" step="0.1" inputmode="decimal" value="${cur ? num(cur.n) : ""}"></label>
          <label class="field"><span>P ฟอสฟอรัส</span><input type="number" id="prodP" min="0" max="100" step="0.1" inputmode="decimal" value="${cur ? num(cur.p) : ""}"></label>
          <label class="field"><span>K โพแทสเซียม</span><input type="number" id="prodK" min="0" max="100" step="0.1" inputmode="decimal" value="${cur ? num(cur.k) : ""}"></label>
        </div>
        <div class="notice green" id="prodRatio" style="margin-top:12px"></div>
        <div class="notice red" id="prodError" hidden style="margin-top:12px"></div>
        <div class="form-actions"><button type="button" class="btn ghost" data-close>ยกเลิก</button><button class="btn" id="prodSave">บันทึกสูตร</button></div>
      </form>`);
    const el = (sel) => $(sel, modal.el);
    const fields = () => [num(el("#prodN").value), num(el("#prodP").value), num(el("#prodK").value)];
    const showRatio = () => {
      const [n, p, k] = fields();
      const total = n + p + k;
      el("#prodRatio").textContent =
        total > 0
          ? `สัดส่วน N : P : K = ${ratioText(n, p, k)} (คิดเป็น ${Math.round((n / total) * 100)}% : ${Math.round((p / total) * 100)}% : ${Math.round((k / total) * 100)}%) ระบบใช้สัดส่วนนี้จับคู่กับค่าที่คำนวณได้`
          : "กรอกค่า N-P-K อย่างน้อยหนึ่งธาตุ";
    };
    ["#prodN", "#prodP", "#prodK"].forEach((s) => el(s).addEventListener("input", showRatio));
    showRatio();

    const err = (msg) => {
      el("#prodError").textContent = msg;
      el("#prodError").hidden = !msg;
    };
    el("#prodFile").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        err("");
        image = await resizeImage(file);
        el("#prodPreview").src = image;
        el("#prodClear").hidden = false;
      } catch (ex) {
        err(ex.message);
      }
    });
    el("#prodClear").addEventListener("click", () => {
      image = null;
      el("#prodPreview").src = XF.PRODUCT_PLACEHOLDER;
      el("#prodClear").hidden = true;
      el("#prodFile").value = "";
    });

    el("#prodForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = el("#prodName").value.trim();
      const [n, p, k] = fields();
      if (!name) return err("กรุณากรอกชื่อสูตรปุ๋ย");
      if ([n, p, k].some((v) => v < 0 || v > 100)) return err("ค่า N-P-K ต้องอยู่ระหว่าง 0 ถึง 100");
      if (n + p + k <= 0) return err("กรุณากรอกค่า N-P-K อย่างน้อยหนึ่งธาตุ");
      if (n + p + k > 100) return err("ผลรวม N+P+K เกิน 100 กรุณาตรวจสอบตัวเลขบนฉลาก");
      const dup = XF.allProducts().some((x) => x.id !== id && x.name.trim().toLowerCase() === name.toLowerCase());
      if (dup) return err("มีสูตรปุ๋ยชื่อนี้อยู่แล้ว กรุณาใช้ชื่ออื่น");
      const pid = id || "c_" + Date.now().toString(36);
      const updates = { [`products/${pid}`]: { name, n, p, k, created: cur && cur.created ? cur.created : Date.now() } };
      if (image !== undefined) updates[`product_img/${pid}`] = image;
      // ถังที่เลือกสูตรนี้ไว้ใช้ค่าชุดเดียวกัน เมื่อแก้สัดส่วนจึงต้องอัปเดตตามด้วย
      if (id) tanksUsing(tanks(), id).forEach((i) => Object.assign(updates, { [`down/settings/tanks/t${i}/n`]: n, [`down/settings/tanks/t${i}/p`]: p, [`down/settings/tanks/t${i}/k`]: k }));
      el("#prodSave").disabled = true;
      const ok = await XF.run(() => store.update(XF.root, updates), cur ? "บันทึกสูตรปุ๋ยแล้ว" : "เพิ่มสูตรปุ๋ยแล้ว");
      el("#prodSave").disabled = false;
      if (ok) {
        modal.close();
        if (opts.onSaved) opts.onSaved(pid);
      }
    });
  }

  async function remove(id, opts) {
    const p = XF.customProducts[id];
    if (!p) return;
    const tanks = opts && opts.tanks ? opts.tanks() : {};
    const used = tanksUsing(tanks, id);
    const warn = used.length ? `\nสูตรนี้ถูกเลือกไว้ที่ถัง ${used.join(", ")} จะคงค่า N-P-K ไว้แต่ไม่ผูกกับสูตรนี้อีก` : "";
    if (!confirm(`ลบสูตร "${p.name}"?${warn}`)) return;
    const updates = { [`products/${id}`]: null, [`product_img/${id}`]: null };
    used.forEach((i) => (updates[`down/settings/tanks/t${i}/product`] = null));
    await XF.run(() => store.update(XF.root, updates), "ลบสูตรปุ๋ยแล้ว");
  }

  XF.productForm = { open, remove, ratioText };
})();
