// Walmart background module (isolated from legacy minified background logic)
(() => {
  'use strict';

  const WALMART_HANDLER_BUILD = 'walmart-handler-3.75';
  const WALMART_SCRIPTS = [
    'common/utils.js',
    'common/element-finder.js',
    'common/storage.js',
    'common/checkout-base.js',
    'sites/walmart/selectors.js',
    'sites/walmart/content-script.js'
  ];

  function isWalmartUrl(url) {
    return typeof url === 'string' && url.includes('walmart.com') && !url.startsWith('chrome://');
  }

  function isDirectWalmartProductPage(url) {
    return typeof url === 'string' && url.startsWith('https://www.walmart.com/ip/');
  }

  async function injectWalmartScripts(tabId) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: WALMART_SCRIPTS
    });
  }

  chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(['siteSettings'], result => {
      const all = result.siteSettings || {};
      if (!all.walmart) {
        all.walmart = { enabled: false, quantity: 1, profileId: '' };
        chrome.storage.local.set({ siteSettings: all });
      }
    });
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete') return;
    if (!tab || !tab.url || !isWalmartUrl(tab.url)) return;
    if (!isDirectWalmartProductPage(tab.url)) return;

    const settingsData = await chrome.storage.local.get(['siteSettings', 'globalSettings']);
    const walmartSettings = (settingsData.siteSettings || {}).walmart || {};
    const globalEnabled = (settingsData.globalSettings || {}).enabled !== false;
    const walmartEnabled = walmartSettings.enabled === true;
    if (!globalEnabled || !walmartEnabled) return;

    try {
      await injectWalmartScripts(tabId);
      chrome.tabs.sendMessage(tabId, {
        action: 'detectPage',
        site: 'walmart',
        type: 'product',
        siteSettings: walmartSettings
      }).catch(() => {});
    } catch (err) {
      console.error('[Walmart BG module] Injection/activation error:', err);
    }
  });

  console.log('[Walmart BG module] Minimal product-page-only handler active.', WALMART_HANDLER_BUILD);
})();
