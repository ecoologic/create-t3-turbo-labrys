import { createMcpHandler as createHandler } from "mcp-handler";
import { z } from "zod";

/**
 * Creates an MCP handler with arithmetic tools.
 *
 * @param config - Configuration options
 * @param config.redisUrl - Optional Redis URL for SSE resumability in serverless environments.
 *   When provided, Redis stores stream state (last sent message position) so that if a function
 *   times out or connection drops, streams can resume from where they left off rather than
 *   restarting. Without Redis, streams work but cannot resume after interruptions.
 * @param config.basePath - Base path for the API route (default: "/api")
 * @param config.maxDuration - Maximum duration for requests in seconds (default: 60)
 * @param config.verboseLogs - Enable verbose logging (default: false, or true in development)
 */
export function createMcpHandler(config?: {
  redisUrl?: string;
  basePath?: string;
  maxDuration?: number;
  verboseLogs?: boolean;
}) {
  return createHandler(
    (server) => {
      // Add two numbers
      server.registerTool(
        "add",
        {
          description: "Add two numbers together.",
          inputSchema: {
            a: z.number(),
            b: z.number(),
          },
        },
        ({ a, b }: { a: number; b: number }) => {
          const result = a + b;
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    result,
                    operation: "add",
                    operands: { a, b },
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        },
      );

      // Subtract two numbers
      server.registerTool(
        "subtract",
        {
          description: "Subtract the second number from the first number.",
          inputSchema: {
            a: z.number(),
            b: z.number(),
          },
        },
        ({ a, b }: { a: number; b: number }) => {
          const result = a - b;
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    result,
                    operation: "subtract",
                    operands: { a, b },
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        },
      );

      // Multiply two numbers
      server.registerTool(
        "multiply",
        {
          description: "Multiply two numbers together.",
          inputSchema: {
            a: z.number(),
            b: z.number(),
          },
        },
        ({ a, b }: { a: number; b: number }) => {
          const result = a * b;
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    result,
                    operation: "multiply",
                    operands: { a, b },
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        },
      );

      // Divide two numbers
      server.registerTool(
        "divide",
        {
          description: "Divide the first number by the second number.",
          inputSchema: {
            a: z.number(),
            b: z.number(),
          },
        },
        ({ a, b }: { a: number; b: number }) => {
          if (b === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: false,
                      error: "Division by zero is not allowed",
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }
          const result = a / b;
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    result,
                    operation: "divide",
                    operands: { a, b },
                  },
                  null,
                  2,
                ),
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
      // Redis URL for SSE resumability: stores stream state so streams can resume
      // after serverless function timeouts or connection drops
      redisUrl: config?.redisUrl ?? process.env.REDIS_URL,
      basePath: config?.basePath ?? "/api",
      maxDuration: config?.maxDuration ?? 60,
      verboseLogs:
        config?.verboseLogs ?? process.env.NODE_ENV === "development",
    },
  );
}
