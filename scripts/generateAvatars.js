// Draws simple illustrated portraits (SVG) for the FAKE demo family, so the
// "Family faces" game has pictures without using photos of real people.
//   node scripts/generateAvatars.js   -> public/seed-avatars/*.svg
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'public', 'seed-avatars');

const SKIN = { light: '#F1C9A5', medium: '#D9A577', tan: '#C68B59', deep: '#9C6B43' };
const HAIR = { black: '#1E1B1B', grey: '#9E9E9E', white: '#E6E6E6', brown: '#4A2E1F' };

function hairShape(style, color) {
  switch (style) {
    case 'short': return `<path d="M58 92c0-30 18-48 42-48s42 18 42 48c-8-14-22-22-42-22s-34 8-42 22z" fill="${color}"/>`;
    case 'side': return `<path d="M56 96c0-34 20-52 46-52 24 0 42 16 42 44-14-10-30-20-58-18-12 1-22 12-30 26z" fill="${color}"/>`;
    case 'bald': return `<path d="M58 100c-4-10-2-22 4-28M142 100c4-10 2-22-4-28" stroke="${color}" stroke-width="9" stroke-linecap="round" fill="none"/>`;
    case 'long': return `<path d="M50 150c-6-40 0-104 50-104s56 64 50 104c-10 0-14-30-14-50-10-18-26-26-36-26s-26 8-36 26c0 20-4 50-14 50z" fill="${color}"/>`;
    case 'bun': return `<circle cx="100" cy="40" r="16" fill="${color}"/><path d="M58 96c0-30 18-50 42-50s42 20 42 50c-10-16-24-24-42-24s-32 8-42 24z" fill="${color}"/>`;
    case 'bob': return `<path d="M54 120c-6-44 12-76 46-76s52 32 46 76c-8 0-10-20-10-34-8-10-22-16-36-16s-28 6-36 16c0 14-2 34-10 34z" fill="${color}"/>`;
    case 'ponytail': return `<path d="M140 80c22 6 26 40 14 60-4-20-8-34-18-42z" fill="${color}"/><path d="M58 96c0-30 18-50 42-50s42 20 42 50c-10-16-24-24-42-24s-32 8-42 24z" fill="${color}"/>`;
    default: return '';
  }
}

function avatar(p) {
  const skin = SKIN[p.skin];
  const hair = HAIR[p.hair];
  const behind = p.hairStyle === 'long' || p.hairStyle === 'bob' ? hairShape(p.hairStyle, hair) : '';
  const front = p.hairStyle === 'long' || p.hairStyle === 'bob'
    ? `<path d="M64 92c4-24 18-38 36-38s32 14 36 38c-10-10-22-16-36-16s-26 6-36 16z" fill="${hair}"/>`
    : hairShape(p.hairStyle, hair);
  const lines = p.old ? `<path d="M76 84q6-3 12 0M112 84q6-3 12 0" stroke="#7A5236" stroke-width="2" fill="none" opacity=".6"/><path d="M80 118q5 3 8 0M112 118q5 3 8 0" stroke="#7A5236" stroke-width="2" fill="none" opacity=".45"/>` : '';
  const glasses = p.glasses ? `<g fill="none" stroke="#3B3B3B" stroke-width="3"><circle cx="84" cy="98" r="11"/><circle cx="116" cy="98" r="11"/><path d="M95 98h10"/></g>` : '';
  const bindi = p.bindi ? `<circle cx="100" cy="80" r="3.5" fill="#C62828"/>` : '';
  const beard = p.beard ? `<path d="M74 112c4 26 16 36 26 36s22-10 26-36c-8 10-16 12-26 12s-18-2-26-12z" fill="${hair}" opacity=".9"/>` : '';
  const moustache = p.moustache ? `<path d="M86 118q14-8 28 0q-14 4-28 0z" fill="${hair}"/>` : '';
  const earrings = p.earrings ? `<circle cx="61" cy="112" r="4" fill="#F4B860"/><circle cx="139" cy="112" r="4" fill="#F4B860"/>` : '';
  // gamosa: white scarf with red border (Assam) / puan stripes (Mizoram)
  const scarf = p.scarf === 'gamosa'
    ? `<path d="M62 168c14 10 62 10 76 0l6 14c-20 12-68 12-88 0z" fill="#FAFAFA"/><path d="M58 178c22 12 62 12 84 0" stroke="#C62828" stroke-width="4" fill="none"/>`
    : p.scarf === 'puan'
      ? `<path d="M62 168c14 10 62 10 76 0l6 14c-20 12-68 12-88 0z" fill="#1A237E"/><path d="M60 174c22 12 60 12 80 0M58 180c22 12 64 12 84 0" stroke="#E53935" stroke-width="3" fill="none"/>`
      : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="Illustrated portrait">
  <rect width="200" height="200" fill="${p.bg}"/>
  ${behind}
  <path d="M30 200c4-36 34-56 70-56s66 20 70 56z" fill="${p.shirt}"/>
  <rect x="88" y="128" width="24" height="24" rx="6" fill="${skin}"/>
  ${scarf}
  <ellipse cx="60" cy="102" rx="7" ry="11" fill="${skin}"/><ellipse cx="140" cy="102" rx="7" ry="11" fill="${skin}"/>
  <ellipse cx="100" cy="98" rx="40" ry="46" fill="${skin}"/>
  ${front}
  ${earrings}
  <circle cx="84" cy="98" r="4" fill="#2B2B2B"/><circle cx="116" cy="98" r="4" fill="#2B2B2B"/>
  <path d="M78 86q6-4 12 0M110 86q6-4 12 0" stroke="${p.hair === 'white' ? '#BDBDBD' : hair}" stroke-width="3" fill="none" stroke-linecap="round"/>
  ${lines}
  <path d="M98 100q-3 10 2 12" stroke="#8D5B3B" stroke-width="2" fill="none" opacity=".6"/>
  ${beard}${moustache}
  <path d="M88 122q12 10 24 0" stroke="#8B3A3A" stroke-width="3" fill="none" stroke-linecap="round"/>
  <circle cx="74" cy="114" r="6" fill="#E57373" opacity=".25"/><circle cx="126" cy="114" r="6" fill="#E57373" opacity=".25"/>
  ${glasses}${bindi}
</svg>
`;
}

// FAKE people for testing only
const PEOPLE = {
  // Bina Devi Bora's family (Assam)
  'hemanta-bora': { bg: '#CFE8E4', skin: 'tan', hair: 'white', hairStyle: 'bald', shirt: '#6D4C41', old: true, glasses: true, moustache: true, scarf: 'gamosa' },
  'rupam-bora': { bg: '#FFE7C2', skin: 'tan', hair: 'black', hairStyle: 'short', shirt: '#1565C0', moustache: true },
  'anjali-bora': { bg: '#F8D7E3', skin: 'medium', hair: 'black', hairStyle: 'long', shirt: '#AD1457', bindi: true, earrings: true },
  'moni-bora': { bg: '#E1F5FE', skin: 'medium', hair: 'black', hairStyle: 'ponytail', shirt: '#F9A825' },
  'dipali-saikia': { bg: '#EDE7F6', skin: 'tan', hair: 'grey', hairStyle: 'bun', shirt: '#2E7D32', old: true, bindi: true, scarf: 'gamosa' },
  'ananya-bora': { bg: '#E8F5E9', skin: 'medium', hair: 'brown', hairStyle: 'bob', shirt: '#5E35B1', glasses: true, earrings: true },
  // Lalthansangi Ralte's family (Mizoram)
  'mary-lalremruati': { bg: '#FCE4EC', skin: 'light', hair: 'black', hairStyle: 'long', shirt: '#00897B', earrings: true, scarf: 'puan' },
  'zothanpuia-ralte': { bg: '#E3F2FD', skin: 'light', hair: 'black', hairStyle: 'side', shirt: '#37474F' },
  'lalnunmawii': { bg: '#FFF8E1', skin: 'light', hair: 'black', hairStyle: 'ponytail', shirt: '#EF6C00' },
  'vanlalruata-ralte': { bg: '#EFEBE9', skin: 'light', hair: 'grey', hairStyle: 'short', shirt: '#4E342E', old: true, glasses: true, scarf: 'puan' },
};

fs.mkdirSync(OUT, { recursive: true });
for (const [slug, p] of Object.entries(PEOPLE)) fs.writeFileSync(path.join(OUT, `${slug}.svg`), avatar(p));
console.log(`Wrote ${Object.keys(PEOPLE).length} avatars to public/seed-avatars/`);
