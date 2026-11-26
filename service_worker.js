let expeditionData = [];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "EXPEDITIONS_DATA") {
    expeditionData = message.data;
  }

  if (message.type === "GET_EXPEDITIONS") {
    sendResponse({ data: expeditionData });
  }
});

// Track current tab ID for data extraction
let currentTabId = null;

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    tab.url.toLowerCase().includes("traitementlivreurexcute")
  ) {
    currentTabId = tabId;
  }
});

chrome.runtime.onMessage.addListener((request, sender) => {
  if (request.action === "storeRefusedColis") {
    chrome.storage.local.get({ refusedColis: [] }, (result) => {
      const filteredData = request.data.filter(
        (item) =>
          item.colis &&
          ["GOF", "GMK", "GFS", "GTG", "GRB"].some((prefix) =>
            item.colis.startsWith(prefix)
          )
      );

      const existingColisNumbers = new Set(
        result.refusedColis.map((item) => item.colis)
      );
      const uniqueNewData = filteredData.filter(
        (item) => !existingColisNumbers.has(item.colis)
      );

      if (uniqueNewData.length > 0) {
        const updatedData = [...result.refusedColis, ...uniqueNewData];
        chrome.storage.local.set({ refusedColis: updatedData });
      }
    });
  }

  if (request.action === "storeNonDeliveredParcels" && request.data) {
    chrome.storage.local.get(
      { gofleet_non_delivered_by_rider: {}, gofleet_non_delivered_history: {} },
      (result) => {
        const currentMap = result.gofleet_non_delivered_by_rider || {};
        const historyMap = result.gofleet_non_delivered_history || {};
        const { livreur, tourneeId, date, parcels } = request.data;
        if (!livreur || !Array.isArray(parcels)) return;

        const isoMatch = String(date || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        const dateIso = isoMatch
          ? `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`
          : /^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))
            ? String(date)
            : new Date().toISOString().split("T")[0];

        const mergeRider = (existingEntry) => {
          const existingData = existingEntry || {
            livreur,
            tourneeId,
            date,
            parcels: [],
          };
          const parcelsMap = new Map();
          (existingData.parcels || []).forEach((p) => {
            if (p && p.colis) parcelsMap.set(p.colis.toUpperCase(), p);
          });
          parcels.forEach((p) => {
            if (p && p.colis) {
              const key = p.colis.toUpperCase();
              parcelsMap.set(key, { ...parcelsMap.get(key), ...p });
            }
          });
          return {
            livreur,
            tourneeId: tourneeId || existingData.tourneeId || "N/A",
            date: date || existingData.date || "",
            dateIso,
            lastUpdated: new Date().toISOString(),
            parcels: Array.from(parcelsMap.values()),
          };
        };

        currentMap[livreur] = mergeRider(currentMap[livreur]);
        const dayMap = historyMap[dateIso] || {};
        dayMap[livreur] = mergeRider(dayMap[livreur]);
        historyMap[dateIso] = dayMap;

        chrome.storage.local.set({
          gofleet_non_delivered_by_rider: currentMap,
          gofleet_non_delivered_history: historyMap,
        });
      }
    );
  }
});

// One-time test data seed from test-seed-data.json when extension storage is empty
async function seedExtensionTestDataIfNeeded() {
  try {
    const existing = await chrome.storage.local.get({
      gofleet_test_seed_20261125_v2_done: false,
      deliveryBoys: [],
      caissier_history: {},
      gofleet_non_delivered_by_rider: {},
      gofleet_non_delivered_history: {},
    });
    if (existing.gofleet_test_seed_20261125_v2_done) return false;

    const resp = await fetch(chrome.runtime.getURL("test-seed-data.json"));
    if (!resp.ok) return false;
    const seed = await resp.json();
    if (!seed || !Array.isArray(seed.deliveryBoys) || !seed.nonDeliveredMap) return false;

    const mergedByRider = {
      ...(existing.gofleet_non_delivered_by_rider || {}),
      ...seed.nonDeliveredMap,
    };
    const nextNdHistory = { ...(existing.gofleet_non_delivered_history || {}) };
    nextNdHistory["2026-11-25"] = {
      ...(nextNdHistory["2026-11-25"] || {}),
      ...seed.nonDeliveredMap,
    };

    const nextCaissierHistory = { ...(existing.caissier_history || {}) };
    nextCaissierHistory["2026-11-25"] = {
      date: "2026-11-25",
      updatedAt: new Date().toISOString(),
      deliveryBoys: seed.deliveryBoys,
      cardsHtml: nextCaissierHistory["2026-11-25"]?.cardsHtml || [],
    };

    await chrome.storage.local.set({
      gofleet_test_seed_20261125_v2_done: true,
      deliveryBoys: seed.deliveryBoys,
      caissier_history: nextCaissierHistory,
      gofleet_non_delivered_by_rider: mergedByRider,
      gofleet_non_delivered_history: nextNdHistory,
    });
    console.log("[GoFleet Seed] Données de test du 25/11/2026 chargées (4 livreurs, 35 colis non livrés).");
    return true;
  } catch (err) {
    console.warn("[GoFleet Seed] Erreur initialisation seed de test:", err);
    return false;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  seedExtensionTestDataIfNeeded();
});

seedExtensionTestDataIfNeeded();
