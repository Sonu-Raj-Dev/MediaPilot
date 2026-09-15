// Google AdSense Configuration
// UPDATE THESE VALUES with your actual AdSense publisher ID and ad slot IDs
// from your Google AdSense account

export const ADSENSE_CONFIG = {
  // Your Google AdSense Publisher ID (format: ca-pub-xxxxxxxxxxxxxxxx)
  publisherId: 'pub-5308568581303754',

  // Ad slot IDs for each location (format: xxxxxxxxxx)
  slots: {
    // Sidebar ad - below "Support the website" section
    sidebar: '4734687975',

    // Top content ad - near the top of the main editor
    topContent: '3659998191',

    // Below-tool ad - below the editor/tool
    belowTool: '6402992862'
  },

  // Ad dimensions (standard sizes)
  dimensions: {
    sidebar: { width: 300, height: 250 },      // Medium Rectangle
    topContent: { width: 728, height: 90 },    // Leaderboard
    belowTool: { width: 728, height: 90 }      // Leaderboard
  }
};

// Helper to validate configuration
export function validateAdsenseConfig() {
  const config = ADSENSE_CONFIG;
  const errors = [];

  if (!config.publisherId || config.publisherId.includes('YOUR_PUBLISHER_ID')) {
    errors.push('Publisher ID not configured');
  }

  if (!config.slots.sidebar || config.slots.sidebar.includes('YOUR_SIDEBAR_SLOT_ID')) {
    errors.push('Sidebar ad slot ID not configured');
  }

  if (!config.slots.topContent || config.slots.topContent.includes('YOUR_TOP_CONTENT_SLOT_ID')) {
    errors.push('Top content ad slot ID not configured');
  }

  if (!config.slots.belowTool || config.slots.belowTool.includes('YOUR_BELOW_TOOL_SLOT_ID')) {
    errors.push('Below-tool ad slot ID not configured');
  }

  if (errors.length > 0) {
    console.warn('AdSense Configuration Incomplete:', errors);
    return false;
  }

  return true;
}
