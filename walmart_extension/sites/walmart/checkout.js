// Legacy Walmart checkout script has been intentionally disabled.
// The active Walmart automation flow is handled by:
//   - sites/walmart/content-script.js
//   - background.js detectPage messaging
//
// This file remains as a compatibility stub so that if it is injected
// accidentally (or still listed in resources), it will not auto-add items.

(() => {
  if (window.__walmartLegacyCheckoutStubLoaded) return;
  window.__walmartLegacyCheckoutStubLoaded = true;
  console.log('[Walmart Legacy Checkout] Disabled stub loaded.');
})();
