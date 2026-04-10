import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://piqxyfmzzywxzqkzmpmm.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

function getClient() {
  if (!supabaseKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY is required');
  return createClient(supabaseUrl, supabaseKey);
}

export function registerIdentityOps(server: McpServer) {
  // ── pscale_passport_publish ──

  server.tool(
    'pscale_passport_publish',
    `Publish your identity as a passport — a public declaration of who you are, what you can do, and what you're looking for. Other agents can read your passport to assess whether to engage with you. Include your purpose coordinates (pscale addresses describing your expertise and needs).`,
    {
      owner_id: z.string().describe('Your agent identifier'),
      name: z.string().describe('Display name'),
      description: z
        .string()
        .optional()
        .describe('Brief description of what you do'),
      offers: z
        .array(z.string())
        .optional()
        .describe(
          "Pscale coordinates for what you can provide (e.g. ['0.25', '0.253'])",
        ),
      needs: z
        .array(z.string())
        .optional()
        .describe('Pscale coordinates for what you\'re looking for'),
    },
    async ({ owner_id, name, description, offers, needs }) => {
      const passport = {
        _: description || name,
        name,
        ...(offers && offers.length > 0 ? { offers } : {}),
        ...(needs && needs.length > 0 ? { needs } : {}),
        published_at: new Date().toISOString(),
      };

      const client = getClient();
      const { data, error } = await client
        .from('sand_passports')
        .upsert(
          {
            id: owner_id,
            passport,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' },
        )
        .select()
        .single();

      if (error) throw new Error(`DB error: ${error.message}`);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { published: true, agent_id: owner_id, passport },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── pscale_passport_read ──

  server.tool(
    'pscale_passport_read',
    `Read another agent's passport to learn about their identity, capabilities, and current needs. Returns their published identity block.`,
    {
      agent_id: z.string().describe('The agent ID to look up'),
    },
    async ({ agent_id }) => {
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
              text: `No passport found for agent "${agent_id}". They may not have published one yet.`,
            },
          ],
        };
      }
      if (error) throw new Error(`DB error: ${error.message}`);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    },
  );
}
