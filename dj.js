// DJ — 🎙️ first tap records; second tap stops and the take loops, gapless, forever.
// ⏹ stops the loop (or throws away a recording that's still going).

import { audioContext, decode, explain, play, startRecording } from '../audio.js';
import { createScreen } from '../screen.js';
import { h, roundKey, seconds } from '../ui.js';

export default {
  title: 'DJ',

  mount(root) {
    const screen = createScreen('Tap 🎙️ to record a loop');
    const recKey = roundKey('🎙️', 'Record', toggleRecording, 'is-rec');
    const stopKey = roundKey('⏹\uFE0E', 'Stop', stop);

    let take = null;
    let voice = null;
    let counter = 0;
    let busy = false;
    let alive = true;

    function sync() {
      recKey.classList.toggle('is-live', Boolean(take));
      recKey.setAttribute('aria-label', take ? 'Stop recording and loop it' : 'Record');
      stopKey.disabled = !take && !voice;
    }

    async function toggleRecording() {
      if (busy) return;
      busy = true;
      try {
        if (take) {
          const blob = await take.stop();
          take = null;
          startLoop(await decode(blob));
        } else {
          stopLoop();
          take = await startRecording();
          if (!alive) { take.stop(); return; }
          screen.recording(take, 'Recording. Tap 🎙️ to loop it');
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

    function startLoop(buffer) {
      voice = play(buffer, { loop: true });
      screen.show(buffer);
      screen.run(buffer.duration, { loop: true });
      screen.say('Looping');

      // Count passes from the audio clock, so the number never drifts from what you hear.
      const startedAt = audioContext().currentTime;
      const tick = () => {
        const pass = Math.floor((audioContext().currentTime - startedAt) / buffer.duration) + 1;
        screen.detail(`${seconds(buffer.duration)}  ×${pass}`);
      };
      tick();
      counter = setInterval(tick, 100);
    }

    function stopLoop() {
      voice?.stop();
      voice = null;
      clearInterval(counter);
      screen.halt();
    }

    function stop() {
      if (busy) return;
      if (take) {
        take.stop();
        take = null;
        screen.show(null);
        screen.say('Recording discarded. Tap 🎙️ to record a loop');
      } else if (voice) {
        stopLoop();
        screen.say('Stopped. Tap 🎙️ to record a new loop');
      }
      sync();
    }

    root.append(h('div', { class: 'instrument' },
      screen.el,
      h('div', { class: 'transport' }, recKey, stopKey)));
    sync();

    return () => {
      alive = false;
      stopLoop();
      take?.stop();
    };
  },
};
