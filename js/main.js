// Three pages, one URL each:  #/  →  #/tools  →  #/kustom | #/reverse | #/dj
// A tool is { title, mount(element) → cleanup }. Leaving a tool always runs its
// cleanup, so nothing keeps playing or recording behind your back.

import { unlockAudio } from './audio.js';
import { closeSheet } from './ui.js';
import kustom from './tools/kustom.js';
import reverse from './tools/reverse.js';
import dj from './tools/dj.js';

const tools = { kustom, reverse, dj };
const $ = id => document.getElementById(id);
const views = ['home', 'tools', 'tool'].map($);

let unmount = null;
let page = null;
let cameFromTools = false;

function route() {
  const name = location.hash.replace(/^#\/?/, '');
  const tool = tools[name];
  const next = tool ? 'tool' : name === 'tools' ? 'tools' : 'home';

  closeSheet();
  unmount?.();
  unmount = null;
  cameFromTools = Boolean(tool) && page === 'tools';
  page = tool ? name : next;

  for (const view of views) view.hidden = view.id !== next;

  if (tool) {
    $('tool-title').textContent = tool.title;
    const body = $('tool-body');
    body.replaceChildren();
    unmount = tool.mount(body);
  }

  document.title = tool ? `${tool.title} | Kustom audio` : 'Kustom audio';
  window.scrollTo(0, 0);
  $(next).querySelector('h1').focus({ preventScroll: true });
}

// ← goes back in history when we came from the tools page, so the phone's
// back gesture and the on-screen arrow always agree.
$('back').addEventListener('click', event => {
  if (!cameFromTools) return;
  event.preventDefault();
  history.back();
});

window.addEventListener('hashchange', route);
route();

for (const type of ['pointerdown', 'touchend', 'keydown']) {
  window.addEventListener(type, unlockAudio, { passive: true });
}
document.addEventListener('touchstart', () => {}, { passive: true }); // lets iOS show :active key presses

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(error => console.warn('Offline mode unavailable', error));
}
