const barcodeInput = document.getElementById("js-barcode-input");
if (barcodeInput) {
  let allowBlur = false;
  let selectionActive = false;
  let lastSelection = "";
  let notificationCooldown = false;

  // Initialize focus with a slight delay for page load
  setTimeout(() => barcodeInput.focus(), 100);

  // Track text selection state
  document.addEventListener("selectionchange", () => {
    const selection = window.getSelection();
    selectionActive = selection.toString().length > 0;
    lastSelection = selection.toString();
  });

  // Handle text selection and copying
  document.addEventListener("mousedown", (e) => {
    // Allow text selection when clicking outside input
    if (!barcodeInput.contains(e.target)) {
      allowBlur = true;
      selectionActive = true;
    }
  });

  document.addEventListener("mouseup", (e) => {
    // Handle double-click selection
    if (e.detail === 2 && selectionActive) {
      handleCopyOperation();
    }
  });

  // Context menu handling
  document.addEventListener("contextmenu", (e) => {
    if (selectionActive) {
      allowBlur = true;
      // Preserve selection for context menu
      const range = window.getSelection().getRangeAt(0);
      setTimeout(() => {
        const newSelection = window.getSelection();
        newSelection.removeAllRanges();
        newSelection.addRange(range.cloneRange());
      }, 50);
    }
  });

  // Smart focus management
  barcodeInput.addEventListener("blur", () => {
    if (!allowBlur) {
      setTimeout(() => {
        if (!selectionActive) barcodeInput.focus();
      }, 50);
    }
  });

  // Keyboard handling
  document.addEventListener("keydown", (e) => {
    if (
      (e.ctrlKey || e.metaKey) &&
      ["c", "v", "x"].includes(e.key.toLowerCase())
    ) {
      handleCopyOperation();
    }
  });

  function handleCopyOperation() {
    if (selectionActive) {
      navigator.clipboard
        .writeText(lastSelection)
        .then(() => {
          showCopyFeedback();
          selectionActive = false;
          setTimeout(() => barcodeInput.focus(), 300);
        })
        .catch(console.error);
    }
  }

  function showCopyFeedback() {
    // Show a basic toast-style feedback
    const toast = document.createElement("div");
    toast.textContent = "Copié !";
    toast.style.position = "fixed";
    toast.style.bottom = "20px";
    toast.style.right = "20px";
    toast.style.backgroundColor = "#4caf50";
    toast.style.color = "white";
    toast.style.padding = "10px 20px";
    toast.style.borderRadius = "8px";
    toast.style.zIndex = "9999";
    toast.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
    toast.style.transition = "opacity 0.3s ease";
    toast.style.opacity = "1";

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 1000);
  }

  // Click-outside handler
  document.addEventListener("click", (e) => {
    if (!barcodeInput.contains(e.target)) {
      allowBlur = true;
      setTimeout(() => {
        allowBlur = false;
        if (!selectionActive) barcodeInput.focus();
      }, 1000);
    }
  });

  const toastDisplayCounts = {};
  function showToast(message, key, color = "#4CAF50") {
    // Limit to 5 times per unique key
    toastDisplayCounts[key] = (toastDisplayCounts[key] || 0) + 1;
    if (toastDisplayCounts[key] > 5) return;

    const toast = document.createElement("div");
    toast.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;max-width:320px;word-break:break-word;">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="${color}" viewBox="0 0 24 24">
        <path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2zm-.25 5h.5a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0V7.75A.75.75 0 0 1 11.75 7zm.75 10a1.25 1.25 0 1 1 1.25-1.25A1.252 1.252 0 0 1 12.5 17z"/>
      </svg>
      <div style="flex:1;font-weight:500;line-height:1.4;">${message}</div>
    </div>
  `;

    Object.assign(toast.style, {
      position: "fixed",
      bottom: "24px",
      left: "50%",
      transform: "translateX(-50%) translateY(20px)",
      background: "rgba(33,33,33,0.85)",
      color: "#FFF",
      padding: "16px 24px",
      borderRadius: "10px",
      backdropFilter: "blur(5px)",
      boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
      fontFamily: "Inter, sans-serif",
      fontSize: "15px",
      lineHeight: "1.5",
      opacity: "0",
      transition: "opacity 0.35s ease, transform 0.35s ease",
      zIndex: "10000",
    });

    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateX(-50%) translateY(0)";
    });

    setTimeout(() => {
      toast.remove();
    }, 4000);
  }

  function checkForNotification() {
    const items = Array.from(document.querySelectorAll(".tournee-state"))
      .filter(
        (el) => el.textContent.trim().toLowerCase() === "pris en charge livreur"
      )
      .map((el) => {
        const card = el.closest(".card");
        if (!card) return null;

        const dateEl = card.querySelector(".dateh-timeline");
        if (!dateEl) return null;

        const fullDate = dateEl.textContent.trim();
        const dateOnly = fullDate.split("à")[0].trim();
        return dateOnly;
      })
      .filter(Boolean);

    const uniqueDates = new Set(items);
    const count = uniqueDates.size;

    if (count === 2 && !notificationCooldown) {
      showToast(
        "Attention : 2 fois « Pris en charge livreur » – veuillez mentionner « 3 tentatives ».",
        "2-tentatives",
        "#FFC107"
      );
      notificationCooldown = true;
      setTimeout(() => (notificationCooldown = false), 3000);
    } else if (count >= 3 && !notificationCooldown) {
      showToast(
        `Attention : Pris en charge ${count} jours différents – annulation requise.`,
        "annulation-requise",
        "#E53935"
      );
      notificationCooldown = true;
      setTimeout(() => (notificationCooldown = false), 3000);
    }
  }

  const timelineEl = document.querySelector("ul.timeline");

  if (timelineEl) {
    const observer = new MutationObserver((mutationsList, observer) => {
      let hasChanges = false;

      for (const mutation of mutationsList) {
        if (
          mutation.type === "childList" &&
          (mutation.addedNodes.length || mutation.removedNodes.length)
        ) {
          hasChanges = true;
        }
        if (
          mutation.type === "attributes" ||
          mutation.type === "characterData"
        ) {
          hasChanges = true;
        }
      }

      if (hasChanges) {
        console.log("Timeline updated");
        checkForNotification();
      }
    });

    observer.observe(timelineEl, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });
  }
  setInterval(checkForNotification, 1000);
  barcodeInput.addEventListener("input", checkForNotification);
  setTimeout(checkForNotification, 300);
}

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
