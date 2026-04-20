# RizzOS

A voice-first AI personality experience. The character you talk to is **Rizzy**. RizzOS is the platform underneath.

Built with Next.js (App Router), TypeScript, Tailwind CSS, and ElevenLabs Conversational AI. Mobile-first. Vercel-ready.

---

## Quick start

```bash
npm install
cp .env.example .env.local   # then fill in your Agent ID
npm run dev
```

Open http://localhost:3000 on your phone or desktop.

---

## Making voice actually work

You need an **ElevenLabs Conversational Agent**. The app is fully wired, it just needs credentials.

1. Go to https://elevenlabs.io/app/conversational-ai and create an Agent. Pick any voice you like for Rizzy.
2. In `.env.local`, set:

   ```
   NEXT_PUBLIC_ELEVENLABS_AGENT_ID=your_agent_id_here
   ```

3. **Public agent** (simplest): that's it. Click "Talk to Rizzy" and speak.

4. **Private agent** (recommended for production): also set
   ```
   ELEVENLABS_API_KEY=your_server_api_key
   ```
   The client will automatically hit `/api/eleven/signed-url` to mint short-lived signed URLs so your API key never leaves the server.

> The system prompt for each personality is sent as an override at session start, so Rizzy takes on the selected mode (Smooth / Playful / Savage) without any dashboard configuration.

---

## Project structure

```
app/
  api/eleven/signed-url/route.ts   # optional server endpoint for private agents
  layout.tsx
  page.tsx
  globals.css
components/
  Header.tsx
  Footer.tsx
  BotOrb.tsx                       # animated Rizzy presence
  Hero.tsx                         # orb + name + dynamic status line
  StatusBadge.tsx
  TalkButton.tsx
  PersonalitySelector.tsx
  TranscriptPanel.tsx
  RizzyExperience.tsx              # orchestrates state + wires voice
lib/
  elevenlabs.ts                    # useRizzySession() — voice session hook
  personalities.ts                 # Smooth / Playful / Savage configs
types/
  personality.ts
  conversation.ts
```

### Extension points (future roadmap)

- **Auth / DB**: wrap `RizzyExperience` with a provider later; the transcript is already a plain `Message[]` you can persist.
- **Multiple voices**: add a `voiceId` to `Personality` and pass it through `overrides.agent` in `lib/elevenlabs.ts`.
- **Custom LLM brain**: swap `useRizzySession` for a provider of your choice — the UI only depends on `status`, `start`, `stop`, and `onMessage`.
- **Memory**: add a `conversationContext` prop to the personality override and feed it long-term user memory.

---

## Tech

- **Next.js 14** App Router (client components isolated, server route for signed URLs)
- **TypeScript** strict mode
- **Tailwind CSS** with custom keyframes for the orb
- **@elevenlabs/react** for voice conversations
- **Vercel-ready** — no extra config needed. Add the env vars in your Vercel project.

---

## Personalities

Defined centrally in `lib/personalities.ts`. Each has a `systemPrompt` that gets sent to the agent as an override at session start. Add new modes by extending `PersonalityKey` and the `PERSONALITIES` record — the UI picks them up automatically.

---

## Status model

Rizzy has four interaction states that drive the orb animation and copy:

- `idle` — soft floating pulse
- `listening` — stronger pulse + ring rotation
- `thinking` — counter-rotating orbits, dimmer core
- `speaking` — bursty scaling + equalizer bars

These are derived from the ElevenLabs session in `lib/elevenlabs.ts` so the UI stays in sync without manual plumbing.
