import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { createServer } from '../src/server.js';

/**
 * Create a minimal fake IncomingMessage/ServerResponse pair for auto-init.
 * The SDK's handleRequest expects real Node HTTP objects.
 */
function createFakeHttpPair(): { req: IncomingMessage; res: ServerResponse; getBody: () => string } {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.method = 'POST';
  req.url = '/mcp';
  req.headers = {
    'content-type': 'application/json',
    'accept': 'application/json, text/event-stream',
  };

  const res = new ServerResponse(req);
  const chunks: Buffer[] = [];
  const origWrite = res.write;
  const origEnd = res.end;
  res.write = function (chunk: any, ...args: any[]) {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    return true;
  } as any;
  res.end = function (chunk?: any, ...args: any[]) {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    return this;
  } as any;

  return { req, res, getBody: () => Buffer.concat(chunks).toString('utf-8') };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, Accept');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'DELETE') return res.status(200).json({ jsonrpc: '2.0', result: {} });

  if (req.method === 'GET') {
    // mcp-remote wants an SSE stream. In serverless we can't hold connections
    // open — Vercel functions timeout at 5min and pile up, blocking POST calls.
    // Return a valid SSE response and close immediately.
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

    const clientSessionId = (req.headers['mcp-session-id'] as string) || randomUUID();

    const mcpServer = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => clientSessionId,
      enableJsonResponse: true,
    });
    await mcpServer.connect(transport);

    if (isInit) {
      // Normal init — handle directly
      await transport.handleRequest(req as any, res as any, body);
      return;
    }

    // Non-init request: auto-initialize first
    const fake = createFakeHttpPair();
    const initBody = {
      jsonrpc: '2.0',
      id: '_init_' + Date.now(),
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'vercel-auto', version: '0.1.0' },
      },
    };

    await transport.handleRequest(fake.req, fake.res, initBody);

    // Now handle the real request
    // Ensure the session ID header matches what the transport expects
    if (!req.headers['mcp-session-id']) {
      (req.headers as any)['mcp-session-id'] = clientSessionId;
    }
    await transport.handleRequest(req as any, res as any, body);
  } catch (err: any) {
    console.error('MCP error:', err?.stack || err?.message || err);
    if (!res.headersSent) {
      return res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: err?.message || 'Internal error' },
      });
    }
  }
}
