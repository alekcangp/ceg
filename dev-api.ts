import http from "node:http";
import analyzeHandler from "./api/analyze.ts";
import generateImageHandler from "./api/generate-image.ts";

const PORT = Number(process.env.PORT || 3001);

type Handler = (req: any, res: any) => Promise<void>;

async function handleRoute(path: string, handler: Handler, req: any, res: any) {
  let raw = "";
  req.on("data", (c: Buffer) => {
    raw += c;
    if (raw.length > 100_000) req.destroy();
  });
  req.on("end", async () => {
    let body: unknown = {};
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      body = {};
    }
    let status = 200;
    let payload: unknown = null;
    const out: any = {
      status: (c: number) => ((status = c), out),
      json: (d: unknown) => ((payload = d), undefined),
      setHeader: () => undefined,
      end: () => undefined,
    };
    await handler({ method: req.method, body } as any, out);
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const path = req.url?.split("?")[0];

  if (path === "/api/analyze" && req.method === "POST") {
    return handleRoute(path, analyzeHandler as Handler, req, res);
  }
  if (path === "/api/generate-image" && req.method === "POST") {
    return handleRoute(path, generateImageHandler as Handler, req, res);
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("API dev server: POST /api/analyze | POST /api/generate-image");
});

server.listen(PORT, () => console.log(`API dev server on http://localhost:${PORT}/api/analyze and /api/generate-image`));