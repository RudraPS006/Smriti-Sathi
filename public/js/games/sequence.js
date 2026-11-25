// Game 3 — Colour pattern (working memory). Each pad has an icon AND a word,
// so it also works for people with colour-vision problems.
import { html, mount, $$, sleep } from '../lib.js';

const PADS = [
  { icon: '🌸', color: '#F48FB1' },
  { icon: '🍃', color: '#81C784' },
  { icon: '☀️', color: '#FFD54F' },
  { icon: '💧', color: '#64B5F6' },
];
const ROUNDS = 3;

export function play(el, { config, t, speak }) {
  let score = 0;
  let mistakes = 0;

  return (async () => {
    for (let r = 0; r < ROUNDS; r++) {
      const seq = Array.from({ length: config.length }, () => Math.floor(Math.random() * PADS.length));
      mount(el, html`
        <p class="muted center">${r + 1} / ${ROUNDS}</p>
        <p class="prompt">${t('watch_carefully')}</p>
        <div class="pads">${PADS.map((p, i) => html`<button class="pad" data-i="${i}" style="background:${p.color}" disabled>${p.icon}</button>`)}</div>
        <div class="feedback" aria-live="polite"></div>`);
      const pads = $$('.pad', el);
      const prompt = el.querySelector('.prompt');
      await speak(t('watch_carefully'));
      await sleep(400);

      for (const i of seq) {
        pads[i].classList.add('lit');
        await sleep(config.speedMs);
        pads[i].classList.remove('lit');
        await sleep(300);
      }

      prompt.textContent = t('your_turn');
      speak(t('your_turn'));
      pads.forEach((p) => { p.disabled = false; });

      const ok = await new Promise((resolve) => {
        let pos = 0;
        pads.forEach((pad) => pad.addEventListener('click', async () => {
          const i = Number(pad.dataset.i);
          pad.classList.add('lit');
          setTimeout(() => pad.classList.remove('lit'), 250);
          if (i !== seq[pos]) return resolve(false);
          pos++;
          if (pos === seq.length) resolve(true);
        }));
      });

      pads.forEach((p) => { p.disabled = true; });
      const fb = el.querySelector('.feedback');
      if (ok) { score++; fb.className = 'feedback good'; fb.textContent = t('correct'); }
      else { mistakes++; fb.className = 'feedback bad'; fb.textContent = t('try_again'); }
      speak(fb.textContent);
      await sleep(1600);
    }
    return { score, maxScore: ROUNDS, mistakes };
  })();
}
