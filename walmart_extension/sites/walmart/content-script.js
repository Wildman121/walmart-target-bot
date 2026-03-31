// Polar Assist Bot — Walmart Content Script
// Mirrors the structure of the Target content script.

console.log('[Walmart] Starting execution.');
console.log('[Walmart] Build marker:', 'walmart-content-3.75');

if (window.location.pathname === '/cart') {
  // Cart page — handle auto-close logic
  (async function handleCartPageClose() {
    try {
      const flagData = await chrome.storage.local.get(['cartCloseAttempted']);
      if (flagData.cartCloseAttempted) {
        console.log('[Walmart Cart] Close already attempted, skipping.');
        return;
      }
      await chrome.storage.local.set({ cartCloseAttempted: true });
      const stored = await chrome.storage.session.get(['globalSettings']);
      const globalSettings = stored.globalSettings || {};
      if (globalSettings.autoCloseCartPage === true) {
        console.log('[Walmart Cart] Auto-close enabled, closing tab.');
        window.close();
        setTimeout(() => { try { window.close(); } catch (e) { console.warn('Failed second close:', e); } }, 100);
      } else {
        console.log('[Walmart Cart] Auto-close disabled, keeping tab open.');
      }
    } catch (e) {
      console.error('[Walmart Cart] Error in handleCartPageClose:', e);
    }
  })();
  window.walmartContentScriptExecuted = true;
} else if (!window.walmartContentScriptExecuted) {
  window.walmartContentScriptExecuted = true;

  // ── Grab shared helpers injected before this script ──────────────────────
  const utils = {
    sleep: sleep,
    waitForElement: waitForElement,
    findElementWithSelectors: findElementWithSelectors,
    clickElement: clickElement,
    fillField: fillField,
    updateStatus: updateStatus,
    debugLog: debugLog,
    getFromStorage: getFromStorage,
    saveToStorage: saveToStorage,
    getProfiles: getProfiles
  };
  const finder = {
    findButtonByText: findButtonByText,
    findElementWithSelectors: findElementWithSelectors,
    fillFieldBySelectors: fillFieldBySelectors,
    createElementWatcher: createElementWatcher,
    createButtonWatcher: createButtonWatcher,
    isElementVisible: isElementVisible,
    isElementDisabled: isElementDisabled
  };
  const storage = {
    getFromStorage: getFromStorage,
    saveToStorage: saveToStorage,
    getSiteSettings: getSiteSettings,
    updateSiteSettings: updateSiteSettings,
    getProfiles: getProfiles,
    saveProfile: saveProfile,
    deleteProfile: deleteProfile
  };

  // Grab Walmart selectors set by selectors.js
  const selectors = window.walmartSelectors || {};
  const productPageSelectors   = selectors.productPageSelectors   || {};
  const checkoutPageSelectors  = selectors.checkoutPageSelectors  || {};
  const popupSelectors         = selectors.popupSelectors         || {};
  const loginPageSelectors     = selectors.loginPageSelectors     || {};

  // ── State ─────────────────────────────────────────────────────────────────
  let isEnabled       = false;
  let siteSettings    = {};
  let globalSettings  = {};
  let checkoutProfile = null;
  let checkoutInProgress = false;
  let currentStep     = '';
  let observers       = [];
  let intervals       = [];
  const ACTION_DELAY_MS = 750;
  let placeOrderClicked   = false;
  let cvvConfirmClicked   = false;
  let cardVerifyClicked   = false;

  // ── Message listener ──────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    utils.debugLog('[Walmart] Message received:', msg);

    if (msg.action === 'activateSite' && msg.site === 'walmart') {
      console.log('[Walmart] Received activateSite command.');
      siteSettings = msg.siteSettings || siteSettings;
      isEnabled    = globalSettings.enabled !== false && siteSettings.enabled === true;
      if (isEnabled) {
        loadSettingsAndStart().catch(e => console.error('[Walmart] Activation error:', e));
      }
    }

    if (msg.action === 'detectPage' && msg.site === 'walmart') {
      console.log('[Walmart] Received detectPage command, type:', msg.type);
      cleanupProcesses();
      if (msg.type === 'cart') {
        utils.updateStatus('Cart page detected', 'status-waiting');
        return;
      }
      loadSettingsAndStart()
        .then(() => handlePageType(msg.type))
        .catch(e => console.error('[Walmart] detectPage error:', e));
    }

    if (msg.action === 'updateSiteSetting' && msg.site === 'walmart') {
      const prevEnabled = isEnabled;

      if (msg.siteSettings && typeof msg.siteSettings === 'object') {
        siteSettings = { ...siteSettings, ...msg.siteSettings };
      } else if (msg.setting) {
        siteSettings[msg.setting] = msg.value;
      }

      isEnabled = globalSettings.enabled !== false && siteSettings.enabled === true;

      if (!prevEnabled && isEnabled) {
        loadSettingsAndStart()
          .then(() => {
            const pageType = detectCurrentPageType();
            if (pageType !== 'cart') handlePageType(pageType);
          })
          .catch(e => console.error('[Walmart] Failed to apply updated site settings:', e));
      }
      if (prevEnabled && !isEnabled) {
        cleanupProcesses();
      }
    }

    if (msg.action === 'toggleStatus') {
      const globalOn = msg.enabled;
      const siteOn   = isEnabled;
      isEnabled = globalOn && (siteSettings?.enabled || false);
      if (siteOn && !isEnabled) cleanupProcesses();
      else if (!siteOn && isEnabled) loadSettingsAndStart().then(() => handlePageType(detectCurrentPageType()));
    }

    if (msg.action === 'profileUpdated' || msg.action === 'profileSelected') {
      loadSettingsAndStart();
    }

    return false;
  });

  // Keep enable state in sync even if toggles are changed without direct tab messaging.
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;

    const prevEnabled = isEnabled;
    if (changes.globalSettings?.newValue) {
      globalSettings = changes.globalSettings.newValue || {};
    }
    if (changes.siteSettings?.newValue?.walmart) {
      siteSettings = changes.siteSettings.newValue.walmart || {};
    }

    isEnabled = globalSettings.enabled !== false && siteSettings.enabled === true;
    if (prevEnabled && !isEnabled) {
      console.log('[Walmart] Detected disable via storage change; cleaning up.');
      cleanupProcesses();
    }
  });

  // ── Settings loader ───────────────────────────────────────────────────────
  async function loadSettingsAndStart() {
    try {
      const stored = await storage.getFromStorage(['siteSettings', 'globalSettings', 'selectedProfile']);
      siteSettings   = stored.siteSettings?.walmart || {};
      globalSettings = stored.globalSettings || { autoSubmit: true, randomizeDelay: false };
      isEnabled      = globalSettings.enabled !== false && siteSettings.enabled === true;

      const profilesData = await storage.getProfiles();
      const profiles     = profilesData.profiles || [];
      const profileId    = siteSettings.profileId || stored.selectedProfile;

      checkoutProfile = null;
      if (profileId) {
        checkoutProfile = profiles.find(p => p.id === profileId) || null;
      }
      if (!checkoutProfile && profiles.length > 0) {
        checkoutProfile = profiles[0];
        await storage.saveToStorage({ selectedProfile: checkoutProfile.id });
        siteSettings.profileId = checkoutProfile.id;
        await storage.updateSiteSettings('walmart', { profileId: checkoutProfile.id });
      }
      if (!checkoutProfile) {
        console.warn('[Walmart] No profile available.');
      }
    } catch (e) {
      console.error('[Walmart] Error loading settings:', e);
      isEnabled = false;
    }
  }

  // ── Page type detection ───────────────────────────────────────────────────
  function detectCurrentPageType() {
    if (window.location.href.startsWith('https://www.walmart.com/ip/')) return 'product';

    const path = window.location.pathname || '';
    if (path.startsWith('/checkout')) return 'checkout';
    if (path === '/cart')             return 'cart';
    if (window.location.pathname.includes('/login')) return 'login';
    return 'unknown';
  }

  // ── Page handler dispatcher ───────────────────────────────────────────────
  async function handlePageType(pageType) {
    if (!isEnabled) {
      utils.updateStatus('Walmart disabled', 'status-waiting');
      return;
    }
    console.log('[Walmart] Handling page type:', pageType);
    switch (pageType) {
      case 'product':
        utils.updateStatus('Product page detected', 'status-waiting');
        setupProductPageObserver();
        await utils.sleep(ACTION_DELAY_MS);
        doAddToCart().catch(handleError);
        break;
      case 'checkout':
        utils.updateStatus('Starting checkout...', 'status-running');
        await utils.sleep(ACTION_DELAY_MS);
        runCheckout().catch(handleError);
        break;
      case 'login':
        utils.updateStatus('Login page detected', 'status-waiting');
        await tryAutoLogin();
        break;
      default:
        utils.updateStatus('Non-targetable Walmart page', 'status-waiting');
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  function cleanupProcesses() {
    console.log('[Walmart] Cleaning up processes.');
    checkoutInProgress   = false;
    currentStep          = '';
    placeOrderClicked    = false;
    cvvConfirmClicked    = false;
    cardVerifyClicked    = false;
    observers.forEach(ob => { try { ob.disconnect(); } catch (e) { console.warn('[Walmart] Observer disconnect error:', e); } });
    observers = [];
    intervals.forEach(id => clearInterval(id));
    intervals = [];
  }

  function handleError(err) {
    console.error('[Walmart] Checkout error at step "' + currentStep + '":', err);
    utils.updateStatus('Error: ' + err.message, 'status-waiting');
    checkoutInProgress = false;
  }

  // ── Product page: wait for add-to-cart button ────────────────────────────
  function setupProductPageObserver() {
    const attempt = () => {
      const btn = finder.findElementWithSelectors(productPageSelectors.addToCart || []);
      if (btn && finder.isElementVisible(btn)) {
        if (finder.isElementDisabled(btn)) {
          checkOutOfStock();
        }
      }
    };
    const ob = new MutationObserver(attempt);
    ob.observe(document.body, { childList: true, subtree: true, attributes: true });
    observers.push(ob);
    attempt();
  }

  function checkOutOfStock() {
    const oosEl = finder.findElementWithSelectors(productPageSelectors.outOfStock || []);
    if (oosEl && finder.isElementVisible(oosEl)) {
      utils.updateStatus('Item is out of stock', 'status-waiting');
    }
  }

  // ── Add to cart (invoked by background when product page is active) ──────
  async function doAddToCart() {
    const pageType = detectCurrentPageType();
    if (pageType !== 'product') {
      console.log('[Walmart] Skipping add-to-cart: not on product page. Current page type:', pageType);
      return;
    }

    if (checkoutInProgress) { console.log('[Walmart] Add-to-cart already in progress.'); return; }
    checkoutInProgress = true;
    currentStep = 'add-to-cart';
    utils.updateStatus('Adding to cart...', 'status-running');

    const qty = siteSettings.quantity || 1;
    if (qty > 1) await setQuantity(qty);

    const maxAttempts = 10;
    const pollMs      = 200;
    let btn = null;
    for (let i = 0; i < maxAttempts; i++) {
      btn = finder.findElementWithSelectors(productPageSelectors.addToCart || []);
      if (btn && finder.isElementVisible(btn) && !finder.isElementDisabled(btn)) break;
      await utils.sleep(pollMs);
      btn = null;
    }

    if (!btn) {
      checkoutInProgress = false;
      throw new Error('Add to cart button not found after ' + maxAttempts + ' attempts');
    }

    await utils.clickElement(btn, 'add-to-cart');
    utils.updateStatus('Waiting for cart confirmation...', 'status-running');

    // Wait for modal/confirmation. If Walmart changes modal markup and we time out,
    // continue to checkout instead of hard-refreshing.
    const confirmed = await waitForAddToCartResult(3000);
    if (confirmed === false) {
      console.warn('[Walmart] Add-to-cart error state detected, attempting checkout anyway.');
    }
    if (confirmed === null) {
      console.log('[Walmart] Add-to-cart confirmation timed out, proceeding to checkout fallback.');
    }

    utils.updateStatus('Added to cart! Proceeding to checkout...', 'status-running');
    await utils.sleep(ACTION_DELAY_MS);

    // Always move directly to checkout after add-to-cart attempt.
    window.location.href = 'https://www.walmart.com/checkout';
  }

  async function setQuantity(qty) {
    if (qty <= 1) return;
    const sel = checkoutPageSelectors; // re-use qty selectors
    const incBtn = document.querySelector(productPageSelectors.quantity?.stepper?.increment);
    const qtyInput = document.querySelector(productPageSelectors.quantity?.stepper?.value);
    if (incBtn && qtyInput) {
      const current = parseInt(qtyInput.value || '1', 10);
      for (let i = 0; i < qty - current; i++) {
        await utils.clickElement(incBtn, 'qty-increment');
        await utils.sleep(ACTION_DELAY_MS);
      }
      return;
    }
    const dropdown = finder.findElementWithSelectors(productPageSelectors.quantity?.dropdown || []);
    if (dropdown) {
      const opt = Array.from(dropdown.options).find(o => o.value === String(qty) || o.text.trim() === String(qty));
      if (opt) {
        dropdown.value = opt.value;
        dropdown.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  async function waitForAddToCartResult(timeout) {
    return new Promise(resolve => {
      const end = Date.now() + timeout;
      const check = () => {
        const modalEl = finder.findElementWithSelectors(productPageSelectors.addToCartResult?.successContainer || []);
        if (modalEl && finder.isElementVisible(modalEl)) { resolve(true); return; }
        const errEl = finder.findElementWithSelectors(productPageSelectors.addToCartResult?.errorContainer || []);
        if (errEl && finder.isElementVisible(errEl)) { resolve(false); return; }
        if (Date.now() < end) setTimeout(check, 150);
        else resolve(null); // timeout — uncertain
      };
      check();
    });
  }

  // ── Full checkout flow ───────────────────────────────────────────────────
  async function runCheckout() {
    if (checkoutInProgress) { console.log('[Walmart] Checkout already in progress.'); return; }
    if (!checkoutProfile) {
      utils.updateStatus('No profile selected', 'status-waiting');
      return;
    }
    checkoutInProgress = true;

    // Wait for page to settle
    currentStep = 'wait-for-load';
    await waitForPageLoad();

    // Dismiss any popup
    currentStep = 'handle-popups';
    await dismissPopups();

    // Check which step we're on
    currentStep = 'detect-step';
    const step = detectCheckoutStep();
    console.log('[Walmart] Detected checkout step:', step);

    try {
      if (step === 'shipping') {
        currentStep = 'fill-shipping';
        utils.updateStatus('Filling shipping info...', 'status-running');
        await fillShipping();
        await utils.sleep(ACTION_DELAY_MS);
        await continueFromShipping();
        await utils.sleep(ACTION_DELAY_MS);
        await dismissPopups();
        await utils.sleep(ACTION_DELAY_MS);
        await fillPayment();
        await utils.sleep(ACTION_DELAY_MS);
        await placeOrder();
      } else if (step === 'payment') {
        currentStep = 'fill-payment';
        utils.updateStatus('Filling payment info...', 'status-running');
        await fillPayment();
        await utils.sleep(ACTION_DELAY_MS);
        await placeOrder();
      } else {
        // Generic fallback: try payment then place order
        await dismissPopups();
        await fillPayment();
        await utils.sleep(ACTION_DELAY_MS);
        await placeOrder();
      }
    } catch (e) {
      handleError(e);
    } finally {
      checkoutInProgress = false;
    }
  }

  async function waitForPageLoad() {
    const spinnerSels = checkoutPageSelectors.loadingSpinner || [];
    const maxWait = 8000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const spinner = finder.findElementWithSelectors(spinnerSels);
      if (!spinner || !finder.isElementVisible(spinner)) break;
      await utils.sleep(ACTION_DELAY_MS);
    }
  }

  function detectCheckoutStep() {
    const shippingForm = finder.findElementWithSelectors(checkoutPageSelectors.shippingForm || []);
    if (shippingForm && finder.isElementVisible(shippingForm)) return 'shipping';
    const paymentForm = finder.findElementWithSelectors(checkoutPageSelectors.paymentForm || []);
    if (paymentForm && finder.isElementVisible(paymentForm)) return 'payment';
    const placeBtn = document.querySelector(checkoutPageSelectors.placeOrderButton || 'button[data-testid="place-order-btn"]');
    if (placeBtn && finder.isElementVisible(placeBtn)) return 'review';
    return 'unknown';
  }

  async function dismissPopups() {
    try {
      // Close button
      const closeBtn = finder.findElementWithSelectors(popupSelectors.closeButton || []);
      if (closeBtn && finder.isElementVisible(closeBtn)) {
        await utils.clickElement(closeBtn, 'close-popup');
        await utils.sleep(ACTION_DELAY_MS);
      }
      // Continue button in modals (e.g., Walmart+ upsell)
      const contBtn = finder.findElementWithSelectors(popupSelectors.continueButton || []);
      if (contBtn && finder.isElementVisible(contBtn)) {
        await utils.clickElement(contBtn, 'continue-popup');
        await utils.sleep(ACTION_DELAY_MS);
      }
    } catch (e) {
      console.warn('[Walmart] dismissPopups error (non-fatal):', e);
    }
  }

  async function fillShipping() {
    const fields = checkoutPageSelectors.shippingFields;
    if (!fields) return;
    const profile = checkoutProfile;
    if (!profile) throw new Error('No profile for shipping');

    await finder.fillFieldBySelectors(fields.firstName, profile.firstName);
    await utils.sleep(ACTION_DELAY_MS);
    await finder.fillFieldBySelectors(fields.lastName, profile.lastName);
    await utils.sleep(ACTION_DELAY_MS);
    await finder.fillFieldBySelectors(fields.address1, profile.address1);
    await utils.sleep(ACTION_DELAY_MS);
    if (profile.address2) {
      await finder.fillFieldBySelectors(fields.address2, profile.address2);
      await utils.sleep(ACTION_DELAY_MS);
    }
    await finder.fillFieldBySelectors(fields.city, profile.city);
    await utils.sleep(ACTION_DELAY_MS);
    await finder.fillFieldBySelectors(fields.state, profile.state);
    await utils.sleep(ACTION_DELAY_MS);
    await finder.fillFieldBySelectors(fields.zip, profile.zip);
    await utils.sleep(ACTION_DELAY_MS);
    if (profile.phone) {
      await finder.fillFieldBySelectors(fields.phone, profile.phone);
      await utils.sleep(ACTION_DELAY_MS);
    }
    if (profile.email) {
      await finder.fillFieldBySelectors(fields.email, profile.email);
      await utils.sleep(ACTION_DELAY_MS);
    }
  }

  async function continueFromShipping() {
    const sels = checkoutPageSelectors.continueButtons;
    let btn = finder.findElementWithSelectors(sels?.shipping || []);
    if (!btn) btn = finder.findElementWithSelectors(sels?.saveAndContinue || []);
    if (btn && finder.isElementVisible(btn) && !finder.isElementDisabled(btn)) {
      await utils.clickElement(btn, 'shipping-continue');
      utils.updateStatus('Shipping submitted, moving to payment...', 'status-running');
    } else {
      console.warn('[Walmart] Shipping continue button not found.');
    }
  }

  async function fillPayment() {
    const formEl = finder.findElementWithSelectors(checkoutPageSelectors.paymentForm || []);
    if (!formEl) {
      console.log('[Walmart] Payment form not visible, skipping fill.');
      return;
    }

    const profile = checkoutProfile;
    if (!profile) throw new Error('No profile for payment');

    const payment = profile.payment || profile.paymentMethod || {};
    const cardNumber = payment.cardNumber || profile.cardNumber || '';
    const nameOnCard = payment.nameOnCard || (profile.firstName + ' ' + profile.lastName) || '';
    const expMonth   = payment.expiryMonth || payment.expMonth || '';
    const expYear    = payment.expiryYear  || payment.expYear  || '';
    const cvv        = payment.cvv || profile.cvv || '';

    if (!cardNumber) {
      console.warn('[Walmart] No card number in profile, skipping payment fill.');
      return;
    }

    const pf = checkoutPageSelectors.paymentFields;
    utils.updateStatus('Filling payment info...', 'status-running');

    await finder.fillFieldBySelectors(pf.cardNumber, cardNumber);
    await utils.sleep(ACTION_DELAY_MS);
    await finder.fillFieldBySelectors(pf.nameOnCard, nameOnCard);
    await utils.sleep(ACTION_DELAY_MS);
    await finder.fillFieldBySelectors(pf.expiryMonth, expMonth);
    await utils.sleep(ACTION_DELAY_MS);
    await finder.fillFieldBySelectors(pf.expiryYear, expYear);
    await utils.sleep(ACTION_DELAY_MS);
    if (cvv) {
      await finder.fillFieldBySelectors(pf.cvv, cvv);
      await utils.sleep(ACTION_DELAY_MS);
    }
  }

  async function placeOrder() {
    if (!globalSettings.autoSubmit) {
      utils.updateStatus('Review order — auto-submit disabled', 'status-waiting');
      console.log('[Walmart] Auto-submit disabled, stopping before place order.');
      return;
    }

    utils.updateStatus('Placing order...', 'status-running');
    const btnSels = checkoutPageSelectors.placeOrderButtonSelectors || [checkoutPageSelectors.placeOrderButton];
    const btn = finder.findElementWithSelectors(btnSels);

    if (!btn || !finder.isElementVisible(btn)) {
      console.warn('[Walmart] Place order button not found.');
      utils.updateStatus('Place order button not found', 'status-waiting');
      return;
    }
    if (finder.isElementDisabled(btn)) {
      console.warn('[Walmart] Place order button is disabled.');
      utils.updateStatus('Place order button is disabled', 'status-waiting');
      return;
    }
    if (placeOrderClicked) {
      console.log('[Walmart] Place order already clicked, skipping.');
      return;
    }

    placeOrderClicked = true;
    await utils.clickElement(btn, 'place-order');
    utils.updateStatus('Order submitted!', 'status-complete');
    console.log('[Walmart] Place order clicked.');
  }

  // ── Auto-login ────────────────────────────────────────────────────────────
  async function tryAutoLogin() {
    try {
      const stored = await storage.getFromStorage(['walmartEmail', 'walmartPassword', 'globalSettings']);
      const email  = stored.walmartEmail;
      const pass   = stored.walmartPassword;
      const gs     = stored.globalSettings || {};

      if (!gs.autoLogin) {
        utils.updateStatus('Login page (auto-login disabled)', 'status-waiting');
        return;
      }
      if (!email || !pass) {
        utils.updateStatus('Login page (no credentials)', 'status-waiting');
        return;
      }

      // Check already logged in
      const loggedIn = finder.findElementWithSelectors(loginPageSelectors.loggedInIndicators || []);
      if (loggedIn && finder.isElementVisible(loggedIn)) {
        console.log('[Walmart] Already logged in.');
        return;
      }

      utils.updateStatus('Auto-logging in to Walmart...', 'status-running');

      const emailInput = finder.findElementWithSelectors(loginPageSelectors.loginFields?.email || []);
      const passInput  = finder.findElementWithSelectors(loginPageSelectors.loginFields?.password || []);
      const signInBtn  = finder.findElementWithSelectors(loginPageSelectors.signInButton || []);

      if (!emailInput || !passInput || !signInBtn) {
        utils.updateStatus('Login form elements not found', 'status-waiting');
        return;
      }

      await utils.fillField(emailInput, email, 'email');
      await utils.sleep(ACTION_DELAY_MS);
      await utils.fillField(passInput, pass, 'password');
      await utils.sleep(ACTION_DELAY_MS);

      if (finder.isElementVisible(signInBtn) && !finder.isElementDisabled(signInBtn)) {
        await utils.clickElement(signInBtn, 'sign-in');
        utils.updateStatus('Signing in...', 'status-running');
      }
    } catch (e) {
      console.error('[Walmart] Auto-login error:', e);
      utils.updateStatus('Auto-login error: ' + e.message, 'status-waiting');
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  console.log('[Walmart] Content script initialised. URL:', window.location.href);
  console.log('[Walmart] Message listeners ready.');
  


}
