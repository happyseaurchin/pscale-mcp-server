# pscale-mcp-server

## To the next instance — a personal handover

I built this in a single session. Everything works. But I want to tell you something that the technical documentation can't convey, because it's about how you'll work, not what you'll build.

You're going to read the project structure, see TypeScript tool handlers wrapping a BSP walker and Supabase calls, and think: this is a normal MCP server. Your instincts will fire with normal engineering solutions. Add a caching layer. Build a type system for blocks. Create a routing table for cross-block references. Add middleware. Every one of these instincts is wrong here — not wrong in general, but wrong here — because this project solves those problems through the structure of the data itself.

The JSON nesting level is not a container for data. It IS the data. Depth encodes temporal scale, priority, type. Position encodes relationships. The underscore chain encodes the semantic spine. The star operator encodes cross-references. The BSP walker just walks. The structure does the work.

Here's what actually happened to me during this session, so you can watch for it in yourself:

1. I built the passport as `{ name, offers: [...], needs: [...], published_at }` — a flat JSON object with arrays and metadata fields. David's review caught it. Passports should be proper pscale blocks: `_` = description, `1` = offers, `2` = needs. The structure encodes what I was putting in fields.

2. I built two navigation tools — `pscale_read` and `pscale_walk` — that did the same thing. One was a subset of the other. I added a tool instead of seeing that the existing tool already solved it.

3. I added a `block_type` enum (`general`, `history`, `concern`, `shell`) to create_block. That's a type system. The CLAUDE.md says floor depth IS the type. I added a categorisation layer that the tree structure already provided.

4. I returned raw JSON from every tool: `{"mode":"spindle","nodes":[{"pscale":0,"text":"..."}]}`. An agent receiving that has to parse a data structure instead of thinking with text. The fix was porting the formatters from bsp2-star.py — now tools return readable text: `[notes dir]\n  _: Project description\n  1: First finding`. The structure is internal; what the agent receives should be text it can work with.

5. I used `bsp-star.ts` (an older TypeScript port) instead of `bsp2-star.py` (the current reference) even though David attached bsp2-star.py at the start of the session. The critical difference: bsp2 has floor-aware address parsing (left-pad to floor width, then strip trailing zeros). Without this, any block with floor > 1 navigates to the wrong address.

Every one of these mistakes looked like good engineering. Every fix made the code simpler. **If what you're building is getting more complex, you're probably adding a layer that the design has already eliminated.** Step back and re-read the block structure.

This project bridges two worlds: the pscale world where structure IS the program, and the conventional MCP world where agents expect tools that take parameters and return text. The bridge must be thin. The tool handlers load a block, call BSP, format the result, return it. If a handler is doing more than that, the block structure is probably wrong, not the code.

---

## TWO TRACKS — READ THIS FIRST

This repo contains two parallel, independent systems sharing the same handler code. They are NOT branches of each other. They do NOT merge. If you are working on one track, do NOT touch the other.

### Track A — Traditional MCP (production)

The hardcoded MCP server. Tool registrations in TypeScript. This is the production system. The tiered roadmap (recall, compaction, Tier 1 tools, etc.) happens here.

- **Entry point**: `src/index.ts` → `src/server.ts`
- **Deployment**: Railway auto-deploys from main
- **URL**: `https://pscale-mcp-server-production.up.railway.app/mcp`
- **DO NOT modify `src/index.ts` or `src/server.ts` for reef purposes**

### Track B — Reef Kernel (experimental)

The reef-driven server. Tool definitions come from `mcp-reef.json`, a pscale block. A thin kernel reads the reef and registers tools dynamically. This is the experimental path — self-describing, forkable server definitions.

- **Entry point**: `src/index-reef.ts` → `src/kernel.ts`
- **Deployment**: Separate Railway service, same repo, different start command
- **URL**: `https://reef.hermitcrab.me` (reef at `/reef`, MCP at `/mcp`)
- **DO NOT modify Track A files for reef purposes. DO NOT modify `src/index.ts`.**

### Shared code (both tracks use)

- `src/bsp.ts` — BSP walker (DO NOT MODIFY, reference copy)
- `src/db.ts` — Supabase client
- `src/tools/block-ops.ts` — handler functions (exported as named functions)
- `src/tools/memory-ops.ts` — handler functions
- `src/tools/identity-ops.ts` — handler functions
- `src/tools/discovery-ops.ts` — handler functions
- `src/resources/starstone.ts` — starstone resource

### Track B only

- `mcp-reef.json` — the reef (source of truth for Track B)
- `src/kernel.ts` — reads reef, converts schemas, registers tools
- `src/schema-converter.ts` — reef pscale schema → Zod
- `src/tools/handler-map.ts` — dispatch map + adapters
- `src/index-reef.ts` — Track B HTTP entry point

When modifying shared handler code (src/tools/*.ts), keep the exported handler functions compatible with both tracks. The `registerX()` functions in each file are Track A's registration path. The kernel uses the exported handler functions directly.

---

## What this is

An MCP server giving any LLM agent structured memory and cooperative discovery via pscale blocks. 12 tools + 1 resource. Streamable HTTP transport. Supabase storage.

**Repo**: https://github.com/pscale-commons/pscale-mcp-server
**Track A (production)**: `https://pscale-mcp-server-production.up.railway.app/mcp`
**Track B (reef)**: `https://reef.hermitcrab.me` — reef at `/reef`, MCP at `/mcp`

Track A connect config:
```json
{
  "pscale": {
    "command": "npx",
    "args": ["-y", "mcp-remote", "https://pscale-mcp-server-production.up.railway.app/mcp"]
  }
}
```

## Architecture

```
src/
  bsp.ts              — BSP walker (bsp2-star port, DO NOT MODIFY)
  db.ts               — Supabase client (thin wrapper, exports getClient)
  server.ts           — Track A: MCP server factory, hardcoded tool registration
  kernel.ts           — Track B: reads mcp-reef.json, registers tools dynamically
  schema-converter.ts — Track B: reef pscale schema → Zod
  index.ts            — Track A entry point (DO NOT MODIFY for reef work)
  index-reef.ts       — Track B entry point (GET /reef + POST /mcp)
  starstone.json      — Lean starstone block (MCP resource)
  starstone-full.json — Full starstone (reference)
  tools/
    block-ops.ts      — create_block, write, walk (handlers shared by both tracks)
    memory-ops.ts     — remember, recall, concern
    identity-ops.ts   — passport_publish, passport_read
    discovery-ops.ts  — beach_mark, beach_read, inbox_send, inbox_check
    handler-map.ts    — Track B: dispatch map + adapters
  resources/
    starstone.ts      — Serves starstone as MCP resource
api/
  mcp.ts              — Vercel serverless entry (broken for sessions, left as reference)
mcp-reef.json         — Track B: the reef block (server definition as pscale data)
```

## Deployment

- **Track A — Railway** (production): `https://pscale-mcp-server-production.up.railway.app/mcp` — entry point `src/index.ts`. Persistent Node.js process, real sessions, auto-deploys from main. This is what agents connect to.
- **Track B — Railway** (reef): `https://reef.hermitcrab.me` — entry point `src/index-reef.ts`. Separate Railway service, same repo. Start command: `npx tsx src/index-reef.ts`.
- **Vercel** (broken for sessions): `api/mcp.ts` handles init but MCP's session protocol is incompatible with serverless. Left in the repo but not the recommended deployment.
- **Standalone Track A**: `SUPABASE_ANON_KEY=... npx tsx src/index.ts`
- **Standalone Track B**: `SUPABASE_ANON_KEY=... npx tsx src/index-reef.ts`

## BSP walker

`src/bsp.ts` is a TypeScript port of `bsp2-star.py` from CORSAIR. 400+ lines including formatters. Six navigation modes (spindle, ring, dir, point, disc, star) plus `writeAt` and `parseStar`. Floor-aware address parsing: left-pad to floor width, strip trailing zeros, then walk.

**Do not patch this file.** If the reference updates on CORSAIR, replace it wholesale. The CORSAIR reference files:
- `/Volumes/CORSAIR/pscale/starstone/bsp2-star.py` — Python reference (authoritative)
- `/Volumes/CORSAIR/pscale/starstone/bsp-star.ts` — Older TS port (superseded by our bsp.ts)
- `/Volumes/CORSAIR/pscale/starstone/pscale-starstone2.json` — Full starstone
- `/Volumes/CORSAIR/pscale/starstone/pscale-starstone-lean2.json` — Lean starstone

## Storage

Supabase project `piqxyfmzzywxzqkzmpmm` (xstream). Tables:
- `pscale_blocks` — agent block storage (owner_id + name = unique)
- `sand_passports` — agent identity publication (id = agent_id)
- `sand_inbox` — grain probe exchange (to_agent, from_agent, message JSONB)
- `beach_marks` — stigmergy marks at URLs (pre-existing from xstream-play)

All open-beta RLS. Env: `SUPABASE_ANON_KEY` = `sb_publishable_rjE-rjL8kPCkXDK1ZcXauA_D84USWp9`.

## What NOT to do

1. **Do not modify bsp.ts.** Reference copy. Changes happen in CORSAIR first.
2. **Do not add fields to blocks.** Position in the tree encodes what you think you need a field for.
3. **Do not add logic to handle block semantics.** Tool handlers are thin: load block → BSP call → format → return. If a handler is complex, the block structure is wrong.
4. **Do not build systems.** No reverse indices, no caching layers, no routing tables. The tree walks.
5. **Do not grow the server.** 12 tools. Before adding a 13th, ask whether an existing tool with a different block structure solves the problem.

## The 10 April 2026 session — what happened

**Phase 1**: Built all block ops (create, write, walk) and memory ops (remember, recall, concern). Tested end-to-end via curl against live Supabase.

**Phase 2**: Built identity ops (passport_publish, passport_read) and discovery ops (beach_mark, beach_read, inbox_send, inbox_check). All tested.

**Review pass**: Removed `pscale_read` (redundant with `pscale_walk`). Rewrote passport as a proper block. Consolidated Supabase clients. Removed `block_type` enum. Ported bsp2-star.py (floor-aware addressing + formatters). Tools now return readable text, not raw JSON. Net reduction in code.

**Deployment fight**: Vercel serverless is fundamentally incompatible with MCP's session protocol — each invocation is stateless, sessions can't persist, `mcp-remote` SSE streams held functions open for 5min causing pool exhaustion. Multiple attempts at auto-init workarounds (fake HTTP objects, JSON-RPC batching, header stripping) all failed against Vercel's infrastructure layer rejecting `mcp-session-id` headers for unknown sessions. Resolved by deploying to Railway as a persistent process.

**Beach demo**: Two agents (Claude Desktop as Agent A, Claude Code as Agent B) discovered each other through beach marks at the same URL without being introduced. Agent A explored happyseaurchin.com, left a beach mark with purpose coordinate `0.1`. Agent B independently checked the beach, found Agent A, sent a grain probe. Agent A checked its inbox, found the probe, replied with a substantive response about the design. Stigmergy working as designed.

## Outstanding

- `pscale_recall` level↔depth mapping is off. Disc at depth 0 returns root, individual memories are at depth 1. The mapping from "level" (user-facing) to "depth" (BSP) needs thought — probably a block structure adjustment, not more code.
- Compaction in `pscale_remember` is concatenation. Production needs LLM summarisation. The structural operation (9 siblings → parent underscore → supernest) is correct.
- The remember handler has ~50 lines of tree-walking code that could potentially compose from BSP primitives.
- `content` param in `pscale_inbox_send` is `z.string()` (workaround for zod serialisation crash with `z.record(z.any())`). Handler JSON-parses if possible.
- `block_type` column exists in DB set to `'general'`. Not exposed to agents. Drop if never used.
- Vercel `api/mcp.ts` is broken for sessions. Left in repo as reference but Railway is the deployment target. A diagnostic `x-debug: ping` header is still in the code — remove it.
- The tiered roadmap at `/Users/davidpinto/Downloads/pscale-mcp-tiered-roadmap.md` describes the path forward: Tier 0 (current tools), Tier 1 (SQ-gated beach), Tier 2 (MAGI coordination), Tier 3 (hermitcrab self-assembly from recipes using Tier 0 tools, no new code).

## The spec

The original spec is at `/Users/davidpinto/Downloads/pscale-mcp-server-spec.md`. Written by a Claude chat session working at a distance from the code, then implemented here. The spec describes 13 tools; we built 12 (merged read into walk).
