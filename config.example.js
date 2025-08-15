// Rename this file to config.js and paste your Sandbox Client ID below.
window.PAYPAL_CLIENT_ID = "YOUR_SANDBOX_CLIENT_ID_HERE";
window.PAYPAL_ENV = "sandbox"; // "sandbox" or "live"
window.PAYPAL_CURRENCY = "USD";

// --- Checkout settings ---
// Indiana flat sales tax example (change as needed)
window.TAX_RATE = 0.07;            // 7%
// Shipping config
window.SHIPPING_FLAT = 10.00;      // $10 flat-rate shipping
window.TAX_SHIPPING = true;        // whether shipping is taxable
// Google Sheets webhook (Apps Script Web App URL)
// Set to your deployed URL (e.g., https://script.google.com/macros/s/AKfycb.../exec)
window.GS_WEBHOOK = "YOUR_APPS_SCRIPT_WEB_APP_URL";

// --- Shipping methods (edit labels/costs/taxability) ---
window.SHIPPING_METHODS = [
  { key: "pickup",   label: "Local Pickup (Free)",   cost: 0.00,  taxable: false, paypalShippingPreference: "NO_SHIPPING" },
  { key: "standard", label: "Standard Shipping",     cost: 10.00, taxable: true,  paypalShippingPreference: "GET_FROM_FILE" },
  { key: "express",  label: "Express Shipping",      cost: 25.00, taxable: true,  paypalShippingPreference: "GET_FROM_FILE" }
];
// Default preselected shipping method
window.DEFAULT_SHIPPING_METHOD = "standard";
