const express = require('express');
const cors = require('cors');
const path = require('path');
const applicationsRouter = require('./routes/applications');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API routes
app.use('/api/applications', applicationsRouter);

// Serve Vue frontend in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Job Tracker server running on http://localhost:${PORT}`);
});
