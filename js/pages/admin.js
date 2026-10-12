// หน้าผู้ดูแล: สร้างบัญชีผู้ใช้พร้อมกำหนดสถานะ ส่งชื่อผู้ใช้/รหัสผ่านให้ผู้ใช้ จัดการสิทธิ์ และรหัสเข้าร่วม
XF.bootAdmin(function (isAdmin) {
  const { store, $, $$, esc } = XF;
  const me = XF.user;

  if (!isAdmin) {
    $("#notAdmin").hidden = false;
    $("#myUid").textContent = me.uid;
    return;
  }
  $("#adminBody").hidden = false;

  const ROLE_NAMES = { admin: "ผู้ดูแลระบบ", owner: "เจ้าของสวน", member: "ผู้ใช้งาน", viewer: "ผู้เข้าชม" };
  let role = "member";
  let users = {};
  let lastCred = "";

  $("#uDevice").value = localStorage.getItem("xf_device") || "";

  // ---- ตัวช่วย
  const randomPassword = () => {
    const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const buf = new Uint32Array(10);
    crypto.getRandomValues(buf);
    return Array.from(buf, (n) => chars[n % chars.length]).join("");
  };
  const randomCode = () => {
    const buf = new Uint32Array(8);
    crypto.getRandomValues(buf);
    return Array.from(buf, (n) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[n % 32]).join("");
  };
  const showError = (message) => {
    const el = $("#createError");
    el.textContent = message;
    el.hidden = !message;
  };
  const deviceId = () => $("#uDevice").value.trim().toUpperCase();
  const loginUrl = () => new URL("login.html", location.href).href;

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      XF.toast("คัดลอกแล้ว");
    } catch (err) {
      XF.toast("คัดลอกไม่ได้ ให้เลือกข้อความแล้วคัดลอกเอง", true);
    }
  }

  // ให้สิทธิ์: เขียนข้อมูลสมาชิก/เจ้าของ/ผู้ดูแล ตามสถานะที่เลือก
  async function applyRole(uid, info, newRole, device) {
    if (newRole === "admin") {
      await store.set("/admins/" + uid, true);
    } else {
      if (!device) throw new Error("กรุณากรอก Device ID");
      await store.set(`/members/${device}/${uid}`, {
        role: newRole === "viewer" ? "viewer" : "member",
        name: info.name,
        email: info.email,
        joined: Date.now(),
        by: me.uid,
      });
      await store.set(`/user_devices/${uid}/${device}`, true);
      const owner = await store.get("/owners/" + device).catch(() => null);
      if (newRole === "owner") await store.set("/owners/" + device, uid);
      else if (owner === uid) await store.remove("/owners/" + device);
    }
    await store.set("/users/" + uid, {
      name: info.name,
      username: XF.usernameOf(info.email),
      email: info.email,
      role: newRole,
      device: newRole === "admin" ? info.device || "" : device,
      created: info.created || Date.now(),
      createdBy: info.createdBy || me.uid,
      disabled: false,
    });
  }

  // ---- ฟอร์มสร้างบัญชี
  $$("#roleOpts .role-opt").forEach((btn) =>
    btn.addEventListener("click", () => {
      role = btn.dataset.role;
      $$("#roleOpts .role-opt").forEach((b) => b.classList.toggle("active", b === btn));
    })
  );
  $("#uPass").value = randomPassword();
  $("#genPass").addEventListener("click", () => ($("#uPass").value = randomPassword()));
  $("#uDevice").addEventListener("input", renderJoin);

  $("#createForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    const name = $("#uName").value.trim();
    const username = $("#uUser").value.trim().toLowerCase();
    const password = $("#uPass").value;
    const device = deviceId();
    if (!username.includes("@") && !/^[a-z0-9._-]{3,32}$/.test(username)) {
      return showError("ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - ความยาว 3-32 ตัว");
    }
    if (password.length < 6) return showError("รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร");
    if (role !== "admin" && !/^[A-Z0-9_-]{3,32}$/.test(device)) return showError("กรุณากรอก Device ID (A-Z, 0-9, - และ _)");

    const email = XF.toEmail(username);
    const btn = $("#createBtn");
    btn.disabled = true;
    try {
      const uid = await store.createUser(name, email, password);
      await applyRole(uid, { name, email, device }, role, device);
      lastCred = [
        "เข้าใช้งานระบบ XactFlow",
        `ลิงก์: ${loginUrl()}`,
        `ชื่อผู้ใช้: ${XF.usernameOf(email)}`,
        `รหัสผ่าน: ${password}`,
        `สถานะ: ${ROLE_NAMES[role]}`,
      ].join("\n");
      $("#credText").textContent = lastCred;
      $("#credCard").hidden = false;
      $("#credCard").scrollIntoView({ behavior: "smooth", block: "center" });
      $("#createForm").reset();
      $("#uDevice").value = device;
      $("#uPass").value = randomPassword();
      XF.toast("สร้างบัญชีแล้ว");
      loadUsers();
    } catch (err) {
      console.error(err);
      const map = {
        "auth/email-already-in-use": "ชื่อผู้ใช้นี้ถูกใช้แล้ว",
        "auth/weak-password": "รหัสผ่านง่ายเกินไป",
        "auth/invalid-email": "รูปแบบอีเมลไม่ถูกต้อง",
      };
      showError(map[err.code] || (err.code === "PERMISSION_DENIED" ? "ไม่มีสิทธิ์เขียนข้อมูล ตรวจว่าเผยแพร่กฎ database.rules.json ล่าสุดแล้ว" : err.message));
    } finally {
      btn.disabled = false;
    }
  });
  $("#copyCred").addEventListener("click", () => copy(lastCred));

  // ---- รายชื่อบัญชี
  async function loadUsers() {
    try {
      users = (await store.get("/users")) || {};
    } catch (err) {
      $("#userList").innerHTML = '<div class="empty">โหลดรายชื่อไม่สำเร็จ</div>';
      return;
    }
    renderUsers();
  }

  function renderUsers() {
    const rows = Object.keys(users)
      .map((uid) => ({ uid, ...users[uid] }))
      .sort((a, b) => (b.created || 0) - (a.created || 0));
    if (!rows.length) {
      $("#userList").innerHTML = '<div class="empty">ยังไม่มีบัญชีที่สร้างผ่านหน้านี้</div>';
      return;
    }
    $("#userList").innerHTML = rows
      .map((u) => {
        const self = u.uid === me.uid;
        const options = Object.keys(ROLE_NAMES)
          .map((k) => `<option value="${k}" ${k === u.role ? "selected" : ""}>${ROLE_NAMES[k]}</option>`)
          .join("");
        return `<div class="list-item" data-uid="${esc(u.uid)}">
          <div class="grow"><b>${esc(u.name || "–")}</b> ${u.disabled ? '<span class="badge">ระงับ</span>' : ""}
            <div class="small muted">${esc(XF.usernameOf(u.email))}${u.device ? " · " + esc(u.device) : ""}</div></div>
          <select class="input" style="width:auto;height:36px" data-act="role" ${self ? "disabled" : ""} aria-label="สถานะ">${options}</select>
          ${XF.isInternalEmail(u.email) ? "" : '<button class="btn ghost sm" data-act="reset">รีเซ็ตรหัส</button>'}
          ${self ? "" : u.disabled ? '<button class="btn ghost sm" data-act="enable">คืนสิทธิ์</button>' : '<button class="btn ghost sm" data-act="disable">ระงับ</button>'}
        </div>`;
      })
      .join("");
  }

  $("#userList").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn || btn.tagName === "SELECT") return;
    const uid = btn.closest("[data-uid]").dataset.uid;
    const u = users[uid];
    if (btn.dataset.act === "reset") {
      return void XF.run(() => store.sendReset(u.email), "ส่งอีเมลรีเซ็ตรหัสผ่านแล้ว");
    }
    if (btn.dataset.act === "disable") {
      if (!confirm(`ระงับสิทธิ์ของ ${u.name}?`)) return;
      const ok = await XF.run(async () => {
        if (u.role === "admin") await store.remove("/admins/" + uid);
        else {
          await store.remove(`/members/${u.device}/${uid}`);
          await store.remove(`/user_devices/${uid}/${u.device}`);
          if ((await store.get("/owners/" + u.device).catch(() => null)) === uid) await store.remove("/owners/" + u.device);
        }
        await store.update("/users/" + uid, { disabled: true });
      }, "ระงับแล้ว");
      if (ok) loadUsers();
    }
    if (btn.dataset.act === "enable") {
      const ok = await XF.run(() => applyRole(uid, { ...u, device: u.device }, u.role, u.device), "คืนสิทธิ์แล้ว");
      if (ok) loadUsers();
    }
  });

  $("#userList").addEventListener("change", async (e) => {
    const sel = e.target.closest('select[data-act="role"]');
    if (!sel) return;
    const uid = sel.closest("[data-uid]").dataset.uid;
    const u = users[uid];
    const device = deviceId() || u.device;
    if (sel.value !== "admin" && !device) {
      sel.value = u.role;
      return XF.toast("กรุณากรอก Device ID ในฟอร์มด้านบนก่อน", true);
    }
    const ok = await XF.run(async () => {
      if (u.role === "admin" && sel.value !== "admin") await store.remove("/admins/" + uid);
      await applyRole(uid, u, sel.value, device);
    }, "เปลี่ยนสถานะแล้ว");
    if (ok) loadUsers();
    else sel.value = u.role;
  });

  // ---- รหัสเข้าร่วม
  async function renderJoin() {
    const device = deviceId();
    const state = $("#joinState");
    if (!/^[A-Z0-9_-]{3,32}$/.test(device)) {
      state.textContent = "เลือกอุปกรณ์ในช่องด้านบนก่อน";
      return;
    }
    const code = await store.get("/join_codes/" + device).catch(() => null);
    if (deviceId() !== device) return;
    state.innerHTML = code ? `รหัสเข้าร่วมของ ${esc(device)}: <b>${esc(code)}</b>` : `${esc(device)}: ปิดการเข้าร่วมด้วยรหัส`;
  }
  $("#joinNew").addEventListener("click", async () => {
    const device = deviceId();
    if (!/^[A-Z0-9_-]{3,32}$/.test(device)) return XF.toast("กรุณากรอก Device ID", true);
    if (await XF.run(() => store.set("/join_codes/" + device, randomCode()), "สร้างรหัสเข้าร่วมใหม่แล้ว")) renderJoin();
  });
  $("#joinOff").addEventListener("click", async () => {
    const device = deviceId();
    if (!/^[A-Z0-9_-]{3,32}$/.test(device)) return XF.toast("กรุณากรอก Device ID", true);
    if (await XF.run(() => store.remove("/join_codes/" + device), "ปิดการเข้าร่วมด้วยรหัสแล้ว")) renderJoin();
  });

  loadUsers();
  renderJoin();
});
