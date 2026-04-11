/**
 * kernel.ts — The reef reader.
 *
 * Reads mcp-reef.json (a pscale block defining the server), walks section 1
 * for tool definitions, converts schemas, resolves handlers, registers tools.
 * The kernel walks and registers. No business logic.
 *
 * Section 1: tools by tier and function group
 * Section 2: resources
 * Section 3: connection metadata
 * Section 4: tier gates (SQL queries against live tables)
 * Section 5: identity and lineage
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reefSchemaToZod } from './schema-converter.js';
import { HANDLER_MAP, ADAPTERS } from './tools/handler-map.js';
import { collectUnderscore, type Block } from './bsp.js';
import { registerStarstone } from './resources/starstone.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Reef loading ──

function loadReef(): Block {
  const raw = readFileSync(join(__dirname, '..', 'mcp-reef.json'), 'utf-8');
  return JSON.parse(raw);
}

// ── Tier mapping ──
// Reef section 1 groups: 1-4 = Tier 0 (always on), 5 = Tier 1, 6 = Tier 2, 7 = Tier 3, 8 = Tier 4

function groupTier(groupKey: string): number {
  const n = parseInt(groupKey, 10);
  if (n <= 4) return 0;
  return n - 4;
}

// ── Tier gate evaluation ──
// For now, only Tier 0 is unlocked. SQL gate evaluation requires raw SQL
// execution which the Supabase JS client doesn't expose directly.
// Placeholder for future: create an RPC function or use pg connection.

async function evaluateTierGates(_reef: Block): Promise<Set<number>> {
  const unlocked = new Set<number>([0]);
  // TODO: Walk section 4, run SQL queries, check thresholds.
  // For now, Tier 0 tools are always available. Higher tiers activate
  // when gate evaluation is implemented.
  return unlocked;
}

// ── Tool registration from reef ──

function registerToolFromReef(
  server: McpServer,
  toolNode: Record<string, any>,
): boolean {
  const name = toolNode['1'];
  const description = toolNode['2'];
  const schemaNode = toolNode['3'];

  if (!name || typeof name !== 'string') return false;
  if (!description || typeof description !== 'string') return false;

  // Check if this is a resource, not a tool (section 1.7 items have "3": "resource")
  if (schemaNode === 'resource') return false;

  const handler = HANDLER_MAP[name];
  if (!handler) {
    console.log(`[kernel] No handler for "${name}" — stub (tier-gated or not yet implemented)`);
    return false;
  }

  // Convert reef schema to Zod shape
  const zodShape = schemaNode && typeof schemaNode === 'object'
    ? reefSchemaToZod(schemaNode)
    : {};

  // Apply adapter if the reef schema differs from handler expectations
  const adapter = ADAPTERS[name];
  const wrappedHandler = adapter
    ? async (args: Record<string, any>) => handler(adapter(args))
    : handler;

  server.tool(name, description, zodShape, wrappedHandler as any);
  return true;
}

// ── Main: build server from reef ──

export async function createReefServer(): Promise<McpServer> {
  const reef = loadReef();
  const unlockedTiers = await evaluateTierGates(reef);

  // Read server identity from reef section 5
  const identity = reef['5'] || {};
  const serverName = identity['1'] || 'pscale-mcp-server';

  // Build instructions from the reef's root underscore (truncated for MCP)
  const rootText = collectUnderscore(reef) || '';
  const instructions = rootText.length > 500 ? rootText.slice(0, 500) + '...' : rootText;

  const server = new McpServer(
    { name: serverName, version: '0.4.0' },
    { instructions },
  );

  // Walk section 1 — tool groups
  const toolsSection = reef['1'];
  let registered = 0;
  let skipped = 0;

  if (toolsSection && typeof toolsSection === 'object') {
    for (const groupKey of '123456789') {
      if (!(groupKey in toolsSection)) continue;

      const tier = groupTier(groupKey);
      if (!unlockedTiers.has(tier)) {
        // Count tools in this group for the skip message
        const group = toolsSection[groupKey];
        if (group && typeof group === 'object') {
          const toolCount = Object.keys(group).filter(k => k !== '_').length;
          console.log(`[kernel] Tier ${tier} locked — skipping group 1.${groupKey} (${toolCount} tools)`);
          skipped += toolCount;
        }
        continue;
      }

      const group = toolsSection[groupKey];
      if (!group || typeof group !== 'object') continue;

      const groupName = collectUnderscore(group) || `group ${groupKey}`;

      for (const toolKey of '123456789') {
        if (!(toolKey in group)) continue;
        const toolNode = group[toolKey];
        if (toolNode && typeof toolNode === 'object' && toolNode['1']) {
          if (registerToolFromReef(server, toolNode)) {
            registered++;
          }
        }
      }
    }
  }

  // Register resources — starstone (always available)
  registerStarstone(server);

  console.log(`[kernel] Reef loaded: ${registered} tools registered, ${skipped} tier-gated`);
  return server;
}

// ── Export reef for the /reef endpoint ──

export function getReefJson(): string {
  return readFileSync(join(__dirname, '..', 'mcp-reef.json'), 'utf-8');
}
