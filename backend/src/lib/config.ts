export type AppConfig = {
  port: number;
};

export function loadConfig(): AppConfig {
  const rawPort = process.env.PORT ?? "3000";
  const port = Number(rawPort);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${rawPort}`);
  }

  return { port };
}
