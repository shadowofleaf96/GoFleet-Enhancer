let expeditionData = [];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXPEDITIONS_DATA') {
    expeditionData = message.data;
  }

  if (message.type === 'GET_EXPEDITIONS') {
    sendResponse({ data: expeditionData });
  }
});