"use strict";

// --- Mode presets (same as in popup.js) ---
const modePresets = {
  off: {
    BTubeOn: false,
    redirect_home: false,
    hide_shorts: false,
    minimal_homepage: false,
    enable_website_blocking: false,
    hide_sidebar_recommendations: false
  },
  minimal: {
    BTubeOn: true,
    redirect_home: false,
    hide_shorts: true,
    minimal_homepage: true,
    enable_website_blocking: true,
    hide_sidebar_recommendations: true
  },
  "high-focus": {
    BTubeOn: true,
    redirect_home: false,
    hide_shorts: true,
    minimal_homepage: true,
    enable_website_blocking: true,
    hide_sidebar_recommendations: true
  }
};

const MODE_STORAGE_KEY = 'btube_mode';
const MODE_SETTINGS_SNAPSHOT_KEY = 'btube_mode_settings_snapshot';
const MODE_UPDATED_AT_KEY = 'btube_mode_updated_at';
const VALID_MODES = new Set(['off', 'minimal', 'high-focus', 'custom']);

function detectModeFromSettings(settings) {
  for (const [modeName, preset] of Object.entries(modePresets)) {
    const matches = Object.keys(preset).every((key) => settings[key] === preset[key]);
    if (matches) return modeName;
  }
  return 'custom';
}

function pickSettingsSnapshot(settings) {
  const keys = [
    'BTubeOn',
    'redirect_home',
    'hide_shorts',
    'minimal_homepage',
    'enable_website_blocking',
    'hide_sidebar_recommendations'
  ];

  return keys.reduce((acc, key) => {
    acc[key] = !!settings[key];
    return acc;
  }, {});
}

// --- Initialize settings (set minimal mode as default if none exist) ---
chrome.storage.local.get(null, (existing) => {
  // Remove any legacy defaultSettings or enable_channel_blocking
  const { enable_channel_blocking, ...rest } = existing;
  const mergedSettings = { ...modePresets.minimal, ...rest };

  const settingsSnapshot = pickSettingsSnapshot(mergedSettings);
  const detectedMode = detectModeFromSettings(settingsSnapshot);
  const persistedMode = VALID_MODES.has(mergedSettings[MODE_STORAGE_KEY])
    ? mergedSettings[MODE_STORAGE_KEY]
    : detectedMode;
  mergedSettings[MODE_STORAGE_KEY] = persistedMode;
  mergedSettings[MODE_SETTINGS_SNAPSHOT_KEY] = settingsSnapshot;
  if (typeof mergedSettings[MODE_UPDATED_AT_KEY] !== 'number') {
    mergedSettings[MODE_UPDATED_AT_KEY] = Date.now();
  }
  
  // Ensure new settings have default values if not present
  if (!('hide_sidebar_recommendations' in mergedSettings)) {
    mergedSettings.hide_sidebar_recommendations = false;
  }
  
  chrome.storage.local.set(mergedSettings);
});

// --- Redirect rules ---
const homeRedirectRules = [
  {
    id: 1,
    priority: 1,
    action: { type: "redirect", redirect: { url: "https://www.youtube.com/feed/subscriptions" } },
    condition: { urlFilter: "youtube.com/feed/trending", resourceTypes: ["main_frame"] }
  },
  {
    id: 2,
    priority: 1,
    action: { type: "redirect", redirect: { url: "https://www.youtube.com/feed/subscriptions" } },
    condition: { urlFilter: "youtube.com/shorts", resourceTypes: ["main_frame"] }
  },
  {
    id: 3,
    priority: 1,
    action: { type: "redirect", redirect: { url: "https://www.youtube.com/feed/subscriptions" } },
    condition: { regexFilter: "^https://(www\\.)?youtube\\.com/?$", resourceTypes: ["main_frame"] }
  }
];

const shortsRedirectRules = [
  {
    id: 4, // changed to unique ID
    priority: 1,
    action: { type: "redirect", redirect: { url: "https://www.youtube.com/feed/subscriptions" } },
    condition: { urlFilter: "youtube.com/shorts", resourceTypes: ["main_frame"] }
  }
];

// --- Rule management ---
async function updateRedirectRules(rulesToAdd, rulesToRemove) {
  try {
    console.group('[DNR] updateRedirectRules');
    console.log('About to update dynamic rules', {
      addCount: rulesToAdd?.length || 0,
      removeCount: rulesToRemove?.length || 0,
      removeRuleIds: rulesToRemove
    });
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: rulesToAdd,
      removeRuleIds: rulesToRemove
    });
    // Verify the applied rules
    const allRules = await chrome.declarativeNetRequest.getDynamicRules();
    const ids = allRules.map(r => r.id).sort((a,b)=>a-b);
    console.log('Dynamic rules now installed:', { count: allRules.length, ids });
    console.groupEnd();
  } catch (err) {
    console.groupEnd();
    console.error("[DNR] Failed to update redirect rules:", err);
  }
}

function enableHomeRedirects() {
  updateRedirectRules(homeRedirectRules, homeRedirectRules.map(r => r.id));
}

function disableHomeRedirects() {
  updateRedirectRules([], homeRedirectRules.map(r => r.id));
}

function enableShortsRedirects() {
  updateRedirectRules(shortsRedirectRules, shortsRedirectRules.map(r => r.id));
}

function disableShortsRedirects() {
  updateRedirectRules([], shortsRedirectRules.map(r => r.id));
}

// ===== Dynamic rules for user-blocked websites =====
const BLOCK_RULE_BASE_ID = 1000; // Reserve IDs >= 1000 for blocked website rules

// Escape a string for safe use inside a regex
function escapeForRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build declarativeNetRequest rules from the blockedWebsites array
function buildBlockedWebsiteRules(blockedWebsites) {
  let nextId = BLOCK_RULE_BASE_ID;
  const rules = [];

  (blockedWebsites || []).forEach(entry => {
    if (!entry || !entry.url) return;
    let raw = String(entry.url).trim().toLowerCase();
    if (!raw) return;

    // Strip the scheme (http:// or https://) if present
    raw = raw.replace(/^https?:\/\//, '');
    // Remove trailing slash
    raw = raw.replace(/\/$/, '');
    if (!raw) return;

    try {
      // Use urlFilter with || prefix for proper subdomain matching
      const urlFilter = `||${raw}`;
      
      // Rule 1: Redirect main_frame to google.com with HIGHEST priority (1)
      // This must execute first before any block rules
      rules.push({
        id: nextId++,
        priority: 1,
        action: { type: 'redirect', redirect: { url: 'https://www.google.com/' } },
        condition: {
          urlFilter,
          resourceTypes: ['main_frame']
        }
      });
      
      // Rule 2: Redirect all other resource types with LOWER priority (2)
      // This ensures main_frame redirect is evaluated first, then everything else
      rules.push({
        id: nextId++,
        priority: 2,
        action: { type: 'redirect', redirect: { url: 'https://www.google.com/' } },
        condition: {
          urlFilter,
          resourceTypes: [
            'sub_frame',
            'xmlhttprequest',
            'script',
            'other'
          ]
        }
      });
    } catch (e) {
      console.warn('Skipping invalid blocked website rule for', raw, e);
    }
  });

  return rules;
}

// Debounce mechanism to prevent duplicate rule applications
let applyBlockedRulesTimeout = null;
let isApplyingBlockedRules = false;

async function applyBlockedWebsiteRules(blockedWebsites) {
  // Cancel any pending application
  if (applyBlockedRulesTimeout) {
    clearTimeout(applyBlockedRulesTimeout);
    applyBlockedRulesTimeout = null;
  }
  
  // If already applying, debounce this call
  if (isApplyingBlockedRules) {
    applyBlockedRulesTimeout = setTimeout(() => {
      applyBlockedWebsiteRules(blockedWebsites);
    }, 100);
    return;
  }
  
  isApplyingBlockedRules = true;
  
  console.group('[Blocks] Applying blocked website rules');
  console.log('Blocked websites input:', blockedWebsites);
  
  try {
    // Check if website blocking is enabled
    const settings = await chrome.storage.local.get(['enable_website_blocking']);
    const isEnabled = settings.enable_website_blocking !== false;
    
    console.log('Website blocking enabled:', isEnabled);
    
    // Get ALL currently installed dynamic rules to find existing block rules
    const allCurrentRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingBlockRules = allCurrentRules.filter(r => r.id >= BLOCK_RULE_BASE_ID);
    const existingBlockIds = existingBlockRules.map(r => r.id);
    
    // If disabled, remove all blocking rules
    if (!isEnabled) {
      if (existingBlockIds.length > 0) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          addRules: [],
          removeRuleIds: existingBlockIds
        });
        await chrome.storage.local.set({ btube_block_rule_ids: [] });
        console.log('Website blocking disabled - removed', existingBlockIds.length, 'rules');
      }
      console.groupEnd();
      isApplyingBlockedRules = false;
      return;
    }
    
    const rules = buildBlockedWebsiteRules(blockedWebsites);
    const toAdd = rules;

    // Remove ALL existing block rules first (not just stored ones)
    if (existingBlockIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: [],
        removeRuleIds: existingBlockIds
      });
      console.log('Removed', existingBlockIds.length, 'existing block rules');
    }
    
    // Add new rules
    if (toAdd.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: toAdd,
        removeRuleIds: []
      });
    }
    
    await chrome.storage.local.set({ btube_block_rule_ids: toAdd.map(r => r.id) });
    console.log(`Applied ${toAdd.length} blocked-website redirect rules`, {
      removedIds: existingBlockIds,
      addedIds: toAdd.map(r => r.id),
      samples: toAdd.slice(0, 3).map(r => ({ id: r.id, regex: r.condition.regexFilter }))
    });

    // Verify install status
    const allRules = await chrome.declarativeNetRequest.getDynamicRules();
    const blockRange = allRules.filter(r => r.id >= BLOCK_RULE_BASE_ID);
    console.log('Verification: dynamic rules count', allRules.length, 'blocked-range count', blockRange.length);
    console.groupEnd();
  } catch (err) {
    console.groupEnd();
    console.error('[Blocks] Failed updating blocked website rules:', err);
  } finally {
    isApplyingBlockedRules = false;
  }
}

// Initialize blocked website rules on startup
chrome.storage.local.get(['blockedWebsites'], (res) => {
  const list = res.blockedWebsites || [];
  console.log('[Startup] Initializing blocked website rules with', list.length, 'entries');
  applyBlockedWebsiteRules(list);
});

// Rebuild rules whenever the blocked list changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.blockedWebsites) {
    const list = changes.blockedWebsites.newValue || [];
    console.log('[Storage] blockedWebsites changed:', {
      oldLen: (changes.blockedWebsites.oldValue || []).length,
      newLen: list.length
    });
    applyBlockedWebsiteRules(list);
  }
  // Also re-apply rules when the enable_website_blocking setting changes
  if (changes.enable_website_blocking) {
    console.log('[Storage] enable_website_blocking changed:', changes.enable_website_blocking.newValue);
    chrome.storage.local.get(['blockedWebsites'], (res) => {
      const list = res.blockedWebsites || [];
      applyBlockedWebsiteRules(list);
    });
  }
});

// --- Notification system ---
function showOverlayNotification(message, type = 'info') {
  return new Promise((resolve, reject) => {
    if (chrome && chrome.notifications) {
      // Use chrome.runtime.getURL to get the proper path to local assets
      const iconUrl = chrome.runtime.getURL('assets/logo_v2.png');
      
      chrome.notifications.create(
        '', // Empty string to auto-generate notification ID
        {
          type: 'basic',
          iconUrl: iconUrl,
          title: 'BetterTube',
          message: message,
          priority: 2
        },
        (notificationId) => {
          if (chrome.runtime.lastError) {
            console.error('Notification error:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else {
            console.log('Notification created with ID:', notificationId);
            resolve(notificationId);
          }
        }
      );
    } else {
      reject(new Error('Notifications API not available'));
    }
  });
}


// --- Listen for messages ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('Background received message:', msg.type);
  
  if (msg.type === "toggleRedirects") {
    msg.enabled ? enableHomeRedirects() : disableHomeRedirects();
    sendResponse({ success: true });
  } else if (msg.type === "toggleShorts") {
    msg.enabled ? enableShortsRedirects() : disableShortsRedirects();
    sendResponse({ success: true });
  } else if (msg.type === "showNotification") {
    console.log('Processing notification request:', msg.message);
    // Handle async overlay notification
    showOverlayNotification(msg.message, msg.notificationType || 'info')
      .then((notificationId) => {
        console.log('Notification sent successfully with ID:', notificationId);
        sendResponse({ success: true, notificationId });
      })
      .catch((error) => {
        console.error('Notification error:', error);
        sendResponse({ success: false, error: error.message || String(error) });
      });
    return true; // Keep message channel open for async response
  } else if (msg.type === "checkOverlay") {
    // Diagnostic message
    chrome.tabs.query({ active: true, currentWindow: true })
      .then(tabs => {
        if (tabs.length > 0) {
          return checkTabForOverlay(tabs[0].id);
        }
        throw new Error('No active tab');
      })
      .then(result => {
        sendResponse(result);
      })
      .catch(error => {
        sendResponse({ hasOverlay: false, error: error.message });
      });
    return true;
  }
  return false; // No async response needed for other messages
});
