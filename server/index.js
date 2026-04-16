const app = require('./app');
const { startMcpServer } = require('./mcp');

const PORT = process.env.PORT || 3000;
const MCP_PORT = process.env.MCP_PORT || 3001;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Job Tracker server running on http://localhost:${PORT}`);
});

startMcpServer(MCP_PORT);
