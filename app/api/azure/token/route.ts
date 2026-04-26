import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";
// Pin token mint to US-West, closest to AZURE_SPEECH_REGION=westus2.
// This only fires once per session so it's not the hot path, but it
// shaves ~150ms off the initial "tap to talk" tap.
// (If you move Azure to westeurope, switch this to ["fra1"].)
export const preferredRegion = ["pdx1"];

/**
 * Mints a short-lived (10 min) Azure Speech token for the browser.
 * The browser uses this to open WebSocket connections directly to Azure
 * for streaming STT and TTS — keeping the AZURE_SPEECH_KEY server-side.
 */
export async function GET() {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;

  if (!key || !region) {
    return NextResponse.json(
      {
        error:
          "Missing AZURE_SPEECH_KEY / AZURE_SPEECH_REGION on the server.",
      },
      { status: 500 },
    );
  }

  try {
    const res = await fetch(
      `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Length": "0",
        },
        cache: "no-store",
      },
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Azure token error: ${text}` },
        { status: res.status },
      );
    }

    const token = await res.text();
    return NextResponse.json(
      { token, region },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
