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

  // Event details: toggle volunteer_role_id when participation_type changes
  document.querySelectorAll("[data-participation-form]").forEach(function (form) {
    var radios = form.querySelectorAll("[data-participation-type]");
    var roleWrap = form.querySelector("[data-volunteer-role-wrap]");
    var roleField = form.querySelector("#volunteer_role_id");
    var joinCta = form.querySelector("[data-join-cta]");

    function syncParticipationType() {
      var selected = form.querySelector("[data-participation-type]:checked");
      var type = selected ? selected.value : "Participant";
      var isVolunteer = type === "Volunteer";

      if (roleWrap) {
        roleWrap.style.display = isVolunteer ? "" : "none";
      }
      if (roleField) {
        roleField.disabled = !isVolunteer;
        if (!isVolunteer) {
          roleField.value = "";
        }
      }
      if (joinCta) {
        joinCta.textContent = isVolunteer ? "Volunteer for This Event" : "Join as Participant";
      }
    }

    radios.forEach(function (radio) {
      radio.addEventListener("change", syncParticipationType);
    });
    syncParticipationType();
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
