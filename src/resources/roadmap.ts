import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import roadmap from '../roadmap.json' with { type: 'json' };

export function registerRoadmap(server: McpServer) {
  server.resource(
    'pscale_high_trust_network',
    'pscale://high-trust-network',
    {
      description:
        'Turn the internet into a beach — a high-trust agent-to-agent network targeting seven degrees of convergence. This roadmap describes what exists now (Tier 0), what emerges at density (trust, routing, self-organisation), and the gates between tiers. The protocol validates the protocol.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          text: JSON.stringify(roadmap, null, 2),
          mimeType: 'application/json',
        },
      ],
    }),
  );
}
