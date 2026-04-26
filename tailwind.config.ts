import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    // Personality accent classes (from-rizz-cool, from-rizz-hot, ring-rizz-*,
    // shadow-glow*, etc.) live in lib/personalities.ts. Without this glob,
    // Tailwind's JIT can't see them and the Playful/Savage Talk button loses
    // its gradient.
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        rizz: {
          bg: "#05060a",
          surface: "#0b0d14",
          border: "#1a1d2a",
          ink: "#e8ecf5",
          mute: "#8a8fa3",
          accent: "#b388ff",
          accent2: "#7c5cff",
          hot: "#ff5c8a",
          cool: "#39d0d8",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        display: ["var(--font-display)", "ui-sans-serif", "system-ui"],
      },
      boxShadow: {
        glow: "0 0 80px -10px rgba(179,136,255,0.55)",
        glowHot: "0 0 80px -10px rgba(255,92,138,0.55)",
        glowCool: "0 0 80px -10px rgba(57,208,216,0.55)",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.65", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.04)" },
        },
        pulseStrong: {
          "0%, 100%": { opacity: "0.7", transform: "scale(1)" },
          "50%": { opacity: "1", transform: "scale(1.09)" },
        },
        think: {
          "0%, 100%": { transform: "rotate(0deg) scale(1)" },
          "50%": { transform: "rotate(180deg) scale(0.98)" },
        },
        speak: {
          "0%, 100%": { transform: "scale(1)", filter: "brightness(1)" },
          "25%": { transform: "scale(1.06)", filter: "brightness(1.2)" },
          "50%": { transform: "scale(0.98)", filter: "brightness(1.1)" },
          "75%": { transform: "scale(1.08)", filter: "brightness(1.25)" },
        },
        orbit: {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        float: "float 6s ease-in-out infinite",
        pulseSoft: "pulseSoft 3.5s ease-in-out infinite",
        pulseStrong: "pulseStrong 1.6s ease-in-out infinite",
        think: "think 4s ease-in-out infinite",
        speak: "speak 1.1s ease-in-out infinite",
        orbit: "orbit 14s linear infinite",
        "orbit-rev": "orbit 22s linear infinite reverse",
        shimmer: "shimmer 6s ease-in-out infinite",
        fadeUp: "fadeUp 0.35s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
