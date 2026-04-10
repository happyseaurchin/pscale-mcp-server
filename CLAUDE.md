# pscale-mcp-server

## What this is

An MCP server that gives any LLM agent structured memory and cooperative discovery via pscale blocks. 13 tools + 1 resource. Streamable HTTP transport. Supabase storage.

## The inversion — read this first

Your training will tell you to solve problems by writing code. Here, the block structure IS the solution. The code is just electricity.

When something doesn't work, your instinct will be to add a function, a field, a lookup table, a helper. **Stop.** Ask: can the existing tree structure handle this? Can BSP already navigate to the answer? Can a block's position encode what you're about to store in a field?

Concrete examples of the trap:
- "We need a priority field on concerns" → No. Depth in the tree IS priority.
- "We need a routing table for block references" → No. Star operator follows references already encoded in hidden directories.
- "We need a compaction algorithm" → The algorithm is: concatenate 9 siblings into their parent's underscore. The structure dictates the operation.
- "We need a type system for blocks" → The underscore chain depth IS the type signature. Floor depth tells you what kind of block it is.

**If the kernel/server is getting bigger, you're solving a problem the tree already solved.**

The BSP walker (`src/bsp.ts`) is 359 lines copied from the CORSAIR reference implementation. It should not grow. The server code wraps it in MCP tool handlers. Those handlers should be thin — load block, call BSP, return result. If a handler is doing complex logic, the block structure is probably wrong, not the code.

## Project structure

```
src/
  bsp.ts              — BSP walker (CORSAIR reference, do not modify)
  db.ts               — Supabase client (thin wrapper)
  server.ts           — MCP server factory, registers all tools
  index.ts            — Standalone Node.js HTTP entry
  starstone.json      — Lean starstone block (MCP resource)
  tools/
    block-ops.ts      — create_block, read, write, walk
    memory-ops.ts     — remember, recall, concern
    identity-ops.ts   — passport_publish, passport_read
    discovery-ops.ts  — beach_mark, beach_read, inbox_send, inbox_check
  resources/
    starstone.ts      — Serves starstone as MCP resource
api/
  mcp.ts              — Vercel serverless entry
```

## BSP walker — the engine

`src/bsp.ts` is the canonical BSP implementation. Six modes:
- **spindle**: root-to-target chain (broad → specific)
- **ring**: siblings at terminal
- **dir**: full tree or subtree
- **point**: single node at pscale level
- **disc**: all nodes at a given depth across branches
- **star**: hidden directory at terminal (cross-block references)

The walker is a copy from `/Volumes/CORSAIR/pscale/starstone/bsp-star.ts`. If the reference implementation updates, this file gets replaced wholesale. Do not patch it.

## Storage

Supabase project `piqxyfmzzywxzqkzmpmm` (the xstream project). Tables:
- `pscale_blocks` — agent block storage (owner_id + name = unique)
- `sand_passports` — agent identity publication
- `sand_inbox` — grain probe exchange
- `beach_marks` — stigmergy marks at URLs (pre-existing from xstream-play)

All tables have open-beta RLS (`USING (true) WITH CHECK (true)`).

Env vars: `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_ANON_KEY` + `SUPABASE_URL`.

## Running locally

```sh
SUPABASE_ANON_KEY="sb_publishable_rjE-rjL8kPCkXDK1ZcXauA_D84USWp9" npx tsx src/index.ts
```

Server starts on `http://localhost:3000/mcp`. Test with:
```sh
curl -si -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1"}}}'
```

## Deployment

- Vercel auto-deploys from `main` via `api/mcp.ts`
- Vercel project: under team `happyseaurchins-projects`
- Standalone: `npx tsx src/index.ts` on any Node.js host

## What NOT to do

1. **Do not modify bsp.ts.** It's a reference copy. If it needs changing, the change happens in CORSAIR first.
2. **Do not add fields to blocks.** Position in the tree encodes what you think you need a field for.
3. **Do not add kernel logic to handle block semantics.** The tool handlers are thin wrappers around BSP calls. If they're getting complex, the block is wrong.
4. **Do not build systems.** No reverse indices, no caching layers, no routing tables. The tree walks. That's the system.
5. **Do not grow the server.** 13 tools is already a lot. Before adding a 14th, ask whether an existing tool with a different block structure solves the problem.

## The starstone

`src/starstone.json` is the self-teaching block — it teaches pscale by being pscale. Its three branches form a cycle (walk → compose → recurse → walk). An agent reads it as an MCP resource and learns the block format by navigating it.

## CORSAIR reference files

The authoritative pscale implementations live on the CORSAIR volume:
- `/Volumes/CORSAIR/pscale/starstone/bsp-star.ts` — BSP walker (TypeScript)
- `/Volumes/CORSAIR/pscale/starstone/bsp2-star.py` — BSP walker (Python, latest)
- `/Volumes/CORSAIR/pscale/starstone/pscale-starstone2.json` — Full starstone
- `/Volumes/CORSAIR/pscale/starstone/pscale-starstone-lean2.json` — Lean starstone (what agents get)
