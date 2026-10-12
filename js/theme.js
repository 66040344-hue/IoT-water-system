// ธีมสว่าง/มืด: โหลดในส่วน <head> ก่อนวาดหน้า เพื่อไม่ให้หน้าแวบสีผิดตอนเปิด
// ค่าที่ผู้ใช้เลือกเก็บใน localStorage ("light" | "dark"); ไม่มีค่า = ตามระบบ
(function () {
  var KEY = "xf_theme";
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function saved() {
    try {
      var v = localStorage.getItem(KEY);
      return v === "light" || v === "dark" ? v : null;
    } catch (err) {
      return null;
    }
  }

  function effective() {
    return saved() || (media && media.matches ? "dark" : "light");
  }

  function apply() {
    var choice = saved();
    if (choice) root.setAttribute("data-theme", choice);
    else root.removeAttribute("data-theme");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", effective() === "dark" ? "#030a0e" : "#06121a");
  }

  window.xfTheme = {
    current: effective,
    toggle: function () {
      var next = effective() === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(KEY, next);
      } catch (err) {}
      apply();
      return next;
    },
  };

  apply();
  if (media && media.addEventListener) media.addEventListener("change", apply);
  document.addEventListener("DOMContentLoaded", apply);
})();
