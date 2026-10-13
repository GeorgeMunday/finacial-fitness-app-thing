# Manual testing checklist

These checks cover what the automated tests and headless Chromium couldn't reach: real phones, Safari, the live Open Food Facts API and the installed app. Note the device, OS version and browser version for each run, and mark each step pass or fail.

## Setup: serve the build over HTTPS

The camera, service worker and persistent storage only work in a secure context, so phones need an HTTPS URL. Use one of these:

- **Static host (easiest).** Run `npm run build` and deploy `dist/` to any HTTPS static host that serves `index.html` for unknown paths (for example Netlify or Cloudflare Pages).
- **Tunnel from your machine.** Run `npm run build && npx vite preview --host --port 4173`, then expose port 4173 with an HTTPS tunnel (for example `cloudflared tunnel --url http://localhost:4173`).

Use a fresh profile or clear the site's data before each section, unless the step says otherwise.

## 1. Live Open Food Facts lookup (including CORS)

On desktop Chrome, open the served site, then open DevTools → Console and run:

```js
fetch('https://world.openfoodfacts.org/api/v2/product/3017620422003.json?fields=product_name&app_name=Tally&app_version=0.1')
  .then((r) => r.json()).then(console.log)
```

- [ ] It logs a product name, and there's no CORS error in the console.

Then in the app (turn Food on in onboarding or More):

- [ ] Food → Add → Scan barcode, type `3017620422003`, press Look up. You land on the food's page with "Food data © Open Food Facts contributors, ODbL" at the bottom.
- [ ] In DevTools → Network, the request URL contains `app_name=Tally&app_version=0.1`.
- [ ] Log it. Turn the network off (DevTools → Network → Offline), look up the same barcode again: it opens straight away from the local cache.
- [ ] Still offline, look up a different real barcode: you land on "Create food" with the barcode filled in, not an error or a blank screen.
- [ ] Back online, look up a made-up barcode such as `5012345678900`: you land on "Create food" with the barcode filled in.
- [ ] Repeat the first lookup in Safari on a Mac or iPhone, if you have one: same result, no CORS error.

## 2. Barcode scanning on iPhone Safari and Android Chrome

Run on both phones, from the HTTPS URL.

- [ ] Food → Add → Scan barcode → Start camera. The browser asks for camera permission; allow it.
- [ ] The back camera shows. Point it at a supermarket barcode (EAN-13): within a few seconds you land on the food page, or on "Create food" with the barcode filled in.
- [ ] After a successful scan the camera light/indicator turns off.
- [ ] Deny camera permission (or turn it off in site settings) and try again: you see "Camera access is off…" and the Barcode field still works.
- [ ] Load the scan screen once online, then go into airplane mode and scan again: the barcode is still read (the decoder is bundled), and you land on "Create food" (or the cached food).
- [ ] Log the scanned food. It appears on the Food screen under the right meal.

## 3. Add to Home Screen and persistent storage on iOS

Important: on iOS, a Home Screen app has **separate storage** from Safari tabs. Anything logged in a Safari tab won't appear in the installed app. If you've already used Tally in Safari, download a backup first (More → Download backup) and restore it inside the installed app.

- [ ] In Safari (not installed), Tally shows "Add Tally to your Home Screen to keep your data safe…".
- [ ] Share → Add to Home Screen. Open Tally from the Home Screen: it opens full screen with no Safari address bar, and the banner is gone.
- [ ] Go through onboarding. More → Storage shows "Saved in this browser: Yes" and "Installed to Home Screen: Yes". Note what "Protected from clean-up" says (Yes, No or Not supported).
- [ ] Add an expense and a savings contribution. Force-quit the app from the app switcher and reopen it: both are still there.
- [ ] Restart the phone and reopen: the data is still there.
- [ ] Optional, longer check: leave the installed app unused for 8+ days, then reopen. The data should still be there; installed apps are exempt from Safari's 7-day clean-up.

## 4. Backup from Chrome restored in Safari

- [ ] In Chrome, log a few expenses, one income, a savings goal with a contribution, and (with Food on) a food log. Note the Money screen totals and the goal's "£X to go".
- [ ] More → Download backup. A file named `tally-backup-YYYY-MM-DD.json` downloads, and More now shows "Last backup" with today's date.
- [ ] Move the file to the Safari device (AirDrop, Files or email).
- [ ] Also try Download backup inside the installed iOS app: note whether a file is saved (or a share sheet appears). Downloads from Home Screen apps are unreliable on iOS, so this may fail.
- [ ] In Safari (or the installed iOS app), More → Restore from backup → choose the file → Replace my data. The app reloads.
- [ ] Money totals, transactions, the goal and its progress, and the food log match what you noted in Chrome.
- [ ] Clear the site's data (or use a fresh browser profile), open Tally: the first onboarding screen offers "Restore from a backup", and restoring there takes you straight to Today with your data.
- [ ] Try restoring any other JSON file: you get a message saying it isn't a Tally backup, and your data is unchanged.

## 5. Offline use of the installed app

On Android Chrome (menu → Install app or Add to Home screen) and on the iOS Home Screen app from section 3:

- [ ] Open the installed app once while online, then close it.
- [ ] Turn on airplane mode and open the app from the Home Screen: it loads normally, with no browser offline page.
- [ ] Offline, add an expense, add to a savings goal and (with Train on) log a set. Each shows its "saved" toast.
- [ ] With Food on, search for "banana" offline: starter foods appear.
- [ ] Fully close the app, reopen it while still offline: everything you logged is still there.
- [ ] Turn the network back on: nothing is lost or duplicated, and recurring payments due today appear once (not twice).

## Reporting

For each failure, note the device, OS and browser versions, the step, what you saw (a screenshot helps) and what you expected.
