const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Job Tracker server running on http://localhost:${PORT}`);
});

// Spike: remove after SSE connectivity is validated (see docs/plans/2026-04-16-001)
require('./mcp-spike.js');
