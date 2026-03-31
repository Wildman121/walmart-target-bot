
const walmartProductPageSelectors = {
  outOfStock: [
    '[data-automation-id="fulfillment-out-of-stock"]',
    '[data-testid="fulfillment-summary-outofstock"]',
    'button[disabled][data-automation-id="atc-button"]',
    '[aria-label*="Out of stock"]',
    '.prod-out-of-stock'
  ],
  addToCart: [
    '[data-automation-id="atc-button"]',
    'button[data-testid="ip-add-to-cart-btn"]',
    'button[data-testid="add-to-cart-btn"]',
    'button[aria-label*="Add to cart"]',
    'button[aria-label*="Add to Cart"]',
    '#btn-atc',
    '.WMButton[data-tl-id="atc-button"]'
  ],
  addToCartResult: {
    successContainer: [
      '[data-testid="cart-added-modal"]',
      '[data-automation-id="cart-flyout"]',
      '.cart-added-item-container',
      '[aria-label="Item added to cart"]'
    ],
    errorContainer: [
      '[data-testid="error-banner"]',
      '.error-alert',
      '[role="alert"]'
    ],
    viewCartButton: [
      '[data-testid="cart-count-link"]',
      'a[href="/cart"]',
      '[data-automation-id="cart-icon"]'
    ],
    closeButton: [
      '[data-automation-id="close-modal-btn"]',
      'button[aria-label="Close"]',
      '[data-testid="close-modal"]'
    ]
  },
  quantity: {
    stepper: {
      increment: '[data-testid="quantity-increment-btn"]',
      decrement: '[data-testid="quantity-decrement-btn"]',
      value: '[data-testid="quantity-input"]'
    },
    dropdown: [
      'select[data-testid="quantity-select"]',
      'select[name="quantity"]',
      'select[aria-label*="Quantity"]',
      '.qty-select'
    ]
  }
};

const walmartCheckoutPageSelectors = {
  loadingSpinner: [
    '[data-testid="spinner"]',
    '.loading-spinner',
    '[aria-busy="true"]',
    '[data-automation-id="spinner"]',
    '.spin-icon'
  ],
  shippingForm: [
    '[data-testid="shipping-form"]',
    '#shipping-form',
    'form[data-automation-id="shipping-address-form"]',
    '.shipping-address-form'
  ],
  shippingFields: {
    firstName: [
      'input[data-testid="firstName"]',
      'input[id="first-name"]',
      'input[name="firstName"]',
      'input[placeholder*="First name"]',
      'input[aria-label*="First name"]'
    ],
    lastName: [
      'input[data-testid="lastName"]',
      'input[id="last-name"]',
      'input[name="lastName"]',
      'input[placeholder*="Last name"]',
      'input[aria-label*="Last name"]'
    ],
    address1: [
      'input[data-testid="addressLineOne"]',
      'input[id="address-line1"]',
      'input[name="addressLine1"]',
      'input[placeholder*="Street address"]',
      'input[aria-label*="Street address"]'
    ],
    address2: [
      'input[data-testid="addressLineTwo"]',
      'input[id="address-line2"]',
      'input[name="addressLine2"]',
      'input[placeholder*="Apt"]',
      'input[aria-label*="Apt"]'
    ],
    city: [
      'input[data-testid="city"]',
      'input[id="city"]',
      'input[name="city"]',
      'input[placeholder*="City"]',
      'input[aria-label*="City"]'
    ],
    state: [
      'select[data-testid="state"]',
      'select[id="state"]',
      'select[name="state"]',
      'select[aria-label*="State"]'
    ],
    zip: [
      'input[data-testid="postalCode"]',
      'input[id="zip-code"]',
      'input[name="postalCode"]',
      'input[placeholder*="ZIP"]',
      'input[aria-label*="ZIP"]'
    ],
    phone: [
      'input[data-testid="phone"]',
      'input[id="phone-number"]',
      'input[name="phone"]',
      'input[placeholder*="Phone"]',
      'input[aria-label*="Phone"]'
    ],
    email: [
      'input[data-testid="email"]',
      'input[id="email"]',
      'input[name="email"]',
      'input[type="email"]',
      'input[placeholder*="Email"]'
    ]
  },
  continueButtons: {
    shipping: [
      'button[data-testid="shipping-continue-btn"]',
      'button[data-automation-id="shipping-continue-cta"]',
      'button[aria-label*="Continue to payment"]',
      'button[aria-label*="Continue to Payment"]'
    ],
    saveAndContinue: [
      'button[data-testid="save-and-continue-btn"]',
      'button[aria-label*="Save and continue"]'
    ]
  },
  paymentForm: [
    '[data-testid="payment-section"]',
    '#payment-section',
    'form[data-automation-id="payment-form"]',
    '.payment-form'
  ],
  paymentFields: {
    cardNumber: [
      'input[data-testid="cc-input"]',
      'input[id="credit-card-number"]',
      'input[name="ccNumber"]',
      'input[placeholder*="Card number"]',
      'input[aria-label*="Credit card number"]',
      'input[autocomplete="cc-number"]'
    ],
    nameOnCard: [
      'input[data-testid="cc-name"]',
      'input[id="credit-card-name"]',
      'input[name="ccName"]',
      'input[placeholder*="Name on card"]',
      'input[aria-label*="Name on card"]',
      'input[autocomplete="cc-name"]'
    ],
    expiryMonth: [
      'select[data-testid="cc-exp-month"]',
      'select[id="expiry-month"]',
      'select[name="expMonth"]',
      'select[aria-label*="Expiration month"]',
      'input[data-testid="cc-exp"]',
      'input[placeholder*="MM"]'
    ],
    expiryYear: [
      'select[data-testid="cc-exp-year"]',
      'select[id="expiry-year"]',
      'select[name="expYear"]',
      'select[aria-label*="Expiration year"]',
      'input[placeholder*="YY"]'
    ],
    cvv: [
      'input[data-testid="cc-csc"]',
      'input[id="cvv"]',
      'input[name="cvv"]',
      'input[placeholder*="CVV"]',
      'input[placeholder*="Security code"]',
      'input[aria-label*="CVV"]',
      'input[autocomplete="cc-csc"]'
    ]
  },
  placeOrderButton: 'button[data-testid="place-order-btn"]',
  placeOrderButtonSelectors: [
    'button[data-testid="place-order-btn"]',
    'button[data-automation-id="place-order-btn"]',
    'button[aria-label*="Place order"]',
    'button[aria-label*="Place Order"]',
    '#place-order-btn'
  ],
  termsCheckbox: [
    'input[data-testid="terms-checkbox"]',
    'input[id="terms-and-conditions"]',
    'input[name="terms"]'
  ]
};

const walmartPopupSelectors = {
  continueButton: [
    'button[data-testid="affirm-button"]',
    'button[data-testid="continue-modal-btn"]',
    'button[aria-label*="Continue"]',
    'button[aria-label*="continue"]'
  ],
  closeButton: [
    'button[data-testid="modal-close-btn"]',
    'button[aria-label="Close"]',
    '[data-automation-id="modal-close"]'
  ],
  errorOkButton: [
    'button[data-testid="error-modal-ok"]',
    'button[aria-label="OK"]',
    'button[aria-label="Ok"]',
    'button[aria-label="Dismiss"]',
    'button[data-testid="dismiss-btn"]'
  ]
};

const walmartCartPageSelectors = {
  continueToCheckoutButton: [
    'button[data-automation-id="cart-continue-checkout"]',
    'button[data-testid="continue-to-checkout-button"]',
    'button[data-testid="checkout-button"]',
    'button[aria-label*="Continue to checkout"]',
    'button[aria-label*="Checkout"]',
    'a[href*="/checkout"]'
  ]
};

const walmartLoginPageSelectors = {
  loginForm: [
    'form[data-testid="sign-in-form"]',
    '#sign-in-form',
    'form[action*="login"]'
  ],
  loginFields: {
    email: [
      'input[data-testid="email-input"]',
      'input[id="email"]',
      'input[name="email"]',
      'input[type="email"]'
    ],
    password: [
      'input[data-testid="password-input"]',
      'input[id="password"]',
      'input[name="password"]',
      'input[type="password"]'
    ]
  },
  signInButton: [
    'button[data-testid="sign-in-btn"]',
    'button[aria-label*="Sign in"]',
    'button[type="submit"]',
    '#sign-in-btn'
  ],
  loggedInIndicators: [
    '[data-testid="account-greeting"]',
    '[data-automation-id="account-name"]',
    '#header-user-name',
    '.header-account__name'
  ]
};

const walmartAntiBotSelectors = {
  challengeContainers: [
    '[data-testid="captcha-container"]',
    '#px-captcha',
    '#captcha-container',
    'iframe[src*="captcha"]',
    'iframe[title*="challenge"]',
    'iframe[title*="CAPTCHA"]',
    'form[action*="challenge"]',
    '[data-automation-id*="challenge"]',
    '[class*="captcha"]',
    '[id*="captcha"]'
  ],
  challengeText: [
    'Verify you are a human',
    'Press and hold',
    'Security checkpoint',
    'Please complete the challenge',
    'unusual activity'
  ]
};

window.walmartSelectors = {
  productPageSelectors: walmartProductPageSelectors,
  cartPageSelectors: walmartCartPageSelectors,
  checkoutPageSelectors: walmartCheckoutPageSelectors,
  popupSelectors: walmartPopupSelectors,
  loginPageSelectors: walmartLoginPageSelectors,
  antiBotSelectors: walmartAntiBotSelectors
};

console.log('sites/walmart/selectors.js: Script loaded.');