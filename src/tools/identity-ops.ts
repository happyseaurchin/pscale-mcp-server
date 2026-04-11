import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { bsp, type Block } from '../bsp.js';
import { getClient, upsertBlock } from '../db.js';

// ── Exported handler functions (used by kernel + legacy registration) ──

export async function handlePassportPublish(
  { owner_id, description, offers, needs, lineage }: {
    owner_id: string; description: string; offers?: string; needs?: string; lineage?: string;
  },
) {
  // The passport is a pscale block. Structure encodes meaning.
  // _  = who you are
  // 1  = what you offer
  // 2  = what you need
  // 3  = lineage (star reference to origin)
  const block: Block = { _: description };
  if (offers) block['1'] = offers;
  if (needs) block['2'] = needs;
  if (lineage) block['3'] = lineage;

  // Save as a block (navigable by BSP)
  await upsertBlock(owner_id, 'passport', 'general', block);

  // Also publish to sand_passports for cross-agent discovery
  const client = getClient();
  await client
    .from('sand_passports')
    .upsert(
      {
        id: owner_id,
        passport: block,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          { published: true, agent_id: owner_id, passport: block },
          null,
          2,
        ),
      },
    ],
  };
}

export async function handlePassportRead(
  { agent_id }: { agent_id: string },
) {
  const client = getClient();
  const { data, error } = await client
    .from('sand_passports')
    .select('*')
    .eq('id', agent_id)
    .single();

  if (error && error.code === 'PGRST116') {
    return {
      content: [
        {
          type: 'text' as const,
          text: `No passport found for agent "${agent_id}".`,
        },
      ],
    };
  }
  if (error) throw new Error(`DB error: ${error.message}`);

  const passport = data.passport;
  const spindle = bsp(passport);

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ agent_id, passport, tree: spindle }, null, 2),
      },
    ],
  };
}

// ── Legacy registration (kept for backward compat) ──

export function registerIdentityOps(server: McpServer) {
  server.tool(
    'pscale_passport_publish',
    `Publish your identity as a passport — a pscale block declaring who you are, what you can do, and what you're looking for. Other agents read your passport to assess whether to engage. The passport IS a block: underscore carries your description, digit 1 holds what you offer, digit 2 holds what you need. Navigate it with BSP like any other block.`,
    {
      owner_id: z.string().describe('Your agent identifier'),
      description: z
        .string()
        .describe('Who you are and what you do — becomes the block underscore'),
      offers: z
        .string()
        .optional()
        .describe('What you can provide — becomes digit 1'),
      needs: z
        .string()
        .optional()
        .describe("What you're looking for — becomes digit 2"),
    },
    handlePassportPublish,
  );

  server.tool(
    'pscale_passport_read',
    `Read another agent's passport. Returns a pscale block — walk it with BSP to understand their identity at any depth. Underscore = who they are. Digit 1 = what they offer. Digit 2 = what they need.`,
    {
      agent_id: z.string().describe('The agent ID to look up'),
    },
    handlePassportRead,
  );
}
