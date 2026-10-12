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

    return {
      demo: false,
      onAuth: (cb) => auth.onAuthStateChanged((u) => cb(toUser(u))),
      signIn: (email, password) => auth.signInWithEmailAndPassword(email, password),
      async signUp(name, email, password) {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName: name });
      },
      async setName(name) {
        await auth.currentUser.updateProfile({ displayName: name });
      },
      signOut: () => auth.signOut(),
      get: async (path) => (await db.ref(path).get()).val(),
      set: (path, value) => db.ref(path).set(value),
      update: (path, values) => db.ref(path).update(values),
      push: (path, value) => db.ref(path).push(value).then((r) => r.key),
      remove: (path) => db.ref(path).remove(),
      watch(path, cb) {
        const ref = db.ref(path);
        const handler = ref.on("value", (snap) => cb(snap.val()), (err) => console.error(path, err));
        return () => ref.off("value", handler);
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
      onAuth(cb) {
        authCb = cb;
        setTimeout(() => cb(currentUser()), 0);
      },
      async signIn(email) {
        setUser({ uid: "demo-user", email, name: (currentUser() || {}).name || email.split("@")[0] });
      },
      async signUp(name, email) {
        setUser({ uid: "demo-user", email, name });
      },
      async setName(name) {
        setUser({ ...currentUser(), name });
      },
      async signOut() {
        setUser(null);
      },
      get: async (path) => read(path),
      async set(path, value) {
        // เลียนแบบกฎความปลอดภัย: เข้าร่วมอุปกรณ์ได้เมื่อรหัสตรงเท่านั้น
        const m = path.match(/^\/members\/([^/]+)\/[^/]+$/);
        if (m && value && value.code !== read("/device_secrets/" + m[1])) {
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
