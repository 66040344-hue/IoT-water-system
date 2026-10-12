// แผนที่ในหน้าตั้งค่า: หมุดตำแหน่งสวน + วาดกรอบสวนและกรอบของแต่ละโซน (Leaflet)
// กรอบเก็บเป็นอาร์เรย์ของ [lat, lng] ที่ farm/boundary และ farm/zone_polygons/<zoneId>
(function () {
  const { $, $$, esc, fmt, num } = XF;
  const COLORS = XF.MAP_COLORS;
  const BOUNDARY = "boundary";

  let map = null;
  let pin = null;
  let layers = { sat: null, street: null };
  let shapes = []; // เลเยอร์ของกรอบและจุดยอดที่วาดอยู่บนแผนที่
  let polys = {}; // { boundary: [[lat,lng],...], <zoneId>: [...] }
  let zones = [];
  let target = BOUNDARY;
  let drawing = false;

  const colorOf = (key) => (key === BOUNDARY ? COLORS[0] : XF.zoneColor(zones.findIndex((z) => z.id === key)));
  const labelOf = (key) => (key === BOUNDARY ? "ขอบเขตสวน" : (zones.find((z) => z.id === key) || {}).name || key);

  const areaSqm = XF.polygonAreaSqm;

  function updateInfo() {
    const points = polys[target] || [];
    const sqm = areaSqm(points);
    $("#drawInfo").textContent = points.length
      ? `${labelOf(target)}: ${points.length} จุด${sqm ? ` · ประมาณ ${fmt(sqm / 1600, 2)} ไร่ (${fmt(sqm, 0)} ตร.ม.)` : ""}`
      : drawing
        ? "แตะบนแผนที่เพื่อวางจุดมุมของแปลงทีละจุด"
        : "";
    $("#drawToggle").textContent = drawing ? "เสร็จสิ้นการวาด" : points.length ? "แก้ไขกรอบ" : "เริ่มวาด";
    $("#drawToggle").classList.toggle("orange", drawing);
  }

  function redraw() {
    if (!map) return;
    shapes.forEach((s) => s.remove());
    shapes = [];
    Object.keys(polys).forEach((key) => {
      const points = polys[key];
      if (!points || !points.length) return;
      const active = key === target;
      const color = colorOf(key);
      const shape = L.polygon(points, { color, weight: active ? 3 : 2, fillOpacity: key === BOUNDARY ? 0.05 : 0.2, dashArray: key === BOUNDARY ? "6 6" : null, interactive: false }).addTo(map);
      shapes.push(shape);
      if (key !== BOUNDARY && points.length >= 3) {
        shapes.push(L.tooltip({ permanent: true, direction: "center", className: "" }).setLatLng(shape.getBounds().getCenter()).setContent(esc(labelOf(key))).addTo(map));
      }
      if (!active || !drawing) return;
      points.forEach((point, index) => {
        const handle = L.marker(point, {
          draggable: true,
          icon: L.divIcon({ className: "", iconSize: [20, 20], iconAnchor: [10, 10], html: `<div style="width:20px;height:20px;border-radius:50%;background:#fff;border:4px solid ${color};box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>` }),
        }).addTo(map);
        handle.on("drag", (e) => {
          points[index] = [e.latlng.lat, e.latlng.lng];
          shape.setLatLngs(points);
        });
        handle.on("dragend", updateInfo);
        shapes.push(handle);
      });
    });
    updateInfo();
  }

  function setPin(lat, lng, pan) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    $("#farmLat").value = lat.toFixed(6);
    $("#farmLng").value = lng.toFixed(6);
    if (!map) return;
    pin.setLatLng([lat, lng]);
    if (pan) map.setView([lat, lng], Math.max(map.getZoom(), 17));
  }

  function renderTargets() {
    $("#drawTarget").innerHTML = [{ id: BOUNDARY, name: "ขอบเขตสวน" }, ...zones].map((z) => `<option value="${esc(z.id)}">${esc(z.name)}</option>`).join("");
    if (target !== BOUNDARY && !zones.some((z) => z.id === target)) target = BOUNDARY;
    $("#drawTarget").value = target;
  }

  function createMap() {
    const lat = num($("#farmLat").value, XF.DEFAULT_FARM.lat);
    const lng = num($("#farmLng").value, XF.DEFAULT_FARM.lng);
    map = L.map("map").setView([lat, lng], 17);
    layers.sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Tiles &copy; Esri" }).addTo(map);
    layers.street = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" });
    pin = L.marker([lat, lng], { draggable: true, title: "ตำแหน่งสวน" }).addTo(map);
    pin.on("dragend", () => setPin(pin.getLatLng().lat, pin.getLatLng().lng));

    map.on("click", (e) => {
      if (!drawing) return;
      (polys[target] = polys[target] || []).push([e.latlng.lat, e.latlng.lng]);
      redraw();
    });

    const all = Object.values(polys).flat();
    if (all.length >= 2) map.fitBounds(L.latLngBounds(all).pad(0.15));
    redraw();
  }

  XF.farmMap = {
    // เรียกครั้งเดียวตอนเปิดหน้า เพื่อผูกปุ่มต่าง ๆ
    init() {
      $("#drawTarget").addEventListener("change", () => {
        target = $("#drawTarget").value;
        redraw();
      });
      $("#drawToggle").addEventListener("click", () => {
        drawing = !drawing;
        redraw();
      });
      $("#drawUndo").addEventListener("click", () => {
        (polys[target] || []).pop();
        redraw();
      });
      $("#drawClear").addEventListener("click", () => {
        if (!(polys[target] || []).length || !confirm(`ล้างกรอบ "${labelOf(target)}"?`)) return;
        polys[target] = [];
        redraw();
      });
      $$("#mapLayer button").forEach((btn) =>
        btn.addEventListener("click", () => {
          $$("#mapLayer button").forEach((b) => b.classList.toggle("active", b === btn));
          if (!map) return;
          Object.keys(layers).forEach((k) => (k === btn.dataset.layer ? layers[k].addTo(map) : layers[k].remove()));
        })
      );
      ["farmLat", "farmLng"].forEach((id) => $("#" + id).addEventListener("change", () => setPin(num($("#farmLat").value, NaN), num($("#farmLng").value, NaN), true)));
      $("#locateMe").addEventListener("click", () => {
        if (!navigator.geolocation) return XF.toast("เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง", true);
        navigator.geolocation.getCurrentPosition(
          (pos) => setPin(pos.coords.latitude, pos.coords.longitude, true),
          () => XF.toast("ไม่สามารถอ่านตำแหน่งปัจจุบันได้ (ต้องอนุญาตการเข้าถึงตำแหน่ง และเปิดเว็บผ่าน https)", true)
        );
      });
    },

    // เมื่อแท็บตำแหน่งสวนถูกเปิด (แผนที่ต้องสร้างตอนที่มองเห็นแล้วเท่านั้น)
    show() {
      if (typeof L === "undefined") {
        $("#map").innerHTML = '<div class="empty">โหลดแผนที่ไม่สำเร็จ ตรวจการเชื่อมต่ออินเทอร์เน็ต</div>';
        return;
      }
      if (!map) createMap();
      else map.invalidateSize();
    },

    setZones(list) {
      zones = list;
      renderTargets();
      redraw();
    },

    setFarm(farm) {
      $("#farmName").value = farm.name || "";
      $("#farmAddress").value = farm.address || "";
      $("#farmLat").value = farm.lat == null ? "" : farm.lat;
      $("#farmLng").value = farm.lng == null ? "" : farm.lng;
      const clean = XF.cleanPolygon;
      polys = { [BOUNDARY]: clean(farm.boundary) };
      Object.keys(farm.zone_polygons || {}).forEach((id) => (polys[id] = clean(farm.zone_polygons[id])));
      if (map && pin && farm.lat != null) pin.setLatLng([farm.lat, farm.lng]);
      redraw();
    },

    getFarm() {
      const zonePolygons = {};
      zones.forEach((z) => {
        if ((polys[z.id] || []).length >= 3) zonePolygons[z.id] = polys[z.id];
      });
      const lat = num($("#farmLat").value, NaN);
      const lng = num($("#farmLng").value, NaN);
      return {
        name: $("#farmName").value.trim(),
        address: $("#farmAddress").value.trim(),
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        boundary: (polys[BOUNDARY] || []).length >= 3 ? polys[BOUNDARY] : null,
        zone_polygons: Object.keys(zonePolygons).length ? zonePolygons : null,
      };
    },

    finishDrawing() {
      drawing = false;
      redraw();
    },
  };
})();
