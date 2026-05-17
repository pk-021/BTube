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

// --- Theme Selector ---
const themeSelector = document.getElementById("themeSelector");
const THEME_CACHE_KEY = 'btube_theme_cache';

function applyTheme(theme) {
    if (theme === 'system') {
        // Detect system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
            document.documentElement.setAttribute("dark_mode", "true");
        } else {
            document.documentElement.removeAttribute("dark_mode");
        }
    } else if (theme === 'dark') {
        document.documentElement.setAttribute("dark_mode", "true");
    } else if (theme === 'light') {
        document.documentElement.removeAttribute("dark_mode");
    }
}

function syncThemeSelectorState() {
    if (!themeSelector) return;
    chrome.storage.local.get("themeSetting", (result) => {
        const themeSetting = result.themeSetting || 'system';
        themeSelector.value = themeSetting;
        applyTheme(themeSetting);
        try { localStorage.setItem(THEME_CACHE_KEY, themeSetting); } catch (e) {}
    });
}

// Load theme setting on popup open
chrome.storage.local.get("themeSetting", (result) => {
    const themeSetting = result.themeSetting || 'system';
    applyTheme(themeSetting);
    if (themeSelector) {
        themeSelector.value = themeSetting;
    }
    try { localStorage.setItem(THEME_CACHE_KEY, themeSetting); } catch (e) {}
});

// Change theme on selection
if (themeSelector) {
    themeSelector.addEventListener("change", (e) => {
        const selectedTheme = e.target.value;
        applyTheme(selectedTheme);
        chrome.storage.local.set({ themeSetting: selectedTheme });
        try { localStorage.setItem(THEME_CACHE_KEY, selectedTheme); } catch (err) {}
    });
}

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    chrome.storage.local.get("themeSetting", (result) => {
        if (result.themeSetting === 'system' || !result.themeSetting) {
            syncThemeSelectorState();
        }
    });
});



// Close popup with animation
function closePopup() {
    const popup = document.getElementById("popup");
    if (!popup) return;
    popup.classList.add("closing");
    popup.addEventListener("animationend", () => popup.remove(), { once: true });
}



// --- Global pending changes state ---
const pendingChanges = {
    settings: null,
    blockedWebsites: null,
    hasSettingsChanges: false,
    hasBlockChanges: false,
    hasDeletions: false
};

let restoreSettingsState = null;
let restoreBlockedState = null;
let loginOverlay = null;

function hasPendingChanges() {
    return pendingChanges.hasSettingsChanges || pendingChanges.hasBlockChanges;
}

function setSaveButtonsVisibility(visible) {
    const footer = document.querySelector('.popup-footer');
    document.querySelectorAll('.save-settings-btn').forEach((button) => {
        button.classList.toggle('is-hidden', !visible);
        button.disabled = !visible;
    });

    const cancelButton = document.getElementById('cancel-changes-btn');
    const pendingLabel = document.getElementById('pending-changes-label');

    if (cancelButton) {
        cancelButton.disabled = !visible;
    }

    if (footer) {
        footer.classList.toggle('has-pending', visible);
        footer.hidden = !visible;
    }

    if (pendingLabel) {
        pendingLabel.textContent = 'Pending Changes';
    }
}

function updateSaveButtonVisibility() {
    setSaveButtonsVisibility(hasPendingChanges());
}

function clearPendingChanges(options = {}) {
    const { preserveBlockedWebsites = false } = options;

    pendingChanges.settings = null;
    if (!preserveBlockedWebsites) {
        pendingChanges.blockedWebsites = null;
    }
    pendingChanges.hasSettingsChanges = false;
    pendingChanges.hasBlockChanges = false;
    pendingChanges.hasDeletions = false;
}

async function discardPendingChanges() {
    const restoreTasks = [];

    if (typeof restoreSettingsState === 'function') {
        restoreTasks.push(restoreSettingsState());
    }

    if (typeof restoreBlockedState === 'function') {
        restoreTasks.push(restoreBlockedState());
    }

    const results = await Promise.allSettled(restoreTasks);
    results.forEach((result) => {
        if (result.status === 'rejected') {
            console.error('Failed to restore pending popup state:', result.reason);
        }
    });

    clearPendingChanges({ preserveBlockedWebsites: true });
    updateSaveButtonVisibility();
    refreshHomeSummary();
}

function safeRuntimeSendMessage(payload) {
    try {
        if (!chrome?.runtime?.id) return;
        chrome.runtime.sendMessage(payload, () => {
            if (chrome.runtime.lastError) {
                console.debug('[runtime] popup sendMessage skipped:', chrome.runtime.lastError.message);
            }
        });
    } catch (e) {
        console.debug('[runtime] popup sendMessage exception:', e?.message || e);
    }
}

function logNavUpdate(label, value) {
    console.log(label, value);
    try { localStorage.setItem('debug_nav_last', String(value)); } catch (e) {}
}

function createLoginOverlayController() {
    const overlay = document.getElementById('login-overlay');
    const show = () => {
        if (!overlay) return;
        overlay.hidden = false;
    };

    const hide = () => {
        if (!overlay) return;
        overlay.hidden = true;
    };

    return { show, hide };
}

window.addEventListener("DOMContentLoaded", () => {
    // Test notification button (uncomment for testing)
    const testBtn = document.getElementById("test-notification");
    if (testBtn) {
        testBtn.addEventListener("click", () => {
            showNotification("This is a test notification from BTube!", "info");
        });
    }
    
    // Check if we should open blocking tab (from settings link)
    chrome.storage.local.get(['targetTab'], (result) => {
        if (result.targetTab === 'blocking') {
            // Clear the flag
            chrome.storage.local.remove('targetTab');
            // Switch to blocking tab programmatically
            setTimeout(() => {
                switchToTab('blocking');
            }, 100);
        }
    });
    
    // Short delay to allow initial paint
    setTimeout(() => {
        document.body.setAttribute("data-loaded", "true");
    }, 50); // 50ms is usually enough

    // Tabs switching logic
    const tabViews = {
        home: document.getElementById('tab-home'),
        settings: document.getElementById('tab-settings'),
        blocking: document.getElementById('tab-blocking')
    };
    loginOverlay = createLoginOverlayController();
    window.BTubeLoginHost = {
        close: () => {
            loginOverlay.hide();
        },
        success: async () => {
            loginOverlay.hide();
            clearPendingChanges();
            updateSaveButtonVisibility();
            await Promise.allSettled([
                typeof restoreSettingsState === 'function' ? restoreSettingsState() : Promise.resolve(),
                typeof restoreBlockedState === 'function' ? restoreBlockedState() : Promise.resolve()
            ]);
            refreshHomeSummary();
        }
    };
    const addBlockBtn = document.getElementById('add-block-btn');
    const cancelChangesBtn = document.getElementById('cancel-changes-btn');
    let activeTabName = 'home';
    let isTabTransitioning = false;
    // Optional initial subview requested via hash (e.g. #settings:modes)

    function updateToolbarForTab(tabName) {
        if (addBlockBtn) {
            addBlockBtn.classList.toggle('is-hidden', tabName !== 'blocking');
        }

        updateSaveButtonVisibility();
    }

    function showTabInstant(tabName) {
        Object.entries(tabViews).forEach(([key, el]) => {
            if (!el) return;
            const show = key === tabName;
            el.classList.toggle('active', show);
            el.hidden = !show;
            el.classList.remove('tab-animating');
            el.style.transform = '';
        });

        activeTabName = tabName;
        updateToolbarForTab(tabName);
    }

    // Function to switch tabs programmatically
    function switchToTab(tabName, options = {}) {
        const { direction = 'forward', animate = true } = options;
        const targetView = tabViews[tabName];
        const currentView = tabViews[activeTabName];

        if (!targetView || isTabTransitioning || tabName === activeTabName) return;

        if (!animate || !currentView) {
            showTabInstant(tabName);
            return;
        }

        isTabTransitioning = true;

        const enterFrom = direction === 'back' ? '-100%' : '100%';
        const exitTo = direction === 'back' ? '100%' : '-100%';

        targetView.hidden = false;
        targetView.classList.add('active', 'tab-animating');
        currentView.hidden = false;
        currentView.classList.add('active', 'tab-animating');

        targetView.style.transform = `translateX(${enterFrom})`;
        currentView.style.transform = 'translateX(0)';

        // Force a layout flush so transition starts from initial positions.
        void targetView.offsetWidth;

        requestAnimationFrame(() => {
            targetView.style.transform = 'translateX(0)';
            currentView.style.transform = `translateX(${exitTo})`;
        });

        let finished = false;
        const complete = () => {
            if (finished) return;
            finished = true;

            currentView.classList.remove('active', 'tab-animating');
            currentView.hidden = true;
            currentView.style.transform = '';

            targetView.classList.remove('tab-animating');
            targetView.style.transform = '';

            activeTabName = tabName;
            isTabTransitioning = false;
            updateToolbarForTab(tabName);
        };

        targetView.addEventListener('transitionend', (event) => {
            if (event.propertyName === 'transform') {
                complete();
            }
        }, { once: true });

        setTimeout(complete, 350);
    }

    // (hash handling moved into initSettingsToggles to avoid scope issues)

    const homeModeRow = document.getElementById('home-mode-row');
    const homeBlockedRow = document.getElementById('home-blocked-row');
    const backFromSettingsBtn = document.getElementById('back-from-settings-btn');
    const backFromBlockingBtn = document.getElementById('back-from-blocking-btn');

    if (homeModeRow) {
        homeModeRow.addEventListener('click', () => {
            logNavUpdate('[nav] home -> settings', 'modes');
            switchToTab('settings', { direction: 'forward' });
        });
    }

    if (homeBlockedRow) {
        homeBlockedRow.addEventListener('click', () => {
            logNavUpdate('[nav] home -> blocking', 'blocking');
            switchToTab('blocking', { direction: 'forward' });
        });
    }

    if (backFromSettingsBtn) {
        backFromSettingsBtn.addEventListener('click', () => {
            const saved = sessionStorage.getItem('btube_prev_page');
            if (saved) {
                try {
                    const target = new URL(saved, window.location.href).href;
                    if (target && target !== window.location.href) {
                        window.location.href = target;
                        return;
                    }
                } catch (e) {
                    // ignore and fallback to tab
                }
            }
            switchToTab('home', { direction: 'back' });
        });
    }

    if (backFromBlockingBtn) {
        backFromBlockingBtn.addEventListener('click', () => {
            const saved = sessionStorage.getItem('btube_prev_page');
            if (saved) {
                try {
                    const target = new URL(saved, window.location.href).href;
                    if (target && target !== window.location.href) {
                        window.location.href = target;
                        return;
                    }
                } catch (e) {
                    // ignore and fallback to tab
                }
            }
            switchToTab('home', { direction: 'back' });
        });
    }

    if (cancelChangesBtn) {
        cancelChangesBtn.addEventListener('click', async () => {
            if (!hasPendingChanges()) return;
            await discardPendingChanges();
        });
    }

    // Initialize Settings toggles if present
    initSettingsToggles();

    // Initialize Blocking tab functionality
    initBlockingTab();

    // Populate the home tab summary
    refreshHomeSummary();

    // Keep the home tab summary in sync while the popup is open
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        const relevantKeys = [...Object.values(settingsMap), 'blockedWebsites', 'darkModeEnabled'];
        if (relevantKeys.some(key => key in changes)) {
            refreshHomeSummary();
        }
    });

    syncThemeSelectorState();
});


// --- Settings toggles support (embedded settings view) ---
const settingsMap = {
    "extension-online": "BTubeOn",
    "redirect-subscriptions": "redirect_home",
    "disable-shorts": "hide_shorts",
    "minimal-homepage": "minimal_homepage",
    "enable-website-blocking": "enable_website_blocking",
    "hide-sidebar-recommendations": "hide_sidebar_recommendations"
};

const MODE_STORAGE_KEY = 'btube_mode';
const MODE_SETTINGS_SNAPSHOT_KEY = 'btube_mode_settings_snapshot';
const MODE_UPDATED_AT_KEY = 'btube_mode_updated_at';
const VALID_MODES = new Set(['off', 'minimal', 'high-focus', 'custom']);

// Mode presets
const modePresets = {
    "off": {
        BTubeOn: false,
        redirect_home: false,
        hide_shorts: false,
        minimal_homepage: false,
        enable_website_blocking: false,
        hide_sidebar_recommendations: false
    },
    "minimal": {
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

function detectModeFromSettings(settings) {
    for (const [modeName, preset] of Object.entries(modePresets)) {
        const matches = Object.keys(preset).every(key => settings[key] === preset[key]);
        if (matches) return modeName;
    }
    return 'custom';
}

function normalizeMode(mode, fallback = 'minimal') {
    return VALID_MODES.has(mode) ? mode : fallback;
}

function getCurrentSettingsFromUI() {
    const settings = {};
    Object.entries(settingsMap).forEach(([checkboxId, storageKey]) => {
        const checkbox = document.getElementById(checkboxId);
        if (checkbox) {
            settings[storageKey] = checkbox.checked;
        }
    });
    return settings;
}

function buildModeMetadata(mode, settingsSnapshot) {
    return {
        [MODE_STORAGE_KEY]: normalizeMode(mode, 'custom'),
        [MODE_SETTINGS_SNAPSHOT_KEY]: settingsSnapshot,
        [MODE_UPDATED_AT_KEY]: Date.now()
    };
}

function formatModeLabel(mode) {
    return String(mode || 'custom')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, letter => letter.toUpperCase());
}

async function refreshHomeSummary() {
    const modeValue = document.getElementById('home-mode-value');
    const blockedCount = document.getElementById('home-blocked-count');

    try {
        const [settings, blockedResult] = await Promise.all([
            chrome.storage.local.get([...Object.values(settingsMap), MODE_STORAGE_KEY]),
            chrome.storage.local.get(['blockedWebsites'])
        ]);

        const detectedMode = detectModeFromSettings(settings);
        const savedMode = normalizeMode(settings[MODE_STORAGE_KEY], detectedMode);

        if (modeValue) {
            modeValue.textContent = formatModeLabel(savedMode);
        }

        if (blockedCount) {
            blockedCount.textContent = String((blockedResult.blockedWebsites || []).length);
        }
    } catch (error) {
        console.error('Failed to refresh home summary:', error);
    }
}

// Strictness levels (higher number = stricter)
const strictnessLevels = {
    "off": 0,
    "minimal": 1,
    "high-focus": 2,
    "custom": -1 // Custom is not part of the strictness hierarchy
};

function initSettingsToggles() {
    const present = Object.keys(settingsMap).some(id => document.getElementById(id));
    if (!present) return; // settings view not rendered

    const saveButtons = document.querySelectorAll('.save-settings-btn');
    const modeView = document.querySelector('.settings-mode-view');
    const customView = document.querySelector('.settings-custom-view');
    const editCustomBtn = document.getElementById('edit-custom-btn');
    const backToModesBtn = document.getElementById('back-to-modes-btn');
    const modeRadios = document.querySelectorAll('input[name="settings-mode"]');
    const customRadio = document.getElementById('custom-mode-radio');
    const settingsViews = {
        modes: modeView,
        custom: customView
    };
    
    let initialValues = {};
    let initialMode = 'custom';
    let changed = false;
    let activeSettingsSubview = 'modes';
    let isSettingsSubviewTransitioning = false;

    function showSettingsSubview(viewName, options = {}) {
        const { direction = 'forward', animate = true } = options;
        const targetView = settingsViews[viewName];
        const currentView = settingsViews[activeSettingsSubview];

        if (!targetView || isSettingsSubviewTransitioning || viewName === activeSettingsSubview) {
            return;
        }

        if (!animate || !currentView) {
            Object.entries(settingsViews).forEach(([name, view]) => {
                if (!view) return;
                const isTarget = name === viewName;
                view.hidden = !isTarget;
                view.classList.remove('settings-view-animating');
                view.style.transform = '';
            });
            activeSettingsSubview = viewName;
            return;
        }

        isSettingsSubviewTransitioning = true;

        const enterFrom = direction === 'back' ? '-100%' : '100%';
        const exitTo = direction === 'back' ? '100%' : '-100%';

        targetView.hidden = false;
        currentView.hidden = false;
        targetView.classList.add('settings-view-animating');
        currentView.classList.add('settings-view-animating');
        targetView.style.transform = `translateX(${enterFrom})`;
        currentView.style.transform = 'translateX(0)';

        void targetView.offsetWidth;

        requestAnimationFrame(() => {
            targetView.style.transform = 'translateX(0)';
            currentView.style.transform = `translateX(${exitTo})`;
        });

        let finished = false;
        const complete = () => {
            if (finished) return;
            finished = true;

            currentView.classList.remove('settings-view-animating');
            currentView.hidden = true;
            currentView.style.transform = '';

            targetView.classList.remove('settings-view-animating');
            targetView.style.transform = '';

            activeSettingsSubview = viewName;
            isSettingsSubviewTransitioning = false;
        };

        targetView.addEventListener('transitionend', (event) => {
            if (event.propertyName === 'transform') {
                complete();
            }
        }, { once: true });

        setTimeout(complete, 350);
    }

    // If a desired settings subview was requested on load, show it now without animation
    // If a desired settings subview was requested via the URL hash, show it now without animation
    try {
        const h = window.location.hash || '';
        if (h.startsWith('#settings')) {
            const parts = h.replace('#settings', '').replace(/^:/, '').split(':');
            const desired = parts[1] || (parts[0] || 'modes');
            showSettingsSubview(desired, { animate: false, direction: 'back' });
        } else if (h.startsWith('#blocking')) {
            switchToTab('blocking', { animate: false });
        }
    } catch (e) {
        // ignore
    }

    restoreSettingsState = async () => {
        const result = await chrome.storage.local.get([...Object.values(settingsMap), MODE_STORAGE_KEY]);

        initialValues = {};
        for (const [checkboxId, storageKey] of Object.entries(settingsMap)) {
            const checkbox = document.getElementById(checkboxId);
            if (!checkbox) continue;
            const value = !!result[storageKey];
            checkbox.checked = value;
            initialValues[checkboxId] = value;
        }

        const detectedMode = detectModeFromSettings(result);
        initialMode = normalizeMode(result[MODE_STORAGE_KEY], detectedMode);

        if (result[MODE_STORAGE_KEY] !== initialMode) {
            const settingsSnapshot = getCurrentSettingsFromUI();
            chrome.storage.local.set(buildModeMetadata(initialMode, settingsSnapshot));
        }

        const modeRadio = document.querySelector(`input[name="settings-mode"][value="${initialMode}"]`);
        if (modeRadio) {
            modeRadio.checked = true;
        }

        if (customRadio) {
            customRadio.checked = initialMode === 'custom';
        }

        if (editCustomBtn) {
            editCustomBtn.hidden = initialMode !== 'custom';
        }

        if (modeView) {
            modeView.hidden = false;
            modeView.classList.remove('settings-view-animating');
            modeView.style.transform = '';
        }

        if (customView) {
            customView.hidden = true;
            customView.classList.remove('settings-view-animating');
            customView.style.transform = '';
        }

        activeSettingsSubview = 'modes';
        isSettingsSubviewTransitioning = false;

        markActiveMode(initialMode);

        changed = false;
        updateSaveButtonVisibility();
    };

    // Navigate to custom settings editor
    function showCustomEditor() {
        showSettingsSubview('custom', { direction: 'forward' });
    }

    // Navigate back to mode selector
    function showModeSelector() {
        showSettingsSubview('modes', { direction: 'back' });
    }

    // Apply mode preset to checkboxes, or restore custom settings
    function applyModeToCheckboxes(mode) {
        if (mode === 'custom') {
            // Restore custom settings from storage
            chrome.storage.local.get(['btube_custom_settings', ...Object.values(settingsMap)], (data) => {
                const custom = data.btube_custom_settings || {};
                Object.entries(settingsMap).forEach(([checkboxId, storageKey]) => {
                    const checkbox = document.getElementById(checkboxId);
                    if (checkbox) {
                        if (storageKey in custom) {
                            checkbox.checked = !!custom[storageKey];
                        } else {
                            checkbox.checked = !!data[storageKey];
                        }
                    }
                });
            });
            return;
        }
        const preset = modePresets[mode];
        if (!preset) return;
        Object.entries(settingsMap).forEach(([checkboxId, storageKey]) => {
            const checkbox = document.getElementById(checkboxId);
            if (checkbox && storageKey in preset) {
                checkbox.checked = preset[storageKey];
            }
        });
    }

    // Mark the currently active mode with a visual indicator
    function markActiveMode(mode) {
        // Remove active class from all mode options
        document.querySelectorAll('.mode-option').forEach(option => {
            option.classList.remove('mode-active');
        });
        
        // Add active class to the current mode
        const activeOption = document.querySelector(`input[name="settings-mode"][value="${mode}"]`)?.closest('.mode-option');
        if (activeOption) {
            activeOption.classList.add('mode-active');
        }
    }

    // Load initial values and detect mode. Prefer explicit saved mode for reliability,
    // then self-heal if it is missing or invalid.
    restoreSettingsState();

    // Listen for storage changes to update active mode indicator
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            // Check if any settings that affect mode detection changed
            const relevantKeys = Object.values(settingsMap);
            const hasRelevantChanges = relevantKeys.some(key => key in changes) || (MODE_STORAGE_KEY in changes);
            
            if (hasRelevantChanges) {
                // Re-detect the active mode
                chrome.storage.local.get([...relevantKeys, MODE_STORAGE_KEY], (result) => {
                    const detectedMode = detectModeFromSettings(result);
                    const newMode = normalizeMode(result[MODE_STORAGE_KEY], detectedMode);
                    markActiveMode(newMode);
                    
                    // Update initial mode if different
                    if (newMode !== initialMode) {
                        initialMode = newMode;
                        
                        // Update initial values
                        Object.entries(settingsMap).forEach(([checkboxId, storageKey]) => {
                            const checkbox = document.getElementById(checkboxId);
                            if (checkbox && storageKey in result) {
                                checkbox.checked = !!result[storageKey];
                                initialValues[checkboxId] = !!result[storageKey];
                            }
                        });
                    }

                    refreshHomeSummary();
                });
            }
        }
    });

    // Handle edit button click
    if (editCustomBtn) {
        editCustomBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Select custom mode if not already selected
            if (customRadio && !customRadio.checked) {
                customRadio.checked = true;
                changed = true;
                updateSaveButtonVisibility();
            }
            
            showCustomEditor();
        });
    }

    // Handle back button
    if (backToModesBtn) {
        backToModesBtn.addEventListener('click', () => {
            showModeSelector();
        });
    }

    // Handle mode radio changes
    modeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            const selectedMode = e.target.value;
            
            // Show/hide edit button based on mode
            if (editCustomBtn) {
                editCustomBtn.hidden = selectedMode !== 'custom';
            }
            
            // Apply preset to checkboxes if not custom
            if (selectedMode !== 'custom') {
                applyModeToCheckboxes(selectedMode);
            }
            
            // Mark as changed if different from initial
            // For custom mode, always mark as changed if it wasn't the initial mode
            if (selectedMode === 'custom' && initialMode !== 'custom') {
                changed = true;
            } else {
                changed = selectedMode !== initialMode;
            }
            
            pendingChanges.hasSettingsChanges = changed;
            
            updateSaveButtonVisibility('settings');
        });
    });

    // Track changes in custom toggles
    Object.entries(settingsMap).forEach(([checkboxId, storageKey]) => {
        const checkbox = document.getElementById(checkboxId);
        if (!checkbox) return;
        checkbox.addEventListener("change", () => {
            // When custom toggles change, switch to custom mode
            if (customRadio && !customRadio.checked) {
                customRadio.checked = true;
                // Show edit button when switching to custom mode
                if (editCustomBtn) {
                    editCustomBtn.hidden = false;
                }
            }

            // Check if any value differs from initial
            changed = Object.entries(settingsMap).some(([id]) => {
                const cb = document.getElementById(id);
                return cb && cb.checked !== initialValues[id];
            });
            
            pendingChanges.hasSettingsChanges = changed;
            
            updateSaveButtonVisibility('settings');
        });
    });

    // Save on button click - handles both settings and blocking changes
    saveButtons.forEach((saveBtn) => {
        saveBtn.addEventListener('click', async () => {
            // Determine if login is required based on changes
            let requiresLogin = false;

            // Check if there are block deletions
            if (pendingChanges.hasDeletions) {
                requiresLogin = true;
            }

            // Check settings changes for login requirement
            if (pendingChanges.hasSettingsChanges) {
                const selectedMode = document.querySelector('input[name="settings-mode"]:checked')?.value;
                const isCustomMode = selectedMode === 'custom';
                const wasCustomMode = initialMode === 'custom';
                const isHighFocus = selectedMode === 'high-focus';
                
                if (isHighFocus) {
                    // High focus mode never requires login
                    requiresLogin = requiresLogin || false;
                } else if (isCustomMode || wasCustomMode) {
                    // Require login when entering OR exiting custom mode
                    requiresLogin = true;
                } else {
                    // Check strictness levels
                    const selectedStrictness = strictnessLevels[selectedMode] || 0;
                    const initialStrictness = strictnessLevels[initialMode] || 0;
                    const isStricter = selectedStrictness > initialStrictness;
                    requiresLogin = requiresLogin || !isStricter;
                }
            }

            // Build complete changes object
            const toSave = {};
            let hasPendingSettings = false;
            let hasPendingBlocks = false;

            // Collect settings changes
            if (pendingChanges.hasSettingsChanges) {
                const selectedMode = document.querySelector('input[name="settings-mode"]:checked')?.value;
                if (selectedMode && selectedMode !== 'custom' && modePresets[selectedMode]) {
                    Object.assign(toSave, modePresets[selectedMode]);
                } else {
                    Object.assign(toSave, getCurrentSettingsFromUI());
                }
                hasPendingSettings = true;

                const modeToPersist = normalizeMode(selectedMode, 'custom');
                Object.assign(toSave, buildModeMetadata(modeToPersist, {
                    ...Object.fromEntries(Object.values(settingsMap).map(key => [key, toSave[key]]))
                }));

                // Persist custom settings if in custom mode
                if (modeToPersist === 'custom') {
                    await chrome.storage.local.set({
                        btube_custom_settings: Object.fromEntries(
                            Object.values(settingsMap).map(key => [key, toSave[key]])
                        )
                    });
                }
            }

            // Collect blocking changes (filter out deleted items, keep only active)
            if (pendingChanges.hasBlockChanges) {
                if (pendingChanges.blockedWebsites) {
                    toSave.blockedWebsites = pendingChanges.blockedWebsites
                        .filter(item => !item.isDeleted)
                        .map(({url, addedAt}) => ({url, addedAt}));
                    hasPendingBlocks = true;
                }
            }

            if (requiresLogin) {
                // Stage all changes and redirect to login
                const pendingData = {};
                if (hasPendingSettings) {
                    const settingsOnly = {};
                    Object.entries(toSave).forEach(([key, val]) => {
                        if (key !== 'blockedWebsites' && key !== MODE_STORAGE_KEY && key !== MODE_SETTINGS_SNAPSHOT_KEY && key !== MODE_UPDATED_AT_KEY) {
                            settingsOnly[key] = val;
                        }
                    });
                    pendingData.btube_pending_settings = settingsOnly;
                    
                    // Store the selected mode to preserve custom mode selection
                    const selectedMode = document.querySelector('input[name="settings-mode"]:checked')?.value;
                    if (selectedMode) {
                        pendingData.btube_pending_mode = selectedMode;
                    }
                }
                if (hasPendingBlocks) {
                    pendingData.btube_pending_block_updates = {};
                    if (toSave.blockedWebsites) {
                        pendingData.btube_pending_block_updates.blockedWebsites = toSave.blockedWebsites;
                    }
                    if (pendingChanges.hasDeletions) {
                        pendingData.btube_has_pending_block_deletions = true;
                    }
                }

                                await chrome.storage.local.set(pendingData);
                                try {
                                    // Save a richer prev page: include popup tab + optional settings subview
                                    let saved = 'popup.html';
                                    if (activeTabName === 'settings') {
                                        // activeSettingsSubview is defined inside initSettingsToggles
                                        const sub = (typeof activeSettingsSubview !== 'undefined' && activeSettingsSubview) ? activeSettingsSubview : 'modes';
                                        saved += `#settings:${sub}`;
                                    } else if (activeTabName === 'blocking') {
                                        saved += '#blocking';
                                    } else {
                                        saved = window.location.href;
                                    }
                                    sessionStorage.setItem('btube_prev_page', saved);
                                    logNavUpdate('[nav] btube_prev_page updated ->', saved);
                                } catch (e) {
                                    // ignore
                                }
                                loginOverlay.show();
            } else {
                // Save directly without login
                await chrome.storage.local.set(toSave);
                
                safeRuntimeSendMessage({
                    type: 'showNotification',
                    message: 'Changes saved successfully!',
                    notificationType: 'success'
                });

                // Reset pending state
                if (pendingChanges.hasSettingsChanges) {
                    const selectedMode = document.querySelector('input[name="settings-mode"]:checked')?.value;
                    initialMode = selectedMode;
                    Object.entries(settingsMap).forEach(([checkboxId, storageKey]) => {
                        const checkbox = document.getElementById(checkboxId);
                        if (checkbox) {
                            initialValues[checkboxId] = checkbox.checked;
                        }
                    });
                    markActiveMode(selectedMode);
                }

                refreshHomeSummary();

                clearPendingChanges();
                changed = false;
                updateSaveButtonVisibility();

                // Reload blocked content from storage
                const result = await chrome.storage.local.get(['blockedWebsites']);
                pendingChanges.blockedWebsites = (result.blockedWebsites || []).slice();
                renderBlockedWebsites(pendingChanges.blockedWebsites);
            }
        });
    });
}

// --- Blocking Tab Functionality ---
function initBlockingTab() {
    const addBlockBtn = document.getElementById('add-block-btn');
    const overlay = document.getElementById('add-block-overlay');
    const closeOverlayBtn = document.getElementById('close-overlay-btn');
    const cancelOverlayBtn = document.getElementById('cancel-overlay-btn');
    const saveOverlayBtn = document.getElementById('save-overlay-btn');
    const websiteInput = document.getElementById('website-input');
    const websiteUrlField = document.getElementById('website-url');

    restoreBlockedState = async () => {
        const result = await chrome.storage.local.get(['blockedWebsites']);
        pendingChanges.blockedWebsites = (result.blockedWebsites || []).slice();
        pendingChanges.hasBlockChanges = false;
        pendingChanges.hasDeletions = false;
        renderBlockedWebsites(pendingChanges.blockedWebsites);

        if (overlay) {
            overlay.hidden = true;
        }

        if (websiteUrlField) {
            websiteUrlField.value = '';
        }

        updateSaveButtonVisibility();
    };
    
    // Load blocked content when popup opens
    loadBlockedContent();

    // Add block button - shows overlay
    if (addBlockBtn) {
        addBlockBtn.addEventListener('click', () => {
            overlay.hidden = false;
            websiteUrlField.focus();
        });
    }

    // Close overlay handlers
    const closeOverlay = () => {
        overlay.hidden = true;
        websiteUrlField.value = '';
    };

    if (closeOverlayBtn) {
        closeOverlayBtn.addEventListener('click', closeOverlay);
    }

    if (cancelOverlayBtn) {
        cancelOverlayBtn.addEventListener('click', closeOverlay);
    }

    // Save blocked content
    if (saveOverlayBtn) {
        saveOverlayBtn.addEventListener('click', async () => {
            const url = websiteUrlField.value.trim();
            if (!url) {
                alert('Please enter a website URL');
                return;
            }
            await addBlockedWebsite(url);

            closeOverlay();
        });
    }

    // Handle Escape key to close overlay
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.hidden) {
            e.preventDefault();
            e.stopPropagation();
            closeOverlay();
        }
    });

    // Handle Enter key in input fields
    if (websiteUrlField) {
        websiteUrlField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                saveOverlayBtn.click();
            }
        });
    }

    // Close overlay when clicking outside
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeOverlay();
            }
        });
    }
}

// Add blocked website
async function addBlockedWebsite(rawUrl) {
    try {
        let processedUrl = (rawUrl || '').trim();
        if (!processedUrl) {
            alert('Please enter a valid URL');
            return;
        }

        // Strip protocol and www
        processedUrl = processedUrl.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
        // Remove trailing slash
        processedUrl = processedUrl.replace(/\/$/, '');

        // If it's just a domain, optionally strip common TLDs to normalize
        if (!processedUrl.includes('/')) {
            processedUrl = processedUrl.replace(/\.(com|org|net|edu|gov|co|io|ai|me|tv|info|biz|dev|app|tech|online|site|xyz|store|shop|blog|news|pro|cloud|digital|web|us|uk|ca|au|de|fr|jp|in|br|ru|cn|kr|es|it|nl|se|pl|tr|mx|za|id|th|my|sg|ph|vn|tw|hk|nz|ar|cl|pe|eg|pk|bd|ng|ke|ua|ro|cz|gr|pt|be|hu|at|ch|dk|fi|no|ie|il|sa|ae|qa|kw|om|bh|lb|jo|iq|sy|ye|ly|tn|ma|dz|sd|so|et|ug|tz|gh|sn|ci|cm|bw|zm|zw|mw|mg|mu|re|mz|ao|na|ls|sz|gm|gn|gw|sl|lr|ml|bf|ne|td|cf|ga|cg|cd|rw|bi|dj|er|ss|st|cv|sc|km|mr|eh)$/i, '');
        }

        processedUrl = processedUrl.trim();
        if (!processedUrl) {
            alert('Please enter a valid URL');
            return;
        }

        // Get current blocked websites from storage
        const result = await chrome.storage.local.get(['blockedWebsites']);
        const blockedWebsites = result.blockedWebsites || [];

        // Check if already blocked (case-insensitive)
        if (blockedWebsites.some(item => item.url.toLowerCase() === processedUrl.toLowerCase())) {
            alert('This website is already blocked');
            return;
        }

        // Add and save immediately
        blockedWebsites.push({
            url: processedUrl,
            addedAt: Date.now()
        });

        await chrome.storage.local.set({ blockedWebsites });

        // Update pending changes to reflect current storage state
        pendingChanges.blockedWebsites = blockedWebsites.slice();

        // Re-render to show new item
        renderBlockedWebsites(pendingChanges.blockedWebsites);

        safeRuntimeSendMessage({
            type: 'showNotification',
            message: 'Website blocked successfully!',
            notificationType: 'success'
        });
    } catch (error) {
        console.error('Error adding blocked website:', error);
        alert('Failed to block website. Please try again.');
    }
}

// Load and display blocked websites and channels
async function loadBlockedContent() {
    try {
        // Use pending changes if available, otherwise load from storage
        if (pendingChanges.blockedWebsites === null) {
            const result = await chrome.storage.local.get(['blockedWebsites']);
            pendingChanges.blockedWebsites = (result.blockedWebsites || []).slice();
        }

        // Render using pending data
        renderBlockedWebsites(pendingChanges.blockedWebsites);
    } catch (error) {
        console.error('Error loading blocked content:', error);
    }
}

// Render blocked websites list
function renderBlockedWebsites(websites) {
    const listContainer = document.getElementById('blocked-websites-list');
    const emptyMessage = document.getElementById('empty-websites');
    
    if (!listContainer) return;
    if (!Array.isArray(websites)) websites = [];

    listContainer.innerHTML = '';

    if (websites.length === 0) {
        emptyMessage.hidden = false;
        return;
    }

    emptyMessage.hidden = true;

    websites.forEach((website) => {
        const item = createBlockedItem(website.url, () => {
            deleteBlockedWebsite(website.url);
        }, website.isPending, website.isDeleted);
        listContainer.appendChild(item);
    });
}

// Create a blocked item element
function createBlockedItem(title, onDelete, isPending = false, isDeleted = false) {
    const item = document.createElement('div');
    item.className = 'blocked-item';
    
    // Add visual state class only for deleted items
    if (isDeleted) item.classList.add('pending-delete');

    const content = document.createElement('div');
    content.className = 'blocked-item-content';

    const titleEl = document.createElement('div');
    titleEl.className = 'blocked-item-title';
    titleEl.textContent = title;
    titleEl.title = title; // Show full text on hover
    
    // Add status indicator only for deleted items
    if (isDeleted) {
        const statusEl = document.createElement('span');
        statusEl.className = 'status-badge';
        statusEl.textContent = 'Removed';
        titleEl.appendChild(statusEl);
    }

    content.appendChild(titleEl);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-block-btn';
    deleteBtn.title = isDeleted ? 'Undo' : 'Delete';
    deleteBtn.innerHTML = isDeleted ? `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 11l3 3L22 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    ` : `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    `;
    deleteBtn.addEventListener('click', onDelete);

    item.appendChild(content);
    item.appendChild(deleteBtn);

    return item;
}

// Delete blocked website
async function deleteBlockedWebsite(blockedUrl) {
    try {
        if (!blockedUrl || !Array.isArray(pendingChanges.blockedWebsites)) {
            return;
        }

        const item = pendingChanges.blockedWebsites.find((entry) => entry && entry.url === blockedUrl);
        if (!item) {
            return;
        }
        
        if (item.isDeleted) {
            // Undo deletion - restore the item
            delete item.isDeleted;
        } else {
            // Mark existing item as deleted
            item.isDeleted = true;
            pendingChanges.hasDeletions = true;
        }

        pendingChanges.hasBlockChanges = true;

        // Re-render to show updated state
        renderBlockedWebsites(pendingChanges.blockedWebsites);

        // Show save button
        updateSaveButtonVisibility();
    } catch (error) {
        console.error('Error deleting blocked website:', error);
    }
}

