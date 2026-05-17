"use strict";

(function initTheme() {
  const THEME_CACHE_KEY = 'btube_theme_cache';
  const root = document.documentElement;
  const params = new URLSearchParams(window.location.search);

  root.style.visibility = 'hidden';

  function applyTheme(themeSetting) {
    if (themeSetting === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        root.setAttribute('dark_mode', 'true');
      } else {
        root.removeAttribute('dark_mode');
      }
      return;
    }

    if (themeSetting === 'dark') {
      root.setAttribute('dark_mode', 'true');
      return;
    }

    root.removeAttribute('dark_mode');
  }

  function syncCache(themeSetting) {
    try {
      localStorage.setItem(THEME_CACHE_KEY, themeSetting || 'system');
    } catch (e) {
      // ignore cache failures
    }
  }

  const cachedTheme = (() => {
    try {
      return localStorage.getItem(THEME_CACHE_KEY);
    } catch (e) {
      return null;
    }
  })();

  const hintedTheme = params.get('theme');
  if (hintedTheme === 'dark' || hintedTheme === 'light' || hintedTheme === 'system') {
    applyTheme(hintedTheme);
    syncCache(hintedTheme);
  } else if (cachedTheme) {
    applyTheme(cachedTheme);
  }

  const finish = (themeSetting) => {
    const resolvedTheme = themeSetting || hintedTheme || cachedTheme || 'system';
    applyTheme(resolvedTheme);
    syncCache(resolvedTheme);
    root.setAttribute('data-theme-ready', 'true');
    root.style.visibility = '';
  };

  try {
    chrome.storage.local.get('themeSetting', (result) => {
      if (chrome.runtime?.lastError) {
        finish(cachedTheme || 'system');
        return;
      }

      finish(result?.themeSetting || cachedTheme || 'system');
    });
  } catch (e) {
    finish(cachedTheme || 'system');
  }
})();