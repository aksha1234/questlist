# QuestList

QuestList is a calm, fantasy-quest-inspired to-do and focus app. It can turn a broad goal into an individualized AI plan, track editable tasks, run focused Pomodoro sessions, and unlock gentle reward prompts. Quests stay in your browser's local storage and there are no accounts.

## How planning works

Enter a broad goal, choose how much time you typically have for one sitting, and optionally add a deadline. One click requests a concrete, ordered plan from the server-side AI provider. Every task includes estimated minutes, an effort/importance-based point value, and a suggested focus-session breakdown. Each quest clearly says whether it was **AI planned** or created by the **Offline fallback**.

If the server has no API key, the model request fails, or returned data is invalid, QuestList automatically uses its deterministic offline planner. That fallback recognizes common intent categories and has a practical generic plan for other goals. It is never presented as AI. Task titles remain editable after creation, but editing is optional.

The AI provider runs only in the Node server. The API key and model name are read from server environment variables and are never included in browser code or local storage. The server validates and rate-limits requests, asks for schema-constrained output, and validates the response again. Only the current goal, available minutes, and optional deadline are sent to OpenAI; saved quests and focus history are not sent.

## Focus audio

The optional warm ambient pad and sparse soft chimes are synthesized in the browser with the Web Audio API—no audio files or noise tracks are downloaded or streamed. Quiet is the default. Audio starts only after the user presses **Begin focus**, stops on pause/reset/completion, and remembers the selected sound and volume locally.

## Run locally

Prerequisites: [Node.js](https://nodejs.org/) 20.11 or newer and npm.

```bash
npm install
npm run dev
```

Without AI configuration, the app runs normally and labels generated plans as offline fallback. To enable AI planning, copy the example environment file and add your own API key:

```bash
cp .env.example .env
# Edit .env and set OPENAI_API_KEY
npm run dev
```

`npm run dev` starts the Vite frontend and local API server together. Open the local URL printed by Vite (usually `http://localhost:5173`). The default model can be changed only on the server with `OPENAI_MODEL`; restart the development process after environment changes. Never commit `.env`.

## Production build

```bash
npm run build
npm start
```

The compiled site is written to `dist/`. `npm start` runs one Express process that serves both the frontend and `/api/*`, binds to `0.0.0.0`, and uses the platform-provided `PORT` when present.

## Deploy on Render

The included `render.yaml` defines QuestList as one Node web service.

1. Push this repository to GitHub and, in Render, choose **New → Blueprint**.
2. Connect the repository and apply the detected Blueprint.
3. Enter `OPENAI_API_KEY` when Render prompts for the secret. It is stored only in the server environment.
4. Optionally change `OPENAI_MODEL`; the Blueprint defaults to `gpt-4o-mini`.
5. Deploy and check `/api/health`. A healthy configured service reports `ok: true` and `aiConfigured: true` without revealing the key.

Render runs `npm ci && npm run build`, then `npm start`. Do not add `VITE_`-prefixed secrets: Vite variables are browser-visible. The app still uses its clearly labeled offline planner if AI configuration is absent or temporarily unavailable.
