// Reverse — 🎙️ records (tap again to stop), ▶ plays it, ⟲ flips it backwards and plays.
// ⟲ is a toggle: tap it again to flip back to forwards.

import { decode, explain, play, reversed, startRecording } from '../audio.js';
import { createScreen } from '../screen.js';
import { h, roundKey, seconds } from '../ui.js';

export default {
  title: 'Reverse',

  mount(root) {
    const screen = createScreen('Tap 🎙️ to record');
    const recKey = roundKey('🎙️', 'Record', toggleRecording, 'is-rec');
    const playKey = roundKey('▶\uFE0E', 'Play', playTake);
    const flipKey = roundKey('⟲', 'Reverse', flip);

    let take = null;      // the recording in progress
    let forwards = null;  // what was recorded
    let backwards = null; // the same, reversed
    let isReversed = false;
    let voice = null;
    let busy = false;
    let alive = true;

    const current = () => (isReversed ? backwards : forwards);
    const label = () => (isReversed ? 'Reversed' : 'Forwards');

    function sync() {
      recKey.classList.toggle('is-live', Boolean(take));
      recKey.setAttribute('aria-label', take ? 'Stop recording' : 'Record');
      playKey.disabled = flipKey.disabled = !forwards || Boolean(take);
      flipKey.setAttribute('aria-pressed', String(isReversed));
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
          isReversed = false;
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

    function playTake() {
      stopPlayback();
      const buffer = current();
      const mine = voice = play(buffer);
      screen.run(buffer.duration);
      screen.say(isReversed ? 'Playing backwards' : 'Playing', seconds(buffer.duration));
      mine.done.then(() => {
        if (voice !== mine) return;
        voice = null;
        screen.halt();
        screen.say(label(), seconds(buffer.duration));
      });
    }

    function flip() {
      isReversed = !isReversed;
      screen.flip(isReversed);
      sync();
      playTake();
    }

    function stopPlayback() {
      voice?.stop();
      voice = null;
      screen.halt();
    }

    root.append(h('div', { class: 'instrument' },
      screen.el,
      h('div', { class: 'transport' }, recKey, playKey, flipKey)));
    sync();

    return () => {
      alive = false;
      stopPlayback();
      take?.stop();
    };
  },
};
