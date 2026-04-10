import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from '../src/server.js';

/**
 * Vercel serverless MCP endpoint.
 *
 * Problem: MCP protocol requires init before tool calls, but Vercel is stateless.
 * Solution: Every request gets a fresh server. For non-init requests, we run the
 * init handshake first on the same transport, then forward the actual request.
 * The transport is stateful (has a session ID generator) so it accepts follow-ups.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, Accept');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'DELETE') {
    // Session close — acknowledge it (stateless, nothing to clean up)
    return res.status(200).json({ jsonrpc: '2.0', result: {} });
  }

  if (req.method === 'GET') {
    // SSE stream for server notifications — keep alive for mcp-remote
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(':ok\n\n');
    return;
  }

  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body;
  const isInit = body?.method === 'initialize' ||
    (Array.isArray(body) && body.some((m: any) => m.method === 'initialize'));

  // For init requests: create server, handle normally
  if (isInit) {
    try {
      const mcpServer = createServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
      });
      await mcpServer.connect(transport);
      await transport.handleRequest(req as any, res as any, body);
    } catch (err: any) {
      console.error('MCP init error:', err?.message);
      if (!res.headersSent) {
        return res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: err?.message || 'Internal error' },
        });
      }
    }
    return;
  }

  // For non-init requests: create server, auto-init, then handle
  try {
    // Extract or generate a session ID
    const clientSessionId = req.headers['mcp-session-id'] as string || randomUUID();

    const mcpServer = createServer();
    // Use a fixed session ID generator that returns the client's session ID
    // so the transport accepts requests with that session ID
    let firstCall = true;
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => {
        if (firstCall) {
          firstCall = false;
          return clientSessionId;
        }
        return clientSessionId;
      },
      enableJsonResponse: true,
    });
    await mcpServer.connect(transport);

    // Auto-initialize: create a minimal fake HTTP exchange
    const initBody = {
      jsonrpc: '2.0',
      id: '_auto_init_' + Date.now(),
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'vercel-auto', version: '0.1.0' },
      },
    };

    // Use a collector response to capture init output (we discard it)
    const { ServerResponse } = await import('node:http');
    const { Readable } = await import('node:stream');
    const fakeReq = new Readable({ read() {} }) as any;
    fakeReq.method = 'POST';
    fakeReq.url = '/mcp';
    fakeReq.headers = {
      'content-type': 'application/json',
      'accept': 'application/json, text/event-stream',
    };
    const fakeRes = new ServerResponse(fakeReq);
    // Capture output to prevent write-after-end errors
    fakeRes.write = () => true;
    fakeRes.end = () => fakeRes;

    await transport.handleRequest(fakeReq, fakeRes, initBody);

    // Now handle the actual request — the transport is initialized
    // Patch the session ID into the request headers so the transport accepts it
    (req as any).headers['mcp-session-id'] = clientSessionId;
    await transport.handleRequest(req as any, res as any, body);
  } catch (err: any) {
    console.error('MCP handler error:', err?.message);
    if (!res.headersSent) {
      return res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: err?.message || 'Internal error' },
      });
    }
  }
}
