(() => {
  if (window.__walmartBotLoaded) {
    console.log("Walmart bot already running, skipping...");
    return;
  }
  window.__walmartBotLoaded = true;

  console.log('Walmart bot running...');

  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  const findElement = (selectors) => {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  };

  const waitForElement = async (selectors, timeout = 15000) => {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const el = findElement(selectors);
      if (el && el.offsetParent !== null) return el;
      await wait(250);
    }

    return null;
  };

  (async () => {
    console.log("Waiting for Add to Cart...");

    const addToCartBtn = await waitForElement(
      window.walmartSelectors.productPageSelectors.addToCart
    );

    if (!addToCartBtn) {
      console.log("Add to Cart not found");
      return;
    }

    console.log("Clicking Add to Cart...");

    // simulate real click (more reliable)
    addToCartBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    addToCartBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    addToCartBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await wait(3000);

    console.log("Opening cart...");
    const cartBtn = findElement(
      window.walmartSelectors.productPageSelectors.addToCartResult.viewCartButton
    );

    if (cartBtn) {
      cartBtn.click();
    } else {
      window.location.href = "https://www.walmart.com/cart";
    }
  })();
})();