"use client";

import { useState } from "react";

interface TextFallbackInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Text input shown when voice is unavailable (Azure failure, no mic
 * permission, etc.). Keeps Rizzy reachable even without speech.
 */
export function TextFallbackInput({
  onSend,
  disabled,
  placeholder = "Type to Rizzy…",
}: TextFallbackInputProps) {
  const [value, setValue] = useState("");

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex items-center gap-2 w-full max-w-md"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        className="flex-1 rounded-full bg-white/[0.06] border border-white/10 px-4 py-3 text-sm text-rizz-ink placeholder:text-rizz-mute focus:outline-none focus:border-rizz-accent/50"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="rounded-full bg-gradient-to-r from-rizz-accent2 to-rizz-accent text-white px-5 py-3 text-sm font-medium disabled:opacity-50"
      >
        Send
      </button>
    </form>
  );
}
