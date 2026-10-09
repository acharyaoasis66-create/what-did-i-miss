# What Did I Miss? — AI-Assisted Development Record

> This document records the development history visible in this workspace conversation. It does not claim that earlier prompt wording is a complete verbatim transcript when only a summary was available. No credentials, API keys, or other secrets are included.

## 1. Project Overview

**Problem:** People returning to busy unread conversations can miss decisions, personal assignments, deadlines, and important mentions.

**Solution:** What Did I Miss? is a conversation review app. Users can paste a conversation, select a `.txt` export, or explicitly load the sample. After explicit consent, a server-side Google Gemini request produces a structured personalized recap, task and decision findings, priorities, source-message evidence, low-priority items, and a conversation-wide summary.

**Key features implemented:** empty first-run state; paste and TXT import with validation and preview; opt-in demo; analysis and filters; evidence navigation; task status controls; Safe to skip view; conversation summary; WhatsApp export instructions and TXT import; clear-session action. The WhatsApp workflow does not retrieve messages from WhatsApp. ZIP exports must be extracted by the user; the app accepts the `.txt` file.

## 2. Tech Stack & Architecture

- React 19 and TypeScript, built with Vite.
- Tailwind CSS 4 via the Vite plugin, with application-specific CSS.
- Lucide React icons.
- Vitest, Testing Library, and jsdom for UI tests; Oxlint for linting.
- React/Vite proxies `/api` to a small Node HTTP server. The Node server uses the official `@google/genai` SDK and reads `GEMINI_API_KEY` from its environment; the key is not a Vite/client variable.
- Gemini model configured: `gemini-3.8-flash`. The server validates request sizes, message shape, structured response categories/statuses, and all source-message IDs. It computes dashboard counts from returned findings and does not log request content.
- Conversation parsing remains in the browser to preserve message IDs, sender, timestamp, and order. Conversation content and optional profile fields are sent to Google only after the user explicitly accepts the consent dialog. App data is not persistently stored.
- Main implementation areas: `src/App.tsx` (application flow and UI), `src/lib/parser.ts` (local parsing), `src/types.ts` (analysis models), `server.mjs` (Gemini API and production static server), `src/App.css` (presentation), `src/App.test.tsx` and `server.test.mjs` (UI/API tests).

## 3. AI Code Generation

The assistant/model identity is recorded as **AI assistant using Copilot SDK in VS Code**. A model ID was not captured in the available interaction history and is intentionally not guessed. The developer's initial project brief said the solo developer was using Antigravity.

| Actual prompt or instruction (quoted excerpt) | AI tool/model used | Purpose | Files/components affected | Outcome and verification |
|---|---|---|---|---|
| “Build the application, run it, test it, and fix problems” and “Build a working vertical slice first, then improve it.” The full instruction specified a local-first React/TypeScript application for personalized unread-message intelligence, imports, analysis, evidence, and a polished dashboard. | AI assistant using Copilot SDK in VS Code; model ID unavailable | Establish and implement the original hackathon MVP. | Project scaffold and application components, parser/analyzer, demo data, styles, and tests. | Built and launched in the browser; production build and user flow were reported as verified in the development history. |
| “Do not rebuild the application from scratch” and “Never present demo or placeholder content as real user analysis.” The repair prompt also required functional import, evidence-backed findings, honest privacy claims, working controls, and tests. | AI assistant using Copilot SDK in VS Code; model ID unavailable | Repair data integrity, empty state, imports, branding, privacy, and controls. | `src/App.tsx`, analysis/types, tests, and related UI. | Prior development checkpoint reported 8 tests, build, and lint passing. |
| “Make ONLY the following four changes” — make Safe to skip “See all” functional; add WhatsApp export instructions and TXT selection; generate a conversation-wide summary from actual input; test only these changes. | AI assistant using Copilot SDK in VS Code; model ID unavailable | Extend existing behavior without a redesign. | `src/App.tsx`, `src/lib/analyzer.ts`, `src/types.ts`, `src/App.css`, `src/App.test.tsx`. | Summary test verified changing inputs; tests and production build passed after correcting a matcher affected by nested markup. |
| “While selecting the import from whatsapp option, firstly whatsapp.web opens, firstly there should be a window that gives the instructions” and “only after the window is seen, it should give a button: Redirect to whatsapp web.” The user also requested an instruction explaining ZIP exports and `.txt` extraction/selection. | AI assistant using Copilot SDK in VS Code; model ID unavailable | Change WhatsApp navigation to explicit, user-initiated redirection and clarify the ZIP workflow. | `src/App.tsx`, `src/App.css`, `src/App.test.tsx`. | Verified in the browser that the dialog appears without redirecting. Updated tests verify redirect happens only after clicking its button and that instructions mention ZIP; 11 tests, production build, and diagnostics passed. |
| “Before generating any application code, create a file named prompt.md in the root of my GitHub repository” and “After presenting the initial prompt.md and development plan, wait for my confirmation before generating application code.” | AI assistant using Copilot SDK in VS Code; model ID unavailable | Document the actual AI-assisted development process and prepare the next development phase. | `prompt.md` only. | Created this record from available interaction history. No application code was generated in response to this instruction. |
| “Integrate the Google Gemini API into my existing What Did I Miss? project.” The prompt required a server-side `GEMINI_API_KEY`, no client exposure, structured evidence-backed output, explicit disclosure/consent, no fake fallback, and verification of errors, privacy, and existing flows. | AI assistant using Copilot SDK in VS Code; coding model ID unavailable. Gemini model configured in code: `gemini-3.8-flash`. | Replace the app's rule-based analysis flow with a protected Gemini endpoint while preserving existing UI and imports. | `server.mjs`, `src/App.tsx`, `src/types.ts`, `src/App.css`, `src/App.test.tsx`, `server.test.mjs`, `vite.config.ts`, `package.json`, `package-lock.json`, `.env.example`, `.gitignore`, `index.html`, `README.md`, `prompt.md`. | Implemented endpoint, structured response/evidence validation, consent/error states, privacy disclosure, run scripts, and documentation. Tests/build/lint passed; no live Gemini call was possible because `GEMINI_API_KEY` is not configured. |

## 4. Debugging

| Error or issue | Prompt/instruction and resolution | Files affected | Verification |
|---|---|---|---|
| A WhatsApp-instructions test could not match a phrase spanning nested `<strong>` elements. The UI wording was present; the test's text query assumed contiguous text. | Kept the UI unchanged and changed the assertion to locate the list item by its combined `textContent`. | `src/App.test.tsx` | All 11 tests passed after the adjustment. |
| WhatsApp opened as soon as the import option was selected, before users could read the instructions. | Split showing the instructions from opening WhatsApp. Added a dialog button that performs the redirect only when clicked. | `src/App.tsx`, `src/App.test.tsx` | Browser inspection confirmed the dialog appeared while the page remained in place; the test checks redirect call order/trigger. |
| WhatsApp export may arrive as ZIP, while the existing importer accepts text files. | Documented that users should extract the ZIP and select its `.txt` file; did not imply the app supports automatic ZIP extraction. | `src/App.tsx`, `src/App.test.tsx` | Test checks the ZIP guidance. |
| Old summary tests expected the client to regenerate a rule-based recap after a task checkbox changed. | Kept the Gemini-authored summary unchanged; verified the separately recalculated dashboard task metric after the user action. | `src/App.tsx`, `src/App.test.tsx` | The task-status test asserts the updated metric. |
| Local-only privacy labels became inaccurate after hosted model processing was introduced. | Added a consent dialog before network submission, explained Google Gemini processing, and removed local-only claims. | `src/App.tsx`, `README.md` | Browser flow showed consent first and, with the key absent, a clear server configuration error rather than a recap. |

## 5. AI Features & Design

- Gemini generates the summaries and structured findings. The prompt treats conversation content as untrusted data; the server validates categories, statuses, field sizes, and that every evidence ID exists in the current parsed input.
- Unknown owners/deadlines are not inferred in the browser. Dashboard metrics derive from the validated model response and actual parsed message count.
- Conversation text and optional profile details are sent to Google only after consent. The app does not persist chat content or log it on its server.
- Demo data is opt-in and labeled. The initial state contains no fabricated analysis.
- The WhatsApp instruction panel explains the supported export workflow and explicitly says the app cannot read chats from the WhatsApp website.
- Visual decisions retained the existing productivity-dashboard design; the WhatsApp instruction view was changed into a focused modal without broader redesign.

## 6. Testing & Improvements

Checks from earlier development and this integration are distinguished below:

- Earlier targeted UI run: **11 tests passed** (`npm test -- --run src/App.test.tsx`) before the Gemini integration.
- Current full run: **16 tests passed across 2 files** (`npm test -- --run`), including a mocked Gemini/API endpoint path, missing-key and malformed-evidence errors, consent-gated UI, imports, task/status filters, Safe to skip, and clear session.
- Current production build: **passed** (`npm run build`, including TypeScript build and Vite production bundle).
- Current lint: **passed** (`npm run lint`); editor diagnostics reported no errors in the changed TypeScript files.
- Earlier checkpoint: 8 tests, build, and lint passed after the data-integrity repair.
- Browser verification: the WhatsApp dialog opens first and shows a separate Redirect to WhatsApp Web action.
- No separate demo `.txt` fixture was found; summary behavior was tested with the in-app TypeScript demo and a different conversation input.
- Gemini integration smoke checks: frontend required consent before posting; with no key configured, the API returned HTTP 503 with server setup instructions and no dashboard result. The production Node server returned the built app with HTTP 200 and health reported `configured: false`.
- The built browser JS had no `GEMINI_API_KEY` or `AIza` matches, and no `VITE_GEMINI_API_KEY` or direct Gemini URL was found in `src/`. Git CLI is unavailable here, so tracked-file status could not be queried. `.env` is ignored, `.env.example` is blank, and no real `.env` file or key was created.
- No live Gemini request was made because the developer has not configured a key. API tests inject a mock generator; a real model response remains to be verified.

Historical results are prior-interaction checks. Gemini integration checks above were run during the current interaction.

## 7. Final Summary

The AI coding assistant helped improve the React/TypeScript application, repair fabricated initial state and controls, improve TXT/WhatsApp import guidance, and integrate server-side Gemini analysis with explicit consent, structured evidence validation, metrics, API error handling, and tests. The configured Gemini model is `gemini-3.8-flash`; a real Gemini response still needs verification after the developer sets an API key. No API secrets were used or recorded. The coding model ID and earlier prompts/checks not present in the available history are left unspecified rather than invented.

## Development Plan

The MVP and Gemini integration are implemented; continue from the existing project rather than scaffold a replacement:

1. Add `GEMINI_API_KEY` locally to `.env` (or as an environment secret on a Node-capable host); never put it in client code.
2. Run `npm run dev`, then test a representative conversation and confirm consent, real Gemini analysis, evidence links, and API error/retry behavior.
3. Deploy to a Node-capable host, set `GEMINI_API_KEY` and `PORT`, and run `npm run build` then `npm start` (or the host's equivalent). Static-only hosting requires a separately deployed secure API function.
4. For future changes, keep scope focused and add the actual prompt, affected files, and verifiable results to this log.
