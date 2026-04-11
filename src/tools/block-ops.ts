import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { bsp, writeAt, fmtResult, fmtDir, type Block, type BspResult } from '../bsp.js';
import { getBlock, upsertBlock, listBlocks } from '../db.js';

// ── Exported handler functions (used by kernel + legacy registration) ──

export async function handleCreateBlock(
  { owner_id, name, initial_content, block_type }: {
    owner_id: string; name: string; initial_content?: string; block_type?: string;
  },
) {
  const existing = await getBlock(owner_id, name);
  if (existing) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Block "${name}" already exists for ${owner_id}. Use pscale_write to modify it, or pscale_walk to navigate it.`,
        },
      ],
    };
  }

  const block: Block = { _: initial_content || '' };
  await upsertBlock(owner_id, name, block_type || 'general', block);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ created: true, name, block }, null, 2),
      },
    ],
  };
}

export async function handleWrite(
  { owner_id, name, address, content }: {
    owner_id: string; name: string; address: string; content: string;
  },
) {
  const row = await getBlock(owner_id, name);
  if (!row) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Block "${name}" not found. Create it first with pscale_create_block.`,
        },
      ],
    };
  }

  const block = row.block as Block;
  const writeAddress = address === '0' ? '_' : address;
  writeAt(block, writeAddress, content);

  await upsertBlock(owner_id, name, row.block_type, block);

  // Confirm with a spindle to the written address so the agent sees context
  const confirmation = bsp(block, address);
  return {
    content: [
      {
        type: 'text' as const,
        text: `Written to ${name} at ${address}.\n${fmtResult(confirmation)}`,
      },
    ],
  };
}

export async function handleWalk(
  { owner_id, name, address, mode }: {
    owner_id: string; name: string; address?: string; mode?: string;
  },
) {
  const row = await getBlock(owner_id, name);
  if (!row) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Block "${name}" not found for ${owner_id}.`,
        },
      ],
    };
  }

  const block = row.block as Block;
  const effectiveMode = mode || 'dir';
  let result;

  if (!address && effectiveMode === 'dir') {
    result = bsp(block);
  } else if (!address && effectiveMode === 'disc') {
    result = bsp(block, null, 1, 'disc');
  } else if (!address) {
    result = bsp(block);
  } else {
    switch (effectiveMode) {
      case 'spindle':
        result = bsp(block, address);
        break;
      case 'ring':
        result = bsp(block, address, 'ring');
        break;
      case 'dir':
        result = bsp(block, address, 'dir');
        break;
      case 'point':
        result = bsp(block, address, 0, 'point');
        break;
      case 'disc':
        result = bsp(block, null, parseInt(address, 10), 'disc');
        break;
      case 'star':
        result = bsp(block, address, '*');
        break;
    }
  }

  const label = address
    ? `[${name} ${address} ${effectiveMode}]`
    : `[${name} ${effectiveMode}]`;

  return {
    content: [
      { type: 'text' as const, text: `${label}\n${fmtResult(result!)}` },
    ],
  };
}

// ── Legacy registration (kept for backward compat) ──

export function registerBlockOps(server: McpServer) {
  server.tool(
    'pscale_create_block',
    `Create a new pscale block — a structured JSON tree that compacts gracefully over time. The block starts with an underscore (the summary/spine) and numbered entries branch from it. Use for project context, research, or any information you want to navigate later.`,
    {
      owner_id: z.string().describe('Your agent/user identifier'),
      name: z.string().describe("Block name (e.g. 'project-notes', 'research-q4')"),
      initial_content: z
        .string()
        .optional()
        .describe(
          'What this block is about. Becomes the underscore — the root summary that all deeper content branches from.',
        ),
    },
    handleCreateBlock,
  );

  server.tool(
    'pscale_write',
    `Write content to a specific address in a pscale block. Address '1' writes to digit 1 at the root. Address '3.2' writes to digit 2 inside digit 3. Address '0' writes to the underscore (summary). Creates intermediate nodes as needed.`,
    {
      owner_id: z.string(),
      name: z.string(),
      address: z
        .string()
        .describe(
          "Pscale address to write to. '1' through '9' for root entries. '3.2' for nested. '0' for underscore.",
        ),
      content: z.string().describe('Text content to write at this address.'),
    },
    handleWrite,
  );

  server.tool(
    'pscale_walk',
    `Navigate a pscale block. This is the only navigation tool you need. Six modes:

- 'spindle' (default): walk from root to address, collecting text at every level — broad to specific context
- 'ring': see siblings at the same level as your address
- 'dir': full tree from address downward (or entire block if no address)
- 'point': single node at the address
- 'disc': all nodes at a given depth across the whole tree
- 'star': hidden directory at the address (cross-block references)

Start with 'dir' to see the whole block, then 'spindle' to drill into an address.`,
    {
      owner_id: z.string(),
      name: z.string(),
      address: z
        .string()
        .optional()
        .describe("Pscale address (e.g. '1', '3.2'). Omit for full block."),
      mode: z
        .enum(['spindle', 'ring', 'dir', 'point', 'disc', 'star'])
        .default('dir')
        .describe('Navigation mode. Default: dir (full tree).'),
    },
    handleWalk,
  );
}
