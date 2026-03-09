const express = require('express');
const { sendError } = require('./lib/errors');

function createApp({ venuesRouter }) {
  const app = express();

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/v1/venues', venuesRouter);

  app.use((req, res) => {
    sendError(res, 404, 'NOT_FOUND', `Route not found: ${req.method} ${req.originalUrl}`);
  });

  app.use((error, _req, res, _next) => {
    // eslint-disable-next-line no-console
    console.error(error);
    sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected server error');
  });

  return app;
}

module.exports = {
  createApp,
};
