const express = require('express');
const cors = require('cors');
const path = require('path');
const authMiddleware = require('./middleware/auth');
const applicationsRouter = require('./routes/applications');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', authMiddleware);

app.get('/api/me', (req, res) => {
  res.json({ email: req.userEmail, isAdmin: req.isAdmin });
});

app.use('/api/applications', applicationsRouter);

const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('/*splat', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

module.exports = app;
