const DEFAULT_PORT = 3000;

function parsePort(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

const config = {
  port: parsePort(process.env.PORT),
  db: {
    connectionString: process.env.DATABASE_URL,
  },
};

module.exports = { config };
