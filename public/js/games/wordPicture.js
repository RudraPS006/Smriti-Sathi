// Game 4 — Picture words (language + semantic memory), in the patient's own language.
import { html, mount, shuffle, sleep } from '../lib.js';

const WORDS = [
  { pic: '🫖', en: 'Tea', hi: 'चाय', as: 'চাহ', bn: 'চা' },
  { pic: '🐘', en: 'Elephant', hi: 'हाथी', as: 'হাতী', bn: 'হাতি' },
  { pic: '🍚', en: 'Rice', hi: 'चावल', as: 'ভাত', bn: 'ভাত' },
  { pic: '🐟', en: 'Fish', hi: 'मछली', as: 'মাছ', bn: 'মাছ' },
  { pic: '☂️', en: 'Umbrella', hi: 'छाता', as: 'ছাতি', bn: 'ছাতা' },
  { pic: '🛶', en: 'Boat', hi: 'नाव', as: 'নাও', bn: 'নৌকা' },
  { pic: '🌺', en: 'Flower', hi: 'फूल', as: 'ফুল', bn: 'ফুল' },
  { pic: '☀️', en: 'Sun', hi: 'सूरज', as: 'বেলি', bn: 'সূর্য' },
  { pic: '🏠', en: 'House', hi: 'घर', as: 'ঘৰ', bn: 'বাড়ি' },
  { pic: '🥁', en: 'Drum', hi: 'ढोल', as: 'ঢোল', bn: 'ঢোল' },
  { pic: '🐄', en: 'Cow', hi: 'गाय', as: 'গৰু', bn: 'গরু' },
  { pic: '🌙', en: 'Moon', hi: 'चाँद', as: 'জোন', bn: 'চাঁদ' },
];

export function play(el, { config, t, speak, lang }) {
  const L = WORDS[0][lang] ? lang : 'en';
  const items = shuffle(WORDS).slice(0, config.rounds);
  let score = 0;
  let mistakes = 0;

  return (async () => {
    for (let r = 0; r < items.length; r++) {
      const item = items[r];
      const options = shuffle([item, ...shuffle(WORDS.filter((w) => w !== item)).slice(0, config.choices - 1)]);
      mount(el, html`
        <p class="muted center">${r + 1} / ${items.length}</p>
        <div class="big-pic" aria-hidden="true">${item.pic}</div>
        <p class="prompt">${t('what_is_this')}</p>
        <div class="choices">${options.map((o) => html`<button class="choice" data-w="${o.en}">${o[L]}</button>`)}</div>
        <div class="feedback" aria-live="polite"></div>`);
      speak(t('what_is_this'));

      const picked = await new Promise((res) => {
        el.querySelectorAll('.choice').forEach((b) => b.addEventListener('click', () => res(b), { once: true }));
      });
      el.querySelectorAll('.choice').forEach((b) => { b.disabled = true; if (b.dataset.w === item.en) b.classList.add('right'); });
      const fb = el.querySelector('.feedback');
      if (picked.dataset.w === item.en) { score++; fb.className = 'feedback good'; fb.textContent = t('correct'); }
      else { mistakes++; picked.classList.add('wrong'); fb.className = 'feedback bad'; fb.textContent = item[L]; }
      speak(fb.textContent);
      await sleep(1500);
    }
    return { score, maxScore: items.length, mistakes };
  })();
}
