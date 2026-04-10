import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerBlockOps } from './tools/block-ops.js';
import { registerMemoryOps } from './tools/memory-ops.js';
import { registerStarstone } from './resources/starstone.js';

export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: 'pscale-mcp-server',
      version: '0.1.0',
    },
    {
      instructions:
        'Pscale MCP server — structured memory for LLM agents. Use pscale_remember/pscale_recall for simple memory. Use pscale_create_block/pscale_read/pscale_write/pscale_walk for full block operations. Read the pscale_starstone resource to understand the block format.',
    },
  );

  registerBlockOps(server);
  registerMemoryOps(server);
  registerStarstone(server);

  return server;
}
