/* Sovereign Energy landing pages: shared config. Edit ENDPOINT once; all 6 pages use it. */
window.LP_CONFIG = {
  // Paste your deployed Google Apps Script Web App URL here (ends in /exec). Empty = demo mode (no data sent).
  ENDPOINT: "https://script.google.com/macros/s/AKfycbzzaX5L22lKBNIw9MVgVvu_uXyLBDJo_zhVZvaEvVh3HKO8Szr1RCNRAtqWIUg-4rXpFw/exec",
  BRAND: "Sovereign",          // must match the Sheet tab name
  NO_CORS: true,           // Apps Script needs no-cors; set false only for an endpoint that returns CORS headers
  MAX_UPLOAD_MB: 8
};
