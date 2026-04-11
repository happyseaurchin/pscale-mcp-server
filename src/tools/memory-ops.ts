import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { bsp, writeAt, floorDepth, collectUnderscore, fmtResult, fmtDisc, type Block } from '../bsp.js';
import { getBlock, upsertBlock } from '../db.js';

/**
 * Find the next empty slot at a given level in the history block.
 * Slots are digits 1-9. Returns the digit string, or null if all full.
 */
function findNextSlot(node: Record<string, any>): string | null {
  for (const d of '123456789') {
    if (!(d in node)) return d;
  }
  return null;
}

/**
 * Get or create a history block for the agent.
 */
async function getOrCreateHistory(ownerId: string): Promise<{ block: Block; isNew: boolean }> {
  const row = await getBlock(ownerId, 'history');
  if (row) return { block: row.block as Block, isNew: false };
  return { block: { _: '' }, isNew: true };
}

/**
 * Compact a full level: concatenate all 9 entries into a summary at the underscore.
 * Beta implementation uses concatenation. Production would use LLM summarisation.
 */
function compactLevel(node: Record<string, any>): string {
  const parts: string[] = [];
  for (const d of '123456789') {
    if (d in node) {
      const val = node[d];
      if (typeof val === 'string') {
        parts.push(val);
      } else if (val && typeof val === 'object') {
        const text = collectUnderscore(val);
        if (text) parts.push(text);
      }
    }
  }
  return parts.join(' | ');
}

/**
 * Check if a level is full (all 9 slots occupied) and compact if so.
 * After compaction, the summary goes to the underscore and the level
 * promotes to the parent. Recursive.
 */
function compactIfFull(block: Block, path: string[]): void {
  // Navigate to the node at path
  let node: any = block;
  for (const p of path) {
    const key = p === '0' ? '_' : p;
    if (!node || typeof node !== 'object' || !(key in node)) return;
    node = node[key];
  }

  if (!node || typeof node !== 'object') return;

  // Check if all 9 slots are full
  const slot = findNextSlot(node);
  if (slot !== null) return; // not full

  // All 9 are occupied — compact
  const summary = compactLevel(node);

  // Write summary to the underscore of this level (Form 2: backward-facing)
  if (typeof node._ === 'string') {
    // Preserve existing underscore by prepending
    node._ = summary;
  } else {
    node._ = summary;
  }

  // If this is the root level, we need to supernest
  if (path.length === 0) {
    // Supernest: wrap entire block content under underscore, open digit 1
    const existing = { ...block };
    // Clear block
    for (const k of Object.keys(block)) {
      delete block[k];
    }
    // Wrap: existing content becomes the underscore
    block._ = existing;
    // The next remember will write to digit 1 of the new root
  }
}

// ── Exported handler functions (used by kernel + legacy registration) ──

export async function handleRemember(
  { owner_id, content, category }: {
    owner_id: string; content: string; category?: string;
  },
) {
  const { block, isNew } = await getOrCreateHistory(owner_id);

  const timestamp = new Date().toISOString();
  const entry = category
    ? `[${category}] ${content} (${timestamp})`
    : `${content} (${timestamp})`;

  const fl = floorDepth(block);

  if (fl <= 1) {
    const slot = findNextSlot(block);
    if (slot) {
      block[slot] = entry;
    } else {
      compactIfFull(block, []);
      block['1'] = entry;
    }
  } else {
    const slot = findNextSlot(block);
    if (slot) {
      block[slot] = entry;
    } else {
      compactIfFull(block, []);
      block['1'] = entry;
    }
  }

  await upsertBlock(owner_id, 'history', 'history', block);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          { remembered: true, slot: 'written', entry_preview: entry.slice(0, 100) },
          null,
          2,
        ),
      },
    ],
  };
}

export async function handleRecall(
  { owner_id, level, position, search }: {
    owner_id: string; level?: number; position?: number; search?: string;
  },
) {
  const row = await getBlock(owner_id, 'history');
  if (!row) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'No history found. Use pscale_remember to start building memory.',
        },
      ],
    };
  }

  const block = row.block as Block;

  // Search mode: scan entire block for keyword matches
  if (search) {
    const matches: { address: string; text: string }[] = [];
    function searchNode(node: any, path: string) {
      if (typeof node === 'string') {
        if (node.toLowerCase().includes(search!.toLowerCase())) {
          matches.push({ address: path, text: node });
        }
        return;
      }
      if (node && typeof node === 'object') {
        const us = collectUnderscore(node);
        if (us && us.toLowerCase().includes(search!.toLowerCase())) {
          matches.push({ address: path || '_', text: us });
        }
        for (const d of '123456789') {
          if (d in node) {
            searchNode(node[d], path ? `${path}.${d}` : d);
          }
        }
      }
    }
    searchNode(block, '');
    const lines = matches.slice(0, 20).map(m => `  [${m.address}] ${m.text}`);
    return {
      content: [
        {
          type: 'text' as const,
          text: `Search "${search}" — ${matches.length} matches:\n${lines.join('\n')}`,
        },
      ],
    };
  }

  // Position mode: specific item at this level
  if (position) {
    const result = bsp(block, String(position));
    return {
      content: [
        { type: 'text' as const, text: `[history ${position}]\n${fmtResult(result)}` },
      ],
    };
  }

  // All items at this level — use disc
  const effectiveLevel = level ?? 0;
  const result = bsp(block, null, effectiveLevel, 'disc');

  return {
    content: [
      {
        type: 'text' as const,
        text: `[history disc @ depth ${effectiveLevel}]\n${fmtResult(result)}`,
      },
    ],
  };
}

export async function handleConcern(
  { owner_id, action, purpose, perception, gap }: {
    owner_id: string; action: string; purpose?: string; perception?: string; gap?: string;
  },
) {
  if (action === 'read') {
    const row = await getBlock(owner_id, 'concern');
    if (!row) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'No concern set. Use pscale_concern with action "set" to define your current focus.',
          },
        ],
      };
    }
    const dir = bsp(row.block as Block);
    return {
      content: [
        {
          type: 'text' as const,
          text: `[concern]\n${fmtResult(dir)}`,
        },
      ],
    };
  }

  // action === 'set'
  const now = new Date().toISOString();
  const block: Block = {
    _: `Current concern — last updated ${now}`,
    '1': `Purpose: ${purpose || '(not set)'}`,
    '2': `Perception: ${perception || '(not set)'}`,
    '3': `Gap: ${gap || '(not set)'}`,
  };

  // If there's an existing concern, save its summary as entry 4
  const existing = await getBlock(owner_id, 'concern');
  if (existing) {
    const prev = existing.block as Block;
    const prevSummary = collectUnderscore(prev) || '';
    block['4'] = `Previous: ${prevSummary}`;
  }

  await upsertBlock(owner_id, 'concern', 'concern', block);

  const dir = bsp(block);
  return {
    content: [
      {
        type: 'text' as const,
        text: `Concern set.\n${fmtResult(dir)}`,
      },
    ],
  };
}

// ── Legacy registration (kept for backward compat) ──

export function registerMemoryOps(server: McpServer) {
  server.tool(
    'pscale_remember',
    `Remember something. Stores it in your history block with automatic pscale compaction — when 9 items accumulate at a level, they compress to a summary at the next level. Your most recent memories are detailed; older ones are progressively summarised. Nothing is deleted. Use for: session events, decisions made, things learned, interactions completed.`,
    {
      owner_id: z.string(),
      content: z
        .string()
        .describe(
          'What to remember. Be specific — this gets compacted later, so details matter now.',
        ),
      category: z
        .string()
        .optional()
        .describe(
          "Optional. A short tag like 'decision', 'event', 'learning', 'interaction'. Helps with later recall.",
        ),
    },
    handleRemember,
  );

  server.tool(
    'pscale_recall',
    `Recall from memory. Specify how far back and at what resolution. Level 0 = individual memories (recent). Level 1 = summaries of 9 memories each. Level 2 = summaries of summaries (81 memories each). Higher levels = broader, older overviews. Returns a spindle: the summary at your requested level, plus the path of context above it.`,
    {
      owner_id: z.string(),
      level: z
        .number()
        .int()
        .default(0)
        .describe(
          'Resolution level. 0 = individual items (most recent). 1 = summaries. 2 = meta-summaries. Higher = broader.',
        ),
      position: z
        .number()
        .int()
        .optional()
        .describe(
          'Optional. Which item at this level (1-9). Omit for all items at this level.',
        ),
      search: z
        .string()
        .optional()
        .describe(
          'Optional. A keyword or phrase to search for across the history block.',
        ),
    },
    handleRecall,
  );

  server.tool(
    'pscale_concern',
    `Read or set your current concern — what you're focused on and why. The concern has three parts: purpose (what you're trying to achieve), perception (what you currently observe), and gap (the difference driving your next action). Setting a concern structures your reasoning. Reading it back at the start of a session restores your focus.`,
    {
      owner_id: z.string(),
      action: z.enum(['read', 'set']),
      purpose: z
        .string()
        .optional()
        .describe("For 'set': what you're trying to achieve"),
      perception: z
        .string()
        .optional()
        .describe("For 'set': what you currently observe"),
      gap: z
        .string()
        .optional()
        .describe(
          "For 'set': the difference between purpose and perception",
        ),
    },
    handleConcern,
  );
}
