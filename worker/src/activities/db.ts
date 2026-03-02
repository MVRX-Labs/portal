import { updateToolRun as dbUpdateToolRun } from "../lib/db.js";

export interface UpdateToolRunInput {
  runId: string;
  status: "completed" | "failed";
  output?: string | null;
  outputUrl?: string | null;
  error?: string | null;
}

export async function updateToolRun(input: UpdateToolRunInput): Promise<void> {
  console.log(`[db] Updating run ${input.runId} → ${input.status}`);
  await dbUpdateToolRun(input.runId, input.status, input.output, input.outputUrl, input.error);
}
