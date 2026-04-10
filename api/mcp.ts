import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from '../src/server.js';

/**
 * Vercel serverless MCP endpoint.
 *
 * Strategy: for every POST, create a fresh server+transport. If the request
 * isn't an init, prepend an init message so the server is ready. The SDK's
 * handleRequest processes JSON-RPC batches, so we send [init, actualRequest]
 * as a batch and extract just the actual response.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, Accept');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'DELETE') return res.status(200).json({ jsonrpc: '2.0', result: {} });

  if (req.method === 'GET') {
    // SSE: acknowledge and close immediately (serverless can't hold connections)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.write(':ok\n\n');
    res.end();
    return;
  }

  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = req.body;
    const isInit = body?.method === 'initialize' ||
      (Array.isArray(body) && body.some((m: any) => m.method === 'initialize'));
    const isNotification = body?.method?.startsWith('notifications/');

    // Notifications don't need a response — acknowledge immediately
    if (isNotification && !isInit) {
      return res.status(202).end();
    }

    const sessionId = (req.headers['mcp-session-id'] as string) || randomUUID();

    const mcpServer = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
      enableJsonResponse: true,
    });
    await mcpServer.connect(transport);

    if (isInit) {
      await transport.handleRequest(req as any, res as any, body);
    } else {
      // Non-init: the transport validates mcp-session-id against its own
      // session BEFORE processing the body. Since this is a fresh transport,
      // no session exists yet. Fix: strip the header, send init+request as
      // a batch, so the transport sees an init (no session required) and
      // processes both messages.
      delete (req.headers as any)['mcp-session-id'];

      const initMsg = {
        jsonrpc: '2.0',
        id: '_auto_' + Date.now(),
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'vercel-auto', version: '0.1.0' },
        },
      };

      const batch = [initMsg, body];
      await transport.handleRequest(req as any, res as any, batch);
    }
  } catch (err: any) {
    console.error('MCP error:', err?.stack || err?.message || String(err));
    if (!res.headersSent) {
      return res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: err?.message || 'Internal error' },
      });
    }
  }
}
