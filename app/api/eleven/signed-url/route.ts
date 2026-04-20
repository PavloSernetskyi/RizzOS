import { NextResponse } from "next/server";

/**
 * Mints a short-lived signed URL for the ElevenLabs conversational agent.
 * Only needed if your agent is PRIVATE. For public agents, leave
 * ELEVENLABS_API_KEY unset — the client will connect with the agentId directly.
 */
export async function GET(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY not configured on server." },
      { status: 404 },
    );
  }

  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agentId");
  if (!agentId) {
    return NextResponse.json({ error: "Missing agentId" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
      {
        method: "GET",
        headers: { "xi-api-key": apiKey },
        cache: "no-store",
      },
    );

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `ElevenLabs error: ${text}` },
        { status: res.status },
      );
    }

    const data = (await res.json()) as { signed_url?: string };
    if (!data.signed_url) {
      return NextResponse.json(
        { error: "Missing signed_url in ElevenLabs response." },
        { status: 502 },
      );
    }

    return NextResponse.json({ signedUrl: data.signed_url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
