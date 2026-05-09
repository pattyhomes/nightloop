import { createApp } from "./app";
import { loadConfig } from "./lib/config";

const config = loadConfig();
const app = createApp({ config });

app.listen(config.port, () => {
  console.log(`nightloop-backend listening on port ${config.port}`);
  console.log(`health: http://localhost:${config.port}/health`);
  console.log(`v1 api: http://localhost:${config.port}/api/v1`);
  console.log(`recommendations: http://localhost:${config.port}/api/recommendations`);
  console.log(`signals: POST http://localhost:${config.port}/api/signals`);
});
