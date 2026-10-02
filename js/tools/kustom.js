// Kustom — your own sound pads, organised in groups, saved on the device.
// Tap a pad to play it. Long-press or right-click a pad or a group name to edit.

import { decode, explain, play, startRecording } from '../audio.js';
import { createScreen } from '../screen.js';
import * as store from '../store.js';
import {
  PALETTE, ask, confirm, h, menu, notice, pickColor, pressable, roundKey, seconds, sheet, uid,
} from '../ui.js';

const count = n => `${n} sound${n === 1 ? '' : 's'}`;

export default {
  title: 'Kustom',

  mount(root) {
    let groups = [];             // [{ id, name, color, order, sounds: [...] }]
    const buffers = new Map();   // sound id → Promise<AudioBuffer>
    const voices = new Map();    // sound id → the voice playing it
    let alive = true;

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

    async function trigger(sound, pad) {
      voices.get(sound.id)?.stop(); // tapping a playing pad restarts it
      let buffer;
      try {
        buffer = await bufferFor(sound);
      } catch {
        notice(`“${sound.name}” won’t play`, 'Its audio can’t be read. Long-press the pad and replace the audio.');
        return;
      }
      const voice = play(buffer);
      voices.set(sound.id, voice);
      pad.style.setProperty('--dur', `${buffer.duration}s`);
      pad.classList.remove('is-playing');
      void pad.offsetWidth;
      pad.classList.add('is-playing');

      await voice.done;
      if (voices.get(sound.id) !== voice) return;
      voices.delete(sound.id);
      pad.classList.remove('is-playing');
    }

    function forget(sound) {
      voices.get(sound.id)?.stop();
      voices.delete(sound.id);
      buffers.delete(sound.id);
    }

    /* ---------- Drawing ---------- */

    function render() {
      root.replaceChildren(
        groups.length
          ? h('p', { class: 'hint' }, 'Tap a pad to play it. Long-press or right-click a pad or group to edit it.')
          : h('div', { class: 'empty' },
              h('p', { class: 'empty-title' }, 'No groups yet'),
              h('p', { class: 'empty-text' },
                'Make a group, then fill it with sounds you record or pick from your files. Everything stays saved on this device.')),
        ...groups.map(renderGroup),
        h('button', { type: 'button', class: 'key new-group', onclick: () => safely(createGroup) }, '+ New group'),
      );
    }

    function renderGroup(group) {
      const title = h('button', { type: 'button', class: 'group-name' },
        group.name,
        h('span', { class: 'group-count' }, count(group.sounds.length)));
      const edit = () => safely(() => editGroup(group));
      pressable(title, { onTap: edit, onHold: edit });

      return h('section', { class: 'group', style: `--face: ${group.color}` },
        title,
        h('div', { class: 'pads' },
          ...group.sounds.map(sound => renderPad(group, sound)),
          h('button', {
            type: 'button',
            class: 'key pad pad-add',
            'aria-label': `Add a sound to ${group.name}`,
            onclick: () => safely(() => addSound(group)),
          }, '+')));
    }

    function renderPad(group, sound) {
      const pad = h('button', { type: 'button', class: 'key pad', 'aria-label': `Play ${sound.name}` },
        h('span', { class: 'pad-time', 'aria-hidden': 'true' }, seconds(sound.duration)),
        h('span', { class: 'pad-name', 'aria-hidden': 'true' }, sound.name));
      pressable(pad, {
        onTap: () => trigger(sound, pad),
        onHold: () => safely(() => editSound(group, sound)),
      });
      return pad;
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
    }

    async function editGroup(group) {
      const choice = await menu(group.name, [
        { label: 'Rename group', value: 'rename' },
        { label: 'Change color', value: 'color' },
        { label: 'Delete group', value: 'delete', danger: true },
      ]);

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
      }
    }

    /* ---------- Sounds ---------- */

    async function addSound(group) {
      const result = await captureSound(`New sound in ${group.name}`, `Sound ${group.sounds.length + 1}`);
      if (!result) return;
      const sound = {
        id: uid(),
        groupId: group.id,
        name: result.name,
        blob: result.blob,
        duration: result.buffer.duration,
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

      if (choice === 'replace') {
        const result = await captureSound(`New audio for ${sound.name}`);
        if (!result) return;
        forget(sound);
        Object.assign(sound, { blob: result.blob, duration: result.buffer.duration });
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
     * A sheet for getting audio: record it or choose a file, preview, save.
     * Pass a default name to show the name field. Resolves { blob, buffer, name } or null.
     */
    function captureSound(title, defaultName = null) {
      return sheet(title, (done, onClose) => {
        const screen = createScreen('Record a sound or choose a file');
        let take = null;
        let blob = null;
        let buffer = null;
        let voice = null;
        let busy = false;
        let closed = false;
        let renamed = false;

        const nameField = defaultName && h('input', {
          class: 'field', value: defaultName, maxlength: '40', autocomplete: 'off',
          'aria-label': 'Sound name', oninput: () => { renamed = true; },
        });
        const fileInput = h('input', { type: 'file', accept: 'audio/*', hidden: true, onchange: chooseFile });
        const recKey = roundKey('🎙️', 'Record', toggleRecording, 'is-rec');
        const playKey = roundKey('▶\uFE0E', 'Play', preview);
        const fileKey = roundKey('📁', 'Choose an audio file', () => fileInput.click());
        const saveKey = h('button', { type: 'button', class: 'key action is-primary', onclick: save }, 'Save sound');
        recKey.setAttribute('autofocus', ''); // keep the keyboard closed until it's wanted

        function sync() {
          recKey.classList.toggle('is-live', Boolean(take));
          recKey.setAttribute('aria-label', take ? 'Stop recording' : 'Record');
          playKey.disabled = saveKey.disabled = !buffer || Boolean(take);
          fileKey.disabled = Boolean(take);
        }

        async function toggleRecording() {
          if (busy) return;
          busy = true;
          try {
            if (take) {
              const recording = await take.stop();
              take = null;
              await accept(recording);
            } else {
              stopPreview();
              blob = buffer = null;
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
          if (file) accept(file);
        }

        async function accept(candidate) {
          try {
            buffer = await decode(candidate);
            blob = candidate;
            screen.show(buffer);
            screen.say('Ready to save', seconds(buffer.duration));
            if (nameField && !renamed && candidate.name) {
              nameField.value = candidate.name.replace(/\.[^.]+$/, '').slice(0, 40);
            }
          } catch {
            blob = buffer = null;
            screen.show(null);
            screen.say(candidate.name
              ? 'That file can’t be played. Choose a different audio file.'
              : 'That recording was too short. Try again and record a little longer.');
          }
          sync();
        }

        function preview() {
          stopPreview();
          const mine = voice = play(buffer);
          screen.run(buffer.duration);
          mine.done.then(() => {
            if (voice === mine) { voice = null; screen.halt(); }
          });
        }

        function stopPreview() {
          voice?.stop();
          voice = null;
          screen.halt();
        }

        function save() {
          const name = nameField ? nameField.value.trim() || defaultName : undefined;
          done({ blob, buffer, name });
        }

        onClose(() => {
          closed = true;
          stopPreview();
          take?.stop();
        });

        sync();
        return [screen.el, nameField, h('div', { class: 'transport' }, recKey, playKey, fileKey), fileInput, saveKey];
      });
    }

    /* ---------- Start ---------- */

    store.loadGroups()
      .then(loaded => {
        if (!alive) return;
        groups = loaded;
        render();
        // Decode everything up front so the first tap on each pad is instant.
        groups.flatMap(g => g.sounds).forEach(sound => bufferFor(sound).catch(() => {}));
      })
      .catch(error => {
        console.error(error);
        root.replaceChildren(h('div', { class: 'empty' },
          h('p', { class: 'empty-title' }, 'Saving is turned off'),
          h('p', { class: 'empty-text' },
            'This browser won’t let Kustom store sounds. Leave private browsing and open the app again.')));
      });

    return () => {
      alive = false;
      voices.forEach(voice => voice.stop());
      voices.clear();
    };
  },
};
