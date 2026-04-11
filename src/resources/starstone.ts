import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import starstone from '../starstone.json' with { type: 'json' };

export function registerStarstone(server: McpServer) {
  server.resource(
    'pscale_starstone',
    'pscale://starstone',
    {
      description:
        'The pscale starstone v3 — a complete self-unpacking specification of the pscale block format and BSP navigation. Teaches by being: every spindle through this block delivers both an explanation and a structural demonstration. Covers: format (underscore, digits, nesting), BSP (all 6 modes), implementation spec, hidden directories, star operator, and block sign (plus/minus). Walk it with pscale_walk to learn the mechanics.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          text: JSON.stringify(starstone, null, 2),
          mimeType: 'application/json',
        },
      ],
    }),
  );
}
