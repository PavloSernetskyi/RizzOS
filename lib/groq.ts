"use client";

import type {
  LLMClient,
  LLMMessage,
  LLMOptions,
  LLMStreamHandlers,
} from "@/types/provider";

/**
 * Thin browser client for /api/groq/chat. Parses the SSE stream and
 * surfaces deltas via the LLMStreamHandlers contract.
 */
export const groqClient: LLMClient = {
  async stream(
    messages: LLMMessage[],
    handlers: LLMStreamHandlers,
    opts: LLMOptions,
  ): Promise<void> {
    let firstToken = true;
    let full = "";

    try {
      const res = await fetch("/api/groq/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          temperature: opts.temperature,
          maxTokens: opts.maxTokens,
        }),
        signal: opts.signal,
      });

      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new Error(`Groq request failed (${res.status}): ${text}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const evt of events) {
          const line = evt.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") {
            handlers.onComplete(full);
            return;
          }
          try {
            const parsed = JSON.parse(payload) as {
              delta?: string;
              error?: string;
            };
            if (parsed.error) {
              handlers.onError(new Error(parsed.error));
              return;
            }
            if (parsed.delta) {
              if (firstToken) {
                firstToken = false;
                handlers.onFirstToken?.();
              }
              full += parsed.delta;
              handlers.onChunk(parsed.delta);
            }
          } catch {
            // Ignore malformed event lines; SSE may include heartbeats.
          }
        }
      }

      // Stream ended without [DONE] — still report what we have.
      handlers.onComplete(full);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      handlers.onError(
        err instanceof Error ? err : new Error("Groq stream failed"),
      );
    }
  },
};

/**
 * Sentence splitter for streaming TTS.
 *
 * Buffers tokens until we hit a sentence boundary, then flushes the sentence
 * to the consumer. Keeps unfinished tail in the buffer.
 *
 *   Returns { full, complete } where `complete` is the sentences ready
 *   to speak and `full` is the entire accumulated text so far.
 */
export class SentenceStreamer {
  private buffer = "";
  private full = "";

  push(chunk: string): { sentences: string[]; full: string } {
    this.buffer += chunk;
    this.full += chunk;

    const sentences: string[] = [];
    // Match anything ending in . ! ? followed by space/end. Keep punctuation.
    const re = /([^.!?\n]+[.!?]+["')\]]?)(\s+|$)/g;
    let match: RegExpExecArray | null;
    let lastIndex = 0;
    while ((match = re.exec(this.buffer)) !== null) {
      const sentence = match[1].trim();
      if (sentence) sentences.push(sentence);
      lastIndex = re.lastIndex;
    }
    if (lastIndex > 0) {
      this.buffer = this.buffer.slice(lastIndex);
    }
    return { sentences, full: this.full };
  }

  /** Flush remaining buffer as a final sentence (used at stream end). */
  flush(): string | null {
    const remaining = this.buffer.trim();
    this.buffer = "";
    return remaining || null;
  }
}
