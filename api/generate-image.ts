import type { VercelRequest, VercelResponse } from "./vercel-types.js";
import { POLLINATIONS_API_KEY, POLLINATIONS_BASE_URL, POLLINATIONS_MODEL_IMAGE } from "../src/config.js";

export const config = { maxDuration: 30 };

/**
 * Generate image via Pollinations OpenAI-compatible endpoint.
 * POST /v1/images/generations
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(200);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const prompt = (req.body?.prompt ?? "").trim();
  const seed = req.body?.seed;
  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  if (!POLLINATIONS_MODEL_IMAGE) {
    return res.status(400).json({ error: "Image generation not configured: set POLLINATIONS_MODEL_IMAGE" });
  }

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (POLLINATIONS_API_KEY) headers.Authorization = `Bearer ${POLLINATIONS_API_KEY}`;

    const requestBody: Record<string, unknown> = {
      model: POLLINATIONS_MODEL_IMAGE,
      prompt,
      n: 1,
      size: "512x512",
      response_format: "b64_json",
    };
    // Add seed for deterministic results if provided
    if (seed !== undefined && seed !== null) {
      requestBody.seed = seed;
    }

    const resp = await fetch(`${POLLINATIONS_BASE_URL}/v1/images/generations`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(60000),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      return res.status(502).json({ error: `Image generation failed: HTTP ${resp.status}`, detail: body.slice(0, 300) });
    }

    const data = await resp.json();
    const imageData = data?.data?.[0];

    if (!imageData) {
      return res.status(502).json({ error: "Image generation returned no data" });
    }

    // Return as base64 data URL for direct embedding. Pollinations returns
    // JPEG bytes for some models (e.g. flux) despite the images endpoint,
    // so detect the actual format from magic bytes instead of assuming PNG.
    const base64 = imageData.b64_json;
    const buf = Buffer.from(base64, "base64");
    const ascii = (from: number, to: number) => buf.subarray(from, to).toString("latin1");
    const mime =
      buf[0] === 0xff && buf[1] === 0xd8 ? "image/jpeg"
      : buf[0] === 0x89 && buf[1] === 0x50 ? "image/png"
      : ascii(0, 3) === "GIF" ? "image/gif"
      : ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP" ? "image/webp"
      : "image/png";
    const dataUrl = `data:${mime};base64,${base64}`;

    return res.status(200).json({
      imageUrl: dataUrl,
      model: POLLINATIONS_MODEL_IMAGE,
      seed: seed ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: "Image generation error: " + msg });
  }
}
