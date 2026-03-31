// Polar Assist Bot — Walmart Content Script
// Mirrors the structure of the Target content script.

console.log('[Walmart] Starting execution.');
console.log('[Walmart] Build marker:', 'walmart-content-3.75');
const USE_WALMART_FLOW_2026 = false;

if (!USE_WALMART_FLOW_2026 && window.location.pathname === '/cart') {
  // Cart page — continue to checkout, then optional auto-close logic.
  (async function handleCartPageActions() {
    try {
      const flagData = await chrome.storage.local.get(['cartCloseAttempted']);
      if (flagData.cartCloseAttempted) {
        console.log('[Walmart Cart] Close already attempted, skipping.');
      }

      const stored = await chrome.storage.local.get(['globalSettings', 'siteSettings']);
      const globalSettings = stored.globalSettings || {};
      const siteSettings = stored.siteSettings?.walmart || {};
      const isEnabled = globalSettings.enabled !== false && siteSettings.enabled === true;

      if (isEnabled) {
        const desiredQty = Number(siteSettings.quantity || 1);
        if (desiredQty > 1) {
          await ensureCartQuantity(desiredQty);
        }

        const continueSelectors = (window.walmartSelectors?.cartPageSelectors?.continueToCheckoutButton) || [
          'button[data-automation-id="cart-continue-checkout"]',
          'button[data-testid="continue-to-checkout-button"]',
          'button[data-testid="checkout-button"]',
          'button[aria-label*="Continue to checkout"]',
          'button[aria-label*="Checkout"]',
          'a[href*="/checkout"]'
        ];

        let continueBtn = null;
        for (const sel of continueSelectors) {
          const el = document.querySelector(sel);
          if (el && el.offsetParent !== null && !el.disabled) {
            continueBtn = el;
            break;
          }
        }

        if (!continueBtn) {
          continueBtn = findButtonByText(
            ['continue to checkout', 'proceed to checkout', 'checkout'],
            document,
            true
          );
        }

        if (continueBtn) {
          console.log('[Walmart Cart] Continue to checkout button found, clicking.');
          continueBtn.click();
          await chrome.storage.local.set({ cartCloseAttempted: true });
          if (globalSettings.autoCloseCartPage === true) {
            setTimeout(() => {
              try { window.close(); } catch (e) { console.warn('[Walmart Cart] Failed close after continue click:', e); }
            }, 1500);
          }
          return;
        }

        console.warn('[Walmart Cart] Continue to checkout button not found.');
      }

      await chrome.storage.local.set({ cartCloseAttempted: true });
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

  async function ensureCartQuantity(targetQty) {
    try {
      const qtyInputSelectors = [
        'input[data-testid*="quantity"]',
        'input[aria-label*="Quantity"]',
        'input[name*="quantity"]'
      ];
      const incrementSelectors = [
        'button[data-testid*="quantity-increment"]',
        'button[data-automation-id*="quantity-increase"]',
        'button[aria-label*="Increase quantity"]',
        'button[aria-label*="Increment quantity"]',
        'button[aria-label*="Increase"]'
      ];

      let qtyInput = null;
      for (const sel of qtyInputSelectors) {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) {
          qtyInput = el;
          break;
        }
      }
      if (!qtyInput) return;

      const currentQty = parseInt(String(qtyInput.value || qtyInput.getAttribute('value') || '1'), 10) || 1;
      if (currentQty >= targetQty) return;

      let incrementBtn = null;
      for (const sel of incrementSelectors) {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null && !el.disabled) {
          incrementBtn = el;
          break;
        }
      }
      if (!incrementBtn) return;

      for (let i = currentQty; i < targetQty; i++) {
        incrementBtn.click();
        await new Promise(resolve => setTimeout(resolve, 350));
      }
      console.log('[Walmart Cart] Quantity adjusted to target:', targetQty);
    } catch (err) {
      console.warn('[Walmart Cart] Quantity adjustment skipped due to error:', err);
    }
  }
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
  const antiBotSelectors       = selectors.antiBotSelectors       || {};

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
  let antiBotDetected     = false;

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
    const path = window.location.pathname || '';
    const host = (window.location.hostname || '').toLowerCase();
    const isWalmartHost = host === 'www.walmart.com' || host === 'walmart.com';
    if (isWalmartHost && path.startsWith('/ip/')) return 'product';

    if (path.startsWith('/checkout')) return 'checkout';
    if (path === '/cart')             return 'cart';
    if (window.location.pathname.includes('/login')) return 'login';
    return 'unknown';
  }

  // ── Page handler dispatcher ───────────────────────────────────────────────
  async function handlePageType(pageType) {
    if (USE_WALMART_FLOW_2026) return;
    if (!isEnabled) {
      utils.updateStatus('Walmart disabled', 'status-waiting');
      return;
    }
    if (antiBotDetected && !hasAntiBotChallenge()) {
      antiBotDetected = false;
      console.log('[Walmart] Security challenge cleared; resuming automation.');
    }
    if (hasAntiBotChallenge()) {
      handleAntiBotDetection();
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

  function hasAntiBotChallenge() {
    const challengeContainers = antiBotSelectors.challengeContainers || [];
    const visibleChallenge = finder.findElementWithSelectors(challengeContainers);
    if (visibleChallenge && finder.isElementVisible(visibleChallenge)) {
      return true;
    }

    const bodyText = (document.body?.innerText || '').toLowerCase();
    const challengeText = antiBotSelectors.challengeText || [];
    return challengeText.some(snippet => bodyText.includes(String(snippet).toLowerCase()));
  }

  function handleAntiBotDetection() {
    if (antiBotDetected) return;
    antiBotDetected = true;
    cleanupProcesses();
    const message = 'Security challenge detected. Complete it manually, then resume.';
    utils.updateStatus(message, 'status-waiting');
    console.warn('[Walmart] Security challenge detected; automation paused.');
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
    if (hasAntiBotChallenge()) {
      handleAntiBotDetection();
      return;
    }
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
      const buyNowBtn = finder.findElementWithSelectors(productPageSelectors.buyNow || []);
      if (buyNowBtn && finder.isElementVisible(buyNowBtn) && !finder.isElementDisabled(buyNowBtn)) {
        utils.updateStatus('Add to cart unavailable. Using Buy Now...', 'status-running');
        await utils.clickElement(buyNowBtn, 'buy-now');
        checkoutInProgress = false;
        return;
      }

      checkoutInProgress = false;
      throw new Error('Add to cart button not found after ' + maxAttempts + ' attempts');
    }

    await utils.clickElement(btn, 'add-to-cart');
    utils.updateStatus('Waiting for cart confirmation...', 'status-running');

    // Wait for modal/confirmation. If Walmart changes modal markup and we time out,
    // avoid forcing checkout unless we have a positive add-to-cart signal.
    const confirmed = await waitForAddToCartResult(3000);
    if (confirmed === false) {
      checkoutInProgress = false;
      utils.updateStatus('Add to cart failed. Please retry on the product page.', 'status-waiting');
      console.warn('[Walmart] Add-to-cart error state detected; stopping before checkout redirect.');
      return;
    }
    if (confirmed === null) {
      checkoutInProgress = false;
      utils.updateStatus('Cart confirmation unclear. Verify cart, then continue.', 'status-waiting');
      console.log('[Walmart] Add-to-cart confirmation timed out; not redirecting to checkout.');
      return;
    }

    utils.updateStatus('Added to cart! Opening cart...', 'status-running');
    await utils.sleep(ACTION_DELAY_MS);

    // Follow the requested flow: product -> cart -> checkout.
    const viewCartBtn = finder.findElementWithSelectors(productPageSelectors.addToCartResult?.viewCartButton || []);
    if (viewCartBtn && finder.isElementVisible(viewCartBtn)) {
      await utils.clickElement(viewCartBtn, 'view-cart');
    } else {
      const viewCartByText = finder.findButtonByText(['view cart'], document, true);
      if (viewCartByText) {
        await utils.clickElement(viewCartByText, 'view-cart-text');
        return;
      }
    }

    if (window.location.pathname !== '/cart') {
      window.location.href = 'https://www.walmart.com/cart';
    } else {
      const continueBtn = findButtonByText(['continue to checkout', 'proceed to checkout', 'checkout'], document, true);
      if (continueBtn) {
        await utils.clickElement(continueBtn, 'continue-to-checkout');
      }
    }
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
        if (isPositiveAddToCartSignal()) { resolve(true); return; }
        if (hasBlockingAddToCartError()) { resolve(false); return; }
        if (Date.now() < end) setTimeout(check, 150);
        else resolve(null); // timeout — uncertain
      };
      check();
    });
  }

  function isPositiveAddToCartSignal() {
    const modalEl = finder.findElementWithSelectors(productPageSelectors.addToCartResult?.successContainer || []);
    if (modalEl && finder.isElementVisible(modalEl)) return true;

    const viewCartBtn = finder.findElementWithSelectors(productPageSelectors.addToCartResult?.viewCartButton || []);
    if (viewCartBtn && finder.isElementVisible(viewCartBtn)) return true;

    if (window.location.pathname === '/cart') return true;
    return false;
  }

  function hasBlockingAddToCartError() {
    const errorCandidates = productPageSelectors.addToCartResult?.errorContainer || [];
    const errorTextSignals = [
      'out of stock',
      'sold out',
      'not available',
      'cannot be added',
      'can’t be added',
      'could not add',
      'unable to add',
      'try again',
      'quantity limit',
      'something went wrong'
    ];

    for (const selector of errorCandidates) {
      const nodes = Array.from(document.querySelectorAll(selector));
      for (const node of nodes) {
        if (!finder.isElementVisible(node)) continue;
        const text = (node.textContent || '').trim().toLowerCase();
        if (!text) continue;
        if (errorTextSignals.some(signal => text.includes(signal))) return true;
      }
    }
    return false;
  }

  // ── Full checkout flow ───────────────────────────────────────────────────
  async function runCheckout() {
    if (hasAntiBotChallenge()) {
      handleAntiBotDetection();
      return;
    }
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
      if (hasAntiBotChallenge()) {
        handleAntiBotDetection();
        return;
      }
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
    if (hasAntiBotChallenge()) {
      handleAntiBotDetection();
      return;
    }
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
    if (hasAntiBotChallenge()) {
      handleAntiBotDetection();
      return;
    }
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
    if (hasAntiBotChallenge()) {
      handleAntiBotDetection();
      return;
    }
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
    if (hasAntiBotChallenge()) {
      handleAntiBotDetection();
      return;
    }
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
    if (hasAntiBotChallenge()) {
      handleAntiBotDetection();
      return;
    }
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
      if (hasAntiBotChallenge()) {
        handleAntiBotDetection();
        return;
      }
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

  // Bootstrap automation on initial page load so Walmart flow runs even if
  // background page-detection messaging is delayed or unavailable.
  (async () => {
    try {
      await loadSettingsAndStart();
      const pageType = detectCurrentPageType();
      if (pageType !== 'cart') {
        await handlePageType(pageType);
      }
    } catch (error) {
      console.error('[Walmart] Initial bootstrap failed:', error);
    }
  })();

}


/* WALMART PRODUCT->CART->CHECKOUT->PLACE ORDER HOTFIX */
(() => {
  // The primary Walmart automation above already handles product/cart/checkout.
  // Running this legacy hotfix in parallel can cause duplicate clicks and race conditions.
  if (window.walmartContentScriptExecuted) return;
  if (window.__walmartCartCheckoutHotfixAppliedV2) return;
  window.__walmartCartCheckoutHotfixAppliedV2 = true;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const isVisible = (el) => !!el && !el.disabled && el.offsetParent !== null;

  const clickElement = (el) => {
    if (!isVisible(el)) return false;
    try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) {}
    el.click();
    return true;
  };

  const clickBySelectors = (selectors) => {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (clickElement(el)) return true;
    }
    return false;
  };

  const clickByText = (texts) => {
    const needles = texts.map((text) => text.toLowerCase());
    const targets = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    for (const target of targets) {
      const value = (target.textContent || '').trim().toLowerCase();
      if (!value) continue;
      if (needles.some((needle) => value.includes(needle)) && clickElement(target)) return true;
    }
    return false;
  };

  const readSelectedQuantity = async () => {
    const parseQty = (value) => {
      const parsed = Number.parseInt(String(value ?? ''), 10);
      return Number.isFinite(parsed) ? Math.min(5, Math.max(1, parsed)) : null;
    };

    try {
      if (typeof chrome !== 'undefined' && chrome?.storage?.local?.get) {
        const data = await chrome.storage.local.get(['siteSettings']);
        const qty = parseQty(data?.siteSettings?.walmart?.quantity);
        if (qty) return qty;
      }
    } catch (error) {
      console.warn('[Walmart Hotfix] Could not read selected quantity from storage:', error);
    }

    return 1;
  };

  const setProductQuantity = async (targetQty) => {
    if (targetQty <= 1) return;

    const dropdown = [
      'select[data-testid="quantity-select"]',
      'select[name="quantity"]',
      'select[aria-label*="Quantity"]'
    ].map((selector) => document.querySelector(selector)).find(Boolean);

    if (dropdown) {
      const option = Array.from(dropdown.options || []).find((opt) => (
        Number.parseInt(opt.value, 10) === targetQty ||
        Number.parseInt((opt.textContent || '').trim(), 10) === targetQty
      ));
      if (option) {
        dropdown.value = option.value;
        dropdown.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(250);
        return;
      }
    }

    const incrementBtn = [
      '[data-testid="quantity-increment-btn"]',
      'button[data-testid*="quantity-increment"]',
      'button[data-automation-id*="quantity-increase"]',
      'button[aria-label*="Increase quantity"]'
    ].map((selector) => document.querySelector(selector)).find((el) => isVisible(el));

    const quantityInput = [
      '[data-testid="quantity-input"]',
      'input[data-testid*="quantity"]',
      'input[aria-label*="Quantity"]'
    ].map((selector) => document.querySelector(selector)).find(Boolean);

    if (!incrementBtn || !quantityInput) return;

    const readCurrentQty = () => {
      const raw = quantityInput.value || quantityInput.getAttribute('value') || quantityInput.textContent || '1';
      const parsed = Number.parseInt(String(raw).trim(), 10);
      return Number.isFinite(parsed) ? parsed : 1;
    };

    let currentQty = readCurrentQty();
    while (currentQty < targetQty) {
      if (!clickElement(incrementBtn)) break;
      await sleep(250);
      currentQty = readCurrentQty();
    }
  };

  const runProductFlow = async () => {
    const selectedQty = await readSelectedQuantity();
    await setProductQuantity(selectedQty);

    const clickedAddToCart =
      clickBySelectors([
        '[data-automation-id="atc-button"]',
        'button[data-testid="ip-add-to-cart-btn"]',
        'button[data-testid="add-to-cart-btn"]',
        '#btn-atc',
        '.WMButton[data-tl-id="atc-button"]',
        'button[aria-label*="Add to cart"]',
        'button[aria-label*="Add to Cart"]'
      ]) || clickByText(['add to cart']);

    if (!clickedAddToCart) return;

    // Fastest path: mini-cart checkout button immediately after add-to-cart.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (
        clickBySelectors([
          'button[data-testid="checkout-button"]',
          'button[data-testid="proceed-to-checkout"]',
          'button[data-automation-id="cart-continue-checkout"]',
          'a[href*="/checkout"]'
        ]) ||
        clickByText(['check out', 'checkout', 'continue to checkout'])
      ) {
        return;
      }
      await sleep(250);
    }

    // Fallback path: open cart first, then continue to checkout.
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (
        clickBySelectors([
          'button[data-testid="view-cart-btn"]',
          'button[data-automation-id="view-cart-btn"]',
          '[data-testid="cart-count-link"]',
          'a[href="/cart"]',
          '[data-automation-id="cart-icon"]'
        ]) ||
        clickByText(['view cart', 'go to cart'])
      ) {
        return;
      }
      await sleep(250);
    }

    window.location.href = 'https://www.walmart.com/cart';
  };

  const runCartFlow = async () => {
    for (let attempt = 0; attempt < 35; attempt += 1) {
      if (
        clickBySelectors([
          'button[data-automation-id="cart-continue-checkout"]',
          'button[data-testid="continue-to-checkout-button"]',
          'button[data-testid="checkout-button"]',
          'button[data-testid="proceed-to-checkout"]',
          'button[aria-label*="Continue to checkout"]',
          'a[href*="/checkout"]'
        ]) ||
        clickByText(['continue to checkout', 'proceed to checkout', 'checkout'])
      ) {
        return;
      }
      await sleep(350);
    }

    window.location.href = 'https://www.walmart.com/checkout';
  };

  const runCheckoutFlow = async () => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (
        clickBySelectors([
          'button[data-testid="shipping-continue-btn"]',
          'button[data-automation-id="shipping-continue-cta"]',
          'button[data-testid="save-and-continue-btn"]',
          'button[aria-label*="Continue to payment"]',
          'button[aria-label*="Save and continue"]',
          'button[aria-label*="Continue checkout"]',
          'button[data-testid="continue-button"]'
        ]) ||
        clickByText(['continue to payment', 'save and continue', 'continue checkout', 'continue'])
      ) {
        await sleep(700);
        continue;
      }

      const termsCheckbox = [
        'input[data-testid="terms-checkbox"]',
        'input[id="terms-and-conditions"]',
        'input[name="terms"]'
      ].map((selector) => document.querySelector(selector)).find(Boolean);

      if (termsCheckbox && !termsCheckbox.checked && !termsCheckbox.disabled) {
        termsCheckbox.click();
        await sleep(300);
      }

      if (
        clickBySelectors([
          'button[data-testid="place-order-btn"]',
          'button[data-automation-id="place-order-btn"]',
          'button[aria-label*="Place order"]',
          'button[aria-label*="Review order"]',
          '#place-order-btn'
        ]) ||
        clickByText(['place order', 'review order'])
      ) {
        return;
      }
      await sleep(500);
    }
  };

  const path = window.location.pathname.toLowerCase();
  if (path.startsWith('/checkout')) {
    runCheckoutFlow();
  } else if (path === '/cart') {
    runCartFlow();
  } else if (path.startsWith('/ip/')) {
    runProductFlow();
  }
})();
