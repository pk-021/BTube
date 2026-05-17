"use strict";

// Apply dark mode on load
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
    } else {
      document.documentElement.removeAttribute("dark_mode");
    }
  });
}

// Get URL parameters to extract the message
function getNotificationData() {
  const params = new URLSearchParams(window.location.search);
  return {
    message: params.get('message') || 'Notification',
    type: params.get('type') || 'info'
  };
}

// Show the notification
function showNotification() {
  const { message } = getNotificationData();
  if (chrome && chrome.notifications) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'assets/logo_v2.png',
      title: 'BTube',
      message: message
    });
    setTimeout(() => {
      window.close();
    }, 2000);
  }
}

// Close notification with animation
function closeNotification() {
  const container = document.getElementById('notification-container');
  container.classList.add('closing');
  
  // Wait for animation to complete, then close the window
  setTimeout(() => {
    window.close();
  }, 300);
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  applyDarkMode();
  showNotification();
  
  // Ensure window has focus
  window.focus();
  
  // Try to bring window to front
  setTimeout(() => {
    window.focus();
    document.body.focus();
  }, 100);
  
  // Close button
  document.getElementById('close-notification').addEventListener('click', closeNotification);
  
  // OK button
  document.getElementById('notification-ok').addEventListener('click', closeNotification);
  
  // ESC key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeNotification();
    }
  });
});