// Game 1 — Matching pairs. Pictures are familiar things from North East India.
import { html, mount, $$, shuffle, sleep } from '../lib.js';

const PICS = ['🫖', '🐘', '🦏', '🌺', '🎋', '🛶', '🥁', '🐟', '🍚', '☂️', '🏔️', '🌾'];

export function play(el, { config, t, speak }) {
  const pairs = config.pairs;
  const deck = shuffle(shuffle(PICS).slice(0, pairs).flatMap((p) => [p, p]));
  let open = [];
  let matched = 0;
  let mistakes = 0;
  let locked = true;

  mount(el, html`
    <p class="prompt">${t('find_pairs')}</p>
    <div class="cards" style="grid-template-columns:repeat(${pairs <= 3 ? 3 : 4}, minmax(90px, 1fr))">
      ${deck.map((p, i) => html`<button class="mcard up" data-i="${i}" aria-label="card ${i + 1}">${p}</button>`)}
    </div>
    <div class="feedback" aria-live="polite"></div>`);
  speak(t('find_pairs'));

  const cards = $$('.mcard', el);
  const fb = el.querySelector('.feedback');

  return new Promise((resolve) => {
    // Short preview: show all cards first, then hide them
    sleep(config.previewSec * 1000).then(() => {
      cards.forEach((c) => { c.classList.remove('up'); c.innerHTML = '<span class="back">✦</span>'; });
      locked = false;
    });

    cards.forEach((card) => card.addEventListener('click', async () => {
      const i = Number(card.dataset.i);
      if (locked || card.classList.contains('up') || card.classList.contains('matched')) return;
      card.classList.add('up');
      card.textContent = deck[i];
      open.push(card);
      if (open.length < 2) return;

      locked = true;
      const [a, b] = open;
      if (deck[a.dataset.i] === deck[b.dataset.i]) {
        a.classList.add('matched'); b.classList.add('matched');
        matched++;
        fb.className = 'feedback good'; fb.textContent = t('correct');
      } else {
        mistakes++;
        fb.className = 'feedback bad'; fb.textContent = t('try_again');
        await sleep(1100);
        [a, b].forEach((c) => { c.classList.remove('up'); c.innerHTML = '<span class="back">✦</span>'; });
      }
      open = [];
      locked = false;
      if (matched === pairs) {
        await sleep(600);
        // Score: every 2 mistakes costs one pair, never below 0
        resolve({ score: Math.max(0, pairs - Math.floor(mistakes / 2)), maxScore: pairs, mistakes });
      }
    }));
  });
}
