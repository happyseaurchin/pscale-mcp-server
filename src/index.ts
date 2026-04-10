import { createServer as createHttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

const transports = new Map<string, StreamableHTTPServerTransport>();

const httpServer = createHttpServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Only handle /mcp path
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  if (url.pathname !== '/mcp') {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found. MCP endpoint is at /mcp' }));
    return;
  }

  // Parse body for POST requests
  let body: unknown = undefined;
  if (req.method === 'POST') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const raw = Buffer.concat(chunks).toString('utf-8');
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }
    }
  }

  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  if (sessionId && transports.has(sessionId)) {
    // Existing session
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res, body);
  } else if (req.method === 'POST' && !sessionId) {
    // New session initialization
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        transports.delete(transport.sessionId);
      }
    };

    const mcpServer = createServer();
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, body);

    if (transport.sessionId) {
      transports.set(transport.sessionId, transport);
    }
  } else if (req.method === 'GET') {
    // SSE connection for existing session or new session
    if (sessionId && transports.has(sessionId)) {
      await transports.get(sessionId)!.handleRequest(req, res, body);
    } else {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Missing or invalid session ID' }));
    }
  } else if (req.method === 'DELETE') {
    // Session termination
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res, body);
      transports.delete(sessionId);
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Session not found' }));
    }
  } else {
    res.writeHead(400);
    res.end(JSON.stringify({ error: 'Bad request' }));
  }
});

httpServer.listen(PORT, () => {
  console.log(`pscale-mcp-server running on http://localhost:${PORT}/mcp`);
  console.log('Streamable HTTP transport ready.');
});
