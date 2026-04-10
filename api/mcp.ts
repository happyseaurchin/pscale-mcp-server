import type { VercelRequest, VercelResponse } from '@vercel/node';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from '../src/server.js';

/**
 * Vercel serverless MCP endpoint.
 *
 * The MCP protocol requires initialize before any tool call. In serverless,
 * each request is a fresh process — there's no prior state. So for non-init
 * requests, we silently run the init handshake internally first, then handle
 * the actual request.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, Accept');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'DELETE') return res.status(200).json({ jsonrpc: '2.0', result: {} });
  if (req.method === 'GET') return res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'SSE not supported in serverless.' } });
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const mcpServer = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await mcpServer.connect(transport);

    const body = req.body;
    const isInit = body?.method === 'initialize' ||
      (Array.isArray(body) && body.some((m: any) => m.method === 'initialize'));

    if (!isInit) {
      // Auto-initialize: simulate the init handshake internally
      // so the server is ready for tool calls.
      const { ServerResponse } = await import('node:http');
      const { PassThrough } = await import('node:stream');

      // Create a fake request/response pair for the init
      const fakeReqStream = new PassThrough();
      const fakeReq = Object.assign(fakeReqStream, {
        method: 'POST',
        url: '/mcp',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json, text/event-stream',
        },
      });

      const fakeRes = new ServerResponse(fakeReq as any);
      const fakeResBody: Buffer[] = [];
      const origWrite = fakeRes.write.bind(fakeRes);
      const origEnd = fakeRes.end.bind(fakeRes);
      fakeRes.write = (chunk: any, ...args: any[]) => {
        fakeResBody.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        return origWrite(chunk, ...args);
      };
      fakeRes.end = (chunk?: any, ...args: any[]) => {
        if (chunk) fakeResBody.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        return origEnd(chunk, ...args);
      };

      const initBody = {
        jsonrpc: '2.0',
        id: '_auto_init',
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'vercel-serverless', version: '0.1.0' },
        },
      };

      await transport.handleRequest(fakeReq as any, fakeRes as any, initBody);
    }

    // Now handle the actual request
    await transport.handleRequest(req as any, res as any, body);
  } catch (err: any) {
    console.error('MCP handler error:', err?.stack || err?.message || err);
    if (!res.headersSent) {
      return res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: err?.message || 'Internal server error' },
      });
    }
  }
}
