/**
 * index-reef.ts — Track B entry point.
 *
 * Reef-driven MCP server. Reads mcp-reef.json, registers tools dynamically.
 * Separate deployment from Track A (src/index.ts).
 *
 * Endpoints:
 *   GET  /reef  — serves mcp-reef.json (the self-describing server definition)
 *   GET  /      — human-readable pointer to /reef
 *   POST /mcp   — MCP protocol (reef-driven tools)
 *   GET  /mcp   — SSE for existing MCP sessions
 *   DELETE /mcp — session termination
 */

import { createServer as createHttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createReefServer, getReefJson } from './kernel.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

const transports = new Map<string, StreamableHTTPServerTransport>();

const httpServer = createHttpServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  // ── GET / — human-readable root ──
  if (url.pathname === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(
      `pscale reef\n\n` +
      `This is a self-describing MCP server. The reef defines everything.\n\n` +
      `  GET /reef  — the reef block (JSON). Read it to understand the server.\n` +
      `  POST /mcp  — MCP protocol endpoint. Connect with any MCP client.\n\n` +
      `The reef is a pscale block. Walk it with BSP. Fork it to make it yours.\n\n` +
      `Connection config:\n` +
      `  { "pscale-reef": { "command": "npx", "args": ["-y", "mcp-remote", "https://reef.hermitcrab.me/mcp"] } }\n`
    );
    return;
  }

  // ── GET /reef — serve the reef definition ──
  if (url.pathname === '/reef' && req.method === 'GET') {
    try {
      const reef = getReefJson();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(reef);
    } catch {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Reef not found' }));
    }
    return;
  }

  // ── /mcp — MCP protocol ──
  if (url.pathname !== '/mcp') {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found. Reef at /reef, MCP at /mcp' }));
    return;
  }

  // Parse body for POST
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
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res, body);
  } else if (req.method === 'POST' && !sessionId) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        transports.delete(transport.sessionId);
      }
    };

    const mcpServer = await createReefServer();
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, body);

    if (transport.sessionId) {
      transports.set(transport.sessionId, transport);
    }
  } else if (req.method === 'GET') {
    if (sessionId && transports.has(sessionId)) {
      await transports.get(sessionId)!.handleRequest(req, res, body);
    } else {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Missing or invalid session ID' }));
    }
  } else if (req.method === 'DELETE') {
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
  console.log(`pscale reef server running on http://localhost:${PORT}`);
  console.log(`  Reef:  http://localhost:${PORT}/reef`);
  console.log(`  MCP:   http://localhost:${PORT}/mcp`);
});
