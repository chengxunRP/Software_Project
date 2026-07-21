document.addEventListener("DOMContentLoaded", function () {
  // Sticky top-nav hamburger sheet (public + signed-in)
  var navToggle = document.getElementById("navToggle");
  var mobileSheet = document.getElementById("publicMobileSheet");
  if (navToggle && mobileSheet) {
    navToggle.addEventListener("click", function () {
      mobileSheet.classList.toggle("open");
      navToggle.classList.toggle("open");
    });
  }

  // Cancellation confirmation modal — posts to /registrations/:id/cancel
  var modal = document.getElementById("confirmModal");
  var modalEventName = document.getElementById("modalEventName");
  var cancelForm = document.getElementById("cancelRegistrationForm");
  var deleteEventForm = document.getElementById("deleteEventForm");
  var deleteCategoryForm = document.getElementById("deleteCategoryForm");
  var pendingForm = null;
  var openButtons = document.querySelectorAll("[data-open-modal]");
  var closeButtons = document.querySelectorAll("[data-close-modal]");
  var confirmButtons = document.querySelectorAll("[data-confirm-cancel], [data-confirm-delete]");

  openButtons.forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      var cancelId = btn.getAttribute("data-cancel-registration-id");
      var deleteEventId = btn.getAttribute("data-delete-event-id");
      var deleteCategoryId = btn.getAttribute("data-delete-category-id");
      pendingForm = null;

      if (cancelId && cancelForm) {
        pendingForm = cancelForm;
        cancelForm.action = "/registrations/" + encodeURIComponent(cancelId) + "/cancel";
      } else if (deleteEventId && deleteEventForm) {
        pendingForm = deleteEventForm;
        deleteEventForm.action = "/organiser/events/" + encodeURIComponent(deleteEventId) + "/delete";
      } else if (deleteCategoryId && deleteCategoryForm) {
        pendingForm = deleteCategoryForm;
        deleteCategoryForm.action = "/admin/categories/" + encodeURIComponent(deleteCategoryId) + "/delete";
      }

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
      pendingForm = null;
      if (modal) {
        modal.classList.remove("open");
      }
    });
  });

  confirmButtons.forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      if (!pendingForm) {
        return;
      }
      pendingForm.submit();
    });
  });

  if (modal) {
    modal.addEventListener("click", function (e) {
      if (e.target === modal) {
        pendingCancelId = null;
        modal.classList.remove("open");
      }
    });
  }

  // Preview-only forms for teammate pages not yet wired to POST handlers
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

  // Status option radio toggle — ensure the card highlight (.active) follows the checked radio
  (function () {
    var statusRadios = document.querySelectorAll('.status-option input[type=radio]');
    if (!statusRadios || statusRadios.length === 0) return;

    function syncStatusOptions() {
      // remove active from all
      var allLabels = document.querySelectorAll('.status-option');
      allLabels.forEach(function (lab) { lab.classList.remove('active'); });
      // add active to the label of the checked radio(s)
      statusRadios.forEach(function (r) {
        if (r.checked) {
          var lab = r.closest('.status-option');
          if (lab) lab.classList.add('active');
        }
      });
    }

    statusRadios.forEach(function (r) {
      r.addEventListener('change', syncStatusOptions);
      // also react to clicks on the label (for some browsers)
      var parent = r.closest('.status-option');
      if (parent) parent.addEventListener('click', function () {
        // delay slightly to allow the radio checked state to update
        setTimeout(syncStatusOptions, 0);
      });
    });

    // initialise UI state on page load
    syncStatusOptions();
  })();

});
