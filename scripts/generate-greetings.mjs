import { existsSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();

loadEnv(".env");
loadEnv(".env.local");

const key = process.env.AZURE_SPEECH_KEY;
const region = process.env.AZURE_SPEECH_REGION;

if (!key || !region) {
  throw new Error("Missing AZURE_SPEECH_KEY or AZURE_SPEECH_REGION.");
}

const { parseLeadingCue, stripAllCues } = loadTsModule("lib/expression.ts");
const { PERSONALITIES, PERSONALITY_ORDER } = loadTsModule("lib/personalities.ts");
const outDir = path.join(root, "public", "audio", "greetings");

await fs.mkdir(outDir, { recursive: true });

let generated = 0;

for (const personalityKey of PERSONALITY_ORDER) {
  const personality = PERSONALITIES[personalityKey];

  for (const [index, greeting] of personality.idleLines.entries()) {
    const parsed = parseLeadingCue(greeting);
    const spoken = stripAllCues(parsed.cleanText) || greeting;
    const ssml = buildSsml(spoken, personality.voice, parsed.expression);
    const filename = `${personality.key}-${index + 1}.mp3`;
    const outputPath = path.join(outDir, filename);

    const audio = await synthesize(ssml);
    await fs.writeFile(outputPath, audio);
    generated += 1;
    console.log(`Generated ${path.relative(root, outputPath)}`);
  }
}

console.log(`Generated ${generated} greeting files.`);

function loadEnv(name) {
  const file = path.join(root, name);
  if (!existsSync(file)) return;

  const text = readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith("#")) continue;

    const envKey = match[1];
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[envKey] ??= value;
  }
}

function loadTsModule(relativePath) {
  const filename = path.join(root, relativePath);
  if (moduleCache.has(filename)) return moduleCache.get(filename).exports;

  const source = readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });

  const mod = { exports: {} };
  moduleCache.set(filename, mod);

  const localRequire = (id) => {
    if (id.startsWith("@/")) {
      const mapped = path.join(root, id.slice(2));
      const candidates = [mapped, `${mapped}.ts`, `${mapped}.tsx`];
      const found = candidates.find((candidate) => existsSync(candidate));
      if (!found) return {};
      return loadTsModule(path.relative(root, found));
    }
    return require(id);
  };

  vm.runInNewContext(
    outputText,
    {
      console,
      exports: mod.exports,
      module: mod,
      process,
      require: localRequire,
    },
    { filename },
  );

  return mod.exports;
}

async function synthesize(ssml) {
  const response = await fetch(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/ssml+xml",
        "Ocp-Apim-Subscription-Key": key,
        "User-Agent": "RizzOS greeting generator",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      },
      body: ssml,
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Azure TTS failed (${response.status}): ${body}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function buildSsml(text, voice, expr) {
  const inner = humanizeForSsml(text);
  const style = expr?.style ?? voice.style ?? "chat";
  const styleDegree = expr?.styleDegree ?? voice.styleDegree ?? 1.1;
  const rate = expr?.rate ?? voice.rate ?? "-2%";
  const pitch = expr?.pitch ?? voice.pitch ?? "0%";

  return [
    '<speak version="1.0"',
    ' xmlns="http://www.w3.org/2001/10/synthesis"',
    ' xmlns:mstts="http://www.w3.org/2001/mstts"',
    ' xml:lang="en-US">',
    `<voice name="${voice.voiceName}">`,
    `<prosody rate="${rate}" pitch="${pitch}">`,
    `<mstts:express-as style="${style}" styledegree="${styleDegree}">`,
    inner,
    "</mstts:express-as></prosody></voice></speak>",
  ].join("");
}

function humanizeForSsml(raw) {
  let text = raw.trim();
  if (!text) return "";

  text = text.replace(/([!?.])\1{1,}/g, "$1");
  text = text.replace(/\b(M)m\b/g, "$1mm");
  text = text.replace(/\b(m)m\b/g, "$1mm");
  text = text.replace(/\b(H)m\b/g, "$1mm");
  text = text.replace(/\b(h)m\b/g, "$1mm");

  if (!/[.!?\u2026]$/.test(text)) text = `${text}.`;

  const safe = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

  return safe
    .replace(/\.{3,}|\u2026/g, '<break time="280ms"/>')
    .replace(/\s\u2014\s|\s--\s|\s-\s/g, '<break time="180ms"/>')
    .replace(/,\s/g, ', <break time="80ms"/>');
}
