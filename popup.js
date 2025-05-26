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

    async function waitForContentScript(tabId) {
      return new Promise((resolve) => {
        const listener = (message, sender) => {
          if (sender.tab?.id === tabId && message?.ready) {
            chrome.runtime.onMessage.removeListener(listener);
            resolve();
          }
        };
        chrome.runtime.onMessage.addListener(listener);
        setTimeout(resolve, 5000); // Extended timeout
      });
    }

    async function processPalette(palette, expedition) {
      await chrome.tabs.update(tab.id, {
        url: new URL(palette.link, expedition.link).href,
      });

      // Wait for both navigation and content script
      await Promise.race([
        waitForContentScript(tab.id),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);

      // Retry with backoff
      let colisData;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          colisData = await chrome.tabs.sendMessage(tab.id, {
            action: "collectFullExpeditionData",
          });
          if (colisData?.colisList?.length) break;
          await new Promise((r) => setTimeout(r, attempt * 1000));
        } catch (error) {
          console.warn(`Attempt ${attempt} failed:`, error);
        }
      }

      return colisData?.colisList || [];
    }

    try {
      // Step 1: Get initial expedition list
      const initialData = await chrome.tabs.sendMessage(tab.id, {
        action: "collectFullExpeditionData",
      });
      if (!initialData?.expeditions?.length)
        throw new Error("No expeditions found");

      // Process expeditions sequentially
      const processedExpeditions = [];
      for (const expedition of initialData.expeditions) {
        await chrome.tabs.update(tab.id, { url: expedition.link });
        await new Promise((r) => setTimeout(r, 2000)); // Hard wait for navigation

        let detailData = await chrome.tabs.sendMessage(tab.id, {
          action: "collectFullExpeditionData",
        });

        // Fallback in case you land on the wrong page
        if (!detailData?.palettes) {
          // Force navigation to the proper /Edit page
          const editUrl = expedition.link;
          await chrome.tabs.update(tab.id, { url: editUrl });
          await new Promise((r) => setTimeout(r, 2000));
          detailData = await chrome.tabs.sendMessage(tab.id, {
            action: "collectFullExpeditionData",
          });
        }

        const processedPalettes = [];
        for (const palette of detailData.palettes) {
          const colisList = await processPalette(palette, expedition);
          processedPalettes.push({
            ...palette,
            colis: colisList,
            colisCount: colisList.length,
            collectedAt: new Date().toISOString(),
          });
        }

        processedExpeditions.push({
          ...expedition,
          tourneeNumber: detailData.tourneeNumber,
          plombNumber: detailData.plombNumber,
          palettes: processedPalettes,
        });
      }

      await chrome.storage.local.set({ expeditions: processedExpeditions });
      const verification = await chrome.storage.local.get("expeditions");
      await generateExcel();
      if (!verification.expeditions?.length)
        throw new Error("Storage verification failed");
    } catch (error) {
      console.error("Export failed:", error);
      alert(`Export failed: ${error.message}`);
    }
  });
});
