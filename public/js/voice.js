// Voice: the browser's Web Speech API reads text aloud and listens.
// Assamese recognition is weak in browsers, so for 'as' we record audio and
// send it to the server (OpenAI Whisper). Assamese speech output falls back to
// a Bengali voice when no Assamese voice is installed (same script).
import { api } from './api.js';
import { currentLang } from './i18n.js';

const BCP = { en: 'en-IN', hi: 'hi-IN', as: 'as-IN', bn: 'bn-IN' };
const FALLBACK = { as: ['bn', 'hi'], bn: ['hi'], hi: ['en'], en: [] };

let voices = [];
if ('speechSynthesis' in window) {
  const load = () => { voices = speechSynthesis.getVoices(); };
  load();
  speechSynthesis.addEventListener?.('voiceschanged', load);
}

function pickVoice(lang) {
  for (const l of [lang, ...(FALLBACK[lang] || [])]) {
    const code = l.slice(0, 2);
    const v = voices.find((x) => x.lang.replace('_', '-').toLowerCase().startsWith(code));
    if (v) return v;
  }
  return null;
}

export const canSpeak = () => 'speechSynthesis' in window;

export function speak(text, lang = currentLang()) {
  if (!canSpeak() || !text) return Promise.resolve();
  speechSynthesis.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(lang);
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = BCP[lang] || 'en-IN';
    u.rate = 0.85; // slower speech is easier to follow
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = () => Boolean(Recognition) || Boolean(navigator.mediaDevices && window.MediaRecorder);

// Browser speech recognition errors that mean "this browser has no speech service".
// Brave, for example, does not ship Google's speech service and always reports "network".
const NO_SERVICE = ['network', 'service-not-allowed', 'language-not-supported'];
let browserServiceBroken = false;
let serverSttAvailable = null; // null = not checked yet

async function serverCanTranscribe() {
  if (serverSttAvailable === null) {
    try { serverSttAvailable = !(await api('/ai/status')).mock; } catch { serverSttAvailable = false; }
  }
  return serverSttAvailable;
}

export async function listen(lang = currentLang()) {
  const useBrowser = Recognition && lang !== 'as' && !browserServiceBroken;
  if (useBrowser) {
    try {
      return await browserListen(lang);
    } catch (e) {
      if (!NO_SERVICE.includes(e.message)) throw e;
      browserServiceBroken = true; // remember, so the next press does not wait again
    }
  }
  // Fall back to the server (OpenAI Whisper) — only works when an API key is set
  if (await serverCanTranscribe()) return serverListen(lang);
  throw new Error('unavailable');
}

// Turn any voice error into a short, friendly sentence in the patient's language
export function voiceErrorMessage(err, t) {
  const code = err && err.message;
  if (code === 'unavailable' || code === 'not-supported') return t('voice_unavailable');
  if (code === 'not-allowed' || code === 'NotAllowedError' || (err && err.name === 'NotAllowedError')) return t('mic_blocked');
  if (code === 'no-speech' || code === 'aborted') return t('no_speech');
  return t('voice_failed');
}

function browserListen(lang) {
  return new Promise((resolve, reject) => {
    const r = new Recognition();
    r.lang = BCP[lang] || 'en-IN';
    r.interimResults = false;
    r.maxAlternatives = 1;
    let done = false;
    r.onresult = (e) => { done = true; resolve(e.results[0][0].transcript); };
    r.onerror = (e) => { done = true; reject(new Error(e.error)); };
    r.onend = () => { if (!done) reject(new Error('no-speech')); };
    r.start();
  });
}

async function serverListen(lang, seconds = 5) {
  if (!navigator.mediaDevices || !window.MediaRecorder) throw new Error('not-supported');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  const stopped = new Promise((r) => { rec.onstop = r; });
  rec.start();
  setTimeout(() => rec.state !== 'inactive' && rec.stop(), seconds * 1000);
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  const form = new FormData();
  form.append('audio', new Blob(chunks, { type: rec.mimeType || 'audio/webm' }), 'speech.webm');
  form.append('language', lang);
  const res = await api('/ai/transcribe', { method: 'POST', form });
  if (res.mock) throw new Error('unavailable');
  return res.text;
}

// Spoken navigation: match keywords in any of the 4 languages
const COMMANDS = {
  games: ['game', 'play', 'खेल', 'খেল', 'খেলা'],
  memories: ['memor', 'photo', 'याद', 'स्मृति', 'স্মৃতি', 'ফটো'],
  reminders: ['remind', 'medicine', 'दवा', 'याद दिला', 'সোঁৱৰণী', 'ঔষধ', 'ওষুধ', 'মনে করা'],
  companion: ['talk', 'smriti', 'बात', 'কথা'],
  journal: ['diary', 'journal', 'डायरी', 'ডায়েৰী', 'ডায়েরি'],
  quiz: ['quiz', 'प्रश्न', 'কুইজ'],
  help: ['help', 'sos', 'मदद', 'সহায়', 'সাহায্য'],
};
export function matchCommand(text) {
  const s = String(text).toLowerCase();
  // check reminders before memories: "याद दिला" contains "याद"
  for (const cmd of ['help', 'reminders', 'games', 'memories', 'companion', 'journal', 'quiz']) {
    if (COMMANDS[cmd].some((w) => s.includes(w))) return cmd;
  }
  return null;
}
