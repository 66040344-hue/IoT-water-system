// ชั้นข้อมูลของเว็บ: ใช้ Firebase (Auth + Realtime Database) หรือฐานข้อมูลจำลองใน localStorage (โหมดสาธิต)
// ทุกหน้าคุยกับข้อมูลผ่าน XF.store เท่านั้น
window.XF = window.XF || {};

(function () {
  const config = window.XF_FIREBASE_CONFIG || {};
  const demo = !config.apiKey || config.apiKey.startsWith("YOUR_");

  // ---------------------------------------------------------------- Firebase
  function firebaseStore() {
    firebase.initializeApp(config);
    const auth = firebase.auth();
    const db = firebase.database();
    const toUser = (u) => (u ? { uid: u.uid, email: u.email, name: u.displayName || u.email.split("@")[0] } : null);

    // จำค่าล่าสุดของข้อมูลอุปกรณ์ไว้ในเครื่อง เปิดหน้าใหม่จะแสดงได้ทันทีโดยไม่ต้องรอเชื่อมต่อ Firebase
    const CACHE = "xf_c:";
    const cacheRead = (path) => {
      try {
        return localStorage.getItem(CACHE + path);
      } catch (err) {
        return null;
      }
    };
    const cacheWrite = (path, json) => {
      try {
        localStorage.setItem(CACHE + path, json);
      } catch (err) {
        /* พื้นที่เต็ม: ข้ามไป */
      }
    };
    const clearCache = () => {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(CACHE))
        .forEach((k) => localStorage.removeItem(k));
    };

    return {
      demo: false,
      clearCache,
      onAuth: (cb) => auth.onAuthStateChanged((u) => cb(toUser(u))),
      signIn: (email, password) => auth.signInWithEmailAndPassword(email, password),
      async signUp(name, email, password) {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName: name });
      },
      async setName(name) {
        await auth.currentUser.updateProfile({ displayName: name });
      },
      // ผู้ดูแลสร้างบัญชีให้ผู้อื่น: ใช้แอป Firebase อีกตัวเพื่อไม่ให้บัญชีผู้ดูแลหลุดออกจากระบบ
      async createUser(name, email, password) {
        const app = firebase.apps.find((a) => a.name === "xf-admin") || firebase.initializeApp(config, "xf-admin");
        const second = app.auth();
        try {
          const cred = await second.createUserWithEmailAndPassword(email, password);
          await cred.user.updateProfile({ displayName: name });
          return cred.user.uid;
        } finally {
          await second.signOut().catch(() => {});
        }
      },
      sendReset: (email) => auth.sendPasswordResetEmail(email),
      signOut: () => {
        clearCache();
        return auth.signOut();
      },
      // เรียก Cloud Function (เช่น ส่งสรุปเข้า LINE) ต้องโหลด firebase-functions-compat.js ในหน้านั้นก่อน
      async call(name, data) {
        if (!firebase.functions) throw new Error("หน้านี้ยังไม่ได้โหลดไลบรารี Cloud Functions");
        const region = config.functionsRegion || "asia-southeast1";
        const res = await firebase.app().functions(region).httpsCallable(name)(data || {});
        return res.data;
      },
      get: async (path) => (await db.ref(path).get()).val(),
      set: (path, value) => db.ref(path).set(value),
      update: (path, values) => db.ref(path).update(values),
      push: (path, value) => db.ref(path).push(value).then((r) => r.key),
      remove: (path) => db.ref(path).remove(),
      // opts.cache === false: ไม่ส่งค่าที่จำไว้ รอค่าจริงจากเซิร์ฟเวอร์เท่านั้น
      watch(path, cb, opts) {
        const ref = db.ref(path);
        const useCache = path.startsWith("/devices/") && !(opts && opts.cache === false);
        let sent = null; // JSON ของค่าล่าสุดที่ส่งให้ cb แล้ว
        let stopped = false;
        const cached = useCache ? cacheRead(path) : null;
        if (cached != null) {
          queueMicrotask(() => {
            if (stopped || sent != null) return;
            sent = cached;
            cb(JSON.parse(cached));
          });
        }
        const handler = ref.on(
          "value",
          (snap) => {
            const value = snap.val();
            if (useCache) {
              const json = JSON.stringify(value);
              if (json === sent) return; // ตรงกับที่แสดงอยู่แล้ว ไม่ต้องวาดซ้ำ
              sent = json;
              cacheWrite(path, json);
            }
            cb(value);
          },
          (err) => console.error(path, err)
        );
        return () => {
          stopped = true;
          ref.off("value", handler);
        };
      },
      async range(path, child, from, to) {
        const snap = await db.ref(path).orderByChild(child).startAt(from).endAt(to).get();
        const rows = [];
        snap.forEach((c) => {
          rows.push({ id: c.key, ...c.val() });
        });
        return rows;
      },
    };
  }

  // ---------------------------------------------------------------- โหมดสาธิต
  function demoStore() {
    const DB_KEY = "xf_demo_db";
    const USER_KEY = "xf_demo_user";
    const watchers = new Set();
    let tree = JSON.parse(localStorage.getItem(DB_KEY) || "null") || {
      device_secrets: { "DEMO-0001": "123456" },
    };

    const parts = (path) => path.split("/").filter(Boolean);
    const read = (path) => {
      let node = tree;
      for (const p of parts(path)) {
        if (node == null || typeof node !== "object") return null;
        node = node[p];
      }
      return node === undefined ? null : node;
    };
    const write = (path, value) => {
      const keys = parts(path);
      let node = tree;
      keys.slice(0, -1).forEach((k) => {
        if (node[k] == null || typeof node[k] !== "object") node[k] = {};
        node = node[k];
      });
      const last = keys[keys.length - 1];
      if (value === null || value === undefined) delete node[last];
      else node[last] = JSON.parse(JSON.stringify(value));
    };
    const related = (a, b) => a.startsWith(b) || b.startsWith(a);
    const commit = (changed) => {
      localStorage.setItem(DB_KEY, JSON.stringify(tree));
      watchers.forEach((w) => {
        if (changed.some((c) => related(w.path + "/", c + "/"))) w.cb(read(w.path));
      });
    };
    // อีกแท็บหนึ่งแก้ข้อมูล -> โหลดใหม่และแจ้งทุก watcher
    window.addEventListener("storage", (e) => {
      if (e.key !== DB_KEY || !e.newValue) return;
      tree = JSON.parse(e.newValue);
      watchers.forEach((w) => w.cb(read(w.path)));
    });

    let authCb = null;
    const currentUser = () => JSON.parse(localStorage.getItem(USER_KEY) || "null");
    const setUser = (u) => {
      if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
      else localStorage.removeItem(USER_KEY);
      if (authCb) authCb(u);
    };

    return {
      demo: true,
      clearCache() {},
      onAuth(cb) {
        authCb = cb;
        setTimeout(() => cb(currentUser()), 0);
      },
      async signIn(email) {
        const uname = email.split("@")[0];
        const users = tree.users || {};
        const found = Object.keys(users).find((id) => users[id].username === uname);
        setUser({ uid: found || "demo-user", email, name: found ? users[found].name : (currentUser() || {}).name || uname });
      },
      async createUser(name, email) {
        return "demo-" + email.split("@")[0];
      },
      async sendReset() {},
      async signUp(name, email) {
        setUser({ uid: "demo-user", email, name });
      },
      async setName(name) {
        setUser({ ...currentUser(), name });
      },
      async signOut() {
        setUser(null);
      },
      // โหมดสาธิตไม่มีเซิร์ฟเวอร์ LINE: ตอบแบบจำลองเพื่อให้หน้าจอใช้งานได้
      async call(name) {
        if (name === "lineStatus") return { configured: false, botUrl: "", recipients: [], demo: true };
        if (name === "lineCreateLinkCode") return { code: "000000", expiresInSec: 600, demo: true };
        return { sent: 0, demo: true };
      },
      get: async (path) => (path === "/admins/demo-user" ? true : read(path)),
      async set(path, value) {
        // เลียนแบบกฎความปลอดภัย: เข้าร่วมอุปกรณ์ด้วยตัวเองได้เมื่อรหัสเข้าร่วมตรงเท่านั้น (ผู้ดูแลสร้างให้ได้เสมอ)
        const m = path.match(/^\/members\/([^/]+)\/[^/]+$/);
        const asAdmin = value && value.by;
        if (m && value && !asAdmin && value.code !== (read("/join_codes/" + m[1]) || read("/device_secrets/" + m[1]))) {
          throw Object.assign(new Error("permission denied"), { code: "PERMISSION_DENIED" });
        }
        write(path, value);
        commit([path]);
      },
      async update(path, values) {
        const changed = Object.keys(values).map((k) => path + "/" + k);
        Object.keys(values).forEach((k) => write(path + "/" + k, values[k]));
        commit(changed);
      },
      async push(path, value) {
        const key = "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        write(path + "/" + key, value);
        commit([path + "/" + key]);
        return key;
      },
      async remove(path) {
        write(path, null);
        commit([path]);
      },
      watch(path, cb) {
        const w = { path, cb };
        watchers.add(w);
        setTimeout(() => watchers.has(w) && cb(read(path)), 0);
        return () => watchers.delete(w);
      },
      async range(path, child, from, to) {
        const node = read(path) || {};
        return Object.keys(node)
          .map((id) => ({ id, ...node[id] }))
          .filter((r) => r[child] >= from && r[child] <= to)
          .sort((a, b) => a[child] - b[child]);
      },
    };
  }

  XF.store = demo ? demoStore() : firebaseStore();
})();
