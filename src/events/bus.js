// Unit I — EventEmitter
// One app-wide event bus. Routes emit facts ("a game finished"), and
// independent listeners react (adaptive check, alerts, logging, sockets).
// This keeps routes small and decoupled.
const EventEmitter = require('events');

class CareEventBus extends EventEmitter {}

const bus = new CareEventBus();
bus.setMaxListeners(20);

// Event names in one place so typos are caught early
bus.EVENTS = Object.freeze({
  GAME_COMPLETED: 'game:completed',
  ALERT_CREATED: 'alert:created',
  REMINDER_DUE: 'reminder:due',
  MEMORY_ADDED: 'memory:added',
  ACTIVITY_LOGGED: 'activity:logged',
});

module.exports = bus;
