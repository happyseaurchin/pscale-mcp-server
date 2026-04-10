import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import starstone from '../starstone.json' with { type: 'json' };

export function registerStarstone(server: McpServer) {
  server.resource(
    'pscale_starstone',
    'pscale://starstone',
    {
      description:
        'The pscale self-teaching block. Read this to understand how pscale blocks work. The block teaches navigation by being navigable — walk it with pscale_walk to learn the mechanics.',
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
