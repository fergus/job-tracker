const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const authMiddleware = require('./middleware/auth');
const applicationsRouter = require('./routes/applications');
const keysRouter = require('./routes/keys');

const app = express();

app.set('trust proxy', 1);

app.use(morgan('short'));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],  // Tailwind requires unsafe-inline
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  },
}));

if (process.env.NODE_ENV !== 'production') {
  app.use(cors({ origin: 'http://localhost:5173' }));
}

app.use(express.json({ limit: '100kb' }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_API ?? '100', 10),
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_UPLOADS ?? '20', 10),
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', apiLimiter);
app.use('/api/applications/:id/attachments', uploadLimiter);
app.use('/api/applications/:id/cv', uploadLimiter);
app.use('/api/applications/:id/cover-letter', uploadLimiter);

app.use('/api', authMiddleware);

app.get('/api/me', (req, res) => {
  res.json({ email: req.userEmail, isAdmin: req.isAdmin });
});

app.use('/api/applications', applicationsRouter);
app.use('/api/keys', keysRouter);

const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('/*splat', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('[error]', err.message, err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
