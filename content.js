let notificationCooldown = false;
let lastCopyTime = 0;
let lastNotificationMessage = null;
let lastClickTime = 0;
let clickCount = 0;


const barcodeInput = document.getElementById("js-barcode-input");
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

  const modal = document.getElementById("js-affecation-colis-zone-form");

  if (modal) {
    const observer = new MutationObserver((mutationsList) => {
      for (const mutation of mutationsList) {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "style"
        ) {
          const isHidden = getComputedStyle(modal).display === "none";

          if (isHidden) {
            setTimeout(() => {
              const barcodeInput = document.getElementById("js-barcode-input");
              if (barcodeInput) barcodeInput.focus();
            }, 100);
          }
        }
      }
    });

    observer.observe(modal, {
      attributes: true,
      attributeFilter: ["style"],
    });
  }

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
      navigator.clipboard.writeText(lastSelection)
        .then(() => {
          showToast("Copié !", { type: 'success', duration: 800 });
          selectionActive = false;
          setTimeout(() => {
            isAutoFocusing = true;
            barcodeInput.focus();
            isAutoFocusing = false;
          }, 200);
        })
        .catch(err => {
          console.error("Copy failed:", err);
          showToast("Échec de la copie", { type: 'error', duration: 1500 });
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

  barcodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      lastNotificationMessage = null;

      setTimeout(() => {
        checkForNotification();
      }, 500);
    }
  });

  // Improved toast notification system with queue
  function showToast(message, options = {}) {
    // Default options
    const {
      type = 'info', // 'info', 'success', 'error', 'warning'
      duration = 2000,
      position = 'bottom-right'
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
      warning: "#FFC107"
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
    if (type === 'success' && message === "Copié !") {
      currentToast.textContent = message;
      Object.assign(currentToast.style, {
        backgroundColor: colors.success,
        padding: "12px 24px",
        borderRadius: "8px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.2)"
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
        wordBreak: "break-word"
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
      transform: "translateY(20px)"
    });

    // Position styles
    switch (position) {
      case 'top-right':
        Object.assign(currentToast.style, { top: "24px", right: "12px" });
        break;
      case 'top-left':
        Object.assign(currentToast.style, { top: "24px", left: "12px" });
        break;
      case 'bottom-left':
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

  const reasonElements = document.querySelectorAll('.text-red.txt-zone-l99');
  let cancellationReason = 'Raison non spécifiée';

  for (const el of reasonElements) {
    if (el.textContent.includes('Motif:')) {
      cancellationReason = el.textContent.replace('Motif:', '').trim();
      break;
    }
  }

  let currentMessage = null;

  if (refusedFound) {
    currentMessage = "Attention : Ce colis a été annulé: " + cancellationReason;
  } else if (assignCount === 2) {
    currentMessage = "Attention : 2 fois « Assignée Livreur » – veuillez procéder au cachet du colis « 3 tentatives »";
  } else if (assignCount >= 3) {
    currentMessage = `Attention : Assignée Livreur ${assignCount} fois – veuillez procéder à annuler ce colis`;
  }

  // Only show if it's a new message
  if (currentMessage && currentMessage !== lastNotificationMessage) {
    showToast(currentMessage, {
      type: refusedFound ? 'error' : assignCount >= 3 ? 'error' : 'warning',
      duration: 2000
    });
    lastNotificationMessage = currentMessage;
    notificationCooldown = true;
    setTimeout(() => (notificationCooldown = false), 2000);
  }
}

// Debounce and observe changes
const debouncedCheck = debounce(checkForNotification, 500);
const observer = new MutationObserver(debouncedCheck);
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: false,
  characterData: false
});

function debounce(func, wait) {
  let timeout;
  return function () {
    const context = this, args = arguments;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}