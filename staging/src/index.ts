import { createApp, startServer } from "./app.js";
import { resolveEnv, stagingBootCheck } from "./env.js";

const env = resolveEnv();
const gate = stagingBootCheck(env);
if (!gate.ok) {
  console.error(gate.reason);
  process.exit(1);
}

const app = createApp({ env });
const server = startServer(app);
server.listen(env.PORT, env.HOST, () => {
  console.log(`Sovereign closer staging API on http://${env.HOST}:${env.PORT} (llm=${app.llm.name}, not for customer traffic)`);
});
