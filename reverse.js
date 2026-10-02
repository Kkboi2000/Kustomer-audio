// Reverse — 🎙️ records (tap again to stop), ▶ plays it forwards,
// ⟲ plays it backwards: the playhead runs right to left across the waveform.

import { decode, explain, play, reversed, startRecording } from '../audio.js';
import { createScreen } from '../screen.js';
import { h, roundKey, seconds } from '../ui.js';

export default {
  title: 'Reverse',

  mount(root) {
    const screen = createScreen('Tap 🎙️ to record');
    const recKey = roundKey('🎙️', 'Record', toggleRecording, 'is-rec');
    const playKey = roundKey('▶\uFE0E', 'Play', () => playTake(false));
    const backKey = roundKey('⟲', 'Play backwards', () => playTake(true));

    let take = null;      // the recording in progress
    let forwards = null;  // what was recorded
    let backwards = null; // the same samples, last to first
    let voice = null;
    let busy = false;
    let alive = true;

    function sync() {
      recKey.classList.toggle('is-live', Boolean(take));
      recKey.setAttribute('aria-label', take ? 'Stop recording' : 'Record');
      playKey.disabled = backKey.disabled = !forwards || Boolean(take);
    }

    async function toggleRecording() {
      if (busy) return;
      busy = true;
      try {
        if (take) {
          const blob = await take.stop();
          take = null;
          forwards = await decode(blob);
          backwards = reversed(forwards);
          screen.show(forwards);
          screen.say('Ready', seconds(forwards.duration));
        } else {
          stopPlayback();
          forwards = backwards = null;
          take = await startRecording();
          if (!alive) { take.stop(); return; }
          screen.recording(take, 'Recording. Tap 🎙️ to stop');
        }
      } catch (error) {
        take = null;
        screen.show(null);
        screen.say(explain(error));
      } finally {
        busy = false;
        sync();
      }
    }

    function playTake(backward) {
      stopPlayback();
      const buffer = backward ? backwards : forwards;
      const mine = voice = play(buffer);
      screen.run(buffer.duration, { reverse: backward });
      screen.say(backward ? 'Playing backwards' : 'Playing', seconds(buffer.duration));
      mine.done.then(() => {
        if (voice !== mine) return;
        voice = null;
        screen.halt();
        screen.say('Ready', seconds(buffer.duration));
      });
    }

    function stopPlayback() {
      voice?.stop();
      voice = null;
      screen.halt();
    }

    root.append(h('div', { class: 'instrument' },
      screen.el,
      h('div', { class: 'transport' }, recKey, playKey, backKey)));
    sync();

    return () => {
      alive = false;
      stopPlayback();
      take?.stop();
    };
  },
};
