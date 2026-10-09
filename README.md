# What Did I Miss?

**Don’t read everything. Know everything that matters.**

What Did I Miss? turns a pasted or uploaded chat export into an evidence-linked recap using Google's Gemini API. Analysis requires explicit consent: the selected conversation and optional name/role are sent to Google's API through this app's server-side endpoint. The API key remains on the server and is never included in the browser bundle. The app does not save conversations to its own persistent storage; data remains in the current browser session until cleared or the tab is closed. A fresh session is empty; sample data is only loaded when explicitly selected.

## Run locally

```sh
npm install
Copy-Item .env.example .env
npm run dev
```

Add your key to `.env` as `GEMINI_API_KEY=your_key` (do not commit this file). `npm run dev` starts the Vite frontend and the Node API server together. The API server uses `GEMINI_API_KEY` from `.env` and listens on port 3001; Vite proxies `/api` requests to it. The frontend is available at http://localhost:5173 (or the next free port).

The configured model is `gemini-3.8-flash` using Google's Interactions API in stateless mode (`store: false`). The server uses the official `@google/genai` SDK, validates input and structured model output, enforces request limits and a 40-second model request timeout, and does not log chat contents or the API key.

Create a production build with `npm run build`, then serve it and the API from the same Node server with `npm start`. Set `GEMINI_API_KEY` and `PORT` in the production server environment. Deploy to a Node-capable platform; static-only hosting such as plain Vite static hosting cannot serve the protected API endpoint by itself.

Run application and API tests with `npm test`.

## Use

1. Enter your name and, optionally, your project role.
2. Paste a chat export or choose a plain-text `.txt` file (up to 2 MB). “Try sample conversation” loads the opt-in sample.
3. Choose Analyze conversation. Review the disclosure and explicitly consent before any content is sent to Gemini.
4. Filter actions, tasks, decisions, mentions, or completed work after analysis.
5. Select an insight to inspect its original message evidence. Clear the session when finished.

The parser preserves message order and identifies common timestamped chat-export formats, `Sender: message` lines, and plain text. Gemini returns structured findings linked to original message IDs; the server rejects invalid responses and evidence links. Deadlines, owners, and decisions should be verified against cited messages.

## Privacy

Files are read locally by the browser. After explicit user consent, message content and optional profile fields are sent to the server and then Google's Gemini API for analysis. The Gemini Interactions request sets `store: false`; the API key is read only by Node from `GEMINI_API_KEY` and is not exposed to the frontend. Conversation data is not written to the app's persistent storage or logged by this server. This is hosted AI processing, not local-only processing. Review Google's current Gemini API terms and privacy documentation before sharing sensitive conversations.
