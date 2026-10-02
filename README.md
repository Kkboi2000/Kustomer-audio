# Kustom audio

A pocket audio app that installs on your phone like a native app. No build step, no dependencies: plain HTML, CSS and JavaScript.

*Krit's vibe code.*

## Tools

**Kustom** keeps your own sound pads in groups. Tap a pad to play it. Long-press (phone) or right-click (computer) a pad to rename it, replace its audio, move it to another group, or delete it. Tap or long-press a group name to rename it, change its color, or delete it. Groups and sounds are saved on the device, so they're still there when you reopen the app.

**Reverse** has three keys. 🎙️ records (tap again to stop), ▶ plays the recording, ⟲ flips it backwards and plays it. Tap ⟲ again to flip it back.

**DJ** has two keys. 🎙️ starts recording; tapping it again stops and immediately loops the recording, gapless, over and over. ⏹ stops the loop.

## Put it online with GitHub Pages

1. Create a new repository on GitHub, for example `kustom-audio`.
2. Upload everything in this folder to it (drag the files onto the repo page, or push with git).
3. In the repo, open **Settings → Pages**, set **Source** to *Deploy from a branch*, pick `main` and `/ (root)`, and save.
4. After a minute your app is live at `https://YOUR-USERNAME.github.io/kustom-audio/`.

GitHub Pages serves over https, which the microphone and the install button both require.

## Install it as an app

- **Android (Chrome):** open the link, then tap **Install app** in the menu (or the install prompt).
- **iPhone (Safari):** open the link, tap **Share**, then **Add to Home Screen**.
- **Computer (Chrome or Edge):** click the install icon in the address bar.

## Run it on your computer

Any static server works; the microphone is allowed on `localhost`.

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## How it's built

```
index.html            the three pages: title, tool picker, tool
css/app.css           the whole look: tokens, keys, screen, pads, sheets
js/main.js            routing between pages (#/, #/tools, #/kustom, #/reverse, #/dj)
js/audio.js           recording, decoding, playback, reversing
js/store.js           saving Kustom groups and sounds in IndexedDB
js/ui.js              shared pieces: tap vs. long-press, sheets, prompts
js/screen.js          the waveform display
js/tools/*.js         one file per tool
sw.js                 offline support
manifest.webmanifest  what makes it installable
```

Each tool is an object with a `title` and a `mount(element)` that returns a cleanup function. Leaving a tool always runs its cleanup, so nothing keeps playing or recording in the background. To add a fourth tool, write `js/tools/yourtool.js`, add it to `tools` in `main.js`, add a link on the tools page, and list the new file in `sw.js`.

## Good to know

- Kustom's sounds live in the browser's storage on that one device. On iPhone, the home-screen app and Safari keep separate storage.
- When you add or rename files, also update `APP_FILES` in `sw.js` and bump `VERSION` so installed copies pick up the change.
- The typeface is Bricolage Grotesque, used under the SIL Open Font License (`fonts/OFL.txt`).
