"use strict";

// --- Containers ---
const loginContainer = document.getElementById("login-container");
const setupContainer = document.getElementById("setup-container");
const resetContainer = document.getElementById("reset-container");

// --- Login elements ---
const input = document.getElementById("password-input");
const button = document.getElementById("submit-password");
const error = document.getElementById("error-message");
const forgotButton = document.getElementById("forgot-password");

// --- Setup elements ---
const newPasswordInput = document.getElementById("new-password");
const confirmPasswordInput = document.getElementById("confirm-password");
const saveButton = document.getElementById("save-password");
const setupError = document.getElementById("setup-error");

// --- Custom notification elements ---
const customNotification = document.getElementById("custom-notification");
const notificationMessage = document.getElementById("notification-message");
const notificationCloseButton = document.getElementById("notification-close");

// --- Reset elements ---
const currentWordEl = document.getElementById("current-word");
const resetInput = document.getElementById("reset-input");
const resetNextBtn = document.getElementById("reset-next");

// --- Reset words ---
const resetWords = [
  "orange",
  "castle",
  "mirror",
  "planet",
  "forest",
  "window",
  "guitar",
  "breeze",
  "pillow",
  "dragon",
];
let currentResetIndex = 0;

const MODE_STORAGE_KEY = 'btube_mode';
const MODE_SETTINGS_SNAPSHOT_KEY = 'btube_mode_settings_snapshot';
const MODE_UPDATED_AT_KEY = 'btube_mode_updated_at';
const VALID_MODES = new Set(['off', 'minimal', 'high-focus', 'custom']);

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

function normalizeMode(mode, fallback = 'minimal') {
  return VALID_MODES.has(mode) ? mode : fallback;
}

function detectModeFromSettings(settings) {
  for (const [modeName, preset] of Object.entries(modePresets)) {
    const matches = Object.keys(preset).every(key => settings[key] === preset[key]);
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
    if (key in settings) {
      acc[key] = settings[key];
    }
    return acc;
  }, {});
}

function safeRuntimeSendMessage(payload) {
  try {
    if (!chrome?.runtime?.id) return;
    chrome.runtime.sendMessage(payload, () => {
      if (chrome.runtime.lastError) {
        console.debug('[runtime] login sendMessage skipped:', chrome.runtime.lastError.message);
      }
    });
  } catch (e) {
    console.debug('[runtime] login sendMessage exception:', e?.message || e);
  }
}

// --- Helper to show/hide containers ---
function showContainer(container) {
  [loginContainer, setupContainer, resetContainer].forEach((c) =>
    c.classList.add("hidden")
  );
  container.classList.remove("hidden");
}

function showInlineError(errorElement, message) {
  errorElement.textContent = message;
  errorElement.classList.add("hidden");
  void errorElement.offsetWidth;
  errorElement.classList.remove("hidden");
}

// --- Promisify chrome.storage.local.get ---
function getPassword() {
  return new Promise((resolve) => {
    chrome.storage.local.get("extensionPassword", (data) => {
      resolve(data.extensionPassword);
    });
  });
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

// --- Password strength check ---
function isStrongPassword(password) {
  // Minimum 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
  const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
  return strongRegex.test(password);
}

// --- Initialize page ---
async function init() {
  applyDarkMode(); // Apply dark mode on load

  const password = await getPassword();
  if (password) {
    showContainer(loginContainer);
  } else {
    showContainer(setupContainer);
  }
}

// --- Setup password ---
saveButton.addEventListener("click", async () => {
  const newPass = newPasswordInput.value.trim();
  const confirmPass = confirmPasswordInput.value.trim();

  if (!newPass) {
    showInlineError(setupError, "Password cannot be empty.");
    return;
  }

  if (newPass !== confirmPass) {
    showInlineError(setupError, "Passwords do not match.");
    return;
  }

  if (!isStrongPassword(newPass)) {
    showInlineError(
      setupError,
      "Password must be at least 8 characters and include uppercase, lowercase, number, and special character."
    );
    return;
  }

  await chrome.storage.local.set({ extensionPassword: newPass });
  showNotification("Password set successfully! Please log in.", loginContainer);
  setupError.classList.add("hidden");
});

// --- Enter key for setup password ---
newPasswordInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    saveButton.click();
  }
});

confirmPasswordInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    saveButton.click();
  }
});

// --- Check login ---
async function checkPassword() {
  const enteredPass = input.value.trim();
  const password = await getPassword();

  if (enteredPass === password) {
    // Apply any pending settings or block updates after successful login
    chrome.storage.local.get(['btube_pending_settings', 'btube_pending_block_updates', 'btube_has_pending_block_deletions', 'btube_pending_mode'], (data) => {
      const pendingSettings = data.btube_pending_settings || null;
      const pendingBlocks = data.btube_pending_block_updates || null;
      const pendingMode = data.btube_pending_mode || null;

      // Build a single payload to set in one operation
      const toSet = {};
      let hadChanges = false;

      if (pendingSettings && typeof pendingSettings === 'object') {
        Object.assign(toSet, pendingSettings);
        const snapshot = pickSettingsSnapshot(pendingSettings);
        const detectedMode = detectModeFromSettings(snapshot);
        const modeToPersist = normalizeMode(pendingMode, detectedMode);
        toSet[MODE_STORAGE_KEY] = modeToPersist;
        toSet[MODE_SETTINGS_SNAPSHOT_KEY] = snapshot;
        toSet[MODE_UPDATED_AT_KEY] = Date.now();
        hadChanges = true;
        
        // If custom mode was selected, also save it to btube_custom_settings
        if (modeToPersist === 'custom') {
          toSet.btube_custom_settings = snapshot;
        }
      }

      if (pendingBlocks && typeof pendingBlocks === 'object') {
        if (Array.isArray(pendingBlocks.blockedWebsites)) {
          toSet.blockedWebsites = pendingBlocks.blockedWebsites;
          hadChanges = true;
        }
      }

      if (hadChanges) {
              chrome.storage.local.set(toSet, () => {
          // Clean up pending keys/flags
          const keysToRemove = ['btube_pending_settings', 'btube_pending_block_updates', 'btube_has_pending_block_deletions', 'btube_original_block_lists', 'btube_pending_mode'];
                chrome.storage.local.remove(keysToRemove, () => {
                  // Notify success (safe)
                  safeRuntimeSendMessage({
                    type: 'showNotification',
                    message: 'Changes applied successfully!',
                    notificationType: 'success'
                  });

            // Redirect back to popup
            setTimeout(() => {
              window.location.href = 'popup.html';
            }, 500);
          });
        });
      } else {
        // No pending changes – go back to popup by default
        window.location.href = 'popup.html';
      }
    });
  } else {
    showInlineError(error, "Incorrect password!");
    input.value = "";
  }
}

button.addEventListener("click", checkPassword);
input.addEventListener("keypress", (e) => {
  if (e.key === "Enter") checkPassword();
});

// --- Forgot password ---
forgotButton.addEventListener("click", () => {
  currentResetIndex = 0;
  resetInput.value = "";
  showCurrentWord();
  showContainer(resetContainer);
});

// --- Show current word ---
function showCurrentWord() {
  currentWordEl.textContent = resetWords[currentResetIndex];
}

// --- Handle reset next ---
resetNextBtn.addEventListener("click", async () => {
  const userWord = resetInput.value.trim();

  if (userWord === resetWords[currentResetIndex]) {
    currentResetIndex++;
    resetInput.value = "";

    if (currentResetIndex >= resetWords.length) {
      await chrome.storage.local.remove("extensionPassword");
      showNotification(
        "Password reset successful! Please set a new password.",
        setupContainer
      );
    } else {
      showCurrentWord();
    }
  } else {
    showNotification("Incorrect word! Start over.");
    currentResetIndex = 0;
    resetInput.value = "";
    showCurrentWord();
  }
});

// --- Browser notification function ---
function showBrowserNotification(message, type = 'info') {
  safeRuntimeSendMessage({
    type: 'showNotification',
    message: message,
    notificationType: type
  });
}

// --- Custom notification function (for login page) ---
function showNotification(message, targetContainer = loginContainer, useBrowserNotification = false) {
  // If useBrowserNotification is true, show browser notification instead
  if (useBrowserNotification) {
    showBrowserNotification(message);
    if (targetContainer !== loginContainer) {
      showContainer(targetContainer);
    }
    return;
  }

  notificationMessage.textContent = message;

  // Show the notification
  customNotification.style.opacity = "0";
  customNotification.classList.remove("hidden");

  void customNotification.offsetWidth;
  customNotification.style.opacity = "1";

  // Focus the OK button
  setTimeout(() => {
    notificationCloseButton.focus();
  }, 100);

  // Setup event listener for the OK button
  notificationCloseButton.addEventListener("click", function closeHandler() {
    // Fade out effect
    customNotification.style.opacity = "0";

    // Wait for transition to complete before hiding
    setTimeout(() => {
      customNotification.classList.add("hidden");
      showContainer(targetContainer);
      notificationCloseButton.removeEventListener("click", closeHandler);
    }, 300);
  });
}

// --- Initialize on DOM load ---
window.addEventListener("DOMContentLoaded", () => {
  init();
  setTimeout(() => {
    document.body.setAttribute("data-loaded", "true");
  }, 50); // 50ms is usually enough
});
