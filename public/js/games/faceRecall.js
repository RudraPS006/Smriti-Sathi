// Game 2 — Family faces. Uses the people the family added in "Memories".
import { html, mount, shuffle, sleep } from '../lib.js';

const COLORS = ['#0F5C5C', '#8A4FFF', '#C2185B', '#E65100', '#2E7D32', '#1565C0'];

// Caregivers usually type relations in English; show them in the patient's language
const RELATIONS = {
  son: { hi: 'बेटा', as: 'পুত্ৰ', bn: 'ছেলে' },
  daughter: { hi: 'बेटी', as: 'জী', bn: 'মেয়ে' },
  husband: { hi: 'पति', as: 'স্বামী', bn: 'স্বামী' },
  wife: { hi: 'पत्नी', as: 'পত্নী', bn: 'স্ত্রী' },
  sister: { hi: 'बहन', as: 'ভনী', bn: 'বোন' },
  brother: { hi: 'भाई', as: 'ভাই', bn: 'ভাই' },
  granddaughter: { hi: 'पोती', as: 'নাতিনী', bn: 'নাতনি' },
  grandson: { hi: 'पोता', as: 'নাতি', bn: 'নাতি' },
  'daughter-in-law': { hi: 'बहू', as: 'বোৱাৰী', bn: 'বউমা' },
  'son-in-law': { hi: 'दामाद', as: 'জোঁৱাই', bn: 'জামাই' },
  mother: { hi: 'माँ', as: 'মা', bn: 'মা' },
  father: { hi: 'पिता', as: 'দেউতা', bn: 'বাবা' },
  friend: { hi: 'दोस्त', as: 'বন্ধু', bn: 'বন্ধু' },
  neighbour: { hi: 'पड़ोसी', as: 'চুবুৰীয়া', bn: 'প্রতিবেশী' },
};
export const localRelation = (rel, lang) => RELATIONS[String(rel).toLowerCase().trim()]?.[lang] || rel;

export function play(el, { config, people, t, speak, lang }) {
  if (!people || people.length < 2) {
    mount(el, html`<div class="card center"><p class="prompt">${t('need_people')}</p></div>`);
    speak(t('need_people'));
    return Promise.resolve(null); // nothing to save
  }
  const rounds = Math.min(config.rounds, people.length * 2);
  const choices = Math.min(config.choices, people.length);
  let score = 0;
  let mistakes = 0;
  // Everyone appears before anyone repeats
  const order = [];
  while (order.length < rounds) order.push(...shuffle(people));

  return (async () => {
    for (let r = 0; r < rounds; r++) {
      const person = order[r];
      const options = shuffle([person, ...shuffle(people.filter((p) => p.name !== person.name)).slice(0, choices - 1)]);
      // With a photo: "Who is this?"  Without: "Who is your daughter?"
      const question = person.photoUrl ? t('who_is_this') : t('who_is_your', { relation: localRelation(person.relation, lang) });
      const color = COLORS[person.name.length % COLORS.length];

      mount(el, html`
        <p class="muted center">${r + 1} / ${rounds}</p>
        ${person.photoUrl
          ? html`<div class="avatar"><img src="${person.photoUrl}" alt=""></div>`
          : html`<div class="avatar" style="background:${color}">👤</div>`}
        <p class="prompt">${question}</p>
        <div class="choices">${options.map((o) => html`<button class="choice" data-name="${o.name}">${o.name}</button>`)}</div>
        <div class="feedback" aria-live="polite"></div>`);
      speak(question);

      const picked = await new Promise((res) => {
        el.querySelectorAll('.choice').forEach((b) => b.addEventListener('click', () => res(b), { once: true }));
      });
      el.querySelectorAll('.choice').forEach((b) => { b.disabled = true; if (b.dataset.name === person.name) b.classList.add('right'); });
      const fb = el.querySelector('.feedback');
      if (picked.dataset.name === person.name) {
        score++; fb.className = 'feedback good'; fb.textContent = t('correct');
      } else {
        mistakes++; picked.classList.add('wrong'); fb.className = 'feedback bad';
        fb.textContent = `${person.name} — ${localRelation(person.relation, lang)}`; // gently show the right answer
      }
      speak(fb.textContent);
      await sleep(1800);
    }
    return { score, maxScore: rounds, mistakes };
  })();
}
