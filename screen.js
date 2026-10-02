// The little LCD: a waveform, a playhead, a status line and a readout.
// The playhead sweeps left to right for normal playback and right to left
// for backwards playback, over the same unchanged waveform.

import { h, seconds } from './ui.js';

export function createScreen(message) {
  const canvas = h('canvas', { class: 'wave', 'aria-hidden': 'true' });
  const sweep = h('div', { class: 'sweep', 'aria-hidden': 'true' });
  const waveArea = h('div', { class: 'screen-wave' }, canvas, sweep);
  const status = h('p', { class: 'screen-status', 'aria-live': 'polite' }, message);
  const meta = h('p', { class: 'screen-meta' });
  const el = h('div', { class: 'screen' }, waveArea, h('div', { class: 'screen-text' }, status, meta));

  let buffer = null;
  let clock = 0;
  new ResizeObserver(() => drawWave(canvas, buffer)).observe(canvas);

  const screen = {
    el,
    waveArea, // where overlays like the trimmer attach

    say(text, detail = '') {
      clearInterval(clock);
      el.classList.remove('is-recording');
      status.textContent = text;
      meta.textContent = detail;
    },

    /** Readout only — doesn't disturb screen readers the way status changes do. */
    detail(text) {
      meta.textContent = text;
    },

    recording(take, text) {
      screen.say(text);
      screen.show(null);
      screen.halt();
      el.classList.add('is-recording');
      const tick = () => { meta.textContent = seconds((performance.now() - take.startedAt) / 1000); };
      tick();
      clock = setInterval(tick, 100);
    },

    show(next) {
      buffer = next;
      drawWave(canvas, buffer);
    },

    /** Sweeps the playhead once or forever; `reverse` runs it right to left. */
    run(duration, { loop = false, reverse = false } = {}) {
      el.style.setProperty('--dur', `${duration}s`);
      el.style.setProperty('--runs', loop ? 'infinite' : '1');
      el.style.setProperty('--direction', reverse ? 'reverse' : 'normal');
      el.classList.remove('is-running');
      void el.offsetWidth; // restart the animation
      el.classList.add('is-running');
    },

    halt() {
      el.classList.remove('is-running');
    },
  };
  return screen;
}

/** Mirrored peak bars; a dotted baseline when there's nothing to show. */
function drawWave(canvas, buffer) {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(canvas.clientWidth * ratio);
  const height = Math.round(canvas.clientHeight * ratio);
  if (!width || !height) return;

  canvas.width = width;
  canvas.height = height;
  const pen = canvas.getContext('2d');
  pen.fillStyle = getComputedStyle(canvas).color;
  pen.globalAlpha = buffer ? 1 : 0.35;

  const bar = 3 * ratio;
  const step = 5 * ratio;
  const peaks = measure(buffer, Math.floor(width / step));
  peaks.forEach((peak, i) => {
    const size = Math.max(2 * ratio, peak * height * 0.92);
    pen.fillRect(i * step, (height - size) / 2, bar, size);
  });
}

/** Loudest sample in each slice, scaled so the loudest slice fills the screen. */
function measure(buffer, count) {
  if (!buffer) return new Array(count).fill(0);
  const data = buffer.getChannelData(0);
  const slice = data.length / count;
  const peaks = Array.from({ length: count }, (_, i) => {
    let peak = 0;
    for (let j = Math.floor(i * slice), end = Math.floor((i + 1) * slice); j < end; j++) {
      const level = Math.abs(data[j]);
      if (level > peak) peak = level;
    }
    return peak;
  });
  const loudest = Math.max(...peaks, 1e-4);
  return peaks.map(peak => peak / loudest);
}
