const { nextDifficulty, gameConfig, detectDecline } = require('../../src/services/adaptiveEngine');

const games = (...accs) => accs.map((a) => ({ score: Math.round(a * 10), maxScore: 10 }));

describe('adaptive difficulty', () => {
  test('stays the same with fewer than 3 games', () => {
    expect(nextDifficulty(games(1, 1), 2).difficulty).toBe(2);
  });
  test('levels up after 3 strong games', () => {
    expect(nextDifficulty(games(0.9, 1, 0.9), 2).difficulty).toBe(3);
  });
  test('gets gentler after 3 weak games', () => {
    expect(nextDifficulty(games(0.3, 0.4, 0.2), 3).difficulty).toBe(2);
  });
  test('never goes above 5 or below 1', () => {
    expect(nextDifficulty(games(1, 1, 1), 5).difficulty).toBe(5);
    expect(nextDifficulty(games(0, 0, 0), 1).difficulty).toBe(1);
  });
  test('game config grows with difficulty', () => {
    expect(gameConfig('memory-match', 1).pairs).toBeLessThan(gameConfig('memory-match', 5).pairs);
    expect(gameConfig('sequence', 3).length).toBe(5);
    expect(gameConfig('face-recall', 5).choices).toBe(4);
  });
});

describe('decline detection', () => {
  test('needs at least 10 sessions', () => {
    expect(detectDecline(games(0.2, 0.2, 0.2))).toBeNull();
  });
  test('flags a large drop (newest first)', () => {
    const d = detectDecline(games(0.4, 0.4, 0.5, 0.4, 0.4, 0.9, 0.9, 0.8, 0.9, 0.9));
    expect(d).not.toBeNull();
    expect(d.drop).toBeGreaterThan(0.2);
  });
  test('ignores small changes', () => {
    expect(detectDecline(games(0.8, 0.8, 0.8, 0.8, 0.8, 0.9, 0.9, 0.9, 0.9, 0.9))).toBeNull();
  });
});
