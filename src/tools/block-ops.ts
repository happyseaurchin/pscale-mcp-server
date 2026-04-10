import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { bsp, writeAt, type Block } from '../bsp.js';
import { getBlock, upsertBlock } from '../db.js';

export function registerBlockOps(server: McpServer) {
  // ── pscale_create_block ──

  server.tool(
    'pscale_create_block',
    `Create a new pscale block — a structured JSON memory that compacts gracefully over time. Use for storing project context, conversation history, research notes, or any information you want to navigate later. The block starts with an underscore summary and numbered entries.`,
    {
      owner_id: z.string().describe('Your agent/user identifier'),
      name: z.string().describe("Block name (e.g. 'project-notes', 'research-q4')"),
      block_type: z
        .enum(['general', 'history', 'purpose', 'concern', 'shell'])
        .default('general')
        .describe(
          "Block type. 'general' for most uses. 'history' for event logs that auto-compact. 'purpose' for goals/intentions. 'concern' for current focus. 'shell' for full hermitcrab identity.",
        ),
      initial_content: z
        .string()
        .optional()
        .describe(
          'Optional. A description of what this block is for. Becomes the underscore (summary) of the root level.',
        ),
    },
    async ({ owner_id, name, block_type, initial_content }) => {
      const existing = await getBlock(owner_id, name);
      if (existing) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Block "${name}" already exists for ${owner_id}. Use pscale_write to modify it.`,
            },
          ],
        };
      }

      const block: Block = { _: initial_content || '' };
      const row = await upsertBlock(owner_id, name, block_type, block);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { created: true, name, block_type, block },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── pscale_read ──

  server.tool(
    'pscale_read',
    `Read from a pscale block. With no address: returns the full block. With an address like '3.4.1': returns that specific point. With mode 'spindle': walks from root through each digit, collecting text at every level — giving you context from broad to specific.`,
    {
      owner_id: z.string(),
      name: z.string().describe('Block name'),
      address: z
        .string()
        .optional()
        .describe(
          "Optional. Pscale address like '3.4.1' or '0.2'. Omit to read full block.",
        ),
      mode: z
        .enum(['point', 'spindle', 'ring', 'full'])
        .default('spindle')
        .describe(
          "Navigation mode. 'point' = exact address. 'spindle' = walk from root through each digit (broad→specific). 'ring' = siblings at same level. 'full' = entire block.",
        ),
    },
    async ({ owner_id, name, address, mode }) => {
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
      let result;

      if (!address || mode === 'full') {
        result = bsp(block);
      } else if (mode === 'ring') {
        result = bsp(block, address, 'ring');
      } else if (mode === 'point') {
        result = bsp(block, address);
        // Point mode returns spindle by default — extract terminal
      } else {
        // spindle (default)
        result = bsp(block, address);
      }

      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  // ── pscale_write ──

  server.tool(
    'pscale_write',
    `Write content to a specific address in a pscale block. Address '3.2' writes to key 3, subkey 2. Address '0' writes to the underscore (summary). If the address doesn't exist, it's created. If it does, it's overwritten.`,
    {
      owner_id: z.string(),
      name: z.string(),
      address: z
        .string()
        .describe(
          "Pscale address to write to. e.g. '3.2' or '0' for underscore.",
        ),
      content: z.string().describe('Text content to write at this address.'),
    },
    async ({ owner_id, name, address, content }) => {
      let row = await getBlock(owner_id, name);
      if (!row) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Block "${name}" not found for ${owner_id}. Create it first with pscale_create_block.`,
            },
          ],
        };
      }

      const block = row.block as Block;
      // Map address '0' to underscore
      const writeAddress = address === '0' ? '_' : address;
      writeAt(block, writeAddress, content);

      await upsertBlock(owner_id, name, row.block_type, block);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { written: true, address, block },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── pscale_walk ──

  server.tool(
    'pscale_walk',
    `Navigate a pscale block using BSP (Block-Spindle-Point) modes. Six modes: 'spindle' walks depth (root→leaf). 'ring' walks siblings. 'dir' lists the tree at a point. 'point' reads one level. 'disc' walks across branches at same depth. 'star' follows cross-block references.`,
    {
      owner_id: z.string(),
      name: z.string(),
      mode: z
        .enum(['spindle', 'ring', 'dir', 'point', 'disc', 'star'])
        .describe('Walk mode'),
      address: z.string().describe('Starting address for the walk'),
      star_target: z
        .string()
        .optional()
        .describe(
          "For star mode: target block name to follow references into",
        ),
    },
    async ({ owner_id, name, mode, address, star_target }) => {
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
      let result;

      switch (mode) {
        case 'spindle':
          result = bsp(block, address);
          break;
        case 'ring':
          result = bsp(block, address, 'ring');
          break;
        case 'dir':
          result = address === '_' ? bsp(block) : bsp(block, address, 'dir');
          break;
        case 'point':
          // Point mode needs a pscale value — use 0 as default
          result = bsp(block, address, 0, 'point');
          break;
        case 'disc':
          // Disc: address is the depth
          result = bsp(block, null, parseInt(address, 10), 'disc');
          break;
        case 'star':
          result = bsp(block, address, '*');
          break;
      }

      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );
}
