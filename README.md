# RizzOS 2.0 — Azure Speech + Groq

A voice-first AI personality experience. The character you talk to is **Rizzy**. RizzOS is the platform underneath.

> Branch: `rizzos-2.0-azure-groq` — built on Azure Speech (STT + TTS) and Groq (LLM brain).
> The original ElevenLabs build lives on `master`.

Mobile-first. Vercel-ready. Optimized for **rizz quality** (charisma) and **low latency**.

---

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in keys (see below)
npm run dev
```

Open http://localhost:3000 — desktop or phone.

---

## Architecture

```
┌────────────────────────┐            ┌──────────────────────────┐
│   USER'S BROWSER       │            │   YOUR VERCEL DEPLOY     │
│                        │            │                          │
│  Azure Speech SDK ─────┼─ websocket → AZURE COGNITIVE SERVICES │
│  (STT mic in,          │            │                          │
│   TTS speaker out)     │            │   /api/azure/token       │
│                        │  fetch     │   (mints 10-min token)   │
│  conversationOrchestrator ──────────│                          │
│  (state machine)       │  fetch SSE │   /api/groq/chat         │
│                        │ ───────────│   (Edge runtime stream)  │
│                        │            │            │             │
└────────────────────────┘            └────────────┼─────────────┘
                                                   │
                                                   ▼
                                            ┌─────────────┐
                                            │  GROQ LLM   │
                                            │  Llama 3.3  │
                                            └─────────────┘
```

**Key insight**: heavy real-time audio is browser ↔ Azure direct. Vercel only handles a token mint and the LLM stream proxy.

---

## Latency optimizations baked in

1. **Sentence-streaming TTS.** As Groq tokens arrive, we split on sentence boundaries and start TTS the moment the first sentence is ready. Rizzy starts talking ~600-900ms after you stop, instead of 2-3s.
2. **Edge runtime** for `/api/groq/chat` and `/api/azure/token` — ~50ms cold start.
3. **Client-side Azure SDK** — no audio proxying through Vercel.
4. **Bounded prompts** — last 8 turns of history kept; system prompt enforces 8-20 word replies.
5. **Per-personality token limits** (Smooth=80, Playful=80, Savage=70) keep replies snappy.

A latency overlay (set `NEXT_PUBLIC_RIZZ_DEBUG=1` in `.env.local`) shows the breakdown in real-time.

---

## Project structure

```
app/
  api/
    azure/token/route.ts        # Edge route — mints Azure auth token
    groq/chat/route.ts          # Edge route — streams Groq SSE
  layout.tsx, page.tsx, globals.css

components/
  Header, Footer, Hero, BotOrb,
  StatusBadge, TalkButton, PersonalitySelector,
  TranscriptPanel, TextFallbackInput,
  LatencyOverlay,                # dev-only debug HUD
  RizzyExperience                # state orchestrator wiring

lib/
  personalities.ts               # Smooth / Playful / Savage configs
  azure.ts                       # AzureSTTClient + AzureTTSClient
  groq.ts                        # streaming client + SentenceStreamer
  fallback.ts                    # browser STT/TTS fallbacks
  conversationOrchestrator.ts    # the state machine + turn pipeline
  latency.ts                     # TurnTimer + LatencyTurn

types/
  personality.ts                 # Personality + ResponseTuning + VoiceTuning
  conversation.ts                # Message + RizzyStatus
  latency.ts                     # LatencyTurn
  provider.ts                    # STTClient / TTSClient / LLMClient interfaces
```

---

## State machine

```
              ┌──────────────────────────────────┐
              │              idle                │
              └─────────────┬────────────────────┘
                            │ start()
                            ▼
              ┌──────────────────────────────────┐
              │           listening              │
              └─────────────┬────────────────────┘
                            │ transcript final
                            ▼
              ┌──────────────────────────────────┐
              │          processing              │
              └─────────────┬────────────────────┘
                            │ first sentence ready
                            ▼
              ┌──────────────────────────────────┐
              │           speaking               │
              └─────────────┬────────────────────┘
                            │ audio finished
                            ▼
                      (back to listening)

  Any state can transition to:
    error_retry    — recoverable; user taps "Try again"
    fallback_text  — voice unavailable; text input shown
```

---

## Personalities

`lib/personalities.ts` is the single source of truth. Each mode declares:

- `systemPrompt` — sent to Groq verbatim
- `response` — `{ maxWords, maxTokens, temperature, sassLevel }` — runtime tuning
- `voice` — `{ voiceName, style, rate, pitch, styleDegree }` — Azure SSML knobs
- `idleLines` — rotating prose under Rizzy's name when idle

Adding a new mode is one object literal — UI picks it up automatically.

---

## Fallback ladder

Rizzy never goes silent.

| Failure | Fallback |
|---|---|
| Azure STT token fails | Browser `SpeechRecognition` |
| Azure STT runtime error | Surface `error_retry`; retry on tap |
| Azure TTS fails mid-sentence | Browser `speechSynthesis` for remainder |
| Groq stream fails | `error_retry` with preserved transcript |
| No mic / no STT support | `fallback_text` — text input only |

---

## Env vars

| Name | Where | Used for |
|---|---|---|
| `AZURE_SPEECH_KEY` | server only | Mint browser tokens |
| `AZURE_SPEECH_REGION` | server only | Azure region (e.g. `eastus`) |
| `GROQ_API_KEY` | server only | LLM brain |
| `NEXT_PUBLIC_RIZZ_DEBUG` | client | `1` shows latency overlay |

---

## Deploy

```bash
git push origin rizzos-2.0-azure-groq
```

Then on Vercel → Import this branch → set the 3 env vars → done. HTTPS is automatic (required for browser microphone on mobile).

---

## What still needs you

1. Sign up for Azure Speech (free F0 tier exists, no credit card on free).
2. Sign up for Groq Cloud (free tier, no credit card).
3. Drop both keys in `.env.local` and restart `npm run dev`.

Detailed signup walkthrough is in chat history.
