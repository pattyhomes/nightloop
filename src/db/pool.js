const { Pool } = require('pg');
const { config } = require('../config');

const poolOptions = {};
if (config.db.connectionString) {
  poolOptions.connectionString = config.db.connectionString;
}

const pool = new Pool(poolOptions);

module.exports = { pool };
