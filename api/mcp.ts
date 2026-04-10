import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from '../src/server.js';

/**
 * Vercel serverless MCP endpoint.
 *
 * Every POST creates a fresh server+transport. ALL requests — even tool calls —
 * are wrapped in a batch with init prepended. The mcp-session-id header is
 * always stripped so the SDK doesn't try session validation on a fresh transport.
 *
 * The client gets back a JSON-RPC batch response: [initResult, actualResult].
 * mcp-remote handles batch responses correctly.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, Accept');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'DELETE') return res.status(200).json({ jsonrpc: '2.0', result: {} });

  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.write(':ok\n\n');
    res.end();
    return;
  }

  if (req.method !== 'POST') return res.status(405).end();

  try {
    // ALWAYS strip session header — this is a stateless endpoint
    delete (req as any).headers['mcp-session-id'];

    const body = req.body;
    const isInit = body?.method === 'initialize' ||
      (Array.isArray(body) && body.some((m: any) => m.method === 'initialize'));
    const isNotification = !isInit && (body?.method?.startsWith('notifications/') ||
      (Array.isArray(body) && body.every((m: any) => !m.id)));

    // Notifications: acknowledge immediately
    if (isNotification) {
      return res.status(202).end();
    }

    const mcpServer = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
    });
    await mcpServer.connect(transport);

    if (isInit) {
      // Pure init — pass through directly
      await transport.handleRequest(req as any, res as any, body);
    } else {
      // Non-init: wrap in batch with init
      const initMsg = {
        jsonrpc: '2.0' as const,
        id: '_init',
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
