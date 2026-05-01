# BTube (BetterYoutube)

BTube is a browser extension that enhances your YouTube experience by making it more productive and less distracting. It provides features to customize your homepage, block unwanted content, and manage the extension from a compact popup.

---

## Features

- **Minimal Homepage**: Hide the YouTube home feed for a cleaner, distraction-free experience.
- **Redirect Home**: Automatically redirect the YouTube homepage and certain pages (like Trending and Shorts) to your Subscriptions feed.
- **Disable Shorts**: Hide YouTube Shorts from the sidebar, search results, and homepage.
- **Dark Mode**: Toggle dark mode for the extension popup and settings.
- **Extension Lock**: Secure the extension with a password and reset it if forgotten.
- **Smart Overlay Notifications**: Get beautiful, non-intrusive notifications that appear as overlays on any webpage - just like Bitwarden and other modern extensions.

---
## Getting Started

### 1. Install the Extension
- Download or clone this repository to your computer.  
- Open your browser’s **Extensions page**:  
  - Chrome: `chrome://extensions/`  
  - Edge: `edge://extensions/`  
- Enable **Developer Mode** (toggle in the top right).  
- Click **Load unpacked** and select the project folder.  
- The extension will now be installed.

### 2. Open the Popup
- Click the **BTube icon** in your browser toolbar to open the popup.  
- From here, you can:  
  - Access settings and toggle dark mode.  
### 3. Settings
- Open the **settings page** to:  
  - Enable or disable the extension.  
  - Toggle homepage redirection, hide Shorts, or enable a minimal homepage.  
  - Set or change your extension password.  

---

## File Structure

- `manifest.json` – Extension manifest and permissions.
- `popup.html`, `js/popup.js`, `css/popup.css` – Popup UI and logic.
- `settings.html`, `js/settings.js`, `css/settings.css` – Settings UI and logic.
- `login.html`, `js/login.js`, `css/login.css` – Password lock and reset.
- `notification.html`, `js/notification.js`, `css/notification.css` – Bottom-right notification system.
- `js/background.js` – Service worker for background tasks, redirect rules, and notification handling.
- `js/content.js`, `css/content.css` – Content script for modifying YouTube pages and injecting UI.
- `assets/` – Icons and images.

---

## Permissions

- Access to YouTube pages (`*://*.youtube.com/*`)
- Storage for settings
- Tab and navigation management
- Declarative Net Request for redirecting pages
- Notifications for user feedback
- Notifications for user feedback

---

## Security

- All extension settings can be locked with a password.
- Passwords are stored locally and can be reset via a simple challenge.

---

## Development

1. Clone or download this repository.
2. Load as an unpacked extension in your browser.
3. Edit source files as needed.  
   - Popup and settings UIs are in HTML/CSS/JS.
   - Content scripts modify YouTube in real time.

---

## License


---

## Credits
- Inspirations from Unhooked Extension, StayFocusd Extension and others
- Inspired by a Hackathon project-UnBind.
- Icons and assets are original or from open sources.

---

## Contributing

Pull requests and suggestions are welcome!

---

## Contact

For issues or feature requests, open an issue on GitHub or contact the maintainer.
