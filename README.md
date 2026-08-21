# QuestList

QuestList is a calm, fantasy-quest-inspired to-do and focus app. Break a broad goal into editable steps, complete tasks, run focused Pomodoro sessions, and unlock gentle reward prompts. Everything stays in your browser's local storage—there are no accounts or API keys.

## How planning works

QuestList does not pretend to call an AI service. Enter a broad goal, choose how much time you typically have for one sitting, and optionally add a deadline. One click immediately creates a complete, ordered quest—there are no setup questions or required editing steps.

Its offline planner recognizes common intent categories—including learning, travel, events, writing, organization, fitness, career changes, and building or launching something—and turns each into small, completable steps. A practical generic plan handles other goals. Every task includes estimated minutes, an effort/importance-based point value, and a suggested focus-session breakdown based on the available-time choice. Each quest summarizes its total time, sessions, points, and distance to the next reward. Task titles remain editable after creation, but editing is optional.

The planner is behind a small provider interface so a configured AI implementation can be added later without changing the UI or saved task shape. Put any model call behind a server endpoint; never ship a provider API key in this browser bundle. The endpoint should authenticate the user if needed, validate and rate-limit input, request structured JSON containing short task titles, minutes, and bounded point values, validate that response against a schema, and fall back to the current deterministic planner on timeout or error. Avoid sending stored quests unless the user explicitly chooses to include them.

## Focus audio

The optional gentle-rain and soft-instrumental ambience is synthesized in the browser with the Web Audio API—no audio files are downloaded. Audio starts only after the user presses **Begin focus**, stops on pause/reset/completion, and remembers the selected ambience and volume locally.

## Run locally

Prerequisites: [Node.js](https://nodejs.org/) 18 or newer and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`).

## Production build

```bash
npm run build
npm run preview
```

The compiled site is written to `dist/`.
