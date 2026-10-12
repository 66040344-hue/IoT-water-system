// ผังระบบแบบ isometric (SVG) ของหน้าหลัก: บ่อน้ำ ปั๊ม 2 ตัว ถังปุ๋ย 3 ถัง วาล์วไฟฟ้า วาล์วมือ และแปลงตามโซนในระบบ
// โครงผังสร้างใหม่เฉพาะเมื่อโซน/ถังเปลี่ยน ส่วนสถานะ (การไหล, เปิด/ปิด) อัปเดตด้วยการสลับ class เพื่อให้แอนิเมชันไม่สะดุด
(function () {
  const { esc, fmt, num } = XF;

  // ---------------------------------------------------------------- การฉายภาพ isometric
  // พื้น: แกน x ชี้ไปทางขวาล่าง, แกน y ชี้ไปทางซ้ายล่าง, z คือความสูง
  const COS = 0.866;
  const SIN = 0.5;
  let bounds;
  const P = (x, y, z = 0) => {
    const sx = (x - y) * COS;
    const sy = (x + y) * SIN - z;
    bounds.x0 = Math.min(bounds.x0, sx);
    bounds.x1 = Math.max(bounds.x1, sx);
    bounds.y0 = Math.min(bounds.y0, sy);
    bounds.y1 = Math.max(bounds.y1, sy);
    return [sx, sy];
  };
  const pts = (list) => list.map(([x, y, z]) => P(x, y, z).map((n) => n.toFixed(1)).join(",")).join(" ");
  const poly = (list, attrs) => `<polygon points="${pts(list)}" ${attrs}/>`;

  // กล่อง: มองเห็นด้านบน ด้านซ้ายหน้า (y มาก) และด้านขวาหน้า (x มาก)
  function box(x, y, z, w, d, h, c, extra = "") {
    return (
      poly([[x, y + d, z + h], [x + w, y + d, z + h], [x + w, y + d, z], [x, y + d, z]], `fill="${c.left}"`) +
      poly([[x + w, y, z + h], [x + w, y + d, z + h], [x + w, y + d, z], [x + w, y, z]], `fill="${c.right}"`) +
      poly([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]], `fill="${c.top}" ${extra}`)
    );
  }

  // ทรงกระบอกตั้ง: วงกลมบนพื้นกลายเป็นวงรี (rx = 1.2247r, ry = 0.7071r)
  function cylinder(x, y, z, r, h, fill, topFill, extra = "") {
    const [bx, by] = P(x, y, z);
    const [, ty] = P(x, y, z + h);
    const rx = r * 1.2247;
    const ry = r * 0.7071;
    return (
      `<path d="M${(bx - rx).toFixed(1)},${ty.toFixed(1)} V${by.toFixed(1)} A${rx.toFixed(1)},${ry.toFixed(1)} 0 0 0 ${(bx + rx).toFixed(1)},${by.toFixed(1)} V${ty.toFixed(1)} Z" fill="${fill}"/>` +
      `<ellipse cx="${bx.toFixed(1)}" cy="${ty.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${topFill}" ${extra}/>`
    );
  }

  const text = (x, y, z, dx, dy, cls, content, anchor = "middle") => {
    const [sx, sy] = P(x, y, z);
    return `<text x="${(sx + dx).toFixed(1)}" y="${(sy + dy).toFixed(1)}" text-anchor="${anchor}" class="${cls}">${content}</text>`;
  };

  // ป้ายสถานะ ON/OFF ของอุปกรณ์ไฟฟ้า
  const badge = (id, x, y, z, dx, dy, label) => {
    const [sx, sy] = P(x, y, z);
    const cx = sx + dx;
    const cy = sy + dy;
    return `<g class="dg-badge" id="dg-${id}"><rect x="${(cx - 15).toFixed(1)}" y="${(cy - 8).toFixed(1)}" width="30" height="16" rx="8"/>
      <text x="${cx.toFixed(1)}" y="${(cy + 3.8).toFixed(1)}" text-anchor="middle">${label}</text></g>`;
  };

  // ---------------------------------------------------------------- ชิ้นส่วน
  const PIPE_Z = 5;
  const pipes = []; // { id, points } วาดทีหลังเป็น 3 ชั้น: ขอบ, ตัวท่อ, เส้นการไหล
  const pipe = (id, points) => pipes.push({ id, d: "M" + points.map(([x, y]) => P(x, y, PIPE_Z).map((n) => n.toFixed(1)).join(",")).join(" L") });

  const GREY = { top: "#eef2ef", left: "#c3ccc6", right: "#a9b4ad" };
  const DARK = { top: "#4a5650", left: "#2b3430", right: "#1c2320" };

  function electricValve(id, x, y, label, dx, dy) {
    return (
      `<g class="dg-valve" id="dg-dev-${id}">` +
      box(x - 6, y - 6, 1, 12, 12, 9, GREY) +
      `<g class="dg-actuator">${box(x - 5, y - 5, 10, 10, 10, 10, { top: "var(--dg-act-top)", left: "var(--dg-act-left)", right: "var(--dg-act-right)" })}</g>` +
      `</g>` +
      badge("tag-" + id, x, y, 20, dx, dy, label)
    );
  }

  function manualValve(x, y) {
    const [sx, sy] = P(x, y, 22);
    const [bx, by] = P(x, y, 10);
    return (
      box(x - 5, y - 5, 1, 10, 10, 8, GREY) +
      `<line x1="${bx.toFixed(1)}" y1="${by.toFixed(1)}" x2="${sx.toFixed(1)}" y2="${sy.toFixed(1)}" stroke="#2b3430" stroke-width="2.4"/>` +
      `<ellipse cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" rx="9.5" ry="5.5" fill="none" stroke="#f58220" stroke-width="3"/>` +
      `<path d="M${(sx - 9.5).toFixed(1)},${sy.toFixed(1)} H${(sx + 9.5).toFixed(1)} M${sx.toFixed(1)},${(sy - 5.5).toFixed(1)} V${(sy + 5.5).toFixed(1)}" stroke="#f58220" stroke-width="1.8"/>`
    );
  }

  function pump(id, x, y, label, dx, dy) {
    const [ix, iy] = P(x + 9, y, 19);
    return (
      `<g class="dg-pump" id="dg-dev-${id}">` +
      box(x - 18, y - 13, 0, 36, 26, 4, { top: "#dfe5e1", left: "#aab4ae", right: "#939e97" }) +
      box(x - 16, y - 9, 4, 17, 18, 16, DARK) +
      cylinder(x + 9, y, 4, 9.5, 15, "var(--dg-pump-body)", "var(--dg-pump-top)") +
      `<ellipse class="dg-impeller" cx="${ix.toFixed(1)}" cy="${iy.toFixed(1)}" rx="7" ry="4" fill="none" stroke="#fff" stroke-width="2.4" stroke-dasharray="4 4.6"/>` +
      `</g>` +
      badge("tag-" + id, x, y, 24, dx, dy, label)
    );
  }

  function tank(i, x, y, r, h, info) {
    const stripe = ["#1faa3c", "#f58220", "#2b3430"][i];
    const [cx, cyTop] = P(x, y, 8 + h);
    const [, cyBand] = P(x, y, 8 + h * 0.42);
    const rx = r * 1.2247;
    const ry = r * 0.7071;
    return (
      box(x - r * 0.8, y - r * 0.8, 0, r * 1.6, r * 1.6, 8, { top: "#8d9892", left: "#5f6a64", right: "#4b5550" }) +
      cylinder(x, y, 8, r, h, "url(#dg-tank)", "#ffffff", 'stroke="#d5ddd8" stroke-width="1"') +
      // แถบสีประจำถัง โค้งตามผิวถัง
      `<path d="M${(cx - rx).toFixed(1)},${cyBand.toFixed(1)} a${rx.toFixed(1)},${ry.toFixed(1)} 0 0 0 ${(2 * rx).toFixed(1)},0 v12 a${rx.toFixed(1)},${ry.toFixed(1)} 0 0 1 ${(-2 * rx).toFixed(1)},0 Z" fill="${stripe}" opacity="0.92"/>` +
      `<ellipse cx="${cx.toFixed(1)}" cy="${cyTop.toFixed(1)}" rx="${(rx * 0.36).toFixed(1)}" ry="${(ry * 0.36).toFixed(1)}" fill="${stripe}"/>` +
      text(x, y, 8 + h, 0, -ry - 20, "dg-title", esc(info.name)) +
      text(x, y, 8 + h, 0, -ry - 7, "dg-sub", info.npk)
    );
  }

  function pond(x, y, w, d) {
    const [cx, cy] = P(x + w / 2, y + d / 2, 0);
    const ripple = (dx, dy, delay) =>
      `<ellipse class="dg-ripple" style="animation-delay:${delay}s" cx="${(cx + dx).toFixed(1)}" cy="${(cy + dy).toFixed(1)}" rx="16" ry="8" fill="none" stroke="#fff" stroke-width="1.5"/>`;
    return (
      poly([[x, y, 0], [x + w, y, 0], [x + w, y + d, 0], [x, y + d, 0]], 'fill="#b9c8bd" stroke="#b9c8bd" stroke-width="16" stroke-linejoin="round"') +
      poly([[x, y, 0], [x + w, y, 0], [x + w, y + d, 0], [x, y + d, 0]], 'fill="url(#dg-water)" stroke="url(#dg-water)" stroke-width="6" stroke-linejoin="round"') +
      ripple(-18, -4, 0) +
      ripple(22, 10, 1.3) +
      text(x + w / 2, y + d, 0, -30, 26, "dg-title", "บ่อน้ำ")
    );
  }

  function plot(zone, x, y, w, d) {
    const cols = Math.max(2, Math.floor(w / 34));
    const rows = Math.max(1, Math.floor(d / 30));
    let trees = "";
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tx = x + (w / cols) * (c + 0.5);
        const ty = y + (d / rows) * (r + 0.5);
        const [gx, gy] = P(tx, ty, 6);
        const [, topY] = P(tx, ty, 24);
        trees +=
          `<ellipse cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" rx="9" ry="4.6" fill="#000" opacity="0.13"/>` +
          `<line x1="${gx.toFixed(1)}" y1="${gy.toFixed(1)}" x2="${gx.toFixed(1)}" y2="${(topY + 4).toFixed(1)}" stroke="#6b4a2c" stroke-width="3" stroke-linecap="round"/>` +
          `<circle cx="${gx.toFixed(1)}" cy="${topY.toFixed(1)}" r="9.5" fill="#23702f"/>` +
          `<circle cx="${(gx - 2.6).toFixed(1)}" cy="${(topY - 3).toFixed(1)}" r="5.2" fill="#3f9a4a"/>`;
      }
    }
    return {
      tile: `<g class="dg-plot" id="dg-zone-${esc(zone.id)}">${box(x, y, 0, w, d, 6, { top: "var(--dg-soil-top)", left: "#8a6a48", right: "#6f5338" }, 'class="dg-plot-top"')}</g>`,
      trees,
      label:
        text(x + w, y + d / 2, 6, 14, 2, "dg-title", esc(zone.name), "start") +
        text(x + w, y + d / 2, 6, 14, 15, "dg-sub", `${fmt(zone.trees)} ต้น`, "start"),
    };
  }

  // ---------------------------------------------------------------- สร้างผังทั้งภาพ
  const MAIN_Y = 200;
  const TANK_X = [205, 280, 355];
  const TANK_Y = 40;
  const HEADER_Y = 130;
  const FLUSH_X = 170;
  const INJECT_X = 415;
  const MANIFOLD_X = 480;
  const PLOT_X = 520;
  const PLOT_W = 160;

  function build(zones, tanks) {
    bounds = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    pipes.length = 0;

    const n = Math.max(1, zones.length);
    const depth = n <= 2 ? 100 : n === 3 ? 84 : n === 4 ? 66 : Math.max(34, 300 / n - 12);
    const gap = 14;
    const total = n * depth + (n - 1) * gap;
    const plots = zones.map((z, i) => {
      const y = MAIN_Y - total / 2 + i * (depth + gap);
      return { zone: z, y, yc: y + depth / 2, ...plot(z, PLOT_X, y, PLOT_W, depth) };
    });

    // ท่อ (ทิศของเส้น = ทิศการไหล)
    pipe("src", [[84, MAIN_Y], [FLUSH_X, MAIN_Y]]);
    pipe("main-a", [[FLUSH_X, MAIN_Y], [INJECT_X, MAIN_Y]]);
    pipe("main-b", [[INJECT_X, MAIN_Y], [MANIFOLD_X, MAIN_Y]]);
    pipe("flush", [[FLUSH_X, MAIN_Y], [FLUSH_X, HEADER_Y]]);
    const headerStops = [FLUSH_X, ...TANK_X, INJECT_X];
    for (let i = 0; i < 4; i++) pipe("h" + i, [[headerStops[i], HEADER_Y], [headerStops[i + 1], HEADER_Y]]);
    TANK_X.forEach((x, i) => pipe("tank" + (i + 1), [[x, TANK_Y + 23], [x, HEADER_Y]]));
    pipe("inject", [[INJECT_X, HEADER_Y], [INJECT_X, MAIN_Y]]);
    plots.forEach((p) => {
      // จากปลายท่อเมน วิ่งตามท่อแยกไปยังจุดแบ่งของโซน แล้วเข้าแปลง
      pipe("zone-" + p.zone.id, [[MANIFOLD_X, MAIN_Y], [MANIFOLD_X, p.yc], [PLOT_X - 2, p.yc]]);
    });

    let body = "";
    body += poly([[150, 8, 0], [445, 8, 0], [445, 152, 0], [150, 152, 0]], 'fill="#e3e9e5" stroke="#e3e9e5" stroke-width="10" stroke-linejoin="round"');
    body += pond(0, 158, 84, 84);
    TANK_X.forEach((x, i) => (body += tank(i, x, TANK_Y, 21, 58, tanks[i])));
    plots.forEach((p) => (body += p.tile));

    body += pipes.map((p) => `<path class="dg-pipe-edge" d="${p.d}"/>`).join("");
    body += pipes.map((p) => `<path class="dg-pipe" id="dg-pipe-${esc(p.id)}" d="${p.d}"/>`).join("");
    body += pipes.map((p) => `<path class="dg-flow" id="dg-flow-${esc(p.id)}" d="${p.d}"/>`).join("");

    plots.forEach((p) => (body += p.trees));

    // อุปกรณ์บนท่อ (เรียงจากหลังมาหน้า)
    TANK_X.forEach((x, i) => (body += electricValve("t" + (i + 1), x, 96, "T" + (i + 1), -28, 2)));
    body += pump("p2", INJECT_X, HEADER_Y, "P2", 46, -8);
    body += electricValve("f", FLUSH_X, 165, "F", -28, -4);
    body += electricValve("v", INJECT_X, 168, "V", 30, 4);
    body += pump("p1", 120, MAIN_Y, "P1", -10, 36);
    plots.forEach((p) => (body += manualValve(500, p.yc)));

    // ป้ายกำกับ
    body += text(INJECT_X, HEADER_Y, 24, 46, 12, "dg-sub", "ปั๊มปุ๋ย");
    body += text(120, MAIN_Y, 24, -10, 56, "dg-sub", "ปั๊มน้ำ");
    body += text(FLUSH_X, 165, 20, -28, -18, "dg-sub", "วาล์วล้างท่อ");
    body += text(INJECT_X, 168, 20, 52, 24, "dg-sub", "วาล์วเข้าท่อประธาน");
    if (plots.length) {
      const first = plots[0];
      body += text(500, first.yc, 22, 0, -12, "dg-sub", "วาล์วมือ");
    }
    plots.forEach((p) => (body += p.label));

    const pad = 22;
    const vb = [bounds.x0 - pad, bounds.y0 - pad - 26, bounds.x1 - bounds.x0 + pad * 2 + 70, bounds.y1 - bounds.y0 + pad * 2 + 40];
    return `<svg class="dg-svg" viewBox="${vb.map((v) => v.toFixed(0)).join(" ")}" role="img" aria-label="ผังระบบให้น้ำและปุ๋ย">
      <defs>
        <linearGradient id="dg-tank" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stop-color="#dfe6e2"/><stop offset="0.35" stop-color="#ffffff"/><stop offset="1" stop-color="#c2ccc6"/>
        </linearGradient>
        <linearGradient id="dg-water" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#8fc7ea"/><stop offset="1" stop-color="#4f9fd3"/>
        </linearGradient>
      </defs>
      ${body}
    </svg>`;
  }

  // ---------------------------------------------------------------- อัปเดตสถานะ
  function applyState(root, zones, up, online) {
    const mask = online ? up.relays || 0 : 0;
    const on = (bit) => ((mask >> bit) & 1) === 1;
    const water = on(0);
    const feeding = on(1) && on(2); // ปั๊มปุ๋ยเดิน + วาล์วเข้าท่อประธานเปิด
    const inject = [3, 4, 5].map((bit) => feeding && on(bit));
    const flush = feeding && on(6);
    const anyFert = inject.some(Boolean);
    const job = up.job || {};

    const setFlow = (id, active, kind) => {
      const flow = root.querySelector("#dg-flow-" + CSS.escape(id));
      const tube = root.querySelector("#dg-pipe-" + CSS.escape(id));
      if (!flow) return;
      flow.setAttribute("class", "dg-flow" + (active ? " on " + kind : ""));
      tube.setAttribute("class", "dg-pipe" + (active && kind !== "fert" ? " wet" : ""));
    };
    const kindOf = (hasFert, hasWater) => (hasFert ? (hasWater ? "mix" : "fert") : "water");

    setFlow("src", water, "water");
    setFlow("main-a", water, "water");
    setFlow("flush", flush, "water");
    setFlow("h0", flush, "water");
    setFlow("h1", flush || inject[0], kindOf(inject[0], flush));
    setFlow("h2", flush || inject[0] || inject[1], kindOf(inject[0] || inject[1], flush));
    setFlow("h3", flush || anyFert, kindOf(anyFert, flush));
    inject.forEach((active, i) => setFlow("tank" + (i + 1), active, "fert"));
    setFlow("inject", flush || anyFert, kindOf(anyFert, flush));

    const downstream = water || anyFert || flush;
    const downKind = kindOf(anyFert, water || flush);
    setFlow("main-b", downstream, downKind);
    zones.forEach((z) => {
      // ระหว่างทำงานตามคำสั่ง จะรู้ว่ากำลังให้โซนไหน นอกนั้นแสดงว่าน้ำไปถึงทุกจุดแบ่งโซน
      const active = downstream && (!job.running || !job.zone || job.zone === z.id);
      setFlow("zone-" + z.id, active, downKind);
      const tile = root.querySelector("#dg-zone-" + CSS.escape(z.id));
      if (tile) tile.classList.toggle("on", active && water);
    });

    const devices = { p1: 0, p2: 1, v: 2, t1: 3, t2: 4, t3: 5, f: 6 };
    Object.keys(devices).forEach((id) => {
      const active = on(devices[id]);
      const dev = root.querySelector("#dg-dev-" + id);
      const tag = root.querySelector("#dg-tag-" + id);
      if (dev) dev.classList.toggle("on", active);
      if (tag) tag.classList.toggle("on", active);
    });
  }

  let structureKey = "";
  XF.renderDiagram = function (root, { zones, settings, up, online }) {
    const tankCfg = (settings || {}).tanks || {};
    const tanks = [1, 2, 3].map((i) => {
      const t = tankCfg["t" + i] || {};
      return { name: t.name || "ถัง " + i, npk: `${fmt(num(t.n))}-${fmt(num(t.p))}-${fmt(num(t.k))}` };
    });
    const key = JSON.stringify([zones.map((z) => [z.id, z.name, z.trees]), tanks]);
    if (key !== structureKey || !root.firstElementChild) {
      structureKey = key;
      root.innerHTML = build(zones, tanks);
    }
    applyState(root, zones, up || {}, online);
  };
})();
