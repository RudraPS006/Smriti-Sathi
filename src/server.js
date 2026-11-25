// Entry point. Unit II — the core `http` module creates the server;
// Express is just the request handler passed to it. Socket.IO shares the same server.
const http = require('http');
const config = require('./config');
const { app } = require('./app');
const { connectDatabases, disconnectDatabases } = require('./config/db');
const { initSockets } = require('./sockets');
const { registerEventHandlers } = require('./events/handlers');
const { startScheduler, stopScheduler } = require('./services/scheduler');
const { archiveOldLogs } = require('./services/logService');
const { isMock } = require('./services/aiService');

async function main() {
  await connectDatabases();
  registerEventHandlers();

  const server = http.createServer(app);
  const { io } = initSockets(server);
  startScheduler();
  archiveOldLogs().catch(() => {}); // compress yesterday's logs on boot

  server.on('error', async (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${config.port} is already in use — another app (or another copy of Smriti Sathi) is running there.\nTry a different port, e.g.  PORT=3010 npm run dev`);
      stopScheduler();
      await disconnectDatabases().catch(() => {});
      process.exit(1);
    }
    throw err;
  });

  server.listen(config.port, () => {
    console.log(`Smriti Sathi running at http://localhost:${config.port}  (AI: ${isMock() ? 'mock mode' : 'OpenAI'})`);
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} received — shutting down`);
    stopScheduler();
    io.close();
    server.close(async () => {
      await disconnectDatabases();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
