import { sendSlackNotification } from "./slack";

const TIMEOUT_BUFFER_SECONDS = 5;

export function withTimeoutGuard<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  opts: {
    maxDuration: number;
    routeName: string;
    runId?: string;
    userName?: string;
  }
): Promise<T> {
  const timeoutMs = (opts.maxDuration - TIMEOUT_BUFFER_SECONDS) * 1000;
  const controller = new AbortController();

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(async () => {
      controller.abort();

      await sendSlackNotification({
        tool: opts.routeName,
        userName: opts.userName || "Unknown",
        error: `Route timed out after ${opts.maxDuration - TIMEOUT_BUFFER_SECONDS}s (maxDuration: ${opts.maxDuration}s)`,
        runId: opts.runId || "N/A",
      }).catch(() => {});

      reject(new Error("Route timeout guard triggered"));
    }, timeoutMs);

    fn(controller.signal)
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timer));
  });
}
