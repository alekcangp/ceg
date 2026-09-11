# ✨ Co-Eco-Graph

Discover how a smart contract is used across the indexed Web3 ecosystem.

Paste any Ethereum contract address and watch its subgraph ecosystem come alive — entities, data sources, event handlers, and AI-powered interpretation, all in one interactive graph.

## Quick Start

```bash
npm install
cp .env.example .env
# Fill in your API keys in .env
npm run dev
```

Then open http://localhost:5173

### Run API locally (optional, for development)

```bash
npm run dev:api
```

This starts the analyze endpoint at http://localhost:3001/api/analyze

## How It Works

1. Enter a smart contract address
2. The app searches The Graph's decentralized network for subgraphs that index that contract
3. It retrieves and parses the top TOP_SUBGRAPHS subgraph manifests from IPFS (default 5, configurable via the `TOP_SUBGRAPHS` environment variable)
4. It extracts data sources, event handlers, entities, and fields
5. It retrieves and parses GraphQL schemas from IPFS
6. It deduplicates semantic concepts across subgraphs
7. It sends one compact dataset to Cloudflare Workers AI for semantic interpretation
8. It visualizes the ecosystem as an interactive graph

## Architecture

- **Frontend**: Vanilla TypeScript + SVG graph (no framework)
- **Backend**: Vercel serverless functions (`api/analyze.ts`)
- **AI**: Cloudflare Workers AI (Llama 3.1) — optional, app works without it
- **Data sources**: The Graph decentralized network, IPFS

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server (frontend) |
| `npm run dev:api` | Start local API server for `/api/analyze` |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview production build locally |
| `npm run typecheck` | Run TypeScript type checking |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | No | Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | No | Cloudflare Workers AI API token |
| `CF_AI_MODEL` | No | Cloudflare AI model (default: `@cf/meta/llama-3.1-8b-instruct`) |
| `THEGRAPH_API_KEY` | Yes | The Graph API key |
| `THEGRAPH_GATEWAY_URL` | Yes | The Graph gateway URL |
| `GRAPH_NETWORK_SUBGRAPH_ID` | Yes | Graph Network subgraph deployment ID |
| `IPFS_GATEWAY_URL` | No | IPFS gateway URL (default: `https://ipfs.thegraph.com/ipfs`) |
| `SUBGRAPH_MANIFEST_CACHE_TTL` | No | In-memory IPFS cache TTL in seconds (0 = disabled, default 3600) |
| `TOP_SUBGRAPHS` | No | Top N subgraphs by signal + top N by query fees (default: `5`) |

> **Note**: AI analysis is optional. If Cloudflare credentials are not provided, the app still performs full subgraph discovery, manifest/schema parsing, and graph visualization — just without AI interpretation.

> **Note**: `api/analyze.ts` uses `maxDuration: 60` — on the Vercel Hobby plan
> the effective limit is 60s; use Pro or self-hosting for full analysis.

## Deploy to Vercel

```bash
vercel
```

Or connect your GitHub repo to Vercel for automatic deployments.

### Vercel Configuration

The project includes a `vercel.json` with:
- Build command: `vite build`
- Output directory: `dist`
- Framework: `vite`
- API function with `maxDuration: 60`
- CORS headers for API routes

## Project Structure

```
.
├── api/
│   ├── analyze.ts          # Serverless API endpoint
│   └── vercel-types.ts     # Vercel request/response types
├── src/
│   ├── app.ts              # Frontend entry point
│   ├── config.ts           # Tunable pipeline limits
│   ├── styles.css          # Fantasy-themed styles
│   ├── ai/                 # Cloudflare AI integration
│   ├── discovery/          # The Graph subgraph discovery
│   ├── graph/              # SVG graph renderer & builder
│   ├── manifest/           # Subgraph manifest/schema parsing
│   └── normalization/      # Concept deduplication
├── shared/
│   └── types.ts            # Shared TypeScript types
├── index.html              # HTML entry
├── vite.config.ts          # Vite configuration
└── vercel.json             # Vercel deployment config
```
