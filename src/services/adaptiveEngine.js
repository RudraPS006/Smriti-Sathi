// The "adaptive" part of the games.
// Rule-based and explainable on purpose: a caregiver can understand
// exactly why the level changed. Difficulty is 1 (easiest) .. 5.

const MIN = 1;
const MAX = 5;
const WINDOW = 3; // look at the last 3 sessions of the same game

/**
 * @param {Array<{score:number,maxScore:number,mistakes?:number}>} recent newest first
 * @param {number} current current difficulty
 * @returns {{difficulty:number, reason:string}}
 */
function nextDifficulty(recent, current = 1) {
  const level = clamp(current || 1);
  if (!recent || recent.length < WINDOW) {
    return { difficulty: level, reason: 'Not enough games yet — staying at this level.' };
  }
  const last = recent.slice(0, WINDOW);
  const avg = last.reduce((s, g) => s + g.score / g.maxScore, 0) / last.length;
  if (avg >= 0.85 && level < MAX) {
    return { difficulty: level + 1, reason: `Average ${pct(avg)} in last ${WINDOW} games — level up.` };
  }
  if (avg < 0.5 && level > MIN) {
    return { difficulty: level - 1, reason: `Average ${pct(avg)} in last ${WINDOW} games — making it gentler.` };
  }
  return { difficulty: level, reason: `Average ${pct(avg)} — keeping the level steady.` };
}

/**
 * Game settings for each difficulty level, shared by the server and the browser.
 */
function gameConfig(gameType, difficulty) {
  const d = clamp(difficulty);
  switch (gameType) {
    case 'memory-match': return { pairs: d + 2, previewSec: Math.max(1, 5 - d) };
    case 'face-recall': return { rounds: 3 + d, choices: Math.min(2 + d, 4) };
    case 'sequence': return { length: d + 2, speedMs: 1100 - d * 120 };
    case 'word-picture': return { rounds: 3 + d, choices: Math.min(2 + d, 4) };
    default: return {};
  }
}

/**
 * Decline detection across ALL games: compare the latest 5 sessions with the 10 before.
 * Returns a drop (0..1) if accuracy fell by more than `threshold`, otherwise null.
 */
function detectDecline(sessionsNewestFirst, threshold = 0.2) {
  if (sessionsNewestFirst.length < 10) return null;
  const acc = (arr) => arr.reduce((s, g) => s + g.score / g.maxScore, 0) / arr.length;
  const recent = acc(sessionsNewestFirst.slice(0, 5));
  const before = acc(sessionsNewestFirst.slice(5, 15));
  const drop = before - recent;
  return drop > threshold ? { recent, before, drop } : null;
}

const clamp = (n) => Math.min(MAX, Math.max(MIN, Math.round(n)));
const pct = (x) => `${Math.round(x * 100)}%`;

module.exports = { nextDifficulty, gameConfig, detectDecline, MIN, MAX };
