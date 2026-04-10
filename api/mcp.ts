import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from '../src/server.js';

/**
 * Vercel serverless MCP endpoint.
 *
 * Stateless: each request gets a fresh server + transport.
 * enableJsonResponse: true → complete JSON response per request.
 *
 * Key: Vercel pre-parses req.body. The SDK's handleRequest needs the
 * parsed body passed explicitly as the third argument because the
 * request stream is already consumed by Vercel's middleware.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id, Accept');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'DELETE') {
    return res.status(200).json({ jsonrpc: '2.0', result: {} });
  }

  if (req.method === 'GET') {
    return res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'SSE not supported in serverless. Use POST.' },
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  try {
    const mcpServer = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
    });

    await mcpServer.connect(transport);

    // Cast req/res — VercelRequest extends IncomingMessage, VercelResponse extends ServerResponse.
    // Pass req.body explicitly since Vercel has already consumed the stream.
    await transport.handleRequest(
      req as any,
      res as any,
      req.body,
    );
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
