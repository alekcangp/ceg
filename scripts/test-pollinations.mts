/**
 * Pollinations API smoke test — text + image generation for a real contract.
 * Run: node --env-file=.env --import tsx scripts/test-pollinations.ts
 */
import fs from "node:fs";
import path from "node:path";

const API_KEY = process.env.POLLINATIONS_API_KEY ?? "";
const BASE_URL = (process.env.POLLINATIONS_BASE_URL ?? "https://gen.pollinations.ai").replace(/\/$/, "");
const TEXT_MODEL = process.env.POLLINATIONS_MODEL ?? "openai/gpt-5-nano";
const IMAGE_MODEL = process.env.POLLINATIONS_MODEL_IMAGE ?? "black-forest-labs/flux.1-schnell";

// Real contract: Tether USDT (ERC-20) on Ethereum mainnet
const CONTRACT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

function log(tag: string, msg: unknown) {
  const ts = new Date().toISOString().slice(11, 19);
  if (msg instanceof Error) {
    console.log(`[${ts}] ${tag} ERROR: ${msg.message}`);
  } else if (typeof msg === "object") {
    console.log(`[${ts}] ${tag}`, JSON.stringify(msg, null, 2));
  } else {
    console.log(`[${ts}] ${tag} ${msg}`);
  }
}

async function testText(): Promise<boolean> {
  log("TEXT", `model=${TEXT_MODEL}, contract=${CONTRACT.slice(0, 10)}…`);
  const prompt = `In 2 sentences, what is the Tether USDT stablecoin contract at address ${CONTRACT}? Be factual.`;

  const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: TEXT_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    log("TEXT", `HTTP ${res.status}: ${body.slice(0, 300)}`);
    return false;
  }

  const data = (await res.json()) as any;
  const content = data?.choices?.[0]?.message?.content ?? "(empty)";
  const usage = data?.usage ?? null;
  log("TEXT", `OK — ${content.length} chars, usage=${JSON.stringify(usage)}`);
  log("TEXT", `Response: ${content.slice(0, 200)}${content.length > 200 ? "…" : ""}`);
  return true;
}

async function testImage(): Promise<boolean> {
  log("IMAGE", `model=${IMAGE_MODEL}, contract=${CONTRACT.slice(0, 10)}…`);
  const prompt = `A digital art illustration of a Tether USDT stablecoin, gold and green blockchain theme, abstract financial flow, contract address ${CONTRACT.slice(0, 10)}…`;

  // OpenAI-compatible endpoint: POST /v1/images/generations
  const res = await fetch(`${BASE_URL}/v1/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt,
      n: 1,
      size: "512x512",
      response_format: "b64_json",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    log("IMAGE", `HTTP ${res.status}: ${body.slice(0, 300)}`);
    return false;
  }

  const data = (await res.json()) as any;
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) {
    log("IMAGE", "No image data in response");
    return false;
  }

  const buf = Buffer.from(b64, "base64");
  log("IMAGE", `OK — ${buf.length} bytes`);

  if (buf.length < 1000) {
    log("IMAGE", `Suspiciously small response`);
    return false;
  }

  // Save to disk for visual inspection
  const outDir = path.join(process.cwd(), "test-output");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "pollinations-image.png");
  fs.writeFileSync(outPath, buf);
  log("IMAGE", `Saved → ${outPath}`);
  return true;
}

async function main() {
  if (!API_KEY) {
    log("SETUP", "POLLINATIONS_API_KEY is empty — set it in .env");
    process.exit(1);
  }
  log("SETUP", `base=${BASE_URL}, key=${API_KEY.slice(0, 6)}…${API_KEY.slice(-4)}`);

  const results = { text: false, image: false };

  results.text = await testText().catch((e) => {
    log("TEXT", e);
    return false;
  });

  results.image = await testImage().catch((e) => {
    log("IMAGE", e);
    return false;
  });

  log("RESULT", `text=${results.text ? "PASS" : "FAIL"} image=${results.image ? "PASS" : "FAIL"}`);

  if (!results.text || !results.image) {
    process.exit(1);
  }
}

main();
