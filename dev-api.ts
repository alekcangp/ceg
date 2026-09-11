import http from "node:http";
import handler from "./api/analyze.ts";

const PORT = Number(process.env.PORT || 3001);

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }
  if (req.url?.split("?")[0] === "/api/analyze" && req.method === "POST") {
    let raw = "";
    req.on("data", (c) => {
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
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("API dev server: POST /api/analyze");
});

server.listen(PORT, () => console.log(`API dev server on http://localhost:${PORT}/api/analyze`));