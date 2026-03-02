import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./activities/index.js";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TASK_QUEUE = "mvrx-jobs";

async function run() {
  const address = process.env.TEMPORAL_ADDRESS || "localhost:7233";
  const namespace = process.env.TEMPORAL_NAMESPACE || "default";
  const apiKey = process.env.TEMPORAL_API_KEY;

  console.log(`Connecting to Temporal at ${address} (namespace: ${namespace})...`);

  const connection = await NativeConnection.connect({
    address,
    tls: apiKey ? true : undefined,
    metadata: apiKey ? { "temporal-namespace": namespace } : undefined,
    apiKey: apiKey || undefined,
  });

  const worker = await Worker.create({
    connection,
    namespace,
    taskQueue: TASK_QUEUE,
    workflowsPath: path.resolve(__dirname, "./workflows/index.ts"),
    activities,
  });

  console.log(`Worker started, listening on task queue "${TASK_QUEUE}"`);

  await worker.run();
}

run().catch((err) => {
  console.error("Worker failed:", err);
  process.exit(1);
});
