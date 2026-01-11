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

// --- Dark Mode Toggle ---
const darkModeToggle = document.getElementById("darkModeToggle");

// Load dark mode state on popup open
chrome.storage.local.get("darkModeEnabled", (result) => {
    if (result.darkModeEnabled) {
        document.documentElement.setAttribute("dark_mode", "true");
    } else {
        document.documentElement.removeAttribute("dark_mode");
    }
});

// Toggle dark mode on click
darkModeToggle.addEventListener("click", () => {
    const isDark = document.documentElement.hasAttribute("dark_mode");

    if (isDark) {
        document.documentElement.removeAttribute("dark_mode");
    } else {
        document.documentElement.setAttribute("dark_mode", "true");
    }

    // Save preference
    chrome.storage.local.set({ darkModeEnabled: !isDark });
    
    // No notification for dark mode toggle
});



// Fetch bookmarks from storage
function renderBookmarksFromStorage() {
    chrome.storage.sync.get("bookmarks", (result) => {
        const folders = result.bookmarks || [];
        renderBookmarks(folders);
    });
}

// Render all folders and bookmarks
function renderBookmarks(folders) {
    const container = document.querySelector(".folder");
    if (!container) return;
    container.innerHTML = "";

    if (!folders || folders.length === 0) {
        const noMsg = document.createElement("p");
        noMsg.textContent = "No bookmarks";
        noMsg.className = "no-bookmarks";
        container.appendChild(noMsg);
        return;
    }

    folders.forEach((folder, folderIndex) => {
        const folderDiv = document.createElement("div");
        folderDiv.className = "fold";

        // --- Folder Header ---
        const header = document.createElement("div");
        header.className = "head collapsed";

        const titleSpan = document.createElement("span");
        titleSpan.className = "folder-title";
        titleSpan.textContent = folder.folderName || "Untitled Folder";
        header.appendChild(titleSpan);

        const actions = document.createElement("div");
        actions.className = "head-actions";

        const chevron = document.createElement("span");
        chevron.className = "chevron";

        const deleteFolderBtn = document.createElement("span");
        deleteFolderBtn.className = "delete-folder";
        deleteFolderBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            chrome.storage.sync.get("bookmarks", (res) => {
                const allFolders = res.bookmarks || [];
                allFolders.splice(folderIndex, 1);
                chrome.storage.sync.set({ bookmarks: allFolders }, () => {
                    renderBookmarks(allFolders);
                });
            });
        });

        actions.appendChild(deleteFolderBtn);
        actions.appendChild(chevron);
        header.appendChild(actions);
        folderDiv.appendChild(header);

        // --- Folder Content ---
        const content = document.createElement("div");
        content.className = "content";

        const bookmarks = Array.isArray(folder.bookmarks) ? folder.bookmarks : [];
        if (bookmarks.length > 0) {
            bookmarks.forEach((bm, bmIndex) => {
                const bookmarkDiv = document.createElement("div");
                bookmarkDiv.className = "bookmark";

                // Make entire row clickable
                bookmarkDiv.addEventListener("click", () => {
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        chrome.tabs.update(tabs[0].id, { url: bm.url });
                    });
                });

                // Accessibility link
                const link = document.createElement("a");
                link.href = bm.url || "#";
                link.textContent = bm.title || "Untitled";
                link.className = "bookmark-link";
                link.target = "_blank";
                link.addEventListener("click", (e) => e.preventDefault()); // row handles click

                // Right side (meta)
                const rightDiv = document.createElement("div");
                rightDiv.className = "bookmark-meta";

                const timestampSpan = document.createElement("span");
                timestampSpan.className = "timestamp";
                timestampSpan.textContent = formatTimestamp(bm.timestamp);

                const deleteText = document.createElement("span");
                deleteText.textContent = "Delete";
                deleteText.className = "delete-bookmark";

                // Delete bookmark without triggering row click
                deleteText.addEventListener("click", (e) => {
                    e.stopPropagation();
                    e.preventDefault();

                    chrome.storage.sync.get("bookmarks", (res) => {
                        const allFolders = res.bookmarks || [];
                        if (allFolders[folderIndex] && Array.isArray(allFolders[folderIndex].bookmarks)) {
                            allFolders[folderIndex].bookmarks.splice(bmIndex, 1);
                            chrome.storage.sync.set({ bookmarks: allFolders }, () => {
                                renderBookmarks(allFolders);
                            });
                        }
                    });
                });

                rightDiv.appendChild(timestampSpan);
                rightDiv.appendChild(deleteText);

                bookmarkDiv.appendChild(link);
                bookmarkDiv.appendChild(rightDiv);
                content.appendChild(bookmarkDiv);
            });
        } else {
            const noBm = document.createElement("p");
            noBm.textContent = "No bookmarks in this folder";
            noBm.className = "no-bookmarks";
            content.appendChild(noBm);
        }

        folderDiv.appendChild(content);
        container.appendChild(folderDiv);

        // Toggle folder content
        header.addEventListener("click", () => {
            content.classList.toggle("open");
            header.classList.toggle("collapsed");
        });
    });
}

// Format seconds into mm:ss
function formatTimestamp(seconds) {
    if (!seconds) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

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

function hasPendingChanges() {
    return pendingChanges.hasSettingsChanges || pendingChanges.hasBlockChanges;
}

function clearPendingChanges() {
    pendingChanges.settings = null;
    pendingChanges.blockedWebsites = null;
    pendingChanges.hasSettingsChanges = false;
    pendingChanges.hasBlockChanges = false;
    pendingChanges.hasDeletions = false;
}

window.addEventListener("DOMContentLoaded", () => {
    renderBookmarksFromStorage();
    
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
    const tabButtons = document.querySelectorAll('.tabbar .tab-btn');
    const tabViews = {
        home: document.getElementById('tab-home'),
        settings: document.getElementById('tab-settings'),
        blocking: document.getElementById('tab-blocking')
    };
    const addBlockBtn = document.getElementById('add-block-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');

    // Function to switch tabs programmatically
    function switchToTab(tabName) {
        if (!tabViews[tabName]) return;

        // Update views state
        Object.entries(tabViews).forEach(([key, el]) => {
            const show = key === tabName;
            if (!el) return;
            el.classList.toggle('active', show);
            el.hidden = !show;
        });

        // Update buttons state
        tabButtons.forEach(btn => {
            const btnTab = btn.getAttribute('data-tab');
            const isActive = btnTab === tabName;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', String(isActive));
        });

        // Show/hide add block button based on active tab
        if (addBlockBtn) {
            addBlockBtn.classList.toggle('is-hidden', tabName !== 'blocking');
        }

        // Show/hide blocking settings button - only on settings tab
        const popupBlockingBtn = document.getElementById('popup-blocking-btn');
        if (popupBlockingBtn) {
            popupBlockingBtn.classList.toggle('is-hidden', tabName !== 'settings');
        }

        // Save button visibility
        if (saveSettingsBtn) {
            if (hasPendingChanges()) {
                saveSettingsBtn.style.display = 'inline-flex';
                saveSettingsBtn.disabled = false;
            }
        }
    }

    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.currentTarget;
            // No-op if already active
            if (target.classList.contains('active')) {
                e.preventDefault();
                return;
            }

            const tab = target.getAttribute('data-tab');
            if (!tab || !(tab in tabViews)) return;

            switchToTab(tab);
        });
    });

    // Initialize Settings toggles if present
    initSettingsToggles();

    // Initialize Blocking tab functionality
    initBlockingTab();

    // Handle blocking icon button in settings tab
    const popupBlockingBtn = document.getElementById('popup-blocking-btn');
    if (popupBlockingBtn) {
        popupBlockingBtn.addEventListener('click', () => {
            switchToTab('blocking');
        });
    }
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

    const saveBtn = document.getElementById('save-settings-btn');
    const modeView = document.querySelector('.settings-mode-view');
    const customView = document.querySelector('.settings-custom-view');
    const editCustomBtn = document.getElementById('edit-custom-btn');
    const backToModesBtn = document.getElementById('back-to-modes-btn');
    const modeRadios = document.querySelectorAll('input[name="settings-mode"]');
    const customRadio = document.getElementById('custom-mode-radio');
    
    let initialValues = {};
    let initialMode = 'custom';
    let changed = false;

    // Navigate to custom settings editor
    function showCustomEditor() {
        modeView.hidden = true;
        customView.hidden = false;
    }

    // Navigate back to mode selector
    function showModeSelector() {
        modeView.hidden = false;
        customView.hidden = true;
    }

    // Determine current mode from stored settings
    function detectMode(settings) {
        for (const [modeName, preset] of Object.entries(modePresets)) {
            const matches = Object.keys(preset).every(key => settings[key] === preset[key]);
            if (matches) return modeName;
        }
        return 'custom';
    }

    // Apply mode preset to checkboxes, or restore custom settings
    function applyModeToCheckboxes(mode) {
        if (mode === 'custom') {
            // Restore custom settings from storage
            chrome.storage.local.get('btube_custom_settings', (data) => {
                const custom = data.btube_custom_settings || {};
                Object.entries(settingsMap).forEach(([checkboxId, storageKey]) => {
                    const checkbox = document.getElementById(checkboxId);
                    if (checkbox) {
                        checkbox.checked = !!custom[storageKey];
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

    // Load initial values and detect mode
    chrome.storage.local.get(Object.values(settingsMap), (result) => {
        initialValues = {};
        for (const [checkboxId, storageKey] of Object.entries(settingsMap)) {
            const checkbox = document.getElementById(checkboxId);
            if (!checkbox) continue;
            checkbox.checked = !!result[storageKey];
            initialValues[checkboxId] = !!result[storageKey];
        }

        // Detect and set current mode
        initialMode = detectMode(result);
        const modeRadio = document.querySelector(`input[name="settings-mode"][value="${initialMode}"]`);
        if (modeRadio) {
            modeRadio.checked = true;
            // Show edit button if custom mode is initially selected
            if (initialMode === 'custom' && editCustomBtn) {
                editCustomBtn.hidden = false;
            }
        }
        
        // Mark the active mode
        markActiveMode(initialMode);

        changed = false;
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.style.display = 'none';
        }
    });

    // Listen for storage changes to update active mode indicator
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            // Check if any settings that affect mode detection changed
            const relevantKeys = Object.values(settingsMap);
            const hasRelevantChanges = relevantKeys.some(key => key in changes);
            
            if (hasRelevantChanges) {
                // Re-detect the active mode
                chrome.storage.local.get(relevantKeys, (result) => {
                    const newMode = detectMode(result);
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
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.style.display = 'inline-flex';
                }
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
            
            if (saveBtn) {
                saveBtn.disabled = !hasPendingChanges();
                saveBtn.style.display = hasPendingChanges() ? 'inline-flex' : 'none';
            }
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
            
            if (saveBtn) {
                saveBtn.disabled = !hasPendingChanges();
                saveBtn.style.display = hasPendingChanges() ? 'inline-flex' : 'none';
            }
        });
    });

    // Save on button click - handles both settings and blocking changes
    if (saveBtn) {
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
                    Object.entries(settingsMap).forEach(([checkboxId, storageKey]) => {
                        const checkbox = document.getElementById(checkboxId);
                        if (checkbox) {
                            toSave[storageKey] = checkbox.checked;
                        }
                    });
                }
                hasPendingSettings = true;

                // Persist custom settings if in custom mode
                if (selectedMode === 'custom') {
                    await chrome.storage.local.set({ btube_custom_settings: toSave });
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
                        if (key !== 'blockedWebsites') {
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
                window.location.href = 'login.html?from=popup';
            } else {
                // Save directly without login
                await chrome.storage.local.set(toSave);
                
                chrome.runtime.sendMessage({
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

                clearPendingChanges();
                changed = false;
                saveBtn.disabled = true;
                saveBtn.style.display = 'none';

                // Reload blocked content from storage
                const result = await chrome.storage.local.get(['blockedWebsites']);
                pendingChanges.blockedWebsites = (result.blockedWebsites || []).slice();
                renderBlockedWebsites(pendingChanges.blockedWebsites);
            }
        });
    }
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

        chrome.runtime.sendMessage({
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

    listContainer.innerHTML = '';

    if (websites.length === 0) {
        emptyMessage.hidden = false;
        return;
    }

    emptyMessage.hidden = true;

    websites.forEach((website, index) => {
        const item = createBlockedItem(website.url, () => {
            deleteBlockedWebsite(index);
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
async function deleteBlockedWebsite(index) {
    try {
        const item = pendingChanges.blockedWebsites[index];
        
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

// Helper function to update save button visibility
function updateSaveButtonVisibility() {
    const saveBtn = document.getElementById('save-settings-btn');
    if (saveBtn && hasPendingChanges()) {
        saveBtn.style.display = 'inline-flex';
        saveBtn.disabled = false;
    }
}
