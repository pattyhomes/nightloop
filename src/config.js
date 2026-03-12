const DEFAULT_PORT = 3000;
const DEFAULT_AGENT_TIMEOUT_SECONDS = 1800;

function parsePort(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

function parseTimeoutSeconds(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_AGENT_TIMEOUT_SECONDS;
}

const config = {
  port: parsePort(process.env.PORT),
  agentTimeoutSeconds: parseTimeoutSeconds(process.env.AGENT_TIMEOUT_SECONDS),
  db: {
    connectionString: process.env.DATABASE_URL,
  },
};

module.exports = { config };
