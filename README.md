# CO-ECO-GRAPH

Discover how a smart contract is used across the indexed Web3 ecosystem.

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

## How It Works

1. Enter a smart contract address
2. The app searches The Graph's decentralized network for subgraphs that index that contract
3. It retrieves and parses the top TOP_SUBGRAPHS subgraph manifests from IPFS (default 5, configurable via the TOP_SUBGRAPHS environment variable)
4. It extracts data sources, event handlers, entities, and fields
5. It retrieves and parses GraphQL schemas from IPFS
6. It deduplicates semantic concepts across subgraphs
7. It sends one compact dataset to Cloudflare Workers AI for semantic interpretation
8. It visualizes the ecosystem as an interactive graph

## Architecture

- **Frontend**: Vanilla TypeScript + SVG graph (no framework)
- **Backend**: Vercel serverless functions
- **AI**: Cloudflare Workers AI (Llama 3.1)
- **Data sources**: The Graph decentralized network, IPFS

## Environment Variables

| Variable | Description |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Workers AI API token |
| `CF_AI_MODEL` | Cloudflare AI model (default: `@cf/meta/llama-3.1-8b-instruct`) |
| `THEGRAPH_API_KEY` | The Graph API key |
| `THEGRAPH_GATEWAY_URL` | The Graph gateway URL |
| `IPFS_GATEWAY_URL` | IPFS gateway URL |

## Deploy

```bash
vercel
```
