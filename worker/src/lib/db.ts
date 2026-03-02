import postgres from "postgres";

let sql: ReturnType<typeof postgres>;

function getConnection() {
  if (!sql) {
    const connectionString = process.env.STORAGE_DATABASE_URL;
    if (!connectionString) throw new Error("Missing STORAGE_DATABASE_URL");
    sql = postgres(connectionString);
  }
  return sql;
}

export async function updateToolRun(
  runId: string,
  status: "completed" | "failed",
  output?: string | null,
  outputUrl?: string | null,
  error?: string | null,
): Promise<void> {
  const db = getConnection();
  await db`
    UPDATE tool_runs
    SET status = ${status},
        output = ${output ?? null},
        output_url = ${outputUrl ?? null},
        error = ${error ?? null},
        updated_at = NOW()
    WHERE id = ${runId}
  `;
}
