// --- Notification Helper ---
function showNotification(message, type = 'info') {
    if (chrome && chrome.notifications) {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'assets/logo_v2.png',
            title: 'BTube',
            message: message
        });
    }
}

// --- Get dark mode preference ---
function applyDarkMode() {
    chrome.storage.local.get("themeSetting", (data) => {
        const themeSetting = data.themeSetting || 'system';
        if (themeSetting === 'system') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (prefersDark) {
                document.documentElement.setAttribute("dark_mode", "true");
            } else {
                document.documentElement.removeAttribute("dark_mode");
            }
        } else if (themeSetting === 'dark') {
            document.documentElement.setAttribute("dark_mode", "true");
        } else if (themeSetting === 'light') {
            document.documentElement.removeAttribute("dark_mode");
        }
    });
}


// Mapping HTML checkbox IDs -> Storage keys
const settingsMap = {
    "extension-online": "BTubeOn",
    "redirect-subscriptions": "redirect_home",
    "disable-shorts": "hide_shorts",
    "minimal-homepage": "minimal_homepage"
};

const MODE_STORAGE_KEY = 'btube_mode';
const MODE_SETTINGS_SNAPSHOT_KEY = 'btube_mode_settings_snapshot';
const MODE_UPDATED_AT_KEY = 'btube_mode_updated_at';
const SETTINGS_SNAPSHOT_KEYS = [
    'BTubeOn',
    'redirect_home',
    'hide_shorts',
    'minimal_homepage',
    'enable_website_blocking',
    'hide_sidebar_recommendations'
];

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
    'high-focus': {
        BTubeOn: true,
        redirect_home: false,
        hide_shorts: true,
        minimal_homepage: true,
        enable_website_blocking: true,
        hide_sidebar_recommendations: true
    }
};

function detectModeFromSettings(settings) {
    for (const [modeName, preset] of Object.entries(modePresets)) {
        const matches = Object.keys(preset).every((key) => settings[key] === preset[key]);
        if (matches) return modeName;
    }
    return 'custom';
}

async function persistModeMetadataFromStorage() {
    const current = await chrome.storage.local.get(SETTINGS_SNAPSHOT_KEYS);
    const snapshot = {};
    SETTINGS_SNAPSHOT_KEYS.forEach((key) => {
        snapshot[key] = !!current[key];
    });

    await chrome.storage.local.set({
        [MODE_STORAGE_KEY]: detectModeFromSettings(snapshot),
        [MODE_SETTINGS_SNAPSHOT_KEY]: snapshot,
        [MODE_UPDATED_AT_KEY]: Date.now()
    });
}



// --- Load and attach listeners ---
function initSettingsToggles() {
    chrome.storage.local.get(Object.values(settingsMap), (result) => {
        for (const [checkboxId, storageKey] of Object.entries(settingsMap)) {
            const checkbox = document.getElementById(checkboxId);
            if (!checkbox) continue;

            // Load saved state
            checkbox.checked = !!result[storageKey];

            // (No HTML attribute logic here; only in content.js)

            // Save changes on toggle
            checkbox.addEventListener("change", () => {
                const newValue = checkbox.checked;
                chrome.storage.local.set({ [storageKey]: newValue }, () => {
                    persistModeMetadataFromStorage().catch((err) => {
                        console.error('Failed to persist mode metadata:', err);
                    });
                });

                // (No HTML attribute logic here; only in content.js)

                // Only show notification for non-dark mode settings
                const settingNames = {
                    "extension-online": "Extension",
                    "redirect-subscriptions": "Redirect to Subscriptions",
                    "disable-shorts": "Disable Shorts",
                    "minimal-homepage": "Minimal Homepage"
                };
                // Do not notify for dark mode
                if (settingNames.hasOwnProperty(checkboxId)) {
                    const settingName = settingNames[checkboxId];
                    showNotification(`${settingName} ${newValue ? 'enabled' : 'disabled'}`, 'info');
                }
            });
        }
    });
}



// ======================
// Init
// ======================

window.addEventListener("DOMContentLoaded", () => {
    applyDarkMode();
    initSettingsToggles();

    // Handle blocking link click - open popup with blocking tab
    const blockingLink = document.getElementById('blocking-link');
    if (blockingLink) {
        blockingLink.addEventListener('click', (e) => {
            e.preventDefault();
            // Store the target tab in storage
            chrome.storage.local.set({ targetTab: 'blocking' }, () => {
                // Open popup.html
                window.location.href = 'popup.html';
            });
        });
    }

    // Short delay to allow initial paint
    setTimeout(() => {
        document.body.setAttribute("data-loaded", "true");
    }, 50);
});
