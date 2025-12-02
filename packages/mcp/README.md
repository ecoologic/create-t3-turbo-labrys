# @acme/mcp

MCP (Model Context Protocol) handler package for the Next.js application.

## Overview

This package provides an MCP server implementation that enables AI assistants (Claude Desktop, Cursor, etc) to interact with the application's post management system via the MCP protocol.

## Features

- **Post Management Tools**: Four MCP tools for managing posts:
  - `list_posts` - Retrieve posts with optional limit
  - `get_post` - Get a post by ID
  - `create_post` - Create a new post
  - `delete_post` - Delete a post by ID

- **Serverless-Compatible**: Designed to work seamlessly in serverless environments like Vercel

- **SSE Resumability**: Optional Redis support for resumable Server-Sent Events (SSE) streams

## SSE Resumability with Redis

In serverless environments, each function invocation is stateless and short-lived. When MCP streams responses via Server-Sent Events (SSE), Redis can be used to store stream state (last sent message position).

**Why Redis is useful:**

- If a serverless function times out or the connection drops mid-stream, Redis stores the last position
- A new function invocation can read from Redis and resume the stream from where it left off
- Without Redis, streams still work but cannot resume after interruptions - they must restart from the beginning

**When to use Redis:**

- **Production**: Highly recommended for reliability with long-running operations
- **Development**: Optional - often not needed for local testing
- **Short operations**: May not be necessary for quick tool executions

To enable Redis, set the `REDIS_URL` environment variable. The handler will automatically use it if provided.

## Usage

```typescript
import { createMcpHandler } from "@acme/mcp";

const handler = createMcpHandler({
  redisUrl: process.env.REDIS_URL, // Optional: enables SSE resumability
  basePath: "/api",
  maxDuration: 60,
  verboseLogs: process.env.NODE_ENV === "development",
});
```

## Dependencies

- Uses `zod` v3 (`^3.23.8`) for compatibility with `mcp-handler`
- The rest of the monorepo uses `zod` v4, so this package isolates the dependency to prevent conflicts
