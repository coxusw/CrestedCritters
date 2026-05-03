/*
 * Isopedia frontend config
 *
 * After you deploy Apps Script as a Web App, paste the URL below.
 * Example:
 * API_URL: "https://script.google.com/macros/s/AKfycbx.../exec"
 */
window.ISOPEDIA_CONFIG = {
  SITE_NAME: "Isopedia",
  API_URL: "https://script.google.com/macros/s/AKfycbyROPf_zU0eWchzCn2RjCp9JiYc5e8_ZW0A0mQIhmNxQYAEk9WzLAfQna9v9RqKLyjP/exec",
  DATA_URL: "data/isopods.json",
  DONATORS_URL: "data/donators.json",

  // During early testing, true makes the site read current Sheet data through Apps Script first.
  // Later, after GitHub publishing is configured, you can set this to false to prefer static JSON.
  USE_LIVE_API_DATA: true,

  // Optional donation links. Replace with your real Square/PayPal/Cash App links.
  DONATE_LINKS: {
    square: "",
    paypal: "",
    cashapp: ""
  }
};
