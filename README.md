# What Did I Miss?

**Don’t read everything. Know everything that matters.**

What Did I Miss? turns a pasted or uploaded chat export into an evidence-linked recap. Choose between a local, rule-based analyzer and Google's Gemini AI. Local analysis stays in the browser and needs no API key or consent. Gemini analysis sends the selected conversation and optional name/role to Google's API only after explicit consent. The API key remains on the server and is never included in the browser bundle. The app does not save conversations to its own persistent storage; data remains in the current browser session until cleared or the tab is closed. A fresh session is empty; sample data is only loaded when explicitly selected.

## Run locally

```sh
npm install
Copy-Item .env.example .env
npm run dev
```

To use Gemini, add your key to `.env` as `GEMINI_API_KEY=your_key` (do not commit this file). The local analyzer does not need a key. `npm run dev` starts the Vite frontend and the Node API server together. The API server uses `GEMINI_API_KEY` from `.env` and listens on port 3001; Vite proxies `/api` requests to it. The frontend is available at http://localhost:5173 (or the next free port).

The configured Gemini model is `gemini-3.8-flash`, using Google's Interactions API in stateless mode (`store: false`). The server uses the official `@google/genai` SDK, retries transient API failures once, validates input and structured model output, enforces request limits and a 40-second model request timeout, and does not log chat contents or the API key. Gemini is optional; local analysis works without configuring a key.

Create a production build with `npm run build`, then serve it and the API from the same Node server with `npm start`. Set `PORT` in the production server environment; set `GEMINI_API_KEY` too if you want Gemini analysis. Deploy to a Node-capable platform; static-only hosting such as plain Vite static hosting cannot serve the protected API endpoint by itself.

Run application and API tests with `npm test`.

## Use

1. Enter your name and, optionally, your project role.
2. Paste a chat export or choose a plain-text `.txt` file (up to 2 MB). “Try sample conversation” loads the opt-in sample.
3. Choose Local rules for private, browser-only analysis, or Google Gemini for AI analysis.
4. Choose Analyze conversation. If using Gemini, review the disclosure and explicitly consent before any content is sent to Google.
5. Filter actions, tasks, decisions, mentions, or completed work after analysis.
6. Select an insight to inspect its original message evidence. Clear the session when finished.

The parser preserves message order and identifies common timestamped chat-export formats, `Sender: message` lines, and plain text. Local rules identify explicit assignments, decisions, mentions, project updates, and low-priority chatter; Gemini returns structured findings linked to original message IDs. The server rejects invalid Gemini responses and evidence links. Both methods use the same evidence-linked dashboard. Local rules are deterministic and may miss context that Gemini can infer; deadlines, owners, and decisions should be verified against cited messages.

## Privacy

Files are read locally by the browser. With Local rules selected, conversation data and optional profile fields stay in the browser and no API request is made. With Gemini selected, after explicit consent, they are sent to the server and then Google's Gemini API. The Gemini Interactions request sets `store: false`; the API key is read only by Node from `GEMINI_API_KEY` and is not exposed to the frontend. Conversation data is not written to the app's persistent storage or logged by this server. Gemini is hosted AI processing; local rules are browser-only processing. Review Google's current Gemini API terms and privacy documentation before sharing sensitive conversations.
