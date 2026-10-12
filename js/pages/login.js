// หน้าเข้าสู่ระบบ: ขั้นที่ 1 บัญชีผู้ใช้, ขั้นที่ 2 รหัสประจำอุปกรณ์
(function () {
  const { store, $, $$, esc } = XF;
  const authForm = $("#authForm");
  const deviceForm = $("#deviceForm");
  let mode = "in";

  $("#brand").innerHTML = `<img class="auth-mark" src="icon.svg" alt="" width="72" height="72">${XF.brandHtml()}`;
  $("#demoNote").hidden = !store.demo;

  const AUTH_ERRORS = {
    "auth/invalid-credential": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    "auth/wrong-password": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    "auth/user-not-found": "ไม่พบบัญชีนี้",
    "auth/email-already-in-use": "อีเมลนี้ถูกใช้สมัครแล้ว",
    "auth/weak-password": "รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร",
    "auth/invalid-email": "รูปแบบอีเมลไม่ถูกต้อง",
    "auth/too-many-requests": "ลองผิดหลายครั้งเกินไป กรุณารอสักครู่",
    "auth/network-request-failed": "เชื่อมต่ออินเทอร์เน็ตไม่ได้",
  };

  function showError(el, message) {
    el.textContent = message;
    el.hidden = !message;
  }

  $$(".tabs button", authForm).forEach((btn) =>
    btn.addEventListener("click", () => {
      mode = btn.dataset.mode;
      $$(".tabs button", authForm).forEach((b) => b.classList.toggle("active", b === btn));
      $("#nameField").hidden = mode !== "up";
      $("#authSubmit").textContent = mode === "up" ? "สมัครสมาชิก" : "เข้าสู่ระบบ";
      showError($("#authError"), "");
    })
  );

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError($("#authError"), "");
    const email = XF.toEmail($("#email").value);
    const password = $("#password").value;
    try {
      if (mode === "up") await store.signUp($("#name").value.trim() || email.split("@")[0], email, password);
      else await store.signIn(email, password);
    } catch (err) {
      showError($("#authError"), AUTH_ERRORS[err.code] || err.message);
    }
  });

  async function isMember(deviceId) {
    return !!(await store.get(`/members/${deviceId}/${XF.user.uid}`).catch(() => null));
  }

  function enter(deviceId) {
    localStorage.setItem("xf_device", deviceId);
    location.replace("index.html");
  }

  deviceForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError($("#deviceError"), "");
    const deviceId = $("#deviceId").value.trim().toUpperCase();
    const code = $("#deviceCode").value.trim();
    if (!/^[A-Z0-9_-]{3,32}$/.test(deviceId)) return showError($("#deviceError"), "รหัสอุปกรณ์ใช้ได้เฉพาะ A-Z, 0-9, - และ _");
    try {
      await XF.pair(deviceId, code);
      enter(deviceId);
    } catch (err) {
      console.error(err);
      const denied = err.code === "PERMISSION_DENIED" || /permission/i.test(err.message);
      showError($("#deviceError"), denied ? "รหัสอุปกรณ์หรือรหัสเข้าร่วมไม่ถูกต้อง (หรือผู้ดูแลยังไม่เปิดให้เข้าร่วมด้วยรหัส)" : err.message);
    }
  });

  $("#switchUser").addEventListener("click", () => store.signOut());

  store.onAuth(async (user) => {
    XF.user = user;
    authForm.hidden = !!user;
    deviceForm.hidden = !user;
    if (!user) return;

    // เคยเชื่อมต่อแล้วและไม่ได้ตั้งใจมาเปลี่ยนอุปกรณ์ -> เข้าหน้าหลักเลย
    const saved = localStorage.getItem("xf_device");
    if (saved && location.hash !== "#device" && (await isMember(saved))) return enter(saved);

    const mine = Object.keys((await store.get("/user_devices/" + user.uid).catch(() => null)) || {});
    const goBack = location.hash === "#device";
    // บัญชีที่ผู้ดูแลสร้างให้มีอุปกรณ์เดียว -> เข้าเลย
    if (!goBack && mine.length === 1 && (await isMember(mine[0]))) return enter(mine[0]);
    // ผู้ดูแลที่ยังไม่ผูกกับอุปกรณ์ -> ไปหน้าผู้ดูแล
    if (!goBack && !mine.length && (await store.get("/admins/" + user.uid).catch(() => null)) === true) {
      return location.replace("admin.html");
    }
    $("#myDevices").innerHTML = mine.length
      ? `<div class="small muted" style="margin-bottom:6px">อุปกรณ์ที่เคยเชื่อมต่อ</div><div class="row wrap">${mine
          .map((id) => `<button type="button" class="btn ghost sm" data-device="${esc(id)}">${esc(id)}</button>`)
          .join("")}</div>`
      : "";
    $$("[data-device]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (await isMember(btn.dataset.device)) enter(btn.dataset.device);
        else {
          $("#deviceId").value = btn.dataset.device;
          showError($("#deviceError"), "สิทธิ์ของอุปกรณ์นี้ถูกยกเลิกแล้ว กรุณากรอกรหัสประจำอุปกรณ์อีกครั้ง");
        }
      })
    );
  });
})();
