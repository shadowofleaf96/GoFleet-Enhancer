let expeditionData = [];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXPEDITIONS_DATA') {
    expeditionData = message.data;
  }

  if (message.type === 'GET_EXPEDITIONS') {
    sendResponse({ data: expeditionData });
  }
});

// Track current tab ID for data extraction
let currentTabId = null;

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url.includes('TraitementLivreurExcute')) {
    currentTabId = tabId;
    chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
  }
});

// In background.js
chrome.runtime.onMessage.addListener((request, sender) => {
  if (request.action === 'storeRefusedColis') {
    chrome.storage.local.get({ refusedColis: [] }, (result) => {
      // Additional GOF check in background for safety
      const filteredData = request.data.filter(item =>
        item.colis && item.colis.startsWith('GOF')
      );

      const existingColisNumbers = new Set(result.refusedColis.map(item => item.colis));
      const uniqueNewData = filteredData.filter(item =>
        !existingColisNumbers.has(item.colis)
      );

      if (uniqueNewData.length > 0) {
        const updatedData = [...result.refusedColis, ...uniqueNewData];
        chrome.storage.local.set({ refusedColis: updatedData });
      }
    });
  }
});