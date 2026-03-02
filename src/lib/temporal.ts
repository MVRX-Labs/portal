import { Client, Connection } from "@temporalio/client";

const TASK_QUEUE = "mvrx-jobs";

let clientPromise: Promise<Client> | null = null;

function createClient(): Promise<Client> {
  const address = process.env.TEMPORAL_ADDRESS || "localhost:7233";
  const namespace = process.env.TEMPORAL_NAMESPACE || "default";
  const apiKey = process.env.TEMPORAL_API_KEY;

  return (async () => {
    const connection = await Connection.connect({
      address,
      tls: apiKey ? true : undefined,
      apiKey: apiKey || undefined,
    });

    return new Client({ connection, namespace });
  })();
}

async function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = createClient();
  }
  return clientPromise;
}

export interface LinkedInAuditInput {
  runId: string;
  linkedinUrl: string;
  accountName?: string;
  model?: string;
}

export async function startLinkedInAudit(input: LinkedInAuditInput): Promise<string> {
  const client = await getClient();

  const handle = await client.workflow.start("linkedinAuditWorkflow", {
    taskQueue: TASK_QUEUE,
    workflowId: `linkedin-audit-${input.runId}`,
    args: [input],
  });

  return handle.workflowId;
}
