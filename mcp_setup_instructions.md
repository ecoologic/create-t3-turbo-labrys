# MCP Endpoint Implementation Guide

This document provides a comprehensive guide for implementing an MCP (Model Context Protocol) endpoint in a Next.js application.

## Implementation Steps

### Step 1: Create MCP Package

Create a dedicated package for MCP handler logic to isolate zod v3 dependency:

**File**: `packages/mcp/package.json`

```json
{
  "name": "@acme/mcp",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./src/index.ts"
    }
  },
  "dependencies": {
    "@acme/api": "workspace:*",
    "mcp-handler": "^1.0.3",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@acme/eslint-config": "workspace:*",
    "@acme/prettier-config": "workspace:*",
    "@acme/tsconfig": "workspace:*",
    "eslint": "catalog:",
    "prettier": "catalog:",
    "typescript": "catalog:"
  }
}
```

**Note**: The MCP package uses zod v3 (`^3.23.8`) for compatibility with `mcp-handler`, while the rest of your monorepo can use zod v4. This isolation prevents version conflicts.

After creating the `package.json`, install the dependencies:

```bash
cd packages/mcp
pnpm install
```

This will install `mcp-handler`, `zod` v3, and any workspace dependencies.

### Step 2: Create MCP Handler

**File**: `packages/mcp/src/index.ts`

```typescript
import { createMcpHandler as createHandler } from "mcp-handler";
import { z } from "zod";

// Import your business logic functions from shared packages
import { yourSearchFunction, yourServiceFunction } from "@acme/api";

export function createMcpHandler(config?: {
  redisUrl?: string;
  basePath?: string;
  maxDuration?: number;
  verboseLogs?: boolean;
}) {
  return createHandler(
    (server) => {
      // Define your MCP tools here using registerTool (non-deprecated API)
      server.registerTool(
        "example_tool",
        {
          description: "Example tool description",
          inputSchema: {
            text: z.string().min(1),
            optionalParam: z.string().url().optional(),
          },
        },
        async ({
          text,
          optionalParam,
        }: {
          text: string;
          optionalParam?: string;
        }) => {
          // Call your business logic
          const result = await yourServiceFunction(text, optionalParam);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    result,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        },
      );

      // Add more tools as needed
      server.registerTool(
        "another_tool",
        {
          description: "Another tool description",
          inputSchema: {
            query: z.string().min(1),
            limit: z.number().int().min(1).max(100).default(10),
          },
        },
        async ({ query, limit }: { query: string; limit: number }) => {
          const results = await yourSearchFunction(query, limit);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        },
      );
    },
    {
      // Optional server options
    },
    {
      redisUrl: config?.redisUrl ?? process.env.REDIS_URL,
      basePath: config?.basePath ?? "/api",
      maxDuration: config?.maxDuration ?? 60,
      verboseLogs:
        config?.verboseLogs ?? process.env.NODE_ENV === "development",
    },
  );
}
```

### Step 3: Create MCP API Route

Create a new API route file: `apps/nextjs/src/app/api/mcp/route.ts`

```typescript
import { createMcpHandler } from "@acme/mcp";

const handler = createMcpHandler({
  redisUrl: process.env.REDIS_URL,
  basePath: "/api",
  maxDuration: 60,
  verboseLogs: process.env.NODE_ENV === "development",
});

export { handler as GET, handler as POST, handler as DELETE };
```

**Note**: The route file is minimal - it just imports and configures the handler from the `@acme/mcp` package.

### Step 4: Update Environment Variables

Add optional `REDIS_URL` to your environment schema:

**File**: `apps/nextjs/src/env.ts`

```typescript
server: {
  // ... existing variables
  REDIS_URL: z.string().url().optional(),
},
```

**Why Redis?**

- Optional but recommended for production
- Enables SSE (Server-Sent Events) resumability across serverless invocations
- Stores session state when using streaming mode
- Not required for basic functionality, but improves reliability in serverless environments

### Step 5: Configure MCP Client

Create or update `mcp.json` in the project root:

```json
{
  "mcpServers": {
    "your-service-name": {
      "url": "http://localhost:3000/api/mcp",
      "env": {
        "REDIS_URL": "${REDIS_URL}"
      }
    }
  }
}
```

**Configuration Notes**:

- `url`: Points to your Next.js API route (default port 3000 for dev)
- `env`: Environment variables passed to the serverless function (add any required variables here)
- For production, update URL to your deployed domain

### Step 6: Tool Design Patterns

#### Pattern 1: Simple Tool with Validation

```typescript
server.registerTool(
  "add_item",
  {
    description: "Add an item to the system",
    inputSchema: {
      name: z.string().min(1).max(100),
      description: z.string().optional(),
    },
  },
  async ({ name, description }) => {
    const result = await addItem({ name, description });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: true, id: result.id }),
        },
      ],
    };
  },
);
```

#### Pattern 2: Tool with Error Handling

```typescript
server.registerTool(
  "query_items",
  {
    description: "Search for items",
    inputSchema: {
      query: z.string().min(1),
      limit: z.number().int().min(1).max(100).default(10),
    },
  },
  async ({ query, limit }) => {
    try {
      const results = await searchItems(query, limit);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  },
);
```

#### Pattern 3: Tool Using Shared Business Logic

```typescript
// Import from your shared API package
import { yourServiceFunction } from "@acme/api";

server.registerTool(
  "your_tool",
  {
    description: "Tool description",
    inputSchema: {
      text: z.string().min(1),
      optionalParam: z.string().url().optional(),
    },
  },
  async ({ text, optionalParam }) => {
    // Reuse existing business logic
    const result = await yourServiceFunction(text, optionalParam);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            result,
          }),
        },
      ],
    };
  },
);
```

**Important**: Always use `server.registerTool()` instead of the deprecated `server.tool()` method. The `registerTool` API uses a config object with `description` and `inputSchema` properties.

## Architecture Considerations

### File Structure

```
apps/nextjs/
  src/
    app/
      api/
        mcp/
          route.ts          # MCP endpoint handler (imports from @acme/mcp)
    env.ts                  # Environment variable schema (add REDIS_URL)
packages/
  api/                      # Shared business logic
    src/
      services/             # Reusable service functions
        your-service.ts     # Your business logic functions
  mcp/                      # MCP handler package (uses zod v3)
    src/
      index.ts              # MCP handler implementation
    package.json            # zod v3 dependency
mcp.json                    # MCP client configuration
```

**Key Architecture Decision**: The MCP handler is isolated in its own package (`@acme/mcp`) which uses zod v3 for compatibility with `mcp-handler`. This allows the rest of the monorepo to use zod v4 without conflicts.

### Integration Points

1. **Business Logic**: Import from shared packages (`@acme/api`, etc.)
2. **Environment Variables**: Use Next.js env validation (`@t3-oss/env-nextjs`)
3. **Type Safety**: Leverage existing Zod schemas where possible
4. **Error Handling**: Consistent error responses across tools
5. **Dependency Isolation**: MCP package uses zod v3, rest of monorepo uses zod v4

## Configuration Options

### Handler Configuration

```typescript
{
  redisUrl: string | undefined,      // Redis URL for SSE resumability
  basePath: string,                  // Base path (must match route location)
  maxDuration: number,               // Serverless timeout (default: 60)
  verboseLogs: boolean,              // Enable debug logging
}
```

### Server Options

```typescript
{
  capabilities: {
    tools: {},
    resources: {},  // Optional: if exposing resources
    prompts: {},    // Optional: if exposing prompts
  },
}
```

## Testing and Verification

### 1. Local Development

```bash
# Start Next.js dev server
pnpm dev

# Verify endpoint is accessible
curl http://localhost:3000/api/mcp
```

### 2. MCP Client Connection

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "your-service": {
      "url": "http://localhost:3000/api/mcp",
      "env": {
        "REDIS_URL": "your-value"
      }
    }
  }
}
```

**Cursor** (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "your-service": {
      "url": "http://localhost:3000/api/mcp"
    }
  }
}
```

### 3. Tool Testing

Once connected, test tools via your MCP client:

- "Use the [your_tool_name] tool to [action]"
- "Search for [items] using [tool_name]"

## Deployment Considerations

### Vercel Deployment

1. **Environment Variables**: Set in Vercel dashboard:
   - Add any required environment variables for your application
   - `REDIS_URL` (optional but recommended for SSE resumability)

2. **Update mcp.json**: Change URL to production domain:

   ```json
   {
     "url": "https://your-app.vercel.app/api/mcp"
   }
   ```

3. **Function Timeout**: Ensure `maxDuration` matches Vercel plan limits:
   - Hobby: 10 seconds
   - Pro: 60 seconds (default)
   - Enterprise: Custom

### Serverless Limitations

- **Cold Starts**: First request may be slower
- **Timeout Limits**: Respect function timeout settings
- **State Management**: Use Redis for persistent state across invocations
- **Concurrent Requests**: Each request is a separate invocation

## Migration from Standalone Server

If migrating from a standalone Express server:

1. **Extract Tool Logic**: Move tool handlers to the new route file
2. **Update Imports**: Change from Express types to Next.js types (handled automatically by mcp-handler)
3. **Remove Express Server**: Delete standalone server package
4. **Update Configuration**: Change `mcp.json` URL from standalone server to Next.js route
5. **Test Thoroughly**: Verify all tools work in the new environment

## Common Patterns and Best Practices

### 1. Reuse Existing Business Logic

Don't duplicate code - import from shared packages:

```typescript
import { yourFunction } from "@acme/api";
```

### 2. Consistent Error Handling

Always return proper error responses:

```typescript
return {
  content: [{ type: "text", text: `Error: ${message}` }],
  isError: true,
};
```

### 3. Input Validation

Use Zod schemas for all inputs. When using `registerTool`, provide schemas as a plain object (`ZodRawShape`):

```typescript
server.registerTool(
  "tool_name",
  {
    description: "Tool description",
    inputSchema: {
      requiredParam: z.string().min(1),
      optionalParam: z.number().optional(),
      paramWithDefault: z.number().default(10),
    },
  },
  async ({ requiredParam, optionalParam, paramWithDefault }) => {
    // ...
  },
);
```

**Note**: The MCP package uses zod v3, so use `z.string().url()` (not `z.url()`) for URL validation.

### 4. Response Format

Always return structured JSON in text content:

```typescript
{
  content: [
    {
      type: "text",
      text: JSON.stringify(result, null, 2),
    },
  ],
}
```

### 5. Tool Descriptions

Write clear, descriptive tool descriptions - AI assistants use these:

```typescript
server.registerTool(
  "tool_name",
  {
    description: "Clear description of what this tool does and when to use it",
    inputSchema: {
      // ...
    },
  },
  async ({ ... }) => {
    // ...
  },
);
```

## Dependencies

### MCP Package (`@acme/mcp`)

- `mcp-handler`: ^1.0.3 (Vercel's MCP adapter)
- `zod`: ^3.23.8 (Input validation - zod v3 for mcp-handler compatibility)
- `@modelcontextprotocol/sdk`: (Peer dependency, included by mcp-handler)
- `@acme/api`: (Workspace dependency for business logic)

### Next.js App

- `@acme/mcp`: (Workspace dependency - imports the MCP handler)
- `zod`: (Uses catalog version - zod v4 for rest of app)

### Optional

- Redis client (if using Redis for SSE resumability)

**Important**: The MCP package uses zod v3 to avoid compatibility issues with `mcp-handler`, while the rest of your monorepo can use zod v4. This isolation prevents version conflicts.

## Troubleshooting

### Issue: MCP Client Can't Connect

**Solutions**:

1. Verify Next.js server is running
2. Check URL matches route location (`/api/mcp`)
3. Ensure environment variables are set
4. Restart MCP client after configuration changes

### Issue: Tools Not Appearing

**Solutions**:

1. Check tool definitions are correct (use `registerTool`, not deprecated `tool`)
2. Verify handler is exported correctly (`GET`, `POST`, `DELETE`)
3. Check server logs for errors
4. Ensure Zod schemas are valid (use zod v3 in MCP package)
5. Verify the MCP package is built (`pnpm build` in `packages/mcp`)

### Issue: Zod Version Conflicts

**Solutions**:

1. Ensure `@acme/mcp` package uses zod v3 (`^3.23.8`)
2. Rest of monorepo can use zod v4 via catalog
3. Build the MCP package after dependency changes: `cd packages/mcp && pnpm build`

### Issue: Serverless Timeout Errors

**Solutions**:

1. Increase `maxDuration` in handler config
2. Optimize tool execution time
3. Consider using Redis for long-running operations
4. Check Vercel plan limits

### Issue: Session State Lost

**Solutions**:

1. Configure `REDIS_URL` for session persistence
2. Ensure Redis is accessible from serverless function
3. Check Redis connection in logs

## Resources

- [mcp-handler GitHub](https://github.com/vercel/mcp-handler)
- [MCP Specification](https://modelcontextprotocol.io)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)

## Summary

Implementing an MCP endpoint in Next.js involves:

1. Creating a dedicated MCP package (`@acme/mcp`) with zod v3 dependency
2. Implementing MCP handler logic in the package using `registerTool` API
3. Creating a minimal API route that imports from the MCP package
4. Configuring environment variables (including optional Redis)
5. Setting up `mcp.json` for client connection
6. Reusing existing business logic from shared packages

**Key Benefits of Package Isolation**:

- **Dependency Management**: Zod v3 isolated to MCP package, rest of monorepo uses zod v4
- **Clean Separation**: Handler logic separated from route configuration
- **Easier Testing**: MCP functionality can be tested independently
- **Better Maintainability**: Changes to MCP tools don't affect route files

The result is a serverless-compatible MCP server that integrates seamlessly with your Next.js application, eliminating the need for separate infrastructure while providing full MCP protocol support.
