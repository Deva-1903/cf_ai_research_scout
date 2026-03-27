import type { Context } from "hono";
import type { Env } from "../types";

/** Allowed origins. In production set FRONTEND_ORIGIN to your Pages URL. */
function getAllowedOrigin(c: Context<{ Bindings: Env }>): string {
  return c.env.FRONTEND_ORIGIN ?? "http://localhost:5173";
}

export function corsHeaders(c: Context<{ Bindings: Env }>): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(c),
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

/** Handle OPTIONS preflight requests. */
export function handleOptions(c: Context<{ Bindings: Env }>): Response {
  return new Response(null, { status: 204, headers: corsHeaders(c) });
}
