import * as memoryMatch from './memoryMatch.js';
import * as faceRecall from './faceRecall.js';
import * as sequence from './sequence.js';
import * as wordPicture from './wordPicture.js';

export const GAMES = [
  { type: 'memory-match', icon: '🃏', module: memoryMatch },
  { type: 'face-recall', icon: '👪', module: faceRecall },
  { type: 'sequence', icon: '🎨', module: sequence },
  { type: 'word-picture', icon: '🖼️', module: wordPicture },
];
export const gameKey = (type) => `game_${type.replace('-', '_')}`;
