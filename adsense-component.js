// Reusable Google AdSense Component
// Loads the AdSense script once and manages multiple ad placements

import { ADSENSE_CONFIG, validateAdsenseConfig } from './adsense-config.js';

let adScriptLoaded = false;
const loadedAds = new Set();

// Load the AdSense script once
function loadAdSenseScript() {
  if (adScriptLoaded) return;

  if (!validateAdsenseConfig()) {
    console.warn('AdSense configuration incomplete. Ads will not display.');
    adScriptLoaded = true; // Mark as loaded to avoid repeated attempts
    return;
  }

  // Every page already loads adsbygoogle.js in its <head> (the site-wide AdSense snippet); a second
  // copy would load the library twice.
  if (document.querySelector('script[src*="adsbygoogle.js"]')) {
    adScriptLoaded = true;
    return;
  }

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CONFIG.publisherId}`;
  script.crossOrigin = 'anonymous';
  // No push on load: each slot already queued its own push in insertAd, and AdSense works through
  // that queue when the script arrives. An extra push here has no empty slot to fill and errors.
  script.onerror = () => {
    console.error('Failed to load AdSense script');
    adScriptLoaded = true;
  };
  document.head.appendChild(script);
  adScriptLoaded = true;
}

// Create an ad slot
export function createAdSlot(location) {
  // Validate location
  if (!ADSENSE_CONFIG.slots[location]) {
    console.error(`Unknown ad location: ${location}`);
    return null;
  }

  // Avoid duplicate ads in the same location
  if (loadedAds.has(location)) {
    console.warn(`Ad already created for location: ${location}`);
    return null;
  }

  // Load script if not already loaded
  if (!adScriptLoaded) {
    loadAdSenseScript();
  }

  // Create the ad container
  const container = document.createElement('div');
  container.className = `adsense-ad adsense-${location}`;
  container.setAttribute('data-ad-location', location);

  // Create the ad slot
  const adSlot = document.createElement('ins');
  adSlot.className = 'adsbygoogle';
  adSlot.setAttribute('style', 'display:inline-block');
  adSlot.setAttribute('data-ad-client', ADSENSE_CONFIG.publisherId);
  adSlot.setAttribute('data-ad-slot', ADSENSE_CONFIG.slots[location]);
  adSlot.setAttribute('data-ad-format', 'auto');
  adSlot.setAttribute('data-full-width-responsive', 'true');

  container.appendChild(adSlot);
  loadedAds.add(location);

  // Not pushed here: AdSense fills only <ins> elements already in the page, so the push happens
  // in insertAd after the container is attached.
  return container;
}

// Determine ad format based on location
function getAdFormat(location) {
  switch (location) {
    case 'sidebar':
      return 'rectangle';
    case 'topContent':
      return 'horizontal';
    case 'belowTool':
      return 'horizontal';
    default:
      return 'auto';
  }
}

// Insert an ad into a specific DOM element
export function insertAd(location, targetElement) {
  if (typeof targetElement === 'string') {
    targetElement = document.querySelector(targetElement);
  }

  // Slots are per-page: the homepage has no sidebar, tool pages have no in-article slot. An
  // absent target means this page simply does not offer that placement, which is not an error.
  if (!targetElement) return false;

  const adContainer = createAdSlot(location);
  if (!adContainer) return false;

  targetElement.appendChild(adContainer);

  // One push per slot, after it is in the page. The array is a queue: if the AdSense script has
  // not loaded yet, it processes these pushes when it arrives.
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch (e) {
    console.error('Error pushing ad to AdSense:', e);
  }
  return true;
}

// Insert all ads (convenience function)
export function insertAllAds() {
  const locations = [
    { location: 'sidebar', selector: '#adsense-sidebar' },
    { location: 'topContent', selector: '#adsense-top-content' },
    { location: 'belowTool', selector: '#adsense-below-tool' }
  ];

  locations.forEach(({ location, selector }) => {
    insertAd(location, selector);
  });
}

// Initialize ads when DOM is ready
export function initializeAds() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', insertAllAds);
  } else {
    insertAllAds();
  }
}
