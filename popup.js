function formatDate(date = new Date()) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

async function generateDeliveryExcel(customData = null, targetDateStr = null) {
  try {
    let deliveryBoys = customData;
    if (!deliveryBoys || !deliveryBoys.length) {
      const stored = await chrome.storage.local.get("deliveryBoys");
      deliveryBoys = stored.deliveryBoys || [];
    }

    if (!deliveryBoys || !deliveryBoys.length) {
      alert("Aucune donnée de livreur disponible pour l'export.");
      return;
    }

    const templatePath = chrome.runtime.getURL(
      "dummy-content/MARJANE-MALL-EXPORT-DATA.xlsx"
    );
    const templateBuffer = await fetch(templatePath).then((r) =>
      r.arrayBuffer()
    );

    const workbook = await XlsxPopulate.fromDataAsync(templateBuffer);
    const sheet = workbook.sheet(0);

    function formatDate(date = new Date()) {
      const d = date;
      const month = `${d.getMonth() + 1}`.padStart(2, "0");
      const day = `${d.getDate()}`.padStart(2, "0");
      const year = d.getFullYear();
      return `${year}-${month}-${day}`;
    }

    const startRow = 2;

    let totalColisSum = 0;
    let livreeSum = 0;
    let nonLivreeSum = 0;
    let retourRecupereSum = 0;
    let retourNonRecupereSum = 0;

    deliveryBoys.forEach((entry, index) => {
      const row = startRow + index;
      sheet.cell(`A${row}`).value(entry.name);
      sheet.cell(`B${row}`).value(entry.totalColis);
      sheet.cell(`C${row}`).value(entry.livree);
      sheet.cell(`D${row}`).value(entry.nonLivree);
      sheet.cell(`H${row}`).value(entry.retourRecupere);
      sheet.cell(`I${row}`).value(entry.retourNonRecupere);

      totalColisSum += Number(entry.totalColis) || 0;
      livreeSum += Number(entry.livree) || 0;
      nonLivreeSum += Number(entry.nonLivree) || 0;
      retourRecupereSum += Number(entry.retourRecupere) || 0;
      retourNonRecupereSum += Number(entry.retourNonRecupere) || 0;
    });

    if (deliveryBoys.length > 0) {
      const totalRow = startRow + deliveryBoys.length;
      sheet.cell(`A${totalRow}`).value("TOTAL");
      sheet.cell(`B${totalRow}`).value(totalColisSum);
      sheet.cell(`C${totalRow}`).value(livreeSum);
      sheet.cell(`D${totalRow}`).value(nonLivreeSum);
      sheet.cell(`H${totalRow}`).value(retourRecupereSum);
      sheet.cell(`I${totalRow}`).value(retourNonRecupereSum);
      sheet.range(`A${totalRow}:J${totalRow}`).style("bold", true);
    }

    const blob = await workbook.outputAsync("blob");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const exportDateName = targetDateStr || formatDate();
    a.download = `EXPORT_LIVREUR_${exportDateName}.xlsx`;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  } catch (error) {
    console.error("Excel generation failed:", error);
    alert("Erreur de génération Excel: " + error.message);
  }
}

const button = document.getElementById("colisInfoInSourceView");
const targetUrl =
  "https://tms.marjanemall.ma/Hub/Consultation/ZoneColisList?zoneId=4";

button.addEventListener("click", async () => {
  try {
    button.disabled = true;
    const originalContent = button.innerHTML;

    // Show spinner while loading
    button.innerHTML = `
      <span class="button-spinner-wrapper">
        <span class="spinner"></span>
        <span>Chargement...</span>
      </span>
    `;

    // Fetch the raw HTML
    const response = await fetch(targetUrl, { credentials: "include" });
    let html = await response.text();

    // Clean HTML (remove scripts and stylesheets)
    html = html.replace(
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      ""
    );
    html = html.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, "");

    // Wrap in basic HTML structure to ensure compatibility
    const finalHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Colis Info</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            table { border-collapse: collapse; width: 100%; }
            td, th { border: 1px solid #ccc; padding: 6px; text-align: left; }
          </style>
        </head>
        <body>
          ${html}
        </body>
      </html>
    `;

    // Create a blob with cleaned HTML
    const blob = new Blob([finalHtml], { type: "text/html" });
    const blobUrl = URL.createObjectURL(blob);

    // Open tab AFTER everything is ready
    chrome.tabs.create({ url: blobUrl });

    // Restore button content
    button.innerHTML = originalContent;
    button.disabled = false;
  } catch (error) {
    console.error("Failed to open source view:", error);
    button.disabled = false;
    button.innerHTML = "Erreur ! Réessayer";
  }
});

async function generateExcel() {
  try {
    const { expeditions = [] } = await chrome.storage.local.get("expeditions");

    const templatePath = chrome.runtime.getURL(
      "dummy-content/ECHEC-RETOUR_CLIENT-CASABLANCA.xlsx"
    );
    const templateBuffer = await fetch(templatePath).then((r) =>
      r.arrayBuffer()
    );

    const workbook = await XlsxPopulate.fromDataAsync(templateBuffer);

    const processData = (suffix) =>
      expeditions.flatMap((exp) =>
        exp.palettes
          .filter((p) => p.number.endsWith(suffix))
          .map((p) => ({
            paletteNumber: p.number,
            expeditionNumber: exp.number.replace("N° ", ""),
            tourneeNumber: exp.tourneeNumber,
            colisCount: p.colisCount,
            colis: p.colis,
          }))
      );

    function formatDate(date = new Date()) {
      const d = date;
      const month = `${d.getMonth() + 1}`.padStart(2, "0");
      const day = `${d.getDate()}`.padStart(2, "0");
      const year = d.getFullYear();
      return `${year}-${month}-${day}`;
    }

    // Update sheet
    const updateSheet = (sheetName, data) => {
      const sheet = workbook.sheet(sheetName);
      sheet.cell("I2").value(formatDate());

      data.forEach((item) => {
        sheet.cell("J4").value(item.expeditionNumber);
        sheet.cell("J5").value(item.tourneeNumber);
        sheet.cell("J9").value(item.colisCount);

        ["A", "B", "C", "D", "E"].forEach((col) => {
          sheet.cell(`${col}12`).value(item.paletteNumber);
        });

        const cols = ["F", "G", "H", "I", "J"];
        for (const col of cols) {
          for (let row = 12; row <= 30; row++) {
            const cell = sheet.cell(`${col}${row}`);
            cell.clear();
          }
        }

        let colisIndex = 0;
        for (const col of cols) {
          for (let row = 12; row <= 30; row++) {
            if (colisIndex < item.colis.length) {
              const colis = item.colis[colisIndex];
              sheet.cell(`${col}${row}`).value(colis.number);
              colisIndex++;
            }
          }
        }
      });
    };

    updateSheet("ECHEC CASA", processData("001"));
    updateSheet("RTC CASA", processData("002"));

    const blob = await workbook.outputAsync("blob");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ECHEC DE LIVRAISON _RETOUR CLIENT_${formatDate()}.xlsx`;
    document.body.appendChild(a);
    a.click();

    await chrome.storage.local.remove("expeditions");

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  } catch (error) {
    console.error("Excel generation failed:", error);
    alert("Erreur de génération Excel: " + error.message);
  }
}

async function generateExcelHorsCasa() {
  try {
    const cities = ["tanger", "meknes", "fes", "rabat"];
    const storedData = await chrome.storage.local.get(
      cities.map((c) => `expeditions_${c}`)
    );

    const templatePath = chrome.runtime.getURL(
      "dummy-content/ECHEC-RETOUR_CLIENT-HORS-CASA.xlsx"
    );
    const templateBuffer = await fetch(templatePath).then((r) =>
      r.arrayBuffer()
    );
    const workbook = await XlsxPopulate.fromDataAsync(templateBuffer);

    function formatDate(date = new Date()) {
      const month = `${date.getMonth() + 1}`.padStart(2, "0");
      const day = `${date.getDate()}`.padStart(2, "0");
      const year = date.getFullYear();
      return `${year}-${month}-${day}`;
    }

    const updateSheet = (sheetName, data) => {
      const sheet = workbook.sheet(sheetName);
      sheet.cell("I2").value(formatDate());

      let startRow = 12;
      data.forEach((item) => {
        sheet.cell("J4").value(item.expeditionNumber);
        sheet.cell("J5").value(item.tourneeNumber);
        sheet.cell("J9").value(item.colisCount);

        ["A", "B", "C", "D", "E"].forEach((col) => {
          sheet.cell(`${col}${startRow}`).value(item.paletteNumber);
        });

        const cols = ["F", "G", "H", "I", "J"];
        for (const col of cols) {
          for (let row = startRow; row <= 30; row++) {
            sheet.cell(`${col}${row}`).clear();
          }
        }

        let colisIndex = 0;
        for (const col of cols) {
          for (let row = startRow; row <= 30; row++) {
            if (colisIndex < item.colis.length) {
              const colis = item.colis[colisIndex];
              sheet.cell(`${col}${row}`).value(colis.number);
              colisIndex++;
            }
          }
        }
      });
    };

    for (const city of cities) {
      const expeditions = storedData[`expeditions_${city}`] || [];

      const processData = (suffix) =>
        expeditions.flatMap((exp) =>
          exp.palettes
            .filter((p) => p.number.endsWith(suffix))
            .map((p) => ({
              paletteNumber: p.number,
              expeditionNumber: exp.number.replace("N° ", ""),
              tourneeNumber: exp.tourneeNumber,
              colisCount: p.colisCount,
              colis: p.colis,
            }))
        );

      updateSheet(`ECHEC ${city.toUpperCase()}`, processData("001"));
      updateSheet(`RTC ${city.toUpperCase()}`, processData("002"));
    }

    const blob = await workbook.outputAsync("blob");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ECHEC-RETOUR_CLIENT-HORS-CASA_${formatDate()}.xlsx`;
    document.body.appendChild(a);
    a.click();

    await chrome.storage.local.remove(cities.map((c) => `expeditions_${c}`));

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  } catch (error) {
    console.error("Excel generation failed:", error);
    alert("Erreur de génération Excel: " + error.message);
  }
}

/**
 * Envoie un message à l'onglet avec injection automatique de secours
 * si le content script a été déconnecté (rechargement de l'extension / onglet orphelin).
 */
async function sendTabMessageWithFallback(tabId, message, tabUrl = "") {
  if (!tabId) {
    throw new Error("Aucun onglet actif détecté.");
  }

  async function trySend() {
    return await chrome.tabs.sendMessage(tabId, message);
  }

  try {
    return await trySend();
  } catch (err) {
    const isConnErr =
      err &&
      err.message &&
      (err.message.includes("Receiving end does not exist") ||
        err.message.includes("Could not establish connection") ||
        err.message.includes("The message port closed"));

    if (!isConnErr) {
      throw err;
    }

    console.warn(
      `[GoFleet] Extension déconnectée de l'onglet ${tabId}. Tentative de réinjection automatique...`,
      err
    );

    // Vérifier si l'URL est injectable (doit être http:// ou https://)
    const url = (tabUrl || "").toLowerCase();
    const isInjectable = url.startsWith("http://") || url.startsWith("https://");

    if (!isInjectable || !chrome.scripting || !chrome.scripting.executeScript) {
      throw new Error(
        "Impossible de communiquer avec cet onglet.\nVeuillez actualiser la page TMS (F5) pour activer l'extension."
      );
    }

    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["xlsx.full.min.js", "content.js"],
      });

      // Attente courte pour initialiser les listeners
      await new Promise((resolve) => setTimeout(resolve, 350));

      // Deuxième essai
      return await trySend();
    } catch (injectErr) {
      console.error("[GoFleet] Échec de l'injection automatique:", injectErr);
      throw new Error(
        "Connexion avec la page TMS interrompue.\n\n" +
        "Veuillez rafraîchir la page TMS (F5) dans votre navigateur, puis réessayez l'export."
      );
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("printRetour").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab) {
      try {
        await sendTabMessageWithFallback(tab.id, { action: "printRetourIframes" }, tab.url);
      } catch (err) {
        console.warn("Could not print retour:", err);
      }
    }
  });

  const searchBtn = document.getElementById("searchTrackingBtn");
  const input = document.getElementById("trackingInput");
  const startBtn = document.getElementById("startSearchBtn");

  let isVisible = false;

  searchBtn.addEventListener("click", () => {
    isVisible = !isVisible;

    if (isVisible) {
      input.style.display = "block";
      startBtn.style.display = "block";

      // Auto focus input after showing it
      setTimeout(() => input.focus(), 50);
    } else {
      input.style.display = "none";
      startBtn.style.display = "none";
    }
  });

  startBtn.addEventListener("click", async () => {
    const trackingToFind = input.value.trim();
    if (!trackingToFind) {
      alert("Veuillez entrer un code tracking.");
      input.focus(); // Keep focus if empty
      return;
    }

    startBtn.innerHTML = `
      <span class="button-spinner-wrapper">
        <span class="spinner"></span>
        <span>Chargement...</span>
      </span>
    `;
    startBtn.disabled = true;

    console.log("Envoi du tracking au content script:", trackingToFind);

    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab) return;
      try {
        const response = await sendTabMessageWithFallback(
          tab.id,
          { action: "searchTracking", trackingToFind },
          tab.url
        );
        console.log("Réponse du content script:", response);

        if (response && response.found) {
          alert(`✅ Tracking trouvé: ${response.trackingCode}`);
        } else {
          alert("❌ Tracking introuvable dans cette page.");
        }
      } catch (err) {
        console.warn("searchTracking error:", err);
        alert(err.message || "Erreur de communication avec la page.");
      } finally {
        // Reset UI
        startBtn.innerHTML = "Valider";
        startBtn.disabled = false;
        input.value = "";

        input.style.display = "none";
        startBtn.style.display = "none";
        isVisible = false;
      }
    });
  });

  // Populate livreur history dates dropdown
  const livreurSelect = document.getElementById("livreurDateSelect");
  const historyBadge = document.getElementById("historyBadge");

  chrome.storage.local.get({ caissier_history: {} }, (res) => {
    const history = res.caissier_history || {};
    if (!livreurSelect) return;

    const dates = Object.keys(history).sort().reverse();
    if (dates.length > 0) {
      if (historyBadge) historyBadge.textContent = `${dates.length} date(s)`;
      dates.forEach((d) => {
        const opt = document.createElement("option");
        opt.value = d;
        const count = history[d]?.deliveryBoys?.length || 0;
        opt.textContent = `📅 ${d} (${count} livreurs)`;
        livreurSelect.appendChild(opt);
      });
    }
  });

  if (livreurSelect) {
    livreurSelect.addEventListener("change", () => {
      if (livreurSelect.value === "CURRENT") {
        if (historyBadge) {
          historyBadge.textContent = "⚡ En direct";
          historyBadge.style.background = "#e0e7ff";
          historyBadge.style.color = "#4338ca";
        }
      } else {
        if (historyBadge) {
          historyBadge.textContent = "📂 Archive";
          historyBadge.style.background = "#fef3c7";
          historyBadge.style.color = "#92400e";
        }
      }
    });
  }

  document
    .getElementById("exportLivreur")
    .addEventListener("click", async () => {
      const selectedDate = livreurSelect?.value || "CURRENT";

      // If user selected a specific historical date from dropdown
      if (selectedDate !== "CURRENT") {
        const { caissier_history = {} } = await chrome.storage.local.get(
          "caissier_history"
        );
        const historyItem = caissier_history[selectedDate];
        if (
          historyItem &&
          historyItem.deliveryBoys &&
          historyItem.deliveryBoys.length > 0
        ) {
          await generateDeliveryExcel(historyItem.deliveryBoys, selectedDate);
          alert(
            `Export Excel réussi depuis l'historique pour le ${selectedDate} (${historyItem.deliveryBoys.length} livreurs) !`
          );
          return;
        } else {
          alert(
            `Aucune donnée trouvée dans l'historique pour le ${selectedDate}.`
          );
          return;
        }
      }

      // Default: Collect from active tab
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab) {
        alert("Aucun onglet actif trouvé.");
        return;
      }

      const result = await chrome.tabs.sendMessage(tab.id, {
        action: "collectDeliveryBoyData",
      });

      if (result?.status === "ok") {
        const msg = result.fromHistory
          ? `Données livreur récupérées depuis l'historique (${result.date}) !`
          : "Données livreur récupérées avec succès !";
        alert(msg);
        console.log(result.deliveryBoys);
        await generateDeliveryExcel(result.deliveryBoys, result.date);
      } else {
        alert(result?.message || "Échec de la récupération des données.");
      }
    });

  document
    .getElementById("exportEchecCasa")
    .addEventListener("click", async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      // Store original URL at start
      const originalUrl = tab.url;
      let currentUrl = originalUrl;

      // Configuration - Adjust these values as needed
      const config = {
        navigationTimeout: 5000, // Increased from 2000 to 5000ms
        retryDelay: 3000, // Increased from 1000 to 3000ms
        maxRetries: 5, // Increased from 3 to 5 attempts
        dataCollectionDelay: 5000, // Added delay after page loads
        betweenExpeditionDelay: 5000, // Delay between processing expeditions
      };

      // Enhanced navigation with timeout and retry
      async function navigateWithRetry(url, maxAttempts = config.maxRetries) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            await chrome.tabs.update(tab.id, { url });

            // Wait for page to load with timeout
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(
                () => reject(new Error(`Navigation timeout for ${url}`)),
                config.navigationTimeout
              );

              const checkComplete = async () => {
                const newUrl = (await chrome.tabs.get(tab.id)).url;
                if (newUrl === url) {
                  clearTimeout(timeout);
                  currentUrl = newUrl;
                  resolve();
                }
              };

              // Check every 500ms
              const interval = setInterval(checkComplete, 500);
            });

            // Additional delay after successful navigation
            await new Promise((r) => setTimeout(r, config.dataCollectionDelay));
            return true;
          } catch (error) {
            console.warn(`Navigation attempt ${attempt} failed:`, error);
            if (attempt === maxAttempts) throw error;
            await new Promise((r) =>
              setTimeout(r, attempt * config.retryDelay)
            );
          }
        }
      }

      // Enhanced data collection with status checks
      async function processPalette(palette, expedition) {
        const paletteUrl = new URL(palette.link, expedition.link).href;

        // Navigate to palette page with enhanced retry
        await navigateWithRetry(paletteUrl);

        // Collect data with multiple retries and validation
        let colisData;
        for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
          try {
            colisData = await chrome.tabs.sendMessage(tab.id, {
              action: "collectFullExpeditionData",
            });

            // Validate the collected data
            if (colisData?.colisList?.length) {
              console.log(
                `Successfully collected ${colisData.colisList.length} items from palette ${palette.number}`
              );
              break;
            } else {
              throw new Error("Empty or invalid colis data");
            }
          } catch (error) {
            console.warn(
              `Attempt ${attempt} failed for palette ${palette.number}:`,
              error
            );
            if (attempt === config.maxRetries) throw error;
            await new Promise((r) =>
              setTimeout(r, attempt * config.retryDelay)
            );
          }
        }

        // Return to expedition edit page
        await navigateWithRetry(expedition.link);

        return colisData.colisList;
      }

      // Main processing function with enhanced error handling
      async function processExpeditions() {
        try {
          // --- INITIAL DATA COLLECTION ---
          console.log("Starting initial data collection...");
          const initialData = await chrome.tabs.sendMessage(tab.id, {
            action: "collectFullExpeditionData",
          });

          if (!initialData?.expeditions) {
            throw new Error("No expedition data found on the initial page");
          }

          // --- FILTER EXPEDITIONS ---
          const allowedStatuses = [
            "en cours de creation",
            "en cours d'expedition mm",
          ];

          const validExpeditions = initialData.expeditions.filter((exp) => {
            const cleanedStatus = exp.status
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/[’‘`´]/g, "'")
              .toLowerCase()
              .trim();

            return allowedStatuses.includes(cleanedStatus);
          });

          if (validExpeditions.length === 0) {
            const total = initialData.expeditions.length;
            throw new Error(
              total > 0
                ? `${total} expeditions found, none with required status`
                : "No expeditions found in the list"
            );
          }

          console.log(
            `Found ${validExpeditions.length} valid expeditions to process`
          );

          // --- PROCESS EACH EXPEDITION ---
          const processedExpeditions = [];
          let processedCount = 0;

          for (const expedition of validExpeditions) {
            try {
              console.log(
                `Processing expedition ${processedCount + 1}/${
                  validExpeditions.length
                }: ${expedition.number}`
              );

              // Navigate to expedition edit page
              await navigateWithRetry(expedition.link);

              // Collect expedition details
              let detailData;
              try {
                detailData = await chrome.tabs.sendMessage(tab.id, {
                  action: "collectFullExpeditionData",
                });
              } catch (error) {
                console.error("Failed to collect expedition data:", error);
                continue;
              }

              // Process each palette
              const processedPalettes = [];
              for (const palette of detailData.palettes) {
                try {
                  console.log(`Processing palette ${palette.number}`);
                  const colisList = await processPalette(palette, expedition);

                  processedPalettes.push({
                    ...palette,
                    colis: colisList,
                    colisCount: colisList.length,
                    collectedAt: new Date().toISOString(),
                  });

                  console.log(
                    `Completed palette ${palette.number} with ${colisList.length} colis`
                  );
                } catch (error) {
                  console.error(
                    `Failed to process palette ${palette.number}:`,
                    error
                  );
                  processedPalettes.push({
                    ...palette,
                    error: error.message,
                    colis: [],
                    colisCount: 0,
                  });
                }
              }

              processedExpeditions.push({
                ...expedition,
                tourneeNumber: detailData.tourneeNumber,
                plombNumber: detailData.plombNumber,
                palettes: processedPalettes,
                processedAt: new Date().toISOString(),
              });

              processedCount++;

              // Return to list page between expeditions
              await navigateWithRetry(originalUrl);

              // Add delay between expeditions
              if (processedCount < validExpeditions.length) {
                await new Promise((r) =>
                  setTimeout(r, config.betweenExpeditionDelay)
                );
              }
            } catch (error) {
              console.error(
                `Failed to process expedition ${expedition.number}:`,
                error
              );
              processedExpeditions.push({
                ...expedition,
                error: error.message,
                palettes: [],
              });
            }
          }

          // --- FINALIZE PROCESSING ---
          console.log("Processing complete, saving results...");
          await chrome.storage.local.set({
            expeditions: processedExpeditions,
            lastExport: new Date().toISOString(),
          });

          await generateExcel();
          console.log("Exportation terminé pour Zone CASA");
        } catch (error) {
          console.error("Export failed:", error);
          await navigateWithRetry(originalUrl);
          alert(`Export failed: ${error.message}`);
          throw error;
        }
      }

      // Execute the main process
      await processExpeditions();
    });

  document
    .getElementById("exportEchecHorsCasa")
    .addEventListener("click", async () => {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const { city } = await chrome.tabs.sendMessage(tab.id, {
        action: "detectCity",
      });

      if (!["tanger", "meknes", "fes", "rabat"].includes(city)) {
        alert("City not recognized or not supported.");
        return;
      }

      const originalUrl = tab.url;
      let currentUrl = originalUrl;

      const config = {
        navigationTimeout: 5000,
        retryDelay: 3000,
        maxRetries: 5,
        dataCollectionDelay: 5000,
        betweenExpeditionDelay: 5000,
      };

      async function navigateWithRetry(url, maxAttempts = config.maxRetries) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            await chrome.tabs.update(tab.id, { url });
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(
                () => reject(new Error(`Navigation timeout for ${url}`)),
                config.navigationTimeout
              );
              const checkComplete = async () => {
                const newUrl = (await chrome.tabs.get(tab.id)).url;
                if (newUrl === url) {
                  clearTimeout(timeout);
                  resolve();
                }
              };
              const interval = setInterval(checkComplete, 500);
            });
            await new Promise((r) => setTimeout(r, config.dataCollectionDelay));
            return true;
          } catch (error) {
            console.warn(`Navigation attempt ${attempt} failed:`, error);
            if (attempt === maxAttempts) throw error;
            await new Promise((r) =>
              setTimeout(r, attempt * config.retryDelay)
            );
          }
        }
      }

      async function processPalette(palette, expedition) {
        const paletteUrl = new URL(palette.link, expedition.link).href;
        await navigateWithRetry(paletteUrl);

        let colisData;
        for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
          try {
            colisData = await chrome.tabs.sendMessage(tab.id, {
              action: "collectFullExpeditionData",
            });
            if (colisData?.colisList?.length) break;
            throw new Error("Empty or invalid colis data");
          } catch (error) {
            console.warn(
              `Attempt ${attempt} failed for palette ${palette.number}:`,
              error
            );
            if (attempt === config.maxRetries) throw error;
            await new Promise((r) =>
              setTimeout(r, attempt * config.retryDelay)
            );
          }
        }

        await navigateWithRetry(expedition.link);
        return colisData.colisList;
      }

      async function runExportLogic(tab, city) {
        const initialData = await chrome.tabs.sendMessage(tab.id, {
          action: "collectFullExpeditionData",
        });

        if (!initialData?.expeditions)
          throw new Error("No expedition data found on the initial page");

        const allowedStatuses = [
          "en cours de creation",
          "en cours d'expedition mm",
        ];
        const validExpeditions = initialData.expeditions.filter((exp) => {
          const cleanedStatus = exp.status
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .replace(/[’‘`´]/g, "'")
            .toLowerCase()
            .trim();
          return allowedStatuses.includes(cleanedStatus);
        });

        const processedExpeditions = [];
        for (const expedition of validExpeditions) {
          try {
            await navigateWithRetry(expedition.link);
            const detailData = await chrome.tabs.sendMessage(tab.id, {
              action: "collectFullExpeditionData",
            });
            const processedPalettes = [];

            for (const palette of detailData.palettes || []) {
              try {
                const colisList = await processPalette(palette, expedition);
                processedPalettes.push({
                  ...palette,
                  colis: colisList,
                  colisCount: colisList.length,
                });
              } catch (error) {
                processedPalettes.push({
                  ...palette,
                  error: error.message,
                  colis: [],
                  colisCount: 0,
                });
              }
            }

            processedExpeditions.push({
              ...expedition,
              tourneeNumber: detailData.tourneeNumber,
              plombNumber: detailData.plombNumber,
              palettes: processedPalettes,
            });

            await navigateWithRetry(originalUrl);
            await new Promise((r) =>
              setTimeout(r, config.betweenExpeditionDelay)
            );
          } catch (error) {
            console.error(
              `Failed to process expedition ${expedition.number}:`,
              error
            );
            processedExpeditions.push({
              ...expedition,
              error: error.message,
              palettes: [],
            });
          }
        }

        return processedExpeditions;
      }

      const collectedData = await runExportLogic(tab, city);
      const storageKey = `expeditions_${city}`;
      await chrome.storage.local.set({ [storageKey]: collectedData });

      const keys = await chrome.storage.local.get([
        "expeditions_tanger",
        "expeditions_meknes",
        "expeditions_fes",
        "expeditions_rabat",
      ]);

      const completed = Object.values(keys).filter(Boolean).length;

      if (completed === 4) {
        await generateExcelHorsCasa();
        alert("Exportation terminé pour toutes les Zones hors CASA !");
      } else {
        alert(`Ville ${city.toUpperCase()} terminée. Passez à la suivante.`);
      }
    });

  function formatDateForFilename(date = new Date()) {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    return `${day}-${month}-${year}`;
  }

  document
    .getElementById("exportRefused")
    .addEventListener("click", async () => {
      try {
        // Get all refused colis from storage
        const { refusedColis = [] } = await chrome.storage.local.get({
          refusedColis: [],
        });

        // Prepare data for export
        const cleanData = refusedColis.map((item) => ({
          Date: item.date,
          Colis: item.colis,
          "Raison Annulation": item.raisonAnnulation,
          Livreur: item.livreur,
          Description: "",
        }));

        // Create workbook and worksheet
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(cleanData);

        // Set column widths
        ws["!cols"] = [
          { wch: 15 }, // Date
          { wch: 25 }, // Colis
          { wch: 35 }, // Raison Annulation
          { wch: 30 }, // Livreur
          { wch: 20 }, // Description
        ];

        // Add headers with styling
        const headerStyle = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "4A6CF7" } },
          alignment: { horizontal: "center" },
        };

        const headerRow = [
          "Date",
          "Colis",
          "Raison Annulation",
          "Livreur",
          "Description",
        ];
        XLSX.utils.sheet_add_aoa(ws, [headerRow], { origin: "A1" });

        for (let col = 0; col < headerRow.length; col++) {
          const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
          if (!ws[cellRef]) ws[cellRef] = {};
          if (!ws[cellRef].s) ws[cellRef].s = {};
          Object.assign(ws[cellRef].s, headerStyle);
        }

        // Add sheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, "Colis Refusés");

        // ✅ Create a Blob from workbook and download it manually
        const wbArrayBuffer = XLSX.write(wb, {
          bookType: "xlsx",
          type: "array",
        });
        const blob = new Blob([wbArrayBuffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Colis_refusés_${formatDateForFilename()}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Clear data
        await chrome.storage.local.remove("refusedColis");

        console.log(
          `✅ Exportation réussie: ${refusedColis.length} colis refusés exportés`
        );
      } catch (error) {
        console.error("Export échoué:", error);
        alert(`Erreur: ${error.message}`);
      }
    });

  // --- Module Export Colis Non Livrés (Par Livreur) ---
  function sanitizeExcelSheetName(name, existingSet = new Set()) {
    if (!name || typeof name !== "string") name = "Livreur";
    // Replace forbidden characters: \ / ? * [ ] :
    let clean = name.replace(/[\\/?*[\]:]/g, "_").trim();
    if (clean.length > 28) {
      clean = clean.substring(0, 28).trim();
    }
    if (!clean) clean = "Livreur";

    let candidate = clean;
    let idx = 1;
    while (existingSet.has(candidate.toLowerCase())) {
      candidate = `${clean.substring(0, 25)}_${idx}`;
      idx++;
    }
    existingSet.add(candidate.toLowerCase());
    return candidate;
  }

  function updateNonDeliveredBadge() {
    const label = document.getElementById("nonDeliveredCountLabel");
    if (!label) return;

    chrome.storage.local.get({ gofleet_non_delivered_by_rider: {} }, (res) => {
      const data = res.gofleet_non_delivered_by_rider || {};
      const riders = Object.keys(data);
      let totalParcels = 0;
      riders.forEach((r) => {
        totalParcels += (data[r]?.parcels || []).length;
      });

      label.innerHTML = `
        <i class="fa-solid fa-layer-group" style="color: #0d9488;"></i>
        <span><strong>${riders.length}</strong> livreur(s) • <strong>${totalParcels}</strong> colis non livré(s)</span>
      `;
    });
  }

  // Update badge on load
  updateNonDeliveredBadge();

  // Reset button
  const clearNonDeliveredBtn = document.getElementById("clearNonDeliveredBtn");
  if (clearNonDeliveredBtn) {
    clearNonDeliveredBtn.addEventListener("click", async () => {
      if (confirm("Voulez-vous réinitialiser tous les colis non livrés mémorisés pour tous les livreurs ?")) {
        await chrome.storage.local.remove("gofleet_non_delivered_by_rider");
        updateNonDeliveredBadge();
        alert("Mémoire des colis non livrés réinitialisée.");
      }
    });
  }

  // Main Export Button
  const exportNonDeliveredBtn = document.getElementById("exportNonDeliveredRiders");
  if (exportNonDeliveredBtn) {
    exportNonDeliveredBtn.addEventListener("click", async () => {
      try {
        exportNonDeliveredBtn.disabled = true;
        const originalHtml = exportNonDeliveredBtn.innerHTML;
        exportNonDeliveredBtn.innerHTML = `
          <div class="button-content" style="flex-direction: row; align-items: center; justify-content: center; width: 100%; gap: 10px;">
            <span class="spinner"></span>
            <span style="font-weight: 600;">Génération de l'Excel...</span>
          </div>
        `;

        // 1. Try to collect live data depending on active tab
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeUrl = (activeTab?.url || "").toLowerCase();

        if (activeUrl.includes("/caissier/caissier") && !activeUrl.includes("traitementlivreurexcute")) {
          const isSingleEncaissement = activeUrl.includes("tourneeencaisement");
          exportNonDeliveredBtn.innerHTML = `
            <div class="button-content" style="flex-direction: row; align-items: center; justify-content: center; width: 100%; gap: 10px;">
              <span class="spinner"></span>
              <span style="font-weight: 600;">${isSingleEncaissement ? "Extraction de la tournée..." : "Extraction de toutes les tournées..."}</span>
            </div>
          `;
          try {
            const response = await sendTabMessageWithFallback(
              activeTab.id,
              { action: "collectAllCaissierRidersParcels" },
              activeTab?.url
            );
            if (response?.status === "ok" && response.data) {
              console.log("Données de tous les livreurs collectées depuis Caissier:", response.data);
            } else if (response?.status === "error") {
              console.warn("Avertissement renvoyé par Caissier:", response.message);
            }
          } catch (e) {
            console.warn("Could not query Caissier page for riders:", e);
            alert(e.message || "Erreur lors de l'extraction des données de la page Caissier.");
            exportNonDeliveredBtn.disabled = false;
            exportNonDeliveredBtn.innerHTML = originalHtml;
            return;
          }
        } else if (activeUrl.includes("traitementlivreurexcute")) {
          exportNonDeliveredBtn.innerHTML = `
            <div class="button-content" style="flex-direction: row; align-items: center; justify-content: center; width: 100%; gap: 10px;">
              <span class="spinner"></span>
              <span style="font-weight: 600;">Extraction des colis de la tournée...</span>
            </div>
          `;
          try {
            const response = await sendTabMessageWithFallback(
              activeTab.id,
              { action: "collectNonDeliveredParcels" },
              activeTab?.url
            );
            if (response?.status === "ok" && response.data) {
              console.log("Données collectées en direct depuis l'onglet actif:", response.data);
            } else if (response?.status === "error") {
              console.warn("Avertissement renvoyé par TraitementLivreur:", response.message);
            }
          } catch (e) {
            console.warn("Could not query active tab for live non-delivered parcels:", e);
            alert(e.message || "Erreur lors de l'extraction des colis de la tournée.");
            exportNonDeliveredBtn.disabled = false;
            exportNonDeliveredBtn.innerHTML = originalHtml;
            return;
          }
        }

        // Rafraîchir le badge du compteur
        updateNonDeliveredBadge();

        // 2. Read all accumulated non-delivered parcels from storage
        const { gofleet_non_delivered_by_rider = {} } = await chrome.storage.local.get(
          "gofleet_non_delivered_by_rider"
        );

        const riderNames = Object.keys(gofleet_non_delivered_by_rider);
        if (riderNames.length === 0) {
          alert(
            "Aucun colis non livré (annulé ou refusé) n'a été trouvé.\n\n" +
            "Veuillez ouvrir la page Caissier (https://tms.marjanemall.ma/Caissier/Caissier) ou une page de tournée (TraitementLivreurExcute) pour extraire les colis."
          );
          exportNonDeliveredBtn.disabled = false;
          exportNonDeliveredBtn.innerHTML = originalHtml;
          return;
        }

        let totalParcelsCount = 0;
        riderNames.forEach((r) => {
          totalParcelsCount += (gofleet_non_delivered_by_rider[r]?.parcels || []).length;
        });

        if (totalParcelsCount === 0) {
          alert("Tous les colis trouvés sont marqués comme livrés. Aucun colis en échec/annulé/refusé à exporter.");
          exportNonDeliveredBtn.disabled = false;
          exportNonDeliveredBtn.innerHTML = originalHtml;
          return;
        }

        // 3. Build Excel Workbook with a sheet for EACH rider
        const wb = XLSX.utils.book_new();
        const existingSheets = new Set();

        const headerStyle = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "0D9488" } },
          alignment: { horizontal: "center", vertical: "center" },
        };

        const summaryHeaderStyle = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "1E293B" } },
          alignment: { horizontal: "center", vertical: "center" },
        };

        // Summary sheet if multiple riders
        if (riderNames.length > 1) {
          const summaryRows = [];
          riderNames.forEach((rider) => {
            const rData = gofleet_non_delivered_by_rider[rider];
            const pCount = (rData?.parcels || []).length;
            summaryRows.push({
              "Livreur": rider,
              "N° Tournée": rData?.tourneeId || "N/A",
              "Colis Non Livrés": pCount,
              "Date": rData?.date || "",
              "Statut Tournée": pCount > 0 ? `${pCount} non livrés` : "Complet"
            });
          });

          summaryRows.push({
            "Livreur": "TOTAL",
            "N° Tournée": "-",
            "Colis Non Livrés": totalParcelsCount,
            "Date": formatDate(),
            "Statut Tournée": "-"
          });

          const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
          wsSummary["!cols"] = [
            { wch: 28 }, // Livreur
            { wch: 18 }, // N° Tournée
            { wch: 20 }, // Colis Non Livrés
            { wch: 16 }, // Date
            { wch: 20 }  // Statut
          ];

          const summaryHeaders = ["Livreur", "N° Tournée", "Colis Non Livrés", "Date", "Statut Tournée"];
          XLSX.utils.sheet_add_aoa(wsSummary, [summaryHeaders], { origin: "A1" });

          for (let col = 0; col < summaryHeaders.length; col++) {
            const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
            if (!wsSummary[cellRef]) wsSummary[cellRef] = {};
            if (!wsSummary[cellRef].s) wsSummary[cellRef].s = {};
            Object.assign(wsSummary[cellRef].s, summaryHeaderStyle);
          }

          XLSX.utils.book_append_sheet(wb, wsSummary, "RÉCAPITULATIF");
          existingSheets.add("récapitulatif");
        }

        // Each rider gets their own sheet
        riderNames.forEach((riderName) => {
          const rData = gofleet_non_delivered_by_rider[riderName];
          const parcels = rData?.parcels || [];

          const sheetData = parcels.length > 0
            ? parcels.map((item, idx) => ({
                "N°": idx + 1,
                "Colis": item.colis || "",
                "Statut": item.statut || "Non livré",
                "Raison / Motif": item.raisonAnnulation || "-",
                "Destinataire": item.client || "-",
                "Téléphone": item.telephone || "-",
                "Adresse": item.adresse || "-",
                "Montant": item.prix || "-",
                "N° Tournée": item.tourneeId || rData?.tourneeId || "-",
                "Date": item.date || rData?.date || "",
                "Livreur": riderName
              }))
            : [
                {
                  "N°": 1,
                  "Colis": "-",
                  "Statut": "Tous les colis livrés (0 échec)",
                  "Raison / Motif": "-",
                  "Destinataire": "-",
                  "Téléphone": "-",
                  "Adresse": "-",
                  "Montant": "-",
                  "N° Tournée": rData?.tourneeId || "-",
                  "Date": rData?.date || "",
                  "Livreur": riderName
                }
              ];

          const ws = XLSX.utils.json_to_sheet(sheetData);

          ws["!cols"] = [
            { wch: 6 },  // N°
            { wch: 22 }, // Colis
            { wch: 20 }, // Statut
            { wch: 32 }, // Raison / Motif
            { wch: 26 }, // Destinataire
            { wch: 18 }, // Téléphone
            { wch: 36 }, // Adresse
            { wch: 16 }, // Montant
            { wch: 15 }, // N° Tournée
            { wch: 14 }, // Date
            { wch: 24 }  // Livreur
          ];

          const sheetHeaders = [
            "N°", "Colis", "Statut", "Raison / Motif", "Destinataire",
            "Téléphone", "Adresse", "Montant", "N° Tournée", "Date", "Livreur"
          ];
          XLSX.utils.sheet_add_aoa(ws, [sheetHeaders], { origin: "A1" });

          for (let col = 0; col < sheetHeaders.length; col++) {
            const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
            if (!ws[cellRef]) ws[cellRef] = {};
            if (!ws[cellRef].s) ws[cellRef].s = {};
            Object.assign(ws[cellRef].s, headerStyle);
          }

          const safeSheetName = sanitizeExcelSheetName(riderName, existingSheets);
          XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
        });

        // 4. Download file
        const wbArrayBuffer = XLSX.write(wb, {
          bookType: "xlsx",
          type: "array",
        });
        const blob = new Blob([wbArrayBuffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const filename = riderNames.length === 1
          ? `COLIS_NON_LIVRES_${riderNames[0].replace(/\s+/g, "_")}_${formatDateForFilename()}.xlsx`
          : `COLIS_NON_LIVRES_${riderNames.length}_LIVREURS_${formatDateForFilename()}.xlsx`;

        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        updateNonDeliveredBadge();

        alert(
          `✅ Export Excel réussi !\n\n` +
          `• Total Colis Non Livrés : ${totalParcelsCount}\n` +
          `• Nombre de livreurs : ${riderNames.length}\n` +
          `• Fichier : ${filename}\n\n` +
          `Chaque livreur dispose de son propre onglet contenant ses colis (annulés / refusés) et leurs statuts.`
        );
      } catch (err) {
        console.error("Export non livrés échoué:", err);
        alert(`Erreur d'exportation : ${err.message}`);
      } finally {
        exportNonDeliveredBtn.disabled = false;
        exportNonDeliveredBtn.innerHTML = originalHtml;
      }
    });
  }
});
