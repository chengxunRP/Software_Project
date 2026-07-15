document.addEventListener("DOMContentLoaded", function () {
  // Public hamburger navigation
  var navToggle = document.getElementById("navToggle");
  var mobileSheet = document.getElementById("publicMobileSheet");
  if (navToggle && mobileSheet) {
    navToggle.addEventListener("click", function () {
      mobileSheet.classList.toggle("open");
    });
  }

  // App sidebar open/close on mobile
  var appShell = document.getElementById("appShell");
  var sidebarOpenBtn = document.getElementById("sidebarOpenBtn");
  var sidebarBackdrop = document.getElementById("sidebarBackdrop");
  var sidebarCloseBtn = document.getElementById("sidebarCloseBtn");

  function closeSidebar() {
    if (appShell) {
      appShell.classList.remove("sidebar-open");
    }
  }

  function openSidebar() {
    if (appShell) {
      appShell.classList.add("sidebar-open");
    }
  }

  if (sidebarOpenBtn) {
    sidebarOpenBtn.addEventListener("click", openSidebar);
  }
  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener("click", closeSidebar);
  }
  if (sidebarCloseBtn) {
    sidebarCloseBtn.addEventListener("click", closeSidebar);
  }

  // Confirmation modal (preview only — no server action)
  var modal = document.getElementById("confirmModal");
  var modalEventName = document.getElementById("modalEventName");
  var openButtons = document.querySelectorAll("[data-open-modal]");
  var closeButtons = document.querySelectorAll("[data-close-modal]");

  openButtons.forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      if (modalEventName) {
        modalEventName.textContent = btn.getAttribute("data-event-name") || "this item";
      }
      if (modal) {
        modal.classList.add("open");
      }
    });
  });

  closeButtons.forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      if (modal) {
        modal.classList.remove("open");
      }
    });
  });

  if (modal) {
    modal.addEventListener("click", function (e) {
      if (e.target === modal) {
        modal.classList.remove("open");
      }
    });
  }

  // Preview-only forms: block submit so GET-only frontend stays safe
  document.querySelectorAll("form[data-preview-only]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
    });
  });

  // Attendance toggle preview styling
  document.querySelectorAll("[data-attendance-toggle]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      var row = btn.closest("[data-attendance-row]");
      if (!row) return;
      var status = btn.getAttribute("data-attendance-toggle");
      var badge = row.querySelector("[data-attendance-badge]");
      var buttons = row.querySelectorAll("[data-attendance-toggle]");

      buttons.forEach(function (b) {
        b.classList.remove("btn-cc-primary", "btn-cc-danger");
        b.classList.add("btn-cc-secondary");
      });

      if (status === "attended") {
        btn.classList.remove("btn-cc-secondary");
        btn.classList.add("btn-cc-primary");
        if (badge) {
          badge.textContent = "Attended";
          badge.className = "badge-cc badge-cc-attended";
        }
      } else {
        btn.classList.remove("btn-cc-secondary");
        btn.classList.add("btn-cc-danger");
        if (badge) {
          badge.textContent = "Absent";
          badge.className = "badge-cc badge-cc-absent";
        }
      }
    });
  });
});
