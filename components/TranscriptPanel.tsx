"use client";

import { useEffect, useRef } from "react";
import type { Message } from "@/types/conversation";

interface TranscriptPanelProps {
  messages: Message[];
  className?: string;
}

export function TranscriptPanel({ messages, className }: TranscriptPanelProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  return (
    <section
      aria-label="Conversation transcript"
      className={[
        "flex flex-col rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-sm",
        "overflow-hidden",
        className ?? "",
      ].join(" ")}
    >
      <header className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-rizz-accent" aria-hidden />
          <h2 className="text-xs sm:text-sm tracking-[0.18em] text-rizz-mute">
            TRANSCRIPT
          </h2>
        </div>
        <span className="text-[10px] text-rizz-mute/70">
          {messages.length === 0
            ? "empty"
            : `${messages.length} line${messages.length === 1 ? "" : "s"}`}
        </span>
      </header>

      <div className="rizz-scroll relative max-h-[38dvh] sm:max-h-[58dvh] overflow-y-auto px-4 sm:px-5 py-4">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((m) => (
              <li
                key={m.id}
                className={`flex ${m.speaker === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={[
                    "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                    "animate-fadeUp",
                    m.speaker === "user"
                      ? "bg-white/[0.08] text-rizz-ink rounded-br-md"
                      : "bg-gradient-to-br from-rizz-accent2/25 to-rizz-accent/15 text-rizz-ink rounded-bl-md border border-rizz-accent/15",
                  ].join(" ")}
                >
                  <div className="text-[10px] uppercase tracking-wider text-rizz-mute/80 mb-0.5">
                    {m.speaker === "user" ? "You" : "Rizzy"}
                  </div>
                  {m.text}
                </div>
              </li>
            ))}
            <div ref={endRef} />
          </ul>
        )}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-6 sm:py-10 text-rizz-mute">
      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-rizz-accent2/40 to-rizz-accent/20 mb-3 animate-pulseSoft" />
      <p className="text-sm text-rizz-ink/90">No words yet.</p>
      <p className="text-xs mt-1 max-w-[28ch]">
        Tap <span className="text-rizz-ink">Talk to Rizzy</span> and say hi. Your
        conversation will appear here.
      </p>
    </div>
  );
}
