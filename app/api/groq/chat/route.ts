import Groq from "groq-sdk";

export const runtime = "edge";
export const dynamic = "force-dynamic";
// Pin function to US-East — closest to Groq's serving infra. Without this,
// Vercel runs the function near the user, which adds a transatlantic hop
// per token for EU users. iad1 (Washington DC) gives the lowest TTFT.
export const preferredRegion = ["iad1"];

/**
 * Streaming chat endpoint. Forwards messages to Groq and pipes plain-text
 * deltas back as Server-Sent Events. Edge runtime keeps cold-start tiny
 * and supports streaming natively.
 */
export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "GROQ_API_KEY not configured." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: {
    messages?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    temperature?: number;
    maxTokens?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    model?: string;
  };

  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const messages = body.messages;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const groq = new Groq({ apiKey });

  // Default: Llama 3.3 70B versatile — best quality/latency on Groq.
  const model = body.model ?? "llama-3.3-70b-versatile";
  const temperature = clamp(body.temperature ?? 0.92, 0, 1.5);
  const maxTokens = clamp(body.maxTokens ?? 110, 1, 512);
  const frequencyPenalty = clamp(body.frequencyPenalty ?? 0.5, -2, 2);
  const presencePenalty = clamp(body.presencePenalty ?? 0.3, -2, 2);

  let stream: AsyncIterable<{
    choices: Array<{ delta?: { content?: string | null } }>;
  }>;
  try {
    stream = (await groq.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty,
      stream: true,
    })) as unknown as AsyncIterable<{
      choices: Array<{ delta?: { content?: string | null } }>;
    }>;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Groq error";
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices?.[0]?.delta?.content ?? "";
          if (delta) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`),
            );
          }
        }
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "stream error";
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: message })}\n\n`,
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
