// แผนที่แปลงจริงของหน้าหลัก (ดูอย่างเดียว): ภาพดาวเทียม + ขอบเขตสวนและกรอบโซนที่วาดไว้ในหน้าตั้งค่า > ตำแหน่งสวน
(function () {
  const { esc, fmt, num } = XF;
  let map = null;
  let pin = null;
  let shapes = [];
  let zoneShapes = {}; // { zoneId: L.polygon } ไว้เน้นโซนที่กำลังให้น้ำ
  let drawnKey = "";

  function draw(farm, zones) {
    shapes.forEach((s) => s.remove());
    shapes = [];
    zoneShapes = {};
    const all = [];

    const boundary = XF.cleanPolygon(farm.boundary);
    if (boundary.length >= 3) {
      shapes.push(L.polygon(boundary, { color: XF.MAP_COLORS[0], weight: 2.5, dashArray: "7 7", fillOpacity: 0.04, interactive: false }).addTo(map));
      all.push(...boundary);
    }
    zones.forEach((z, index) => {
      const points = XF.cleanPolygon((farm.zone_polygons || {})[z.id]);
      if (points.length < 3) return;
      const shape = L.polygon(points, { color: XF.zoneColor(index), weight: 2.5, fillOpacity: 0.22, interactive: false }).addTo(map);
      shapes.push(shape);
      shapes.push(L.tooltip({ permanent: true, direction: "center", className: "farm-label" }).setLatLng(shape.getBounds().getCenter()).setContent(esc(z.name)).addTo(map));
      zoneShapes[z.id] = shape;
      all.push(...points);
    });

    const lat = num(farm.lat, NaN);
    const lng = num(farm.lng, NaN);
    const hasPin = Number.isFinite(lat) && Number.isFinite(lng);
    if (pin) pin.remove();
    pin = hasPin ? L.marker([lat, lng], { title: farm.name || "ตำแหน่งสวน", keyboard: false }).addTo(map) : null;

    if (all.length >= 3) map.fitBounds(L.latLngBounds(all).pad(0.12));
    else if (hasPin) map.setView([lat, lng], 17);
    return all.length >= 3;
  }

  XF.renderFarmView = function (mapEl, infoEl, { farm, zones, up, online }) {
    if (typeof L === "undefined") {
      mapEl.innerHTML = '<div class="empty">โหลดแผนที่ไม่สำเร็จ ตรวจการเชื่อมต่ออินเทอร์เน็ต</div>';
      return;
    }
    if (!map) {
      // บนจอสัมผัสปิดการลากแผนที่ด้วยนิ้วเดียว เพื่อให้เลื่อนหน้าเว็บผ่านแผนที่ได้ (ยังซูมด้วยปุ่ม +/- ได้)
      map = L.map(mapEl, { scrollWheelZoom: false, dragging: !L.Browser.mobile, attributionControl: true });
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Tiles &copy; Esri" }).addTo(map);
    }

    // วาดใหม่เฉพาะเมื่อกรอบหรือรายชื่อโซนเปลี่ยน เพื่อไม่ให้แผนที่ขยับเองทุกครั้งที่สถานะอัปเดต
    const key = JSON.stringify([farm.lat, farm.lng, farm.boundary, farm.zone_polygons, zones.map((z) => [z.id, z.name])]);
    if (key !== drawnKey) {
      drawnKey = key;
      const hasShapes = draw(farm, zones);
      const rows = [];
      const boundaryArea = XF.polygonAreaSqm(XF.cleanPolygon(farm.boundary));
      if (boundaryArea) rows.push(`<span><i style="background:${XF.MAP_COLORS[0]}"></i>ขอบเขตสวน ${fmt(boundaryArea / 1600, 2)} ไร่</span>`);
      zones.forEach((z, index) => {
        const area = XF.polygonAreaSqm(XF.cleanPolygon((farm.zone_polygons || {})[z.id]));
        rows.push(
          `<span><i style="background:${XF.zoneColor(index)}"></i>${esc(z.name)} ${area ? `${fmt(area / 1600, 2)} ไร่` : '<span class="muted">(ยังไม่ได้วาดกรอบ)</span>'}</span>`
        );
      });
      infoEl.innerHTML =
        (hasShapes ? "" : '<div class="notice" style="margin-bottom:8px">ยังไม่ได้วาดกรอบแปลง แผนที่จึงแสดงเฉพาะตำแหน่งสวน</div>') +
        `<div class="farm-legend">${rows.join("")}<a href="settings.html#farm">${hasShapes ? "แก้ไขกรอบแปลง" : "วาดกรอบแปลง"}</a></div>`;
    }

    // เน้นโซนที่กำลังให้น้ำ/ปุ๋ย
    const job = (online && up && up.job) || {};
    Object.keys(zoneShapes).forEach((id) => {
      const active = !!job.running && job.zone === id;
      zoneShapes[id].setStyle({ weight: active ? 5 : 2.5, fillOpacity: active ? 0.45 : 0.22 });
    });
  };
})();
