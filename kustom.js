// Kustom — a soundboard you build yourself.
// One group fills the screen. ☰ switches groups, 🔊 stops everything,
// 🔍 searches the group, ⋮ edits it, + adds a sound. Tap a sound to play it;
// long-press or right-click it to rename, trim, replace, move or delete it.
//
// Trimming never cuts the audio: a sound keeps its original recording and a
// { start, end } range, so any trim can be loosened again later.

import { audibleRange, decode, explain, play, startRecording } from '../audio.js';
import { createScreen } from '../screen.js';
import * as store from '../store.js';
import { attachTrimmer } from '../trimmer.js';
import {
  PALETTE, ask, confirm, h, icon, iconButton, menu, notice, pickColor, pressable, roundKey, seconds, sheet, uid,
} from '../ui.js';

const LAST_GROUP = 'kustom-audio:last-group';
const count = n => `${n} sound${n === 1 ? '' : 's'}`;
const isSymbols = name => !/[\p{L}\p{N}]/u.test(name); // "✅", "🥁🥁" → shown large

/** The part of a sound that plays: its saved trim, or all of it. */
function rangeOf(sound, buffer) {
  const end = Math.min(sound.trim?.end ?? buffer.duration, buffer.duration);
  const start = Math.min(sound.trim?.start ?? 0, end);
  return { start, end };
}

function remembered() {
  try { return localStorage.getItem(LAST_GROUP); } catch { return null; }
}

function remember(id) {
  try { localStorage.setItem(LAST_GROUP, id); } catch { /* private browsing */ }
}

/** Plays a range of a buffer and sweeps the screen's playhead across just that range. */
function createPreview(screen) {
  let voice = null;
  const stop = () => {
    voice?.stop();
    voice = null;
    screen.halt();
  };
  const playRange = (buffer, { start, end }) => {
    stop();
    const mine = voice = play(buffer, { offset: start, duration: end - start });
    screen.run(end - start);
    mine.done.then(() => {
      if (voice === mine) { voice = null; screen.halt(); }
    });
  };
  return { play: playRange, stop };
}

const emptyState = (heading, text, ...extra) =>
  h('div', { class: 'empty' }, h('p', { class: 'empty-title' }, heading), h('p', { class: 'empty-text' }, text), ...extra);

export default {
  title: 'Kustom',

  mount(root, { title, actions }) {
    let groups = [];              // [{ id, name, color, order, sounds: [...] }]
    let currentId = remembered(); // the group on screen; survives reopening the app
    let query = '';
    let alive = true;
    const buffers = new Map();    // sound id → Promise<AudioBuffer>
    const voices = new Map();     // sound id → the voice playing it

    const current = () => groups.find(g => g.id === currentId) ?? groups[0] ?? null;

    /* ---------- Fixed parts of the board ---------- */

    const groupName = h('span', { class: 'group-switch-name' });
    const switcher = h('button', {
      type: 'button', class: 'group-switch', 'aria-haspopup': 'dialog', title: 'Switch group',
      onclick: () => safely(openGroups),
    }, icon('menu'), groupName);

    const toolbar = [
      iconButton('speaker', 'Stop all sounds', stopAll),
      iconButton('search', 'Search sounds', openSearch),
      iconButton('more', 'Group options', () => safely(editGroup)),
    ];

    const searchInput = h('input', {
      class: 'search-field', type: 'text', enterkeyhint: 'search', autocomplete: 'off',
      placeholder: 'Search this group', 'aria-label': 'Search sounds in this group',
      oninput: () => { query = searchInput.value.trim().toLowerCase(); renderBoard(); },
      onkeydown: event => { if (event.key === 'Escape') closeSearch(); },
    });
    const searchBar = h('div', { class: 'search-bar', hidden: true },
      icon('search'), searchInput, iconButton('close', 'Close search', () => closeSearch()));

    const board = h('div', { class: 'board' });
    const addKey = h('button', {
      type: 'button', class: 'key fab', 'aria-label': 'Add a sound', hidden: true, onclick: () => safely(addSound),
    }, icon('plus'));

    root.append(searchBar, board, addKey);

    /* ---------- Playing ---------- */

    function bufferFor(sound) {
      if (!buffers.has(sound.id)) {
        buffers.set(sound.id, decode(sound.blob).catch(error => {
          buffers.delete(sound.id);
          throw error;
        }));
      }
      return buffers.get(sound.id);
    }

    async function trigger(sound, tile) {
      voices.get(sound.id)?.stop(); // tapping a playing sound restarts it
      let buffer;
      try {
        buffer = await bufferFor(sound);
      } catch {
        notice(`“${sound.name}” won’t play`, 'Its audio can’t be read. Long-press it and choose Replace audio.');
        return;
      }
      const { start, end } = rangeOf(sound, buffer);
      const voice = play(buffer, { offset: start, duration: end - start });
      voices.set(sound.id, voice);
      tile.style.setProperty('--dur', `${end - start}s`);
      tile.classList.remove('is-playing');
      void tile.offsetWidth;
      tile.classList.add('is-playing');

      await voice.done;
      if (voices.get(sound.id) !== voice) return;
      voices.delete(sound.id);
      tile.classList.remove('is-playing');
    }

    function stopAll() {
      voices.forEach(voice => voice.stop());
    }

    function forget(sound) {
      voices.get(sound.id)?.stop();
      voices.delete(sound.id);
      buffers.delete(sound.id);
    }

    /* ---------- Drawing ---------- */

    function render() {
      const group = current();
      currentId = group?.id ?? null;
      if (group) {
        remember(group.id);
        groupName.textContent = group.name;
        title.replaceChildren(switcher);
        actions.replaceChildren(...toolbar);
      } else {
        title.textContent = 'Kustom';
        actions.replaceChildren();
        closeSearch(false);
      }
      addKey.hidden = !group;
      renderBoard();
    }

    function renderBoard() {
      const group = current();
      if (!group) {
        board.replaceChildren(emptyState('No groups yet',
          'Make a group, then fill it with sounds you record or pick from your files. Everything stays saved on this device.',
          h('button', { type: 'button', class: 'key empty-action', onclick: () => safely(createGroup) }, 'Create a group')));
        return;
      }

      board.style.setProperty('--face', group.color);
      const shown = query ? group.sounds.filter(s => s.name.toLowerCase().includes(query)) : group.sounds;

      if (!group.sounds.length) {
        board.replaceChildren(emptyState(`“${group.name}” is empty`, 'Tap + to record a sound or add one from your files.'));
      } else if (!shown.length) {
        board.replaceChildren(emptyState('No matches',
          `No sound in “${group.name}” has “${searchInput.value.trim()}” in its name.`));
      } else {
        board.replaceChildren(
          h('div', { class: 'tiles' }, ...shown.map(sound => renderTile(group, sound))),
          h('p', { class: 'hint' }, 'Long-press or right-click a sound to edit it.'));
      }
    }

    function renderTile(group, sound) {
      const tile = h('button', { type: 'button', class: 'key tile', 'aria-label': `Play ${sound.name}` },
        h('span', { class: 'tile-play', 'aria-hidden': 'true' }, icon('play')),
        h('span', { class: `tile-name${isSymbols(sound.name) ? ' is-symbols' : ''}`, 'aria-hidden': 'true' }, sound.name));
      pressable(tile, {
        onTap: () => trigger(sound, tile),
        onHold: () => safely(() => editSound(group, sound)),
      });
      return tile;
    }

    function openSearch() {
      searchBar.hidden = false;
      searchInput.focus();
    }

    function closeSearch(redraw = true) {
      searchBar.hidden = true;
      searchInput.value = '';
      query = '';
      if (redraw) renderBoard();
    }

    /** Runs an edit, reports a failed save, and redraws either way. */
    async function safely(task) {
      try {
        await task();
      } catch (error) {
        console.error(error);
        await notice('That change wasn’t saved',
          'The browser refused to store it. Free up space on the device or leave private browsing, then try again.');
      }
      if (alive) render();
    }

    /* ---------- Groups ---------- */

    function showGroup(id) {
      currentId = id;
      closeSearch(false);
    }

    async function openGroups() {
      const choice = await sheet('Groups', done => [
        h('div', { class: 'drawer-list' }, ...groups.map(group => h('button', {
          type: 'button',
          class: 'key action drawer-item',
          'aria-current': group.id === currentId ? 'true' : false,
          onclick: () => done(group.id),
        },
          h('span', { class: 'dot', style: `--dot: ${group.color}` }),
          h('span', { class: 'drawer-name' }, group.name),
          h('span', { class: 'drawer-count' }, count(group.sounds.length))))),
        h('button', { type: 'button', class: 'key action', onclick: () => done('new') }, '+ New group'),
      ], { variant: 'drawer', dismiss: 'Close' });

      if (choice === 'new') await createGroup();
      else if (choice) showGroup(choice);
    }

    async function createGroup() {
      const name = await ask('New group', { value: `Group ${groups.length + 1}`, action: 'Create group' });
      if (!name) return;
      const group = {
        id: uid(),
        name,
        color: PALETTE[groups.length % PALETTE.length].value,
        order: Date.now(),
        sounds: [],
      };
      await store.saveGroup(group);
      groups.push(group);
      showGroup(group.id);
    }

    async function editGroup() {
      const group = current();
      if (!group) return;
      const choice = await menu(group.name, [
        { label: 'Rename group', value: 'rename' },
        { label: 'Change color', value: 'color' },
        { label: 'New group', value: 'new' },
        { label: 'Delete group', value: 'delete', danger: true },
      ]);

      if (choice === 'new') await createGroup();

      if (choice === 'rename') {
        const name = await ask('Rename group', { value: group.name, action: 'Rename' });
        if (!name) return;
        group.name = name;
        await store.saveGroup(group);
      }

      if (choice === 'color') {
        const color = await pickColor(`Color for ${group.name}`, group.color);
        if (!color) return;
        group.color = color;
        await store.saveGroup(group);
      }

      if (choice === 'delete') {
        const n = group.sounds.length;
        const sure = await confirm(`Delete “${group.name}”?`,
          n ? `Its ${count(n)} will be deleted from this device too.` : 'The group is empty.',
          'Delete group');
        if (!sure) return;
        await store.deleteGroup(group.id);
        group.sounds.forEach(forget);
        groups = groups.filter(g => g !== group);
        currentId = null;
      }
    }

    /* ---------- Sounds ---------- */

    async function addSound() {
      const group = current();
      if (!group) return;
      const result = await captureSound(`New sound in ${group.name}`, `Sound ${group.sounds.length + 1}`);
      if (!result) return;
      const sound = {
        id: uid(),
        groupId: group.id,
        name: result.name,
        blob: result.blob,
        trim: result.trim,
        order: Date.now(),
      };
      await store.saveSound(sound);
      buffers.set(sound.id, Promise.resolve(result.buffer));
      group.sounds.push(sound);
    }

    async function editSound(group, sound) {
      const others = groups.filter(g => g !== group);
      const choice = await menu(sound.name, [
        { label: 'Rename sound', value: 'rename' },
        { label: 'Trim sound', value: 'trim' },
        { label: 'Replace audio', value: 'replace' },
        others.length && { label: 'Move to another group', value: 'move' },
        { label: 'Delete sound', value: 'delete', danger: true },
      ]);

      if (choice === 'rename') {
        const name = await ask('Rename sound', { value: sound.name, action: 'Rename' });
        if (!name) return;
        sound.name = name;
        await store.saveSound(sound);
      }

      if (choice === 'trim') {
        let buffer;
        try {
          buffer = await bufferFor(sound);
        } catch {
          await notice(`“${sound.name}” can’t be trimmed`, 'Its audio can’t be read. Choose Replace audio instead.');
          return;
        }
        const trim = await trimSound(`Trim “${sound.name}”`, buffer, rangeOf(sound, buffer));
        if (!trim) return;
        sound.trim = trim;
        await store.saveSound(sound);
      }

      if (choice === 'replace') {
        const result = await captureSound(`New audio for ${sound.name}`);
        if (!result) return;
        forget(sound);
        Object.assign(sound, { blob: result.blob, trim: result.trim });
        await store.saveSound(sound);
        buffers.set(sound.id, Promise.resolve(result.buffer));
      }

      if (choice === 'move') {
        const targetId = await menu(`Move “${sound.name}” to`, others.map(g => ({ label: g.name, value: g.id })));
        const target = others.find(g => g.id === targetId);
        if (!target) return;
        Object.assign(sound, { groupId: target.id, order: Date.now() });
        await store.saveSound(sound);
        group.sounds = group.sounds.filter(s => s !== sound);
        target.sounds.push(sound);
      }

      if (choice === 'delete') {
        const sure = await confirm(`Delete “${sound.name}”?`, 'It will be removed from this device.', 'Delete sound');
        if (!sure) return;
        await store.deleteSound(sound.id);
        forget(sound);
        group.sounds = group.sounds.filter(s => s !== sound);
      }
    }

    /**
     * Get audio (record it or choose a file), trim it, save it.
     * Pass a default name to show the name field. Resolves { blob, buffer, trim, name } or null.
     */
    function captureSound(heading, defaultName = null) {
      return sheet(heading, (done, onClose) => {
        const screen = createScreen('Record a sound or choose a file');
        const preview = createPreview(screen);
        let take = null;
        let blob = null;
        let buffer = null;
        let trimmer = null;
        let busy = false;
        let closed = false;
        let renamed = false;

        const nameField = defaultName && h('input', {
          class: 'field', value: defaultName, maxlength: '40', autocomplete: 'off',
          'aria-label': 'Sound name', oninput: () => { renamed = true; },
        });
        const fileInput = h('input', { type: 'file', accept: 'audio/*', hidden: true, onchange: chooseFile });
        const recKey = roundKey('🎙️', 'Record', toggleRecording, 'is-rec');
        const playKey = roundKey('▶\uFE0E', 'Play the trimmed sound', () => preview.play(buffer, trimmer.get()));
        const fileKey = roundKey('📁', 'Choose an audio file', () => fileInput.click());
        const saveKey = h('button', { type: 'button', class: 'key action is-primary', onclick: save }, 'Save sound');
        recKey.setAttribute('autofocus', ''); // keep the keyboard closed until it's wanted

        function sync() {
          recKey.classList.toggle('is-live', Boolean(take));
          recKey.setAttribute('aria-label', take ? 'Stop recording' : 'Record');
          playKey.disabled = saveKey.disabled = !buffer || Boolean(take);
          fileKey.disabled = Boolean(take);
        }

        const describe = ({ start, end }) => screen.detail(seconds(end - start));

        function clear() {
          trimmer?.destroy();
          trimmer = null;
          blob = buffer = null;
          screen.show(null);
        }

        async function toggleRecording() {
          if (busy) return;
          busy = true;
          try {
            if (take) {
              const recording = await take.stop();
              take = null;
              await accept(recording, true);
            } else {
              preview.stop();
              clear();
              take = await startRecording();
              if (closed) { take.stop(); take = null; return; }
              screen.recording(take, 'Recording. Tap 🎙️ to stop');
            }
          } catch (error) {
            take = null;
            screen.say(explain(error));
          } finally {
            busy = false;
            sync();
          }
        }

        function chooseFile() {
          const file = fileInput.files[0];
          fileInput.value = ''; // allow picking the same file again
          if (!file) return;
          preview.stop();
          accept(file, false);
        }

        async function accept(candidate, recorded) {
          clear();
          try {
            buffer = await decode(candidate);
            blob = candidate;
          } catch {
            screen.say(recorded
              ? 'That recording was too short. Try again and record a little longer.'
              : 'That file can’t be played. Choose a different audio file.');
            sync();
            return;
          }
          screen.show(buffer);
          // Recordings start and end with a breath of silence, so the handles start where the sound is.
          const range = recorded ? audibleRange(buffer) : { start: 0, end: buffer.duration };
          trimmer = attachTrimmer(screen, { length: buffer.duration, ...range, onChange: describe });
          screen.say('Drag the handles to trim');
          describe(trimmer.get());
          if (nameField && !renamed && candidate.name) {
            nameField.value = candidate.name.replace(/\.[^.]+$/, '').slice(0, 40);
          }
          sync();
        }

        function save() {
          preview.stop();
          const name = nameField ? nameField.value.trim() || defaultName : undefined;
          done({ blob, buffer, trim: trimmer.get(), name });
        }

        onClose(() => {
          closed = true;
          preview.stop();
          take?.stop();
        });

        sync();
        return [screen.el, nameField, h('div', { class: 'transport' }, recKey, playKey, fileKey), fileInput, saveKey];
      });
    }

    /** Re-trim an existing sound. Resolves the new { start, end } or null. */
    function trimSound(heading, buffer, range) {
      return sheet(heading, (done, onClose) => {
        const screen = createScreen('Drag the handles to trim');
        const preview = createPreview(screen);
        const describe = ({ start, end }) => screen.detail(seconds(end - start));
        screen.show(buffer);
        const trimmer = attachTrimmer(screen, { length: buffer.duration, ...range, onChange: describe });
        describe(trimmer.get());

        const playKey = roundKey('▶\uFE0E', 'Play the trimmed sound', () => preview.play(buffer, trimmer.get()));
        playKey.setAttribute('autofocus', '');
        onClose(preview.stop);

        return [
          screen.el,
          h('div', { class: 'transport' }, playKey),
          h('button', {
            type: 'button', class: 'key action is-primary',
            onclick: () => { preview.stop(); done(trimmer.get()); },
          }, 'Save trim'),
        ];
      });
    }

    /* ---------- Start ---------- */

    store.loadGroups()
      .then(loaded => {
        if (!alive) return;
        groups = loaded;
        render();
        // Decode everything up front so the first tap on each sound is instant.
        groups.flatMap(g => g.sounds).forEach(sound => bufferFor(sound).catch(() => {}));
      })
      .catch(error => {
        console.error(error);
        board.replaceChildren(emptyState('Saving is turned off',
          'This browser won’t let Kustom store sounds. Leave private browsing and open the app again.'));
        addKey.hidden = true;
      });

    return () => {
      alive = false;
      stopAll();
      voices.clear();
    };
  },
};
