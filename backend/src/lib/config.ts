export type AppConfig = {
  env: "development" | "test" | "production";
  port: number;
};

const ALLOWED_ENVS = ["development", "test", "production"] as const;

export function loadConfig(): AppConfig {
  const rawEnv = process.env.NODE_ENV ?? "development";
  const rawPort = process.env.PORT ?? "4000";
  const port = Number(rawPort);

  if (!ALLOWED_ENVS.includes(rawEnv as AppConfig["env"])) {
    throw new Error(`Invalid NODE_ENV: ${rawEnv}`);
  }

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${rawPort}`);
  }

  return {
    env: rawEnv as AppConfig["env"],
    port
  };
}
