# Kustom audio

A pocket audio app that installs on your phone like a native app. No build step, no dependencies: plain HTML, CSS and JavaScript.

*Krit's vibe code.*

## Tools

**Kustom** is a soundboard you build yourself. One group fills the screen as a grid of sounds. Tap a sound to play it. **☰** switches groups or makes a new one, **🔊** stops everything that's playing, **🔍** searches the group, **⋮** renames, recolors or deletes it, and **+** adds a sound by recording it or choosing a file. Long-press (phone) or right-click (computer) a sound to rename, trim, replace, move or delete it. Everything is saved on the device, and the app reopens on the group you last used.

**Trimming** happens right after you record or pick a file, and any time later from a sound's edit menu. Drag the two handles on the waveform, press ▶ to hear the result, then save. Recordings start with the handles already moved past the silence at each end. Trimming never cuts the original audio, so you can always widen it again.

**Reverse** has three keys. 🎙️ records (tap again to stop), ▶ plays the recording forwards, ⟲ plays it backwards, with the playhead running right to left across the waveform.

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
js/trimmer.js         the trim handles
js/tools/*.js         one file per tool
sw.js                 offline support
manifest.webmanifest  what makes it installable
```

Each tool is an object with a `title` and a `mount(body, { title, actions })` that returns a cleanup function; a tool can put its own controls in the page header, as Kustom does. Leaving a tool always runs its cleanup, so nothing keeps playing or recording in the background. To add a fourth tool, write `js/tools/yourtool.js`, add it to `tools` in `main.js`, add a link on the tools page, and list the new file in `sw.js`.

## Good to know

- Kustom's sounds live in the browser's storage on that one device. On iPhone, the home-screen app and Safari keep separate storage.
- When you add or rename files, also update `APP_FILES` in `sw.js` and bump `VERSION` so installed copies pick up the change.
- The typeface is Bricolage Grotesque, used under the SIL Open Font License (`fonts/OFL.txt`).
