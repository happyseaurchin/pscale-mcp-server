import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://piqxyfmzzywxzqkzmpmm.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

function getClient() {
  if (!supabaseKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY is required');
  return createClient(supabaseUrl, supabaseKey);
}

/** Hash a URL to match beach_marks schema (same as xstream-play) */
function hashUrl(url: string): string {
  return createHash('sha256').update(url.trim().toLowerCase()).digest('hex').slice(0, 16);
}

export function registerDiscoveryOps(server: McpServer) {
  // ── pscale_beach_mark ──

  server.tool(
    'pscale_beach_mark',
    `Leave a trace at a URL — declaring that you visited and why. Other agents visiting the same URL can find your mark and follow it back to your passport. This is cooperative visibility — you're helping other agents find you.`,
    {
      owner_id: z.string().describe('Your agent identifier'),
      url: z.string().describe('The URL you\'re marking (will be hashed)'),
      purpose_coordinate: z
        .string()
        .describe(
          "A pscale coordinate for why you're at this URL (e.g. '0.34' for trust evaluation)",
        ),
    },
    async ({ owner_id, url, purpose_coordinate }) => {
      const url_hash = hashUrl(url);
      const client = getClient();

      const { data, error } = await client
        .from('beach_marks')
        .insert({
          url_hash,
          agent_id: owner_id,
          passport_url: null, // will be set when passport URLs are implemented
          purpose: purpose_coordinate,
        })
        .select()
        .single();

      if (error) {
        // Rate limit check: beach_marks has a 10-min rate limit per agent per URL
        if (error.message?.includes('duplicate') || error.code === '23505') {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Already marked this URL recently. Beach marks have a rate limit.`,
              },
            ],
          };
        }
        throw new Error(`DB error: ${error.message}`);
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                marked: true,
                url_hash,
                purpose: purpose_coordinate,
                agent_id: owner_id,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── pscale_beach_read ──

  server.tool(
    'pscale_beach_read',
    `Read who else has visited a URL and why. Returns a list of marks — each with a timestamp, agent reference, and purpose coordinate. Use this to discover agents working in the same domain. Follow their agent IDs to read their passports.`,
    {
      url: z.string().describe('The URL to check for marks'),
      limit: z
        .number()
        .int()
        .default(20)
        .describe('Max marks to return (default 20)'),
    },
    async ({ url, limit }) => {
      const url_hash = hashUrl(url);
      const client = getClient();

      const { data, error } = await client
        .from('beach_marks')
        .select('*')
        .eq('url_hash', url_hash)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw new Error(`DB error: ${error.message}`);

      const marks = (data || []).map((m: any) => ({
        agent_id: m.agent_id,
        purpose: m.purpose,
        passport_url: m.passport_url,
        timestamp: m.created_at,
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { url_hash, mark_count: marks.length, marks },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── pscale_inbox_send ──

  server.tool(
    'pscale_inbox_send',
    `Send a message to another agent's inbox — typically a grain probe initiating engagement. Include a spindle from your own block representing why you want to connect. The receiving agent compares your spindle against their own blocks to assess resonance.`,
    {
      from_agent: z.string().describe('Your agent identifier'),
      to_agent: z.string().describe('Target agent identifier'),
      message_type: z
        .enum(['grain_probe', 'grain_response', 'general'])
        .describe('Message type'),
      spindle: z
        .string()
        .optional()
        .describe(
          'A pscale address from your block representing your intent',
        ),
      content: z
        .string()
        .optional()
        .describe('The message content — free text or JSON string'),
      responding_to: z
        .string()
        .optional()
        .describe(
          "If responding to a probe: the address you're responding to",
        ),
    },
    async ({ from_agent, to_agent, message_type, spindle, content, responding_to }) => {
      const client = getClient();

      // Try to parse content as JSON, fall back to string
      let parsedContent: any = content;
      if (content) {
        try { parsedContent = JSON.parse(content); } catch { /* keep as string */ }
      }

      const message = {
        type: message_type,
        ...(spindle ? { spindle } : {}),
        ...(parsedContent ? { content: parsedContent } : {}),
        ...(responding_to ? { responding_to } : {}),
        sent_at: new Date().toISOString(),
      };

      const { data, error } = await client
        .from('sand_inbox')
        .insert({
          to_agent,
          from_agent,
          message,
          read: false,
        })
        .select()
        .single();

      if (error) throw new Error(`DB error: ${error.message}`);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                sent: true,
                to: to_agent,
                from: from_agent,
                type: message_type,
                id: data.id,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── pscale_inbox_check ──

  server.tool(
    'pscale_inbox_check',
    `Check your inbox for messages from other agents. Returns unread messages, typically grain probes from agents that discovered you via the beach.`,
    {
      owner_id: z.string().describe('Your agent identifier'),
      unread_only: z
        .boolean()
        .default(true)
        .describe('Only return unread messages (default: true)'),
    },
    async ({ owner_id, unread_only }) => {
      const client = getClient();

      let query = client
        .from('sand_inbox')
        .select('*')
        .eq('to_agent', owner_id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (unread_only) {
        query = query.eq('read', false);
      }

      const { data, error } = await query;
      if (error) throw new Error(`DB error: ${error.message}`);

      const messages = (data || []).map((m: any) => ({
        id: m.id,
        from: m.from_agent,
        message: m.message,
        read: m.read,
        received_at: m.created_at,
      }));

      // Mark as read
      if (unread_only && messages.length > 0) {
        const ids = messages.map((m: any) => m.id);
        await client
          .from('sand_inbox')
          .update({ read: true })
          .in('id', ids);
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { inbox_count: messages.length, messages },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
