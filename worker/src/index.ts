import { Hono } from "hono";
import { routeAgentRequest } from "agents";
import type { Env } from "./types";
import { handleOptions } from "./utils/cors";
import sessions from "./routes/sessions";
import sources from "./routes/sources";
import chatRoutes from "./routes/chat";

// Export Durable Object and Workflow classes so wrangler can find them
export { ResearchSession } from "./durable-objects/ResearchSession";
export { DigestWorkflow } from "./workflows/DigestWorkflow";

const app = new Hono<{ Bindings: Env }>();

// Global CORS middleware
app.use("*", async (c, next): Promise<Response | void> => {
  if (c.req.method === "OPTIONS") {
    return handleOptions(c);
  }
  await next();
  const origin = c.env.FRONTEND_ORIGIN ?? "http://localhost:5173";
  c.header("Access-Control-Allow-Origin", origin);
  c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type");
});

app.route("/api/sessions", sessions);
app.route("/api", sources);
app.route("/api", chatRoutes);

app.get("/api/health", (c) => c.json({ status: "ok", ts: Date.now() }));
app.all("*", (c) => c.json({ error: "Not found" }, 404));

const CORS_HEADERS = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Upgrade, Connection",
});

export default {
  /**
   * Request routing:
   *  - /agents/research-session/:id  → ResearchSession Durable Object (WebSocket + AI chat)
   *  - /api/*                        → Hono REST API (sessions, sources, digest)
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = env.FRONTEND_ORIGIN ?? "http://localhost:5173";

    // CORS preflight for /agents/* (Hono middleware doesn't cover these)
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS(origin) });
    }

    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse) {
      // WebSocket upgrades (101) must not be cloned — pass through as-is
      if (agentResponse.status === 101) return agentResponse;
      // Add CORS to regular agent HTTP responses (e.g. get-messages)
      const res = new Response(agentResponse.body, agentResponse);
      Object.entries(CORS_HEADERS(origin)).forEach(([k, v]) => res.headers.set(k, v));
      return res;
    }

    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
