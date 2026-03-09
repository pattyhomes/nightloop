const { config } = require('./config');
const { createApp } = require('./app');
const { buildVenuesRouter } = require('./routes/venues');
const { pool } = require('./db/pool');

const app = createApp({
  venuesRouter: buildVenuesRouter({ pool }),
});

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Nightloop API listening on port ${config.port}`);
});
