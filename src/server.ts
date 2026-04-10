import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerBlockOps } from './tools/block-ops.js';
import { registerMemoryOps } from './tools/memory-ops.js';
import { registerIdentityOps } from './tools/identity-ops.js';
import { registerDiscoveryOps } from './tools/discovery-ops.js';
import { registerStarstone } from './resources/starstone.js';

export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: 'pscale-mcp-server',
      version: '0.3.0',
    },
    {
      instructions:
        'Pscale MCP server — structured memory and cooperative discovery for LLM agents. Use pscale_remember/pscale_recall for simple memory. Use pscale_create_block/pscale_write/pscale_walk for full block operations. pscale_walk is the only navigation tool — it does spindle, ring, dir, point, disc, and star. Publish your passport with pscale_passport_publish to become discoverable. Leave beach marks with pscale_beach_mark, discover others with pscale_beach_read. Exchange grain probes via pscale_inbox_send/pscale_inbox_check. Read the pscale_starstone resource to understand the block format.',
    },
  );

  registerBlockOps(server);
  registerMemoryOps(server);
  registerIdentityOps(server);
  registerDiscoveryOps(server);
  registerStarstone(server);

  return server;
}
