# BTube Testing Checklist

Use this checklist to verify the extension after changes and before releasing a build. The goal is to catch UI regressions, broken flows, storage issues, and runtime console errors.

## 1. Pre-flight Checks

- Load the extension as an unpacked extension in Chrome or Edge.
- Open the browser extension details page and confirm there are no install-time errors.
- Reload the extension once and confirm it still starts cleanly.
- Open the browser DevTools console on the popup and verify there are no uncaught errors on load.

## 2. Popup Testing

Test the popup UI in [popup.html](popup.html) with its script in [js/popup.js](js/popup.js).

- Open the popup and confirm it renders without broken layout or missing icons.
- Switch the theme selector through System, Day, and Night.
- Close and reopen the popup to confirm the selected theme persists.
- Open the Mode row and confirm the settings view opens normally.
- Open the Blocked Websites row and confirm the blocking view opens normally.
- Use the back buttons in both views and confirm navigation returns to Home.
- Verify buttons, toggles, and select controls are clickable and do not trigger console errors.

## 3. Settings Flow Testing

Test the settings behavior in [settings.html](settings.html) and [js/settings.js](js/settings.js).

- Open the settings page and confirm it loads with the expected default values.
- Toggle each setting one at a time and confirm the UI reflects the change.
- Save changes and confirm the values persist after a refresh.
- Switch between presets and custom settings, then confirm the active mode is updated correctly.
- Verify the save button only appears or enables when there are unsaved changes.
- Check that switching away and back preserves the selected state.

## 4. Login and Password Testing

Test the lock screen in [login.html](login.html) and [js/login.js](js/login.js).

- Set a new password and confirm weak passwords are rejected.
- Confirm password matching is validated in the setup flow.
- Log in with the correct password and confirm the extension unlocks.
- Enter a wrong password and confirm the error state appears.
- Refresh or reopen the lock page and confirm the stored password still works.
- Confirm pressing Enter works where intended in login and setup flows.

## 5. Password Reset Testing

Test the reset flow carefully in [login.html](login.html) and [js/login.js](js/login.js).

- Click Forgot Password and confirm the reset challenge opens.
- Enter each displayed word correctly and confirm the next word appears.
- Enter an incorrect word and confirm the reset flow restarts.
- Confirm the reset input does not advance unexpectedly when typing and pressing Enter.
- Confirm the reset flow clears the stored password only after the full challenge is completed.
- After reset, confirm the app returns to the password setup state.

## 6. Blocking and Overlay Testing

Test blocked-site management in [popup.html](popup.html), [js/popup.js](js/popup.js), [add-block.html](add-block.html), [js/add-block.js](js/add-block.js), [notification.html](notification.html), and [js/notification.js](js/notification.js).

- Add a website or channel block and confirm it appears in the blocked list.
- Edit or remove a blocked entry and confirm the list updates correctly.
- Confirm blocked items persist after reopening the popup.
- Verify the add-block overlay opens and closes correctly.
- Try invalid URLs or empty input and confirm validation messages appear.
- Confirm the overlay notification path still appears on normal webpages where expected.

## 7. Content Script Testing

Test page behavior from [js/content.js](js/content.js) and [css/content.css](css/content.css).

- Open YouTube home and confirm homepage modifications are applied when enabled.
- Check Shorts-related pages and confirm the Shorts hiding behavior works when enabled.
- Confirm sidebar and recommendation changes appear only when the related settings are enabled.
- Refresh YouTube and make sure injected UI does not duplicate itself.
- Open multiple YouTube pages and confirm the content script does not break navigation.

## 8. Background and Rules Testing

Test service-worker and rule behavior in [js/background.js](js/background.js) and [rules.json](rules.json).

- Confirm the extension starts without service worker errors.
- Verify DNR rules are loaded and active.
- Test pages that should redirect and confirm the redirect behavior is correct.
- Confirm unrelated pages are not redirected.
- Check browser console and extension service-worker logs for uncaught exceptions.

## 9. Notification Testing

Test both notification systems in [js/notification.js](js/notification.js) and [js/overlay-notification.js](js/overlay-notification.js).

- Trigger a success notification and confirm the message appears.
- Trigger an error or warning notification and confirm the styling is correct.
- Confirm the overlay notification does not block normal page interaction longer than expected.
- Close or dismiss notifications and confirm they clean up properly.

## 10. Persistence and Regression Checks

- Reload the browser after changing settings and confirm all stored values survive.
- Disable and re-enable the extension and confirm the behavior is still correct.
- Update one setting, then test a different feature to make sure the new change did not break another area.
- Verify there are no repeated console errors after several open-close cycles of the popup.
- Confirm the extension works in both fresh and already-authenticated states.

## 11. Final Acceptance Criteria

Consider the change safe only if all of the following are true:

- The popup opens without errors.
- Settings save and reload correctly.
- Password setup, login, and reset all work.
- Blocked website management works end to end.
- YouTube page modifications apply only when enabled.
- No uncaught errors appear in the popup, page console, or service worker logs.
