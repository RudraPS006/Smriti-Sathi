// Listeners for the event bus. Registered once at start-up.
const bus = require('./bus');
const GameSession = require('../models/GameSession');
const { detectDecline } = require('../services/adaptiveEngine');
const { createAlert, hasRecentOpenAlert } = require('../services/alertService');
const { embedMemory } = require('../services/aiService');

let registered = false;

function registerEventHandlers() {
  if (registered) return;
  registered = true;

  // After every game: has overall accuracy dropped sharply? -> alert the care team
  bus.on(bus.EVENTS.GAME_COMPLETED, async (session) => {
    try {
      const recent = await GameSession.find({ patientId: session.patientId }).sort({ completedAt: -1 }).limit(15).lean();
      const decline = detectDecline(recent);
      if (decline && !(await hasRecentOpenAlert(session.patientId, 'cognitive_decline', 24))) {
        await createAlert({
          patientId: session.patientId,
          type: 'cognitive_decline',
          severity: decline.drop > 0.35 ? 'high' : 'medium',
          message: `Game accuracy fell from ${Math.round(decline.before * 100)}% to ${Math.round(decline.recent * 100)}% over the last 5 games. Consider a check-in or doctor review.`,
        });
      }
    } catch (e) {
      console.error('[events] decline check failed:', e.message);
    }
  });

  // When a caregiver adds a memory: compute its embedding in the background
  bus.on(bus.EVENTS.MEMORY_ADDED, (memory) => {
    embedMemory(memory._id).catch((e) => console.error('[events] embedding failed:', e.message));
  });
}

module.exports = { registerEventHandlers };
