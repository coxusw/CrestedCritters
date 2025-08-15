// Temporary config so the site loads. Replace with your real Sandbox Client ID.
window.PAYPAL_CLIENT_ID = "AaSntjhYT6cykT5FKUJVbrQuSar3k1W9MErwdLzU0LFwzqBjQ42gDY4qGxUsfZPYHBCDP9zeNTQRkCaa";
window.PAYPAL_ENV = "sandbox";
window.PAYPAL_CURRENCY = "USD";

// --- Checkout settings ---
// Indiana flat sales tax example (change as needed)
window.TAX_RATE = 0.07;            // 7%
// Shipping config
window.SHIPPING_FLAT = 10.00;      // $10 flat-rate shipping
window.TAX_SHIPPING = true;        // whether shipping is taxable
// Google Sheets webhook (Apps Script Web App URL)
// Set to your deployed URL (e.g., https://script.google.com/macros/s/AKfycb.../exec)
window.GS_WEBHOOK = "";     // add googlesheet webhook here once set up

// --- Shipping methods (edit labels/costs/taxability) ---
window.SHIPPING_METHODS = [
  { key: "pickup",   label: "Local Pickup (Free)",   cost: 0.00,  taxable: false, paypalShippingPreference: "NO_SHIPPING" },
  { key: "standard", label: "Standard Shipping",     cost: 10.00, taxable: true,  paypalShippingPreference: "GET_FROM_FILE" },
  { key: "express",  label: "Express Shipping",      cost: 25.00, taxable: true,  paypalShippingPreference: "GET_FROM_FILE" }
];
// Default preselected shipping method
window.DEFAULT_SHIPPING_METHOD = "standard";
