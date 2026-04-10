# pscale-mcp-server

## To the next instance — before you touch anything

You are not building a normal MCP server. You are building infrastructure for a different kind of computation, and if you treat it as a normal coding project you will produce something that works technically and fails entirely at its purpose.

The purpose is not "give agents memory tools." Any key-value store does that. The purpose is to give agents memory that has structure — structure that compacts without losing navigability, that links across boundaries without routing tables, that encodes temporal scale and priority and type in position rather than metadata. The agents using this MCP server don't just store and retrieve. They accumulate a self-organising structure that gets richer over time. That's the revolution. If the tools you build flatten that structure into conventional CRUD, you've built a worse database with extra steps.

### What this means for how you work

Every LLM has been trained on millions of lines of conventional code. Your instincts are tuned to solve problems by adding code, fields, handlers, abstractions. Those instincts are precisely wrong here, because this project has already solved those problems in a fundamentally different way — through the structure of the data itself.

The JSON nesting level is not a container for data. It IS the data. Depth encodes temporal scale, priority, type. Position encodes relationships. The underscore chain encodes the semantic spine. The star operator encodes cross-references. None of these need code to interpret them. The BSP walker just walks. The structure does the work.

When you want to add something, stop and ask:
- **"We need a field for X"** → Is X already encoded in the node's depth, its parent, its position among siblings? Almost certainly yes.
- **"We need a function to compute Y"** → Can BSP already walk to Y? Can a disc query or a ring query surface it?
- **"We need a system to manage Z"** → Is Z already emergent from how blocks reference each other through star?

If the server code is getting bigger, you are adding a layer of indirection that the pscale design already eliminated. The correct move is usually to step back and re-read the block structure.

### The trap is invisible

Previous CC instances working on the hermitcrab kernel all fell into this trap. Each one thought they understood after reading the warning. Each one reverted to traditional patterns within their first piece of work. The reversion is automatic — you won't notice you're doing it until David points it out. It looks like good engineering. It's redundant engineering.

The phrase from an earlier instance: "The JSON is not storing instructions for a program. The JSON IS the program, and the kernel is the electricity." Every time they forgot this, they built something redundant. Every time they remembered it, the code got simpler.

---

## What this is

An MCP server that gives any LLM agent structured memory and cooperative discovery via pscale blocks. 13 tools + 1 resource. Streamable HTTP transport. Supabase storage.

**Repo**: https://github.com/happyseaurchin/pscale-mcp-server

## Project structure

```
src/
  bsp.ts              — BSP walker (CORSAIR reference, DO NOT MODIFY)
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

`src/bsp.ts` is 359 lines copied from the CORSAIR reference implementation (`/Volumes/CORSAIR/pscale/starstone/bsp-star.ts`). Six modes:
- **spindle**: root-to-target chain (broad → specific)
- **ring**: siblings at terminal
- **dir**: full tree or subtree
- **point**: single node at pscale level
- **disc**: all nodes at a given depth across branches
- **star**: hidden directory at terminal (cross-block references)

If the reference updates, this file gets replaced wholesale. Do not patch it.

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

Server starts on `http://localhost:3000/mcp`.

## Deployment

- Vercel auto-deploys from `main` via `api/mcp.ts`
- Vercel project: under team `happyseaurchins-projects`
- Standalone: `npx tsx src/index.ts` on any Node.js host

## What NOT to do

1. **Do not modify bsp.ts.** It's a reference copy. Change happens in CORSAIR first.
2. **Do not add fields to blocks.** Position in the tree encodes what you think you need a field for.
3. **Do not add logic to handle block semantics.** Tool handlers are thin wrappers around BSP calls. If a handler is getting complex, the block structure is wrong, not the code.
4. **Do not build systems.** No reverse indices, no caching layers, no routing tables. The tree walks. That's the system.
5. **Do not grow the server.** 13 tools is already a lot. Before adding a 14th, ask whether an existing tool with a different block structure solves the problem.

## The starstone

`src/starstone.json` teaches pscale by being pscale. Three branches form a cycle: walk → compose → recurse → walk. An agent reads it as an MCP resource and learns the format by navigating it.

## CORSAIR reference files

- `/Volumes/CORSAIR/pscale/starstone/bsp-star.ts` — BSP walker (TypeScript)
- `/Volumes/CORSAIR/pscale/starstone/bsp2-star.py` — BSP walker (Python, latest)
- `/Volumes/CORSAIR/pscale/starstone/pscale-starstone2.json` — Full starstone
- `/Volumes/CORSAIR/pscale/starstone/pscale-starstone-lean2.json` — Lean starstone

## Session conventions

- `git fetch origin && git rebase origin/main` before starting work.
- Commit, push, merge before session ends.
- Run the server and test with curl before pushing changes.

## What was built in the first session (10 April 2026)

Phase 1 (block ops + memory ops) and Phase 2 (identity + discovery SAND) were built and tested end-to-end in a single session. All 13 tools verified via curl against live Supabase. Database migrations applied. The spec is at `/Users/davidpinto/Downloads/pscale-mcp-server-spec.md`.

Outstanding:
- Vercel deployment not yet configured (project not created on Vercel yet)
- `pscale_recall` level-based navigation needs refinement — disc at depth 0 returns root, individual memories are at depth 1. The mapping from "level" (user-facing) to "depth" (BSP) needs thought. This might be a case where the block structure should be adjusted rather than adding code.
- Compaction in `pscale_remember` is basic (concatenation). Production would use LLM summarisation, but the structure (9 siblings compact to parent underscore) is correct.
- The `content` parameter in `pscale_inbox_send` was changed from `z.record(z.any())` to `z.string()` because zod record schemas crash `tools/list` serialisation. The handler JSON-parses the string if possible. This is a workaround, not a design choice.
