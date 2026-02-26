# MVRX Local API

Local TypeScript API server that runs Claude Code sessions. Designed to be exposed via ngrok so the Vercel-hosted app can call it.

## Setup

```bash
cd local-api
npm install
```

Set your API key in `.env`:

```
DANNY_LOCAL_API_KEY=your-secret-key-here
PORT=3939
```

Set the same `DANNY_LOCAL_API_KEY` and the ngrok URL as environment variables in your Vercel project:

```
DANNY_LOCAL_API_KEY=your-secret-key-here
NGROK_BASE_URL=https://your-subdomain.ngrok-free.app
```

## Running

Start the API server:

```bash
npm run dev    # with file watching
npm start      # without watching
```

In a separate terminal, expose it via ngrok:

```bash
npm run tunnel
# or directly: ngrok http 3939
```

## API

All endpoints (except `/health`) require the `x-api-key` header (or `Authorization: Bearer <key>`).

### `GET /health`

Health check. No auth required.

### `POST /api/claude`

Run a Claude Code session.

**Request body:**

```json
{
  "prompt": "Analyze these files and suggest improvements",
  "files": {
    "main.ts": "console.log('hello')",
    "utils/helpers.ts": "export const add = (a: number, b: number) => a + b;"
  },
  "maxTurns": 5
}
```

| Field      | Type                   | Required | Description                                                                                                |
| ---------- | ---------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `prompt`   | string                 | yes      | The prompt/instructions for Claude Code                                                                    |
| `files`    | Record<string, string> | no       | Map of filename to file content. Written to a temp directory that becomes the session's working directory. |
| `maxTurns` | number                 | no       | Max agentic turns for Claude Code                                                                          |

**Response:**

```json
{
  "output": "Claude's response text..."
}
```

**Error response:**

```json
{
  "error": "error message"
}
```
