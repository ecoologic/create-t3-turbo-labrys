import { createMcpHandler } from "@acme/mcp";
import { env } from "~/env";

const handler = createMcpHandler({
  redisUrl: env.REDIS_URL,
  basePath: "/api",
  maxDuration: 60,
  verboseLogs: env.NODE_ENV === "development",
});

export { handler as GET, handler as POST, handler as DELETE };



