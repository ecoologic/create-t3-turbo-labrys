import { createMcpHandler as createHandler } from "mcp-handler";
import { z } from "zod";

import { desc, eq } from "@acme/db";
import { db } from "@acme/db/client";
import { Post } from "@acme/db/schema";

export function createMcpHandler(config?: {
  redisUrl?: string;
  basePath?: string;
  maxDuration?: number;
  verboseLogs?: boolean;
}) {
  return createHandler(
    (server) => {
      // List all posts
      server.registerTool(
        "list_posts",
        {
          description:
            "Retrieve a list of all posts, ordered by creation date (newest first). Returns up to 10 posts by default.",
          inputSchema: {
            limit: z.number().int().min(1).max(100).optional().default(10),
          },
        },
        async ({ limit }: { limit: number }) => {
          try {
            const posts = await db.query.Post.findMany({
              orderBy: desc(Post.id),
              limit,
            });
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: true,
                      count: posts.length,
                      posts,
                    },
                    null,
                    2,
                  ),
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
                  text: JSON.stringify(
                    {
                      success: false,
                      error: errorMessage,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }
        },
      );

      // Get post by ID
      server.registerTool(
        "get_post",
        {
          description:
            "Retrieve a specific post by its ID. Returns the post details including title, content, and timestamps.",
          inputSchema: {
            id: z.string().uuid(),
          },
        },
        async ({ id }: { id: string }) => {
          try {
            const post = await db.query.Post.findFirst({
              where: eq(Post.id, id),
            });
            if (!post) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        success: false,
                        error: `Post with ID ${id} not found`,
                      },
                      null,
                      2,
                    ),
                  },
                ],
                isError: true,
              };
            }
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: true,
                      post,
                    },
                    null,
                    2,
                  ),
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
                  text: JSON.stringify(
                    {
                      success: false,
                      error: errorMessage,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }
        },
      );

      // Create a new post
      server.registerTool(
        "create_post",
        {
          description:
            "Create a new post with a title and content. Returns the created post with its generated ID and timestamps.",
          inputSchema: {
            title: z.string().min(1).max(256),
            content: z.string().min(1).max(256),
          },
        },
        async ({ title, content }: { title: string; content: string }) => {
          try {
            const [newPost] = await db
              .insert(Post)
              .values({
                title,
                content,
              })
              .returning();
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: true,
                      post: newPost,
                    },
                    null,
                    2,
                  ),
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
                  text: JSON.stringify(
                    {
                      success: false,
                      error: errorMessage,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }
        },
      );

      // Delete a post
      server.registerTool(
        "delete_post",
        {
          description:
            "Delete a post by its ID. Returns success status and the deleted post ID.",
          inputSchema: {
            id: z.string().uuid(),
          },
        },
        async ({ id }: { id: string }) => {
          try {
            const deletedPost = await db.query.Post.findFirst({
              where: eq(Post.id, id),
            });
            if (!deletedPost) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        success: false,
                        error: `Post with ID ${id} not found`,
                      },
                      null,
                      2,
                    ),
                  },
                ],
                isError: true,
              };
            }
            await db.delete(Post).where(eq(Post.id, id));
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      success: true,
                      message: `Post ${id} deleted successfully`,
                      deletedPost,
                    },
                    null,
                    2,
                  ),
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
                  text: JSON.stringify(
                    {
                      success: false,
                      error: errorMessage,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }
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
