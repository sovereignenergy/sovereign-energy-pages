/* Helios voice config. Switch providers here. Never put an API key in this file. */
window.HELIOS_CONFIG = {
  // "webspeech" uses the browser Speech Synthesis API.
  // "elevenlabs" streams speech from HELIOS_CONFIG.elevenLabsProxy (the key stays on that server).
  voiceProvider: "webspeech",
  elevenLabsProxy: "",
  elevenVoiceId: "",
  // Default face when the page has no ?avatar= param. URL wins over this.
  // CLOSER_BRAND.defaultAvatar is the fallback if this is empty.
  avatar: "halo"
};
