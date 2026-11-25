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

    function getDayAndFormattedDate(dateStr = null) {
      let d;
      if (dateStr) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          const [y, m, day] = dateStr.split("-").map(Number);
          d = new Date(y, m - 1, day);
        } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
          const [day, m, y] = dateStr.split("/").map(Number);
          d = new Date(y, m - 1, day);
        } else {
          d = new Date(dateStr);
        }
      } else {
        d = new Date();
      }
      if (isNaN(d.getTime())) d = new Date();

      const daysFr = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
      const dayName = daysFr[d.getDay()];
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();

      const dateFormatted = `${dd}/${mm}/${yyyy}`;
      const dayFull = `${dayName} ${dateFormatted}`;
      const dateIso = `${yyyy}-${mm}-${dd}`;

      return { dayName, dateFormatted, dayFull, dateIso };
    }

    const { dayName, dateFormatted, dayFull, dateIso } = getDayAndFormattedDate(targetDateStr);
    const wb = await XlsxPopulate.fromBlankAsync();
    const ws = wb.sheet(0);
    ws.name(`SYNTHESE_${dateIso}`);
    ws.gridLinesVisible(true);

    // Column Widths (12 columns A to L)
    const colWidths = {
      A: 6,   // N°
      B: 22,  // Date / Jour
      C: 28,  // Livreur / Tournée
      D: 15,  // Total Colis
      E: 15,  // Livrés
      F: 15,  // Non Livrés
      G: 19,  // Taux Livraison
      H: 19,  // Retours Récupérés
      I: 21,  // Retours Non Récupérés
      J: 17,  // Taux Récupération
      K: 14,  // Écart
      L: 22   // Performance
    };
    for (const [col, w] of Object.entries(colWidths)) {
      ws.column(col).width(w);
    }

    // Row 1: Header Banner
    ws.row(1).height(38);
    ws.range("A1:L1").merged(true).value("MARJANE MALL • SUIVI QUOTIDIEN DE LIVRAISON & CONTRÔLE DE CAISSE")
      .style({
        fill: "0F172A",
        fontColor: "FFFFFF",
        bold: true,
        fontSize: 14,
        fontFamily: "Segoe UI",
        horizontalAlignment: "center",
        verticalAlignment: "center"
      });

    // Row 2: Subtitle Metadata
    ws.row(2).height(20);
    ws.range("A2:L2").merged(true).value(
      `📅 Jour d'activité : ${dayFull} | 🛵 ${deliveryBoys.length} livreur(s) actif(s) | Export mis à jour automatiquement via GoFleet Enhancer`
    ).style({
      fill: "1E293B",
      fontColor: "94A3B8",
      italic: true,
      fontSize: 9.5,
      fontFamily: "Segoe UI",
      horizontalAlignment: "center",
      verticalAlignment: "center"
    });

    // Row 3: Spacer
    ws.row(3).height(8);

    // Rows 4-6: KPI Cards
    ws.row(4).height(20);
    ws.row(5).height(18);
    ws.row(6).height(18);

    const startRow = 9;
    const endRow = startRow + deliveryBoys.length - 1;

    function styleCard(colStart, colEnd, title, titleFill, titleColor, formulaOrVal, valColor, borderColor, isPct = false, isDate = false) {
      ws.range(colStart + "4:" + colEnd + "4").merged(true).value(title)
        .style({
          fill: titleFill,
          fontColor: titleColor,
          bold: true,
          fontSize: 8.5,
          fontFamily: "Segoe UI",
          horizontalAlignment: "center",
          verticalAlignment: "center",
          topBorder: "thin",
          leftBorder: "thin",
          rightBorder: "thin",
          bottomBorder: "none",
          borderColor: borderColor
        });
      const valRange = ws.range(colStart + "5:" + colEnd + "6").merged(true);
      if (typeof formulaOrVal === "string" && (formulaOrVal.startsWith("=") || formulaOrVal.includes("("))) {
        valRange.formula(formulaOrVal.startsWith("=") ? formulaOrVal.slice(1) : formulaOrVal);
      } else {
        valRange.value(formulaOrVal);
      }
      valRange.style({
        fill: "FFFFFF",
        fontColor: valColor,
        bold: true,
        fontSize: isDate ? 11 : 16,
        fontFamily: "Segoe UI",
        horizontalAlignment: "center",
        verticalAlignment: "center",
        bottomBorder: "thin",
        leftBorder: "thin",
        rightBorder: "thin",
        topBorder: "none",
        borderColor: borderColor,
        numberFormat: isDate ? "dddd dd/mm/yyyy" : (isPct ? "0.0%" : "#,##0")
      });
    }

    styleCard("A", "B", "📅 JOUR DE L'EXPORT", "F1F5F9", "334155", dayFull, "0F172A", "CBD5E1", false, true);
    styleCard("C", "D", "📦 TOTAL COLIS ASSIGNÉS", "F1F5F9", "475569", `SUM(D${startRow}:D${endRow})`, "0F172A", "CBD5E1");
    styleCard("E", "F", "✅ TOTAL COLIS LIVRÉS", "ECFDF5", "065F46", `SUM(E${startRow}:E${endRow})`, "059669", "A7F3D0");
    styleCard("G", "H", "❌ TOTAL NON LIVRÉS", "FFF1F2", "9F1239", `SUM(F${startRow}:F${endRow})`, "E11D48", "FECDD3");
    styleCard("I", "J", "🎯 TAUX LIVRAISON GLOBAL", "EFF6FF", "1E40AF", "IF(C5>0, E5/C5, 0)", "2563EB", "BFDBFE", true);
    styleCard("K", "L", "🔄 TAUX RÉCUPÉRATION RETOURS", "F0FDFA", "115E59", `IF((SUM(H${startRow}:H${endRow})+SUM(I${startRow}:I${endRow}))>0, SUM(H${startRow}:H${endRow})/(SUM(H${startRow}:H${endRow})+SUM(I${startRow}:I${endRow})), 1)`, "0D9488", "99F6E4", true);

    // Row 7: Spacer
    ws.row(7).height(10);

    // Row 8: Table Headers
    ws.row(8).height(28);
    const headers = [
      { col: "A", text: "N°" },
      { col: "B", text: "Date / Jour" },
      { col: "C", text: "Livreur / Tournée" },
      { col: "D", text: "Total Colis" },
      { col: "E", text: "Livrés" },
      { col: "F", text: "Non Livrés" },
      { col: "G", text: "Taux Livraison (%)" },
      { col: "H", text: "Retours Récupérés" },
      { col: "I", text: "Retours Non Récupérés" },
      { col: "J", text: "Taux Récup. (%)" },
      { col: "K", text: "Écart Colis" },
      { col: "L", text: "Statut Performance" },
    ];

    headers.forEach((h) => {
      ws.cell(h.col + "8").value(h.text).style({
        fill: "1E293B",
        fontColor: "FFFFFF",
        bold: true,
        fontSize: 9.5,
        fontFamily: "Segoe UI",
        horizontalAlignment: "center",
        verticalAlignment: "center",
        border: "thin",
        borderColor: "0F172A"
      });
    });

    deliveryBoys.forEach((entry, index) => {
      const r = startRow + index;
      ws.row(r).height(22);
      const bg = (index % 2 === 0) ? "FFFFFF" : "F8FAFC";

      ws.cell("A" + r).value(index + 1).style({ fill: bg, fontColor: "64748B", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
      ws.cell("B" + r).value(dayFull).style({ fill: bg, fontColor: "475569", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
      ws.cell("C" + r).value(entry.name).style({ fill: bg, fontColor: "1E293B", bold: true, horizontalAlignment: "left", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
      ws.cell("D" + r).value(Number(entry.totalColis) || 0).style({ fill: bg, fontColor: "0F172A", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0", numberFormat: "#,##0" });
      ws.cell("E" + r).value(Number(entry.livree) || 0).style({ fill: "F0FDF4", fontColor: "059669", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0", numberFormat: "#,##0" });
      ws.cell("F" + r).value(Number(entry.nonLivree) || 0).style({ fill: "FFF1F2", fontColor: "E11D48", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0", numberFormat: "#,##0" });
      ws.cell("G" + r).formula(`IF(D${r}>0, E${r}/D${r}, 0)`).style({ fill: bg, fontColor: "2563EB", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0", numberFormat: "0.0%" });
      ws.cell("H" + r).value(Number(entry.retourRecupere) || 0).style({ fill: bg, fontColor: "0D9488", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0", numberFormat: "#,##0" });
      ws.cell("I" + r).value(Number(entry.retourNonRecupere) || 0).style({ fill: bg, fontColor: "64748B", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0", numberFormat: "#,##0" });
      ws.cell("J" + r).formula(`IF((H${r}+I${r})>0, H${r}/(H${r}+I${r}), 1)`).style({ fill: bg, fontColor: "0D9488", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0", numberFormat: "0.0%" });
      ws.cell("K" + r).formula(`D${r}-(E${r}+F${r})`).style({ fill: bg, fontColor: "64748B", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
      ws.cell("L" + r).formula(`IF(D${r}=0, "-", IF(G${r}>=0.9, "⭐⭐⭐ Excellente", IF(G${r}>=0.8, "⭐⭐ Standard", "⚠️ À Surveiller")))`).style({ fill: bg, fontColor: "1E293B", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
    });

    // Total row
    const totalRow = endRow + 1;
    ws.row(totalRow).height(26);
    ws.range(`A${totalRow}:C${totalRow}`).merged(true).value(`TOTAL GÉNÉRAL (${deliveryBoys.length} livreurs)`)
      .style({ fill: "0F172A", fontColor: "FFFFFF", bold: true, fontSize: 10, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A" });
    ws.cell(`D${totalRow}`).formula(`SUM(D${startRow}:D${endRow})`).style({ fill: "0F172A", fontColor: "FFFFFF", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A", numberFormat: "#,##0" });
    ws.cell(`E${totalRow}`).formula(`SUM(E${startRow}:E${endRow})`).style({ fill: "0F172A", fontColor: "34D399", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A", numberFormat: "#,##0" });
    ws.cell(`F${totalRow}`).formula(`SUM(F${startRow}:F${endRow})`).style({ fill: "0F172A", fontColor: "F87171", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A", numberFormat: "#,##0" });
    ws.cell(`G${totalRow}`).formula(`IF(D${totalRow}>0, E${totalRow}/D${totalRow}, 0)`).style({ fill: "0F172A", fontColor: "60A5FA", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A", numberFormat: "0.0%" });
    ws.cell(`H${totalRow}`).formula(`SUM(H${startRow}:H${endRow})`).style({ fill: "0F172A", fontColor: "2DD4BF", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A", numberFormat: "#,##0" });
    ws.cell(`I${totalRow}`).formula(`SUM(I${startRow}:I${endRow})`).style({ fill: "0F172A", fontColor: "CBD5E1", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A", numberFormat: "#,##0" });
    ws.cell(`J${totalRow}`).formula(`IF((H${totalRow}+I${totalRow})>0, H${totalRow}/(H${totalRow}+I${totalRow}), 1)`).style({ fill: "0F172A", fontColor: "2DD4BF", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A", numberFormat: "0.0%" });
    ws.cell(`K${totalRow}`).formula(`D${totalRow}-(E${totalRow}+F${totalRow})`).style({ fill: "0F172A", fontColor: "FFFFFF", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A" });
    ws.cell(`L${totalRow}`).formula(`IF(D${totalRow}=0, "-", IF(G${totalRow}>=0.9, "⭐⭐⭐ Excellente", IF(G${totalRow}>=0.8, "⭐⭐ Standard", "⚠️ À Surveiller")))`).style({ fill: "0F172A", fontColor: "FCD34D", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A" });

    const blob = await wb.outputAsync("blob");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `EXPORT_LIVREURS_${dayName.toUpperCase()}_${dateIso}.xlsx`;
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
        files: ["xlsx-populate.min.js", "xlsx.full.min.js", "content.js"],
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

  // --- Module Export Colis Non Livrés (Par Livreur & Analytique) ---
  function sanitizeExcelSheetName(name, existingSet = new Set()) {
    if (!name || typeof name !== "string") name = "Livreur";
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

  async function buildSleekNonDeliveredWorkbook(map) {
    const riderNames = Object.keys(map || {});
    if (riderNames.length === 0) {
      alert("Aucun colis non livré (annulé ou refusé) n'a été trouvé.");
      return { success: false };
    }

    // 1. Gather all parcels & compute analytics
    let totalParcelsCount = 0;
    let totalCRBT = 0;
    const motifCounts = {};
    const statusCounts = {};
    const riderStats = [];

    riderNames.forEach((name) => {
      const r = map[name] || {};
      const parcels = r.parcels || [];
      totalParcelsCount += parcels.length;
      let rAmount = 0;
      const rMotifs = {};

      parcels.forEach((p) => {
        const priceVal =
          parseFloat(
            String(p.prix || "")
              .replace(/[^0-9.,]/g, "")
              .replace(",", ".")
          ) || 0;
        totalCRBT += priceVal;
        rAmount += priceVal;

        const motif = (p.raisonAnnulation || "Non spécifié").trim();
        if (!motifCounts[motif]) motifCounts[motif] = { count: 0, amount: 0 };
        motifCounts[motif].count++;
        motifCounts[motif].amount += priceVal;

        rMotifs[motif] = (rMotifs[motif] || 0) + 1;

        const stat = (p.statut || "Non livré").trim();
        if (!statusCounts[stat]) statusCounts[stat] = { count: 0, amount: 0 };
        statusCounts[stat].count++;
        statusCounts[stat].amount += priceVal;
      });

      let topRiderMotif = "-";
      let maxRM = 0;
      for (const [m, c] of Object.entries(rMotifs)) {
        if (c > maxRM) {
          maxRM = c;
          topRiderMotif = m;
        }
      }

      riderStats.push({
        livreur: name,
        tourneeId: r.tourneeId || "N/A",
        date: r.date || "",
        count: parcels.length,
        amount: rAmount,
        topMotif: topRiderMotif,
        parcels: parcels,
      });
    });

    if (totalParcelsCount === 0) {
      alert("Tous les colis trouvés sont marqués comme livrés. Aucun colis en échec/annulé/refusé à exporter.");
      return { success: false };
    }

    // Top overall motif
    let topMotif = "Aucun";
    let maxCount = 0;
    for (const [m, data] of Object.entries(motifCounts)) {
      if (data.count > maxCount) {
        maxCount = data.count;
        topMotif = m;
      }
    }
    const topMotifPct = totalParcelsCount > 0 ? ((maxCount / totalParcelsCount) * 100).toFixed(1) : 0;
    const today = new Date();
    const dateFormatted = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;
    const dateFile = `${String(today.getDate()).padStart(2, "0")}-${String(today.getMonth() + 1).padStart(2, "0")}-${today.getFullYear()}`;

    // A) XlsxPopulate Rich Modern Export
    if (typeof XlsxPopulate !== "undefined") {
      const wb = await XlsxPopulate.fromBlankAsync();

      // === SHEET 1: DASHBOARD ANALYTICS ===
      const wsDash = wb.sheet(0);
      wsDash.name("TABLEAU_DE_BORD");
      wsDash.gridLinesVisible(true);

      const dashWidths = { A: 6, B: 34, C: 15, D: 15, E: 20, F: 15, G: 38 };
      for (const [c, w] of Object.entries(dashWidths)) {
        wsDash.column(c).width(w);
      }

      // Row 1: Header Banner
      wsDash.row(1).height(38);
      wsDash.range("A1:G1").merged(true).value("GOFLEET • TABLEAU DE BORD ANALYTIQUE DES COLIS NON LIVRÉS")
        .style({
          fill: "0F172A",
          fontColor: "FFFFFF",
          bold: true,
          fontSize: 13.5,
          fontFamily: "Segoe UI",
          horizontalAlignment: "center",
          verticalAlignment: "center",
        });

      // Row 2: Subtitle
      wsDash.row(2).height(20);
      wsDash.range("A2:G2").merged(true).value(
        `📅 Date d'analyse : ${dateFormatted} | 🛵 ${riderNames.length} tournée(s) analysée(s) | 📦 ${totalParcelsCount} colis non livrés répertoriés`
      ).style({
        fill: "1E293B",
        fontColor: "94A3B8",
        italic: true,
        fontSize: 9.5,
        fontFamily: "Segoe UI",
        horizontalAlignment: "center",
        verticalAlignment: "center",
      });

      // Row 3: Spacer
      wsDash.row(3).height(8);

      // Rows 4-6: KPI Cards
      wsDash.row(4).height(18);
      wsDash.row(5).height(18);
      wsDash.row(6).height(18);

      function createCard(c1, c2, title, tFill, tColor, valText, vColor, bColor) {
        wsDash.range(`${c1}4:${c2}4`).merged(true).value(title).style({
          fill: tFill,
          fontColor: tColor,
          bold: true,
          fontSize: 8.5,
          fontFamily: "Segoe UI",
          horizontalAlignment: "center",
          verticalAlignment: "center",
          topBorder: "thin",
          leftBorder: "thin",
          rightBorder: "thin",
          bottomBorder: "none",
          borderColor: bColor,
        });
        wsDash.range(`${c1}5:${c2}6`).merged(true).value(valText).style({
          fill: "FFFFFF",
          fontColor: vColor,
          bold: true,
          fontSize: 16,
          fontFamily: "Segoe UI",
          horizontalAlignment: "center",
          verticalAlignment: "center",
          bottomBorder: "thin",
          leftBorder: "thin",
          rightBorder: "thin",
          topBorder: "none",
          borderColor: bColor,
        });
      }

      createCard("A", "B", "🔴 TOTAL COLIS NON LIVRÉS", "FFF1F2", "9F1239", `${totalParcelsCount} Colis`, "E11D48", "FECDD3");
      createCard("C", "D", "💰 VALEUR TOTALE CRBT (DH)", "ECFDF5", "065F46", `${totalCRBT.toFixed(2)} DH`, "059669", "A7F3D0");
      createCard("E", "E", "🛵 TOURNÉES LIVREURS", "F0FDFA", "115E59", `${riderNames.length} Livreurs`, "0D9488", "99F6E4");
      createCard("F", "G", "⚠️ PRINCIPAL MOTIF D'ÉCHEC", "EFF6FF", "1E40AF", `${topMotif} (${topMotifPct}%)`, "2563EB", "BFDBFE");

      // Row 7: Spacer
      wsDash.row(7).height(12);

      // Section 1 Header: Motifs
      let curRow = 8;
      wsDash.row(curRow).height(24);
      wsDash.range(`A${curRow}:G${curRow}`).merged(true).value("🔍 RÉPARTITION DES ÉCHECS PAR MOTIF / CAUSE RACINE")
        .style({
          fill: "334155",
          fontColor: "FFFFFF",
          bold: true,
          fontSize: 10,
          fontFamily: "Segoe UI",
          horizontalAlignment: "left",
          verticalAlignment: "center",
          indent: 1,
        });

      curRow++;
      wsDash.row(curRow).height(24);
      const motifHeaders = ["N°", "Motif / Raison d'Échec", "Nb Colis", "% Volume", "Montant CRBT", "% Valeur", "Action Recommandée (Dispatch / Caisse)"];
      const motifCols = ["A", "B", "C", "D", "E", "F", "G"];
      motifHeaders.forEach((h, idx) => {
        wsDash.cell(`${motifCols[idx]}${curRow}`).value(h).style({
          fill: "1E293B",
          fontColor: "FFFFFF",
          bold: true,
          fontSize: 9,
          fontFamily: "Segoe UI",
          horizontalAlignment: "center",
          verticalAlignment: "center",
          border: "thin",
          borderColor: "0F172A",
        });
      });

      const sortedMotifs = Object.entries(motifCounts).sort((a, b) => b[1].count - a[1].count);
      const startMotifRow = curRow + 1;

      sortedMotifs.forEach(([motif, data], idx) => {
        curRow++;
        wsDash.row(curRow).height(21);
        const bg = idx % 2 === 0 ? "FFFFFF" : "F8FAFC";
        const pctVol = totalParcelsCount > 0 ? (data.count / totalParcelsCount) : 0;
        const pctVal = totalCRBT > 0 ? (data.amount / totalCRBT) : 0;

        let action = "⚠️ Vérifier avec livreur";
        const lm = motif.toLowerCase();
        if (lm.includes("injoignable") || lm.includes("répond")) action = "📞 Relance Téléphone / SMS client";
        else if (lm.includes("absent") || lm.includes("pas chez")) action = "🔄 Reprogrammer livraison J+1";
        else if (lm.includes("refus") || lm.includes("prix") || lm.includes("cher")) action = "📦 Retour immédiat au Hub (Contrôle stock)";
        else if (lm.includes("report") || lm.includes("demande") || lm.includes("date")) action = "📅 Reprogrammer à la date convenue";
        else if (lm.includes("adresse") || lm.includes("incompl") || lm.includes("trouv")) action = "📍 Valider localisation avec client";
        else if (lm.includes("annul")) action = "❌ Annulation définitive (Retour stock Hub)";

        wsDash.cell(`A${curRow}`).value(idx + 1).style({ fill: bg, fontColor: "64748B", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
        wsDash.cell(`B${curRow}`).value(motif).style({ fill: bg, fontColor: "0F172A", bold: true, horizontalAlignment: "left", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
        wsDash.cell(`C${curRow}`).value(data.count).style({ fill: bg, fontColor: "E11D48", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0", numberFormat: "#,##0" });
        wsDash.cell(`D${curRow}`).value(pctVol).style({ fill: bg, fontColor: "2563EB", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0", numberFormat: "0.0%" });
        wsDash.cell(`E${curRow}`).value(data.amount).style({ fill: bg, fontColor: "059669", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0", numberFormat: '#,##0.00 "DH"' });
        wsDash.cell(`F${curRow}`).value(pctVal).style({ fill: bg, fontColor: "64748B", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0", numberFormat: "0.0%" });
        wsDash.cell(`G${curRow}`).value(action).style({ fill: bg, fontColor: "334155", italic: true, horizontalAlignment: "left", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
      });

      // Totals Motifs Row
      curRow++;
      wsDash.row(curRow).height(24);
      wsDash.range(`A${curRow}:B${curRow}`).merged(true).value("TOTAL MOTIFS").style({ fill: "0F172A", fontColor: "FFFFFF", bold: true, fontSize: 9.5, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A" });
      wsDash.cell(`C${curRow}`).formula(`SUM(C${startMotifRow}:C${curRow - 1})`).style({ fill: "0F172A", fontColor: "F87171", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A", numberFormat: "#,##0" });
      wsDash.cell(`D${curRow}`).value(1).style({ fill: "0F172A", fontColor: "60A5FA", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A", numberFormat: "0.0%" });
      wsDash.cell(`E${curRow}`).formula(`SUM(E${startMotifRow}:E${curRow - 1})`).style({ fill: "0F172A", fontColor: "34D399", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A", numberFormat: '#,##0.00 "DH"' });
      wsDash.cell(`F${curRow}`).value(1).style({ fill: "0F172A", fontColor: "CBD5E1", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A", numberFormat: "0.0%" });
      wsDash.cell(`G${curRow}`).value("-").style({ fill: "0F172A", fontColor: "94A3B8", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A" });

      // Section 2: Synthèse par Livreur
      curRow += 2;
      wsDash.row(curRow).height(24);
      wsDash.range(`A${curRow}:G${curRow}`).merged(true).value("🛵 SYNTHÈSE & RÉCAPITULATIF PAR LIVREUR")
        .style({ fill: "334155", fontColor: "FFFFFF", bold: true, fontSize: 10, fontFamily: "Segoe UI", horizontalAlignment: "left", verticalAlignment: "center", indent: 1 });

      curRow++;
      wsDash.row(curRow).height(24);
      const riderHeaders = ["N°", "Nom Livreur", "N° Tournée", "Colis Échoués", "Valeur CRBT", "Motif Dominant", "Statut Tournée"];
      riderHeaders.forEach((h, idx) => {
        wsDash.cell(`${motifCols[idx]}${curRow}`).value(h).style({ fill: "1E293B", fontColor: "FFFFFF", bold: true, fontSize: 9, fontFamily: "Segoe UI", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A" });
      });

      const startRiderRow = curRow + 1;
      riderStats.forEach((r, idx) => {
        curRow++;
        wsDash.row(curRow).height(21);
        const bg = idx % 2 === 0 ? "FFFFFF" : "F8FAFC";
        const statusLabel = r.count > 0 ? `⚠️ ${r.count} non livrés` : "✅ 100% Livré";

        wsDash.cell(`A${curRow}`).value(idx + 1).style({ fill: bg, fontColor: "64748B", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
        wsDash.cell(`B${curRow}`).value(r.livreur).style({ fill: bg, fontColor: "0F172A", bold: true, horizontalAlignment: "left", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
        wsDash.cell(`C${curRow}`).value(r.tourneeId).style({ fill: bg, fontColor: "334155", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
        wsDash.cell(`D${curRow}`).value(r.count).style({ fill: bg, fontColor: "E11D48", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0", numberFormat: "#,##0" });
        wsDash.cell(`E${curRow}`).value(r.amount).style({ fill: bg, fontColor: "059669", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0", numberFormat: '#,##0.00 "DH"' });
        wsDash.cell(`F${curRow}`).value(r.topMotif).style({ fill: bg, fontColor: "2563EB", italic: true, horizontalAlignment: "left", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
        wsDash.cell(`G${curRow}`).value(statusLabel).style({ fill: bg, fontColor: "9F1239", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
      });

      // Rider Total
      curRow++;
      wsDash.row(curRow).height(24);
      wsDash.range(`A${curRow}:C${curRow}`).merged(true).value("TOTAL GÉNÉRAL LIVREURS").style({ fill: "0F172A", fontColor: "FFFFFF", bold: true, fontSize: 9.5, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A" });
      wsDash.cell(`D${curRow}`).formula(`SUM(D${startRiderRow}:D${curRow - 1})`).style({ fill: "0F172A", fontColor: "F87171", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A", numberFormat: "#,##0" });
      wsDash.cell(`E${curRow}`).formula(`SUM(E${startRiderRow}:E${curRow - 1})`).style({ fill: "0F172A", fontColor: "34D399", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A", numberFormat: '#,##0.00 "DH"' });
      wsDash.range(`F${curRow}:G${curRow}`).merged(true).value("-").style({ fill: "0F172A", fontColor: "94A3B8", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A" });

      // === SHEETS 2..N: INDIVIDUAL RIDER SHEETS ===
      const existingSheets = new Set(["tableau_de_bord"]);

      riderNames.forEach((riderName) => {
        const rData = map[riderName] || {};
        const parcels = rData.parcels || [];

        let cleanName = (riderName || "Livreur").replace(/[\\/?*[\]:]/g, "_").trim();
        if (cleanName.length > 28) cleanName = cleanName.substring(0, 28).trim();
        let safeName = cleanName || "Livreur";
        let c = 1;
        while (existingSheets.has(safeName.toLowerCase())) {
          safeName = `${cleanName.substring(0, 25)}_${c++}`;
        }
        existingSheets.add(safeName.toLowerCase());

        const wsRider = wb.addSheet(safeName);
        wsRider.gridLinesVisible(true);

        const rCols = { A: 6, B: 24, C: 16, D: 32, E: 18, F: 26, G: 18, H: 40, I: 15, J: 14 };
        for (const [col, w] of Object.entries(rCols)) {
          wsRider.column(col).width(w);
        }

        let rAmount = 0;
        parcels.forEach((p) => {
          rAmount += parseFloat(String(p.prix || "").replace(/[^0-9.,]/g, "").replace(",", ".")) || 0;
        });

        // Banner
        wsRider.row(1).height(34);
        wsRider.range("A1:J1").merged(true).value(`TOURNÉE LIVREUR : ${riderName.toUpperCase()}`)
          .style({ fill: "0D9488", fontColor: "FFFFFF", bold: true, fontSize: 13, fontFamily: "Segoe UI", horizontalAlignment: "center", verticalAlignment: "center" });

        wsRider.row(2).height(20);
        wsRider.range("A2:J2").merged(true).value(
          `N° Tournée : ${rData.tourneeId || "N/A"} | Date : ${rData.date || ""} | Colis Non Livrés : ${parcels.length} | Montant CRBT : ${rAmount.toFixed(2)} DH`
        ).style({ fill: "1E293B", fontColor: "94A3B8", italic: true, fontSize: 9.5, fontFamily: "Segoe UI", horizontalAlignment: "center", verticalAlignment: "center" });

        wsRider.row(3).height(8);

        // Table headers
        wsRider.row(4).height(26);
        const rHeaders = ["N°", "Code Colis / Tracking", "Statut Colis", "Motif / Raison d'Échec", "Montant CRBT", "Client Destinataire", "Téléphone", "Adresse de Livraison", "N° Tournée", "Date"];
        const rColKeys = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
        rHeaders.forEach((h, i) => {
          wsRider.cell(`${rColKeys[i]}4`).value(h).style({ fill: "1E293B", fontColor: "FFFFFF", bold: true, fontSize: 9.5, fontFamily: "Segoe UI", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A" });
        });

        if (parcels.length > 0) {
          parcels.forEach((p, idx) => {
            const r = 5 + idx;
            wsRider.row(r).height(21);
            const bg = idx % 2 === 0 ? "FFFFFF" : "F8FAFC";
            const priceVal = parseFloat(String(p.prix || "").replace(/[^0-9.,]/g, "").replace(",", ".")) || 0;
            const isRefused = (p.statut || "").toLowerCase().includes("refus");

            wsRider.cell(`A${r}`).value(idx + 1).style({ fill: bg, fontColor: "64748B", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
            wsRider.cell(`B${r}`).value(p.colis || "-").style({ fill: bg, fontColor: "0F172A", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
            wsRider.cell(`C${r}`).value(p.statut || "Non livré").style({ fill: bg, fontColor: isRefused ? "E11D48" : "2563EB", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
            wsRider.cell(`D${r}`).value(p.raisonAnnulation || "-").style({ fill: bg, fontColor: "334155", horizontalAlignment: "left", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
            wsRider.cell(`E${r}`).value(priceVal).style({ fill: bg, fontColor: "059669", bold: true, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0", numberFormat: '#,##0.00 "DH"' });
            wsRider.cell(`F${r}`).value(p.client || "-").style({ fill: bg, fontColor: "1E293B", horizontalAlignment: "left", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
            wsRider.cell(`G${r}`).value(p.telephone || "-").style({ fill: bg, fontColor: "0284C7", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
            wsRider.cell(`H${r}`).value(p.adresse || "-").style({ fill: bg, fontColor: "475569", horizontalAlignment: "left", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
            wsRider.cell(`I${r}`).value(p.tourneeId || rData.tourneeId || "-").style({ fill: bg, fontColor: "64748B", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
            wsRider.cell(`J${r}`).value(p.date || rData.date || "").style({ fill: bg, fontColor: "64748B", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "E2E8F0" });
          });

          const totRow = 5 + parcels.length;
          wsRider.row(totRow).height(25);
          wsRider.range(`A${totRow}:D${totRow}`).merged(true).value(`TOTAL : ${parcels.length} COLIS NON LIVRÉS`)
            .style({ fill: "0F172A", fontColor: "FFFFFF", bold: true, fontSize: 9.5, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A" });
          wsRider.cell(`E${totRow}`).formula(`SUM(E5:E${totRow - 1})`)
            .style({ fill: "0F172A", fontColor: "34D399", bold: true, fontSize: 10, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A", numberFormat: '#,##0.00 "DH"' });
          wsRider.range(`F${totRow}:J${totRow}`).merged(true).value("-")
            .style({ fill: "0F172A", fontColor: "94A3B8", horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "0F172A" });
        } else {
          wsRider.row(5).height(22);
          wsRider.range("A5:J5").merged(true).value("✅ Tous les colis de cette tournée ont été livrés avec succès (0 échec).")
            .style({ fill: "F0FDF4", fontColor: "059669", bold: true, fontSize: 10, horizontalAlignment: "center", verticalAlignment: "center", border: "thin", borderColor: "A7F3D0" });
        }
      });

      const blob = await wb.outputAsync("blob");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const filename = riderNames.length === 1
        ? `COLIS_NON_LIVRES_${riderNames[0].replace(/\s+/g, "_")}_${dateFile}.xlsx`
        : `COLIS_NON_LIVRES_${riderNames.length}_LIVREURS_${dateFile}.xlsx`;

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 150);
      return { success: true, count: totalParcelsCount, filename, totalCRBT, totalRiders: riderNames.length };
    } else {
      // B) SheetJS Fallback
      const wb = XLSX.utils.book_new();
      const existingSheets = new Set();

      const summaryRows = [];
      sortedMotifs.forEach(([m, d]) => {
        summaryRows.push({
          "Catégorie": "Motif d'Échec",
          "Libellé": m,
          "Nb Colis": d.count,
          "% Volume": `${((d.count / totalParcelsCount) * 100).toFixed(1)}%`,
          "Valeur CRBT": `${d.amount.toFixed(2)} DH`,
        });
      });
      riderStats.forEach((r) => {
        summaryRows.push({
          "Catégorie": "Livreur",
          "Libellé": `${r.livreur} (Tournée ${r.tourneeId})`,
          "Nb Colis": r.count,
          "% Volume": `${((r.count / totalParcelsCount) * 100).toFixed(1)}%`,
          "Valeur CRBT": `${r.amount.toFixed(2)} DH`,
        });
      });

      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      wsSummary["!cols"] = [{ wch: 18 }, { wch: 36 }, { wch: 12 }, { wch: 14 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, "TABLEAU_DE_BORD");
      existingSheets.add("tableau_de_bord");

      riderNames.forEach((riderName) => {
        const rData = map[riderName] || {};
        const parcels = rData.parcels || [];
        const sheetData = parcels.map((item, idx) => ({
          "N°": idx + 1,
          "Colis": item.colis || "",
          "Statut": item.statut || "Non livré",
          "Motif / Raison": item.raisonAnnulation || "-",
          "Montant CRBT": item.prix || "-",
          "Destinataire": item.client || "-",
          "Téléphone": item.telephone || "-",
          "Adresse": item.adresse || "-",
          "N° Tournée": item.tourneeId || rData.tourneeId || "-",
          "Date": item.date || rData.date || "",
          "Livreur": riderName,
        }));
        const ws = XLSX.utils.json_to_sheet(sheetData);
        ws["!cols"] = [{ wch: 6 }, { wch: 22 }, { wch: 16 }, { wch: 30 }, { wch: 16 }, { wch: 26 }, { wch: 18 }, { wch: 38 }, { wch: 14 }, { wch: 14 }, { wch: 24 }];

        const safeSheetName = sanitizeExcelSheetName(riderName, existingSheets);
        XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
      });

      const wbArrayBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const filename = riderNames.length === 1
        ? `COLIS_NON_LIVRES_${riderNames[0].replace(/\s+/g, "_")}_${dateFile}.xlsx`
        : `COLIS_NON_LIVRES_${riderNames.length}_LIVREURS_${dateFile}.xlsx`;

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 150);
      return { success: true, count: totalParcelsCount, filename, totalCRBT, totalRiders: riderNames.length };
    }
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
      const originalHtml = exportNonDeliveredBtn.innerHTML;
      try {
        exportNonDeliveredBtn.disabled = true;
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
            return;
          }
        }

        // Rafraîchir le badge du compteur
        updateNonDeliveredBadge();

        // 2. Read all accumulated non-delivered parcels from storage
        const { gofleet_non_delivered_by_rider = {} } = await chrome.storage.local.get(
          "gofleet_non_delivered_by_rider"
        );

        const res = await buildSleekNonDeliveredWorkbook(gofleet_non_delivered_by_rider);
        if (res && res.success) {
          updateNonDeliveredBadge();
          alert(
            `✅ Export Analytique Excel Réussi !\n\n` +
            `• Colis Non Livrés : ${res.count}\n` +
            `• Valeur CRBT en Risque : ${res.totalCRBT.toFixed(2)} DH\n` +
            `• Tournées / Livreurs : ${res.totalRiders}\n` +
            `• Fichier : ${res.filename}\n\n` +
            `📊 Tableau de bord analytique généré avec répartition par motif d'échec, actions recommandées et onglets individuels par livreur.`
          );
        }
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
