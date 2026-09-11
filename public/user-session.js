// MedRecSys User Session & Google Profile Sync
(function () {
  function syncUserNavbar() {
    try {
      var raw = localStorage.getItem("medrecsys:currentUser");
      if (!raw) return;
      var user = JSON.parse(raw);
      if (!user || !user.name) return;

      var firstName = user.name.split(" ")[0];
      var links = document.querySelectorAll("a[href='/login']");

      links.forEach(function (link) {
        if (user.picture) {
          link.innerHTML =
            '<span style="display:inline-flex; align-items:center; gap:8px;">' +
            '<img src="' +
            user.picture +
            '" alt="' +
            user.name +
            '" style="width:24px; height:24px; border-radius:50%; object-fit:cover; border:1.5px solid #0066ff; box-shadow:0 2px 6px rgba(0,102,255,0.25);">' +
            '<span style="font-weight:600;">' +
            firstName +
            "</span>" +
            "</span>";
        } else {
          var initial = (user.name || "U").charAt(0).toUpperCase();
          link.innerHTML =
            '<span style="display:inline-flex; align-items:center; gap:8px;">' +
            '<span style="width:22px; height:22px; border-radius:50%; background:linear-gradient(135deg, #0052cc, #00c6ff); color:#ffffff; font-size:0.75rem; font-weight:700; display:grid; place-items:center;">' +
            initial +
            "</span>" +
            '<span style="font-weight:600;">' +
            firstName +
            "</span>" +
            "</span>";
        }
        link.title = "Signed in as " + (user.email || user.name);
      });
    } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncUserNavbar);
  } else {
    syncUserNavbar();
  }
})();
