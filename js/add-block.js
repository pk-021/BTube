// add-block.js - Handle adding blocked websites and channels

document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('close-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const saveBtn = document.getElementById('save-btn');
  const websiteUrlField = document.getElementById('website-url');

  // Close popup handlers
  const closePopup = () => {
    window.close();
  };

  closeBtn.addEventListener('click', closePopup);
  cancelBtn.addEventListener('click', closePopup);

  // Save blocked content
  saveBtn.addEventListener('click', async () => {
    const url = websiteUrlField.value.trim();
    if (!url) {
      alert('Please enter a website URL');
      return;
    }
    await addBlockedWebsite(url);

    // Close popup after saving
    window.close();
  });

  // Add blocked website
  async function addBlockedWebsite(url) {
    try {
      // Clean up the URL
      let cleanUrl = url;
      if (!url.startsWith('http')) {
        cleanUrl = 'https://' + url;
      }

      // Get existing blocked websites
      const result = await chrome.storage.local.get(['blockedWebsites']);
      const blockedWebsites = result.blockedWebsites || [];

      // Check if already blocked
      if (blockedWebsites.some(item => item.url === cleanUrl)) {
        alert('This website is already blocked');
        return;
      }

      // Add new blocked website
      blockedWebsites.push({
        url: cleanUrl,
        addedAt: Date.now()
      });

      // Save to storage
      await chrome.storage.local.set({ blockedWebsites });
      
      console.log('[Block] Website added:', cleanUrl);
    } catch (error) {
      console.error('Error adding blocked website:', error);
      alert('Failed to block website. Please try again.');
    }
  }

  // Handle Enter key in input fields
  websiteUrlField.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveBtn.click();
    }
  });

  channelNameField.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveBtn.click();
    }
  });

  // Apply dark mode if needed
  chrome.storage.local.get(['dark_mode'], (result) => {
    if (result.dark_mode) {
      document.documentElement.setAttribute('dark_mode', 'true');
    }
  });
});
