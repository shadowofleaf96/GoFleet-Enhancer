var notificationCooldown = false;
var lastCopyTime = 0;
var lastNotificationMessage = null;
var lastClickTime = 0;
var clickCount = 0;

var barcodeInput = document.getElementById("js-barcode-input");
if (barcodeInput) {
  // State variables
  let allowBlur = false;
  let selectionActive = false;
  let lastSelection = "";
  let isAutoFocusing = false;

  // Toast system variables
  let toastHideTimeout = null;
  let currentToast = null;
  let toastQueue = [];
  let isToastActive = false;

  // Initialize focus
  setTimeout(() => {
    isAutoFocusing = true;
    barcodeInput.focus();
    isAutoFocusing = false;
  }, 100);

  // Track selection
  document.addEventListener("selectionchange", () => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    if (selectedText.length > 0) {
      selectionActive = true;
      lastSelection = selectedText;
    } else {
      selectionActive = false;
    }
  });

  document.addEventListener("click", (e) => {
    clickCount++;

    if (clickCount === 1) {
      clickTimeout = setTimeout(() => {
        // Single click behavior (just selection)
        clickCount = 0;
      }, 300); // Double-click detection window
    } else if (clickCount === 2) {
      // Double click behavior (copy operation)
      clearTimeout(clickTimeout);
      clickCount = 0;

      if (selectionActive && lastSelection) {
        handleCopyOperation();
      }
    }
  });

  // Focus management
  barcodeInput.addEventListener("blur", () => {
    if (!allowBlur && !isAutoFocusing) {
      isAutoFocusing = true;
      setTimeout(() => {
        if (!selectionActive) barcodeInput.focus();
        isAutoFocusing = false;
      }, 50);
    }
  });

  function handleCopyOperation() {
    if (selectionActive && lastSelection && !isAutoFocusing) {
      navigator.clipboard
        .writeText(lastSelection)
        .then(() => {
          showToast("Copié !", { type: "success", duration: 800 });
          selectionActive = false;
          setTimeout(() => {
            isAutoFocusing = true;
            barcodeInput.focus();
            isAutoFocusing = false;
          }, 200);
        })
        .catch((err) => {
          console.error("Copy failed:", err);
          showToast("Échec de la copie", { type: "error", duration: 1500 });
        });
    }
  }

  // Click-outside handler
  document.addEventListener("mousedown", (e) => {
    if (!barcodeInput.contains(e.target)) {
      allowBlur = true;
      setTimeout(() => {
        allowBlur = false;
        if (!selectionActive) barcodeInput.focus();
      }, 1000);
    }
  });

  barcodeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      lastNotificationMessage = null;

      setTimeout(() => {
        checkForNotification();
      }, 500);
    }
  });

  // Modal system for messages with 80% black transparent background and OK button
  function showExpeditionModal(message) {
    // If modal already exists, remove it
    const existingModal = document.getElementById("custom-modal-overlay");
    if (existingModal) existingModal.remove();

    // Create overlay
    const overlay = document.createElement("div");
    overlay.id = "custom-modal-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      backgroundColor: "rgba(0, 0, 0, 0.8)", // 80% black transparent
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 11000,
    });

    // Create modal box
    const modalBox = document.createElement("div");
    Object.assign(modalBox.style, {
      backgroundColor: "#fff",
      borderRadius: "8px",
      padding: "24px 32px",
      maxWidth: "400px",
      width: "90%",
      boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
      textAlign: "center",
      fontFamily: "Inter, sans-serif",
    });

    // Message text
    const messageEl = document.createElement("p");
    messageEl.textContent = message;
    messageEl.style.marginBottom = "24px";
    messageEl.style.fontSize = "16px";
    messageEl.style.color = "#222";

    // OK button
    const okBtn = document.createElement("button");
    okBtn.textContent = "OK";
    Object.assign(okBtn.style, {
      backgroundColor: "#4CAF50",
      color: "#fff",
      border: "none",
      padding: "10px 20px",
      borderRadius: "5px",
      fontSize: "16px",
      cursor: "pointer",
    });

    okBtn.addEventListener("click", () => {
      overlay.remove();
    });

    // Assemble modal
    modalBox.appendChild(messageEl);
    modalBox.appendChild(okBtn);
    overlay.appendChild(modalBox);

    document.body.appendChild(overlay);
  }

  function waitForSpinnerThenShowModal(message) {
    const spinner = document.querySelector(".fullscreen-loading-spinner");
    if (!spinner) {
      if (
        window.location.href.startsWith(
          "https://tms.marjanemall.ma/TourneeMM/Expedition/EditPaletteWithColis"
        )
      ) {
        // No spinner found, just show modal immediately
        showExpeditionModal(message);
        return;
      }
    }

    function checkSpinner() {
      const style = getComputedStyle(spinner);
      if (style.display === "none") {
        // Spinner is hidden, show modal now
        if (
          window.location.href.startsWith(
            "https://tms.marjanemall.ma/TourneeMM/Expedition/EditPaletteWithColis"
          )
        ) {
          showExpeditionModal(message);
        }
      } else {
        // Spinner still visible, check again after 100ms
        setTimeout(checkSpinner, 100);
      }
    }

    checkSpinner();
  }

  // ✅ Get all current colis from DOM
  function getVisibleColisCodes() {
    return Array.from(
      document.querySelectorAll(
        ".js-colis-details-row .card-header div.text-right"
      )
    )
      .map((el) => {
        const match = el.textContent.match(/Colis\s*N°\s*(\w+)/i);
        return match ? match[1] : null;
      })
      .filter(Boolean);
  }

  // ✅ Save all visible colis into chrome.storage.local
  function saveVisibleColisToStorage() {
    const codes = getVisibleColisCodes();
    chrome.storage.local.set({ scannedColisCodes: codes }, () => {
      console.log("✅ Visible colis codes saved to extension storage:", codes);
    });
  }

  // ✅ Add one colis code to storage
  function addColisToStorage(code) {
    chrome.storage.local.get(["scannedColisCodes"], (result) => {
      const scanned = result.scannedColisCodes || [];
      if (!scanned.includes(code)) {
        scanned.push(code);
        chrome.storage.local.set({ scannedColisCodes: scanned }, () => {
          if (
            window.location.href.startsWith(
              "https://tms.marjanemall.ma/TourneeMM/Expedition/EditPaletteWithColis"
            )
          ) {
            showExpeditionModal("✅ Colis ajouté avec succès.");
          }
        });
      } else {
        if (
          window.location.href.startsWith(
            "https://tms.marjanemall.ma/TourneeMM/Expedition/EditPaletteWithColis"
          )
        ) {
          showExpeditionModal("⚠️ Ce colis a déjà été scanné.");
        }
      }
    });
  }

  // ✅ Handler on scan
  barcodeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const value = barcodeInput.value.trim().toUpperCase();
      if (!value) return;

      try {
        const spinner = document.querySelector(".fullscreen-loading-spinner");
        if (spinner) {
          spinner.style.display = "flex";
        }
      } catch (err) {
        console.warn("Spinner access failed: ", err.message);
      }

      setTimeout(() => {
        // Hide spinner
        document.querySelector(".fullscreen-loading-spinner").style.display =
          "none";

        const currentCodes = getVisibleColisCodes();
        const isInDOM = currentCodes.includes(value);

        chrome.storage.local.get(["scannedColisCodes"], (result) => {
          const scanned = result.scannedColisCodes || [];

          if (isInDOM && !scanned.includes(value)) {
            scanned.push(value);
            chrome.storage.local.set({ scannedColisCodes: scanned }, () => {
              if (
                window.location.href.startsWith(
                  "https://tms.marjanemall.ma/TourneeMM/Expedition/EditPaletteWithColis"
                )
              ) {
                showExpeditionModal("✅ Colis ajouté avec succès.");
              }
            });
          } else if (isInDOM && scanned.includes(value)) {
            if (
              window.location.href.startsWith(
                "https://tms.marjanemall.ma/TourneeMM/Expedition/EditPaletteWithColis"
              )
            ) {
              showExpeditionModal("⚠️ Ce colis a déjà été scanné.");
            }
          } else {
            if (
              window.location.href.startsWith(
                "https://tms.marjanemall.ma/TourneeMM/Expedition/EditPaletteWithColis"
              )
            ) {
              showExpeditionModal(
                "❌ Le numéro de suivi du colis est invalide."
              );
            }
          }
        });
      }, 500);
    }
  });

  function parseDateTime(dateStr) {
    const [datePart, timePart] = dateStr.split(" à ");
    const [day, month, year] = datePart.split("/").map(Number);
    const [hour, minute] = timePart.split(":").map(Number);
    return new Date(year, month - 1, day, hour, minute);
  }

  // Debounce function to limit rapid calls
  function debounce(func, wait) {
    let timeout;
    return function () {
      const context = this,
        args = arguments;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), wait);
    };
  }

  function addStatusIcons() {
    const historiqueEl = document.getElementById("historique-content");
    if (!historiqueEl) return;

    const timelineItems = Array.from(document.querySelectorAll(".timeline li"));
    const deliveryAttempts = [];
    let currentAttempt = null;

    // Group statuses by delivery attempt
    timelineItems.forEach((item) => {
      const text = item.textContent;

      // Start new attempt on "Pris en charge livreur"
      if (text.includes("Pris en charge livreur")) {
        currentAttempt = {
          prisEnChargeItem: item,
          prisEnChargeDate: null,
          injoignableItems: [],
        };
        deliveryAttempts.push(currentAttempt);

        // Get date for the delivery attempt
        const dateEl = item.querySelector(".dateh-timeline");
        if (dateEl) {
          const dateText = dateEl.textContent.trim();
          try {
            currentAttempt.prisEnChargeDate = parseDateTime(dateText);
          } catch (e) {
            console.error("Error parsing date:", dateText, e);
          }
        }
      }

      // Add to current attempt on "Injoignable"
      if (text.includes("Injoignable") && currentAttempt) {
        const dateEl = item.querySelector(".dateh-timeline");
        if (dateEl) {
          const dateText = dateEl.textContent.trim();
          try {
            const date = parseDateTime(dateText);
            currentAttempt.injoignableItems.push({ el: item, date });
          } catch (e) {
            console.error("Error parsing date:", dateText, e);
          }
        }
      }
    });

    // Process each delivery attempt
    deliveryAttempts.forEach((attempt) => {
      const injoignableItems = attempt.injoignableItems;
      if (injoignableItems.length < 2) return;

      // Clear existing icons
      injoignableItems.forEach((item) => {
        const badge = item.el.querySelector(".statut-colis-88");
        if (badge) {
          const existingIcons = badge.querySelectorAll(".status-icon");
          existingIcons.forEach((icon) => icon.remove());
        }
      });

      // Check all injoignable statuses beyond the first one
      for (let i = 1; i < injoignableItems.length; i++) {
        const current = injoignableItems[i];
        const previous = injoignableItems[i - 1];
        const timeDiff = (current.date - previous.date) / 60000;

        // Determine required threshold: 45 min for second status, 90 min for others
        const requiredThreshold = i === 1 ? 90 : 90;
        const icon = timeDiff >= requiredThreshold ? "✅" : "❌";
        const statusType = i === 1 ? "second" : "subsequent";

        // Add icon to current status
        const badge = current.el.querySelector(".statut-colis-88");
        if (badge) {
          const iconSpan = document.createElement("span");
          iconSpan.className = `status-icon ${statusType}`;
          iconSpan.style.cssText =
            "display:inline-block;margin-right:8px;font-size:1.2em";
          iconSpan.textContent = icon;
          badge.prepend(iconSpan);
        }
      }
    });
  }

  // Initialize status icon observer
  function initStatusIconObserver() {
    const historiqueEl = document.getElementById("historique-content");

    if (historiqueEl) {
      // Debounced version of addStatusIcons
      const debouncedAddIcons = debounce(addStatusIcons, 300);

      const observer = new MutationObserver(() => {
        debouncedAddIcons();
      });

      observer.observe(historiqueEl, {
        childList: true,
        subtree: true,
      });

      // Run immediately
      debouncedAddIcons();
    } else {
      // Retry if element doesn't exist yet
      setTimeout(initStatusIconObserver, 500);
    }
  }

  // Start status icon functionality
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initStatusIconObserver);
  } else {
    initStatusIconObserver();
  }

  // Improved toast notification system with queue
  function showToast(message, options = {}) {
    // Default options
    const {
      type = "info", // 'info', 'success', 'error', 'warning'
      duration = 2000,
      position = "bottom-right",
    } = options;

    // Add to queue
    toastQueue.push({ message, type, duration, position });

    // If no toast is active, show the next one
    if (!isToastActive) {
      processToastQueue();
    }
  }

  function processToastQueue() {
    if (toastQueue.length === 0) {
      isToastActive = false;
      return;
    }

    isToastActive = true;
    const { message, type, duration, position } = toastQueue.shift();

    // Color mapping
    const colors = {
      info: "#2196F3",
      success: "#4CAF50",
      error: "#F44336",
      warning: "#FFC107",
    };

    // Remove current toast if exists
    if (currentToast) {
      clearTimeout(toastHideTimeout);
      currentToast.remove();
      currentToast = null;
    }

    // Create new toast element
    currentToast = document.createElement("div");

    // Simple notification style for copy feedback
    if (type === "success" && message === "Copié !") {
      currentToast.textContent = message;
      Object.assign(currentToast.style, {
        backgroundColor: colors.success,
        padding: "12px 24px",
        borderRadius: "8px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
      });
    }
    // Detailed notification style for other messages
    else {
      currentToast.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="${colors[type]}" viewBox="0 0 24 24">
            <path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2zm-.25 5h.5a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0V7.75A.75.75 0 0 1 11.75 7zm.75 10a1.25 1.25 0 1 1 1.25-1.25A1.252 1.252 0 0 1 12.5 17z"/>
          </svg>
          <div style="flex:1;font-weight:500;line-height:1.4;">${message}</div>
        </div>
      `;
      Object.assign(currentToast.style, {
        background: "rgba(33,33,33,0.85)",
        padding: "12px 16px",
        borderRadius: "10px",
        backdropFilter: "blur(5px)",
        maxWidth: "320px",
        wordBreak: "break-word",
      });
    }

    // Common styles
    Object.assign(currentToast.style, {
      position: "fixed",
      color: "#FFF",
      fontFamily: "Inter, sans-serif",
      fontSize: "14px",
      lineHeight: "1.5",
      opacity: "0",
      transition: "opacity 0.3s ease, transform 0.3s ease",
      zIndex: "10000",
      transform: "translateY(20px)",
    });

    // Position styles
    switch (position) {
      case "top-right":
        Object.assign(currentToast.style, { top: "24px", right: "12px" });
        break;
      case "top-left":
        Object.assign(currentToast.style, { top: "24px", left: "12px" });
        break;
      case "bottom-left":
        Object.assign(currentToast.style, { bottom: "24px", left: "12px" });
        break;
      default: // bottom-right
        Object.assign(currentToast.style, { bottom: "24px", right: "12px" });
    }

    document.body.appendChild(currentToast);

    // Animate in
    requestAnimationFrame(() => {
      currentToast.style.opacity = "1";
      currentToast.style.transform = "translateY(0)";
    });

    // Auto-dismiss after delay
    toastHideTimeout = setTimeout(() => {
      currentToast.style.opacity = "0";
      setTimeout(() => {
        if (currentToast && document.body.contains(currentToast)) {
          currentToast.remove();
          currentToast = null;
        }
        // Process next toast in queue
        processToastQueue();
      }, 300);
    }, duration);
  }
}

(function () {
  function extractAllColisCodesFromHTML() {
    const nodes = document.querySelectorAll(
      ".js-colis-details-row .card-header div.text-right"
    );
    const codes = [];

    nodes.forEach((node) => {
      const match = node.textContent.match(/Colis\s*N°\s*(GOF[0-9A-Z]+)/i);
      if (match) {
        codes.push(match[1]);
      }
    });

    return codes;
  }

  function saveColisToExtensionStorage() {
    const allColisCodes = extractAllColisCodesFromHTML();
    chrome.storage.local.set({ scannedColisCodes: allColisCodes }, () => {
      console.log(
        "✅ All existing colis saved to scannedColisCodes:",
        allColisCodes
      );
    });
  }

  function waitForColisAndSave() {
    const observer = new MutationObserver((mutations, obs) => {
      const colisNodes = document.querySelectorAll(".js-colis-details-row");
      if (colisNodes.length > 0) {
        obs.disconnect(); // stop observing
        saveColisToExtensionStorage();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function setupEnterKeyToCloseModal() {
    document.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        const activeModal = document.querySelector(".modal.show"); // or whatever class your modal uses
        if (activeModal) {
          // Option 1: click close button inside modal
          const closeBtn = activeModal.querySelector(".modal-close");
          if (closeBtn) {
            closeBtn.click();
          } else {
            // Option 2: hide modal directly
            activeModal.classList.remove("show");
            activeModal.classList.add("hidden");
          }
        }
      }
    });
  }

  waitForColisAndSave();
  setupEnterKeyToCloseModal();
})();

(function () {
  window.addEventListener("load", () => {
    const path = window.location.pathname.replace(/\/$/, "");

    if (path === "/Hub/TraitementRetour") {
      function showToastWithCopy(colisList) {
        const existingToast = document.getElementById("gof-toast");
        if (existingToast) existingToast.remove();

        const toast = document.createElement("div");
        toast.id = "gof-toast";
        Object.assign(toast.style, {
          position: "fixed",
          bottom: "20px",
          right: "20px",
          background: "#2c3e50",
          color: "#ecf0f1",
          fontFamily: "Arial, sans-serif",
          fontSize: "14px",
          padding: "16px",
          borderRadius: "10px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          zIndex: "10000",
          maxWidth: "300px",
          opacity: "0",
          transition: "opacity 0.3s ease",
        });

        toast.innerHTML = `
          <div style="margin-bottom: 10px;">
            <strong style="font-size: 16px; color: #1abc9c;">${colisList.length}</strong> colis <span style="opacity: 0.8;">"Assigné livreur"</span>
          </div>
          <div style="display: flex; gap: 10px;">
            <button id="gof-copy-colis" style="flex:1; padding:8px 10px; background:#3498db; color:white; border:none; border-radius:6px; cursor:pointer; transition: background 0.3s;">Copier</button>
            <button id="gof-dismiss-toast" style="flex:1; padding:8px 10px; background:#7f8c8d; color:white; border:none; border-radius:6px; cursor:pointer; transition: background 0.3s;">Fermer</button>
          </div>
        `;

        document.body.appendChild(toast);

        setTimeout(() => {
          toast.style.opacity = "1";
        }, 10);

        document
          .getElementById("gof-copy-colis")
          .addEventListener("click", async () => {
            try {
              await navigator.clipboard.writeText(colisList.join("\n"));
              const copyBtn = document.getElementById("gof-copy-colis");
              copyBtn.textContent = "Copié !";
              copyBtn.style.background = "#27ae60";
              setTimeout(() => {
                copyBtn.textContent = "Copier";
                copyBtn.style.background = "#3498db";
              }, 2000);
            } catch (err) {
              console.error("Clipboard error:", err);
              alert("Erreur lors de la copie");
            }
          });

        document
          .getElementById("gof-dismiss-toast")
          .addEventListener("click", () => {
            toast.remove();
          });
      }

      function showEmptyToast() {
        const existingToast = document.getElementById("gof-toast");
        if (existingToast) existingToast.remove();

        const toast = document.createElement("div");
        toast.id = "gof-toast";
        Object.assign(toast.style, {
          position: "fixed",
          bottom: "20px",
          right: "20px",
          background: "#2c3e50",
          color: "#ecf0f1",
          fontFamily: "Arial, sans-serif",
          fontSize: "14px",
          padding: "16px",
          borderRadius: "10px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          zIndex: "10000",
          maxWidth: "300px",
          opacity: "0",
          transition: "opacity 0.3s ease",
          textAlign: "center",
        });

        toast.innerHTML = `
          <div style="margin-bottom: 10px; font-size: 16px;">
            Aucun retour <span style="opacity: 0.8;">"Assigné livreur"</span> trouvé
          </div>
          <button id="gof-dismiss-toast" style="padding:8px 10px; background:#7f8c8d; color:white; border:none; border-radius:6px; cursor:pointer; transition: background 0.3s;">Fermer</button>
        `;

        document.body.appendChild(toast);

        setTimeout(() => {
          toast.style.opacity = "1";
        }, 10);

        document
          .getElementById("gof-dismiss-toast")
          .addEventListener("click", () => {
            toast.remove();
          });
      }

      function checkAssignedLivreurAndNotifyOnce() {
        try {
          const table = document.querySelector("table.table");
          if (!table) return;

          const rows = table.querySelectorAll("tbody tr");
          const assignedColis = [];

          rows.forEach((row) => {
            const cells = row.querySelectorAll("td");
            if (cells.length < 6) return;

            const statusCell = cells[5];
            const statusText = (
              statusCell.querySelector(".badge, p, span, div") || statusCell
            ).textContent
              .trim()
              .toLowerCase();

            if (statusText.includes("assigné livreur")) {
              const colisNumber = cells[0].textContent.trim();
              assignedColis.push(colisNumber);
            }
          });

          if (assignedColis.length > 0) {
            showToastWithCopy(assignedColis);
          } else {
            showEmptyToast();
          }
        } catch (e) {
          console.error("[GOF] Error in notification logic", e);
        }
      }

      checkAssignedLivreurAndNotifyOnce();
    } else {
      console.log("Not on /Hub/TraitementRetour page, script skipped.");
    }
  });
})();

// Notification check logic
function checkForNotification() {
  if (notificationCooldown) return;

  const tourneeStates = document.querySelectorAll(".tournee-state");
  let assignCount = 0;
  let refusedFound = false;

  for (const state of tourneeStates) {
    const stateText = state.textContent.trim().toLowerCase();

    if (stateText === "refusé") {
      refusedFound = true;
      break;
    }

    if (!refusedFound && stateText === "assigné livreur") {
      assignCount++;
      if (assignCount >= 3) break;
    }
  }

  const reasonElements = document.querySelectorAll(".text-red.txt-zone-l99");
  let cancellationReason = "Raison non spécifiée";

  for (const el of reasonElements) {
    if (el.textContent.includes("Motif:")) {
      cancellationReason = el.textContent.replace("Motif:", "").trim();
      break;
    }
  }

  let currentMessage = null;

  if (refusedFound) {
    currentMessage = "Attention : Ce colis a été annulé: " + cancellationReason;
  } else if (assignCount === 2) {
    currentMessage =
      "Attention : 2 fois « Assignée Livreur » – veuillez procéder au cachet du colis « 3 tentatives »";
  } else if (assignCount >= 3) {
    currentMessage = `Attention : Assignée Livreur ${assignCount} fois – veuillez procéder à annuler ce colis`;
  }

  // Only show if it's a new message
  if (currentMessage && currentMessage !== lastNotificationMessage) {
    showToast(currentMessage, {
      type: refusedFound ? "error" : assignCount >= 3 ? "error" : "warning",
      duration: 2000,
    });
    lastNotificationMessage = currentMessage;
    notificationCooldown = true;
    setTimeout(() => (notificationCooldown = false), 2000);
  }
}

// Debounce and observe changes
var debouncedCheck = debounce(checkForNotification, 500);
var observer = new MutationObserver(debouncedCheck);
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: false,
  characterData: false,
});

function debounce(func, wait) {
  let timeout;
  return function () {
    const context = this,
      args = arguments;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

function detectCurrentCity() {
  const hubText =
    document.querySelector(".user-top-btn .ml-2")?.textContent || "";
  const normalized = hubText
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  if (normalized.includes("FES")) return "fes";
  if (normalized.includes("TANGER")) return "tanger";
  if (normalized.includes("RABAT")) return "rabat";
  if (normalized.includes("MEKNES")) return "meknes";
  return "unknown";
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "detectCity") {
    const city = detectCurrentCity();
    sendResponse({ city });
  }
});

// Add debug logs and improve page detection
function handleExpeditionRequests(request, sender, sendResponse) {
  if (request.action === "collectFullExpeditionData") {
    // Main expedition list page
    if (window.location.pathname.endsWith("/TourneeMM/Expedition")) {
      const expeditions = Array.from(
        document.querySelectorAll(".tournee-card-info")
      ).map((card) => ({
        number: card.querySelector(".tournee-num")?.textContent.trim() || "N/A",
        link: card.href,
        type: card.querySelector(".tournee-type")?.textContent.trim() || "N/A",
        city:
          card.querySelector(".tournee-dist-city")?.textContent.trim() || "N/A",
        status:
          card.querySelector(".tournee-state")?.textContent.trim() || "Unknown",
        pallets:
          card.querySelector(".small.text-dark")?.textContent.trim() || "0",
        timestamp: new Date().toISOString(),
      }));

      sendResponse({ expeditions });
    } else if (
      window.location.pathname.includes(
        "/TourneeMM/Expedition/EditPaletteWithColis"
      )
    ) {
      // Debug container element
      const container = document.getElementById("js-colis-list-info");

      // Initial element check
      const initialElements = document.querySelectorAll(
        ".js-colis-details-row"
      );

      const observer = new MutationObserver((mutations) => {
        const currentElements = document.querySelectorAll(
          ".js-colis-details-row"
        );

        if (currentElements.length > 0) {
          processColisElements(currentElements);
          observer.disconnect();
        }
      });

      observer.observe(container || document.body, {
        childList: true,
        subtree: true,
      });

      function processColisElements(elements) {
        const colisList = Array.from(elements).map((colis) => {
          // Debug numcolis extraction
          const numcolisElement = colis.querySelector("[data-numcolis]");
          const numColis = numcolisElement?.dataset.numcolis;

          // Debug text content extraction
          const numberElement = colis.querySelector(".text-green");
          const displayedNumber = numberElement?.textContent
            ?.replace("Colis N°", "")
            ?.trim();

          // Debug zone extraction
          const zoneElement = colis.querySelector(".card-body div");
          const zoneText = zoneElement?.textContent;
          const zone = zoneText?.split("Zone :")[1]?.trim();

          return {
            number: numColis || displayedNumber || "N/A",
            zone: zone || "N/A",
            timestamp: new Date().toISOString(),
          };
        });

        sendResponse({ colisList });
      }

      // Immediate check
      if (initialElements.length > 0) {
        processColisElements(initialElements);
      }

      // Fallback timeout
      setTimeout(() => {
        const finalElements = document.querySelectorAll(
          ".js-colis-details-row"
        );

        if (finalElements.length > 0) {
          processColisElements(finalElements);
        } else {
          console.warn("No colis elements found after timeout");
          sendResponse({ colisList: [] });
        }
        observer.disconnect();
      }, 5000);
    }
    // Expedition detail page
    else if (window.location.pathname.includes("/TourneeMM/Expedition/Edit")) {
      // Tournee Number (with enhanced selector)
      const tourneeInput = document.querySelector(
        'input[type="text"][readonly]:not([placeholder])'
      );
      const tourneeNumber = tourneeInput?.value || "N/A";

      // Plomb Number (hardcoded as per requirement)
      const plombNumber = "1230";

      // Palettes
      const palettes = Array.from(
        document.querySelectorAll(".js-palette-details-row")
      ).map((palette) => ({
        number:
          palette
            .querySelector(".text-green")
            ?.textContent.replace("Palette N°", "")
            .trim() || "N/A",
        link: palette.href,
        colisCount:
          parseInt(
            palette
              .querySelector(".card-body  .p-3")
              ?.textContent.replace("Colis :", "")
              .trim()
          ) || 0,
      }));
      sendResponse({ tourneeNumber, plombNumber, palettes });
    }
  }
}

chrome.runtime.onMessage.addListener(handleExpeditionRequests);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "collectDeliveryBoyData") {
    const rows = document.querySelectorAll(".js-tournee-info-container");
    const deliveryBoys = [];

    rows.forEach((row) => {
      try {
        const name =
          row.querySelector(".text-dark-75")?.textContent.trim() || "N/A";

        const livree = parseInt(
          row
            .querySelector(
              "span.text-success.font-weight-bold[style*='font-size:25px']"
            )
            ?.textContent.trim() || "0"
        );

        const retourRecupere = parseInt(
          row
            .querySelectorAll(
              "span.text-success.font-weight-bold[style*='font-size:13px']"
            )?.[0]
            ?.textContent.trim() || "0"
        );

        const nonLivree = parseInt(
          row
            .querySelector(
              "span.font-weight-bold[style*='font-size:25px'][style*='D70073']"
            )
            ?.textContent.trim() || "0"
        );

        const retourNonRecupere = parseInt(
          Array.from(
            row.querySelectorAll("span.font-weight-bold, span.font-weight-500")
          )
            .find((span) =>
              span.textContent
                .replace(/\s+/g, " ")
                .trim()
                .includes("Non Récupérés")
            )
            ?.previousElementSibling?.textContent.match(/\d+/)?.[0] || "0"
        );

        const totalColis = livree + nonLivree;

        deliveryBoys.push({
          name,
          totalColis,
          livree,
          retourRecupere,
          nonLivree,
          retourNonRecupere,
          timestamp: new Date().toISOString(),
        });
      } catch (e) {
        console.warn("Failed to parse row", e);
      }
    });

    if (deliveryBoys.length === 0) {
      console.error("No data found for delivery boys.");
      sendResponse({ status: "error", message: "Aucune donnée trouvée." });
    } else {
      chrome.storage.local.set({ deliveryBoys }, () => {
        console.log("Delivery data saved:", deliveryBoys);
        sendResponse({ status: "ok", deliveryBoys });
      });
    }

    return true;
  }
});

function extractRefusedColis() {
  // Get today's date in DD/MM/YYYY format
  const today = new Date();
  const formattedDate = `${String(today.getDate()).padStart(2, "0")}/${String(
    today.getMonth() + 1
  ).padStart(2, "0")}/${today.getFullYear()}`;

  // Extract livreur name
  const livreurElement = document.querySelector(".caissier-style label.ml-3");
  const livreur = livreurElement
    ? livreurElement.textContent.trim()
    : "Unknown";

  // First get existing data to check for duplicates
  chrome.storage.local.get({ refusedColis: [] }, function (result) {
    const existingColis = result.refusedColis;
    const existingColisNumbers = new Set(
      existingColis.map((item) => item.colis)
    );

    // Extract refused colis data
    const newRefusedColis = [];

    document.querySelectorAll(".js-colis-data").forEach((card) => {
      const status = card.querySelector(".js-statut-info");
      if (status && status.textContent.includes("Refusé")) {
        // Extract colis number
        const colisElement = card.querySelector("h6.style-87");
        const colisNumber = colisElement
          ? colisElement.textContent.replace("Colis N°", "").trim()
          : "Unknown";

        // Only add if this colis isn't already stored
        if (!existingColisNumbers.has(colisNumber)) {
          // Extract reason
          const reasonElement = card.querySelector(".redo");
          const reason = reasonElement
            ? reasonElement.textContent.trim()
            : "Unknown";

          newRefusedColis.push({
            date: formattedDate,
            colis: colisNumber,
            raisonAnnulation: reason,
            livreur: livreur,
            description: "", // Empty as per requirement
          });
        }
      }
    });

    if (newRefusedColis.length > 0) {
      chrome.runtime.sendMessage({
        action: "storeRefusedColis",
        data: newRefusedColis,
      });
    }
  });
}

setTimeout(extractRefusedColis, 2000);

function printAllRetourTicketsWithIframes() {
  const allRows = document.querySelectorAll("tr");
  const printUrls = [];

  allRows.forEach((row) => {
    const statusCell = row.querySelector("td:nth-child(6) p");
    if (statusCell && statusCell.textContent.includes("Affecté livreur")) {
      const printBtn = row.querySelector("a[href*='PrintRetourTicket']");
      if (printBtn) {
        const printUrl = printBtn.href.startsWith("http")
          ? printBtn.href
          : `https://tms.marjanemall.ma${printBtn.getAttribute("href")}`;
        printUrls.push(printUrl);
      }
    }
  });

  console.log(`🔍 Found ${printUrls.length} retour tickets...`);

  let index = 0;

  function loadAndPrintNext() {
    if (index >= printUrls.length) return;

    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = printUrls[index];

    iframe.onload = () => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        alert(`🖨️ Printed: ${printUrls[index]}`);
      } catch (e) {
        console.warn("⚠️ Cannot print iframe:", e);
      }

      setTimeout(() => {
        iframe.remove();
        index++;
        loadAndPrintNext();
      }, 5000);
    };

    document.body.appendChild(iframe);
  }

  loadAndPrintNext();
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "printRetourIframes") {
    printAllRetourTicketsWithIframes();
  }
});

var modalObserver = new MutationObserver(() => {
  const modalBody = document.getElementById(
    "js-affectation-coliszone-modal-body"
  );
  if (!modalBody) return;

  const forbiddenImg = modalBody.querySelector(
    '#js-colis-livreur-img[src$="forbidden.png"]'
  );
  const zoneText = modalBody.querySelector("#js-colis-livreur-zone-name-text");
  const affectButton = document.getElementById("js-affect-colis-to-zone-btn");
  console.log("Found button:", affectButton);

  if (
    forbiddenImg &&
    zoneText &&
    zoneText.textContent.includes("Zone Expédition vers l'entrepôt") &&
    affectButton &&
    affectButton.style.display !== "none"
  ) {
    console.log("🚫 Forbidden zone detected, hiding affect button");
    affectButton.remove();
  }
});

modalObserver.observe(document.body, {
  childList: true,
  subtree: true,
});
