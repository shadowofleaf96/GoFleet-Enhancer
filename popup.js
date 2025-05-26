function formatDate(date = new Date()) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

async function generateExcel() {
  try {
    const { expeditions } = await chrome.storage.local.get("expeditions");

    // Load template
    const templatePath = chrome.runtime.getURL(
      "dummy-content/ECHEC-RETOUR_CLIENT-CASABLANCA.xlsx"
    );
    const templateBuffer = await fetch(templatePath).then((r) =>
      r.arrayBuffer()
    );

    const workbook = await XlsxPopulate.fromDataAsync(templateBuffer);

    // Process data with suffix
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

    // Helper to format date as you have in your original function
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
      const today = new Date();

      sheet.cell("I2").value(formatDate(today));
      console.log(data);

      data.forEach((item) => {
        sheet.cell("J4").value(item.expeditionNumber);
        sheet.cell("J5").value(item.tourneeNumber);

        sheet.cell("J9").value(item.colisCount);

        ["A", "B", "C", "D", "E"].forEach((col) => {
          sheet.cell(`${col}12`).value(item.paletteNumber);
        });

        const cols = ["F", "G", "H"];
        for (const col of cols) {
          for (let row = 12; row <= 29; row++) {
            const cell = sheet.cell(`${col}${row}`);
            cell.clear();
          }
        }

        let colisIndex = 0;
        for (const col of cols) {
          for (let row = 12; row <= 29; row++) {
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
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  } catch (error) {
    console.error("Excel generation failed:", error);
    alert("Erreur de génération Excel: " + error.message);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("exportEchec").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    // Store original URL at start
    const originalUrl = tab.url;
    let currentUrl = originalUrl;

    async function navigateWithRetry(url, maxAttempts = 3) {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await chrome.tabs.update(tab.id, { url });
        await new Promise(r => setTimeout(r, 2000));

        const newUrl = (await chrome.tabs.get(tab.id)).url;
        if (newUrl === url) {
          currentUrl = newUrl;
          return true;
        }

        if (attempt === maxAttempts) throw new Error(`Navigation failed to ${url}`);
        await new Promise(r => setTimeout(r, attempt * 1000));
      }
    }

    async function processPalette(palette, expedition) {
      const paletteUrl = new URL(palette.link, expedition.link).href;

      // Navigate to palette page
      await navigateWithRetry(paletteUrl);

      // Collect data with retries
      let colisData;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          colisData = await chrome.tabs.sendMessage(tab.id, {
            action: "collectFullExpeditionData",
          });
          if (colisData?.colisList?.length) break;
        } catch (error) {
          console.warn(`Attempt ${attempt} failed:`, error);
        }
        await new Promise(r => setTimeout(r, attempt * 1000));
      }

      // Return to expedition edit page
      await navigateWithRetry(expedition.link);

      return colisData?.colisList || [];
    }

    try {
      // --- MAIN PROCESSING FLOW ---
      // 1. Get initial list
      const initialData = await chrome.tabs.sendMessage(tab.id, {
        action: "collectFullExpeditionData",
      });

      // 2. Filter valid expeditions
      const validExpeditions = initialData?.expeditions?.filter(exp => {
        const cleanedStatus = exp.status
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim();
        return cleanedStatus === "en cours de creation";
      }) || [];

      if (validExpeditions.length === 0) {
        const total = initialData?.expeditions?.length || 0;
        throw new Error(total > 0 ?
          `${total} expeditions found, none with "En cours de création" status` :
          "No expeditions found in the list");
      }

      // 3. Process valid expeditions
      const processedExpeditions = [];

      for (const expedition of validExpeditions) {
        // Navigate to expedition edit page
        await navigateWithRetry(expedition.link);

        // Collect expedition data
        let detailData;
        try {
          detailData = await chrome.tabs.sendMessage(tab.id, {
            action: "collectFullExpeditionData",
          });
        } catch (error) {
          console.error("Failed to collect expedition data:", error);
          continue; // Skip failed expedition
        }

        // Process palettes
        const processedPalettes = [];
        for (const palette of detailData.palettes) {
          try {
            const colisList = await processPalette(palette, expedition);
            processedPalettes.push({
              ...palette,
              colis: colisList,
              colisCount: colisList.length,
              collectedAt: new Date().toISOString(),
            });
          } catch (error) {
            console.error("Failed to process palette:", palette.number, error);
          }
        }

        processedExpeditions.push({
          ...expedition,
          tourneeNumber: detailData.tourneeNumber,
          plombNumber: detailData.plombNumber,
          palettes: processedPalettes,
        });

        // Return to list page between expeditions
        await navigateWithRetry(originalUrl);
      }

      // 4. Final cleanup
      await navigateWithRetry(originalUrl);
      await chrome.storage.local.set({ expeditions: processedExpeditions });
      await generateExcel();

    } catch (error) {
      console.error("Export failed:", error);
      await navigateWithRetry(originalUrl);
      alert(`Export failed: ${error.message}`);
    }
  });
});