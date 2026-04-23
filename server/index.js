const app = require('./app');
const db = require('./db');
const { startMcpServer } = require('./mcp');

const PORT = process.env.PORT || 3000;
const MCP_PORT = process.env.MCP_PORT || 3001;

const httpServer = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Job Tracker server running on http://localhost:${PORT}`);
});

const mcpServer = startMcpServer(MCP_PORT);

function gracefulShutdown(signal) {
  console.log(`[shutdown] received ${signal}, closing servers...`);

  const shutdowns = [
    new Promise((resolve) => httpServer.close(resolve)),
    new Promise((resolve) => mcpServer.close(resolve)),
  ];

  Promise.race([
    Promise.all(shutdowns),
    new Promise((resolve) => setTimeout(resolve, 10000)),
  ])
    .catch((err) => {
      console.error('[shutdown] error during close:', err.message);
    })
    .then(() => {
      try {
        db.close();
        console.log('[shutdown] complete');
      } catch (err) {
        console.error('[shutdown] error closing db:', err.message);
      }
      process.exit(0);
    });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
