function formatDate(date = new Date()) {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

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

        // Function to fill a given sheet
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

        // Iterate through cities
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

        await chrome.storage.local.remove(
            cities.map((c) => `expeditions_${c}`)
        );

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
    document.getElementById("printRetour").addEventListener("click", async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        chrome.tabs.sendMessage(tab.id, { action: "printRetourIframes" });
    });

    document.getElementById("exportEchecCasa").addEventListener("click", async () => {
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
            betweenExpeditionDelay: 5000 // Delay between processing expeditions
        };

        // Enhanced navigation with timeout and retry
        async function navigateWithRetry(url, maxAttempts = config.maxRetries) {
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    await chrome.tabs.update(tab.id, { url });

                    // Wait for page to load with timeout
                    await new Promise((resolve, reject) => {
                        const timeout = setTimeout(() => reject(new Error(`Navigation timeout for ${url}`)), config.navigationTimeout);

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
                    await new Promise(r => setTimeout(r, config.dataCollectionDelay));
                    return true;

                } catch (error) {
                    console.warn(`Navigation attempt ${attempt} failed:`, error);
                    if (attempt === maxAttempts) throw error;
                    await new Promise(r => setTimeout(r, attempt * config.retryDelay));
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
                        console.log(`Successfully collected ${colisData.colisList.length} items from palette ${palette.number}`);
                        break;
                    } else {
                        throw new Error("Empty or invalid colis data");
                    }
                } catch (error) {
                    console.warn(`Attempt ${attempt} failed for palette ${palette.number}:`, error);
                    if (attempt === config.maxRetries) throw error;
                    await new Promise(r => setTimeout(r, attempt * config.retryDelay));
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
                    "en cours d'expedition mm"
                ];

                const validExpeditions = initialData.expeditions.filter(exp => {
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
                    throw new Error(total > 0 ?
                        `${total} expeditions found, none with required status` :
                        "No expeditions found in the list");
                }

                console.log(`Found ${validExpeditions.length} valid expeditions to process`);

                // --- PROCESS EACH EXPEDITION ---
                const processedExpeditions = [];
                let processedCount = 0;

                for (const expedition of validExpeditions) {
                    try {
                        console.log(`Processing expedition ${processedCount + 1}/${validExpeditions.length}: ${expedition.number}`);

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

                                console.log(`Completed palette ${palette.number} with ${colisList.length} colis`);
                            } catch (error) {
                                console.error(`Failed to process palette ${palette.number}:`, error);
                                processedPalettes.push({
                                    ...palette,
                                    error: error.message,
                                    colis: [],
                                    colisCount: 0
                                });
                            }
                        }

                        processedExpeditions.push({
                            ...expedition,
                            tourneeNumber: detailData.tourneeNumber,
                            plombNumber: detailData.plombNumber,
                            palettes: processedPalettes,
                            processedAt: new Date().toISOString()
                        });

                        processedCount++;

                        // Return to list page between expeditions
                        await navigateWithRetry(originalUrl);

                        // Add delay between expeditions
                        if (processedCount < validExpeditions.length) {
                            await new Promise(r => setTimeout(r, config.betweenExpeditionDelay));
                        }

                    } catch (error) {
                        console.error(`Failed to process expedition ${expedition.number}:`, error);
                        processedExpeditions.push({
                            ...expedition,
                            error: error.message,
                            palettes: []
                        });
                    }
                }

                // --- FINALIZE PROCESSING ---
                console.log("Processing complete, saving results...");
                await chrome.storage.local.set({
                    expeditions: processedExpeditions,
                    lastExport: new Date().toISOString()
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

    document.getElementById("exportEchecHorsCasa").addEventListener("click", async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const { city } = await chrome.tabs.sendMessage(tab.id, { action: "detectCity" });

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
            betweenExpeditionDelay: 5000
        };

        async function navigateWithRetry(url, maxAttempts = config.maxRetries) {
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    await chrome.tabs.update(tab.id, { url });
                    await new Promise((resolve, reject) => {
                        const timeout = setTimeout(() => reject(new Error(`Navigation timeout for ${url}`)), config.navigationTimeout);
                        const checkComplete = async () => {
                            const newUrl = (await chrome.tabs.get(tab.id)).url;
                            if (newUrl === url) {
                                clearTimeout(timeout);
                                resolve();
                            }
                        };
                        const interval = setInterval(checkComplete, 500);
                    });
                    await new Promise(r => setTimeout(r, config.dataCollectionDelay));
                    return true;
                } catch (error) {
                    console.warn(`Navigation attempt ${attempt} failed:`, error);
                    if (attempt === maxAttempts) throw error;
                    await new Promise(r => setTimeout(r, attempt * config.retryDelay));
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
                    console.warn(`Attempt ${attempt} failed for palette ${palette.number}:`, error);
                    if (attempt === config.maxRetries) throw error;
                    await new Promise(r => setTimeout(r, attempt * config.retryDelay));
                }
            }

            await navigateWithRetry(expedition.link);
            return colisData.colisList;
        }

        async function runExportLogic(tab, city) {
            const initialData = await chrome.tabs.sendMessage(tab.id, { action: "collectFullExpeditionData" });

            if (!initialData?.expeditions) throw new Error("No expedition data found on the initial page");

            const allowedStatuses = ["en cours de creation", "en cours d'expedition mm"];
            const validExpeditions = initialData.expeditions.filter(exp => {
                const cleanedStatus = exp.status.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[’‘`´]/g, "'").toLowerCase().trim();
                return allowedStatuses.includes(cleanedStatus);
            });

            const processedExpeditions = [];
            for (const expedition of validExpeditions) {
                try {
                    await navigateWithRetry(expedition.link);
                    const detailData = await chrome.tabs.sendMessage(tab.id, { action: "collectFullExpeditionData" });
                    const processedPalettes = [];

                    for (const palette of detailData.palettes || []) {
                        try {
                            const colisList = await processPalette(palette, expedition);
                            processedPalettes.push({ ...palette, colis: colisList, colisCount: colisList.length });
                        } catch (error) {
                            processedPalettes.push({ ...palette, error: error.message, colis: [], colisCount: 0 });
                        }
                    }

                    processedExpeditions.push({
                        ...expedition,
                        tourneeNumber: detailData.tourneeNumber,
                        plombNumber: detailData.plombNumber,
                        palettes: processedPalettes,
                    });

                    await navigateWithRetry(originalUrl);
                    await new Promise(r => setTimeout(r, config.betweenExpeditionDelay));

                } catch (error) {
                    console.error(`Failed to process expedition ${expedition.number}:`, error);
                    processedExpeditions.push({ ...expedition, error: error.message, palettes: [] });
                }
            }

            return processedExpeditions;
        }

        const collectedData = await runExportLogic(tab, city);
        const storageKey = `expeditions_${city}`;
        await chrome.storage.local.set({ [storageKey]: collectedData });

        const keys = await chrome.storage.local.get([
            "expeditions_tanger", "expeditions_meknes", "expeditions_fes", "expeditions_rabat"
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
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();

        return `${day}-${month}-${year}`
    }

    document.getElementById('exportRefused').addEventListener('click', async () => {
        try {
            // Get all refused colis from storage
            const { refusedColis = [] } = await chrome.storage.local.get({ refusedColis: [] });

            // Prepare data for export
            const cleanData = refusedColis.map(item => ({
                Date: item.date,
                Colis: item.colis,
                "Raison Annulation": item.raisonAnnulation,
                Livreur: item.livreur,
                Description: ""
            }));

            // Create workbook
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(cleanData);

            // Set column widths
            const colWidths = [
                { wch: 15 },  // Date
                { wch: 25 },  // Colis
                { wch: 35 },  // Raison Annulation
                { wch: 30 },  // Livreur
                { wch: 20 }   // Description
            ];
            ws['!cols'] = colWidths;

            // Style headers
            const headerStyle = {
                font: { bold: true, color: { rgb: "FFFFFF" } },
                fill: { fgColor: { rgb: "4A6CF7" } },
                alignment: { horizontal: "center" }
            };

            // Add headers
            const headerRow = ["Date", "Colis", "Raison Annulation", "Livreur", "Description"];
            XLSX.utils.sheet_add_aoa(ws, [headerRow], { origin: "A1" });

            // Apply header styles
            for (let col = 0; col < headerRow.length; col++) {
                const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
                if (!ws[cellRef]) ws[cellRef] = {};
                if (!ws[cellRef].s) ws[cellRef].s = {};
                Object.assign(ws[cellRef].s, headerStyle);
            }

            // Add worksheet to workbook
            XLSX.utils.book_append_sheet(wb, ws, "Colis Refusés");

            // Generate filename with today's date
            const dateString = formatDateForFilename();
            XLSX.writeFile(wb, `Colis_refusés_${dateString}.xlsx`);

            await chrome.storage.local.remove('refusedColis');

            // Success notification
            console.log(`Exportation réussie: ${refusedColis.length} colis refusés exportés pour aujourd'hui`);
        } catch (error) {
            console.error('Export échoué:', error);
            alert(`Erreur: ${error.message}`);
        }
    });
})