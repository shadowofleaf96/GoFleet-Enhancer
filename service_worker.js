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
    chrome.storage.local.get({ gofleet_non_delivered_by_rider: {} }, (result) => {
      const currentMap = result.gofleet_non_delivered_by_rider || {};
      const { livreur, tourneeId, date, parcels } = request.data;
      if (!livreur || !Array.isArray(parcels)) return;

      const existingData = currentMap[livreur] || {
        livreur,
        tourneeId,
        date,
        parcels: []
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

      currentMap[livreur] = {
        livreur,
        tourneeId: tourneeId || existingData.tourneeId || "N/A",
        date: date || existingData.date || "",
        lastUpdated: new Date().toISOString(),
        parcels: Array.from(parcelsMap.values())
      };

      chrome.storage.local.set({ gofleet_non_delivered_by_rider: currentMap });
    });
  }
});
