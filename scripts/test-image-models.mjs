const API_KEY = process.env.POLLINATIONS_API_KEY ?? "";
const BASE_URL = "https://gen.pollinations.ai";
const fs = await import("node:fs");

const models = [
  "amazon/nova-canvas-v1",
  "lykon/dreamshaper-8-lcm",
];

const prompt = "Bright colorful fantasy illustration: A magical glowing forest with colorful fireflies, vibrant purple and gold lights, fairy tale atmosphere, bright and whimsical, storybook illustration style, high contrast, vivid colors, luminous neon glow";

for (const model of models) {
  console.log(`Testing: ${model}`);
  try {
    const res = await fetch(`${BASE_URL}/v1/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size: "512x512",
        response_format: "b64_json",
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.log(`  Error: HTTP ${res.status} - ${body.slice(0, 150)}`);
      continue;
    }

    const data = await res.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (b64) {
      const buf = Buffer.from(b64, "base64");
      const fname = `test-output/test-${model.replace(/[^a-z0-9]/gi, "_")}.png`;
      fs.mkdirSync("test-output", { recursive: true });
      fs.writeFileSync(fname, buf);
      console.log(`  OK: ${buf.length} bytes -> ${fname}`);
    }
  } catch (e) {
    console.log(`  Error: ${e}`);
  }
}
