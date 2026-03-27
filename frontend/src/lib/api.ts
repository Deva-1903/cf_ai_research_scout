import type { Session, Source, Digest } from "./types";

// In dev, Vite proxies /api → localhost:8787 (see vite.config.ts).
// In production, set VITE_API_URL to your worker URL, e.g.:
//   VITE_API_URL=https://cf-ai-research-scout-worker.your-subdomain.workers.dev
// If VITE_API_URL is not set, falls back to /api (works when using _redirects proxy).
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ── Sessions ──────────────────────────────────────────────────────────────

export function getSessions(): Promise<Session[]> {
  return request("/sessions");
}

export function getSession(id: string): Promise<Session> {
  return request(`/sessions/${id}`);
}

export function createSession(data: {
  title: string;
  researchQuestion: string;
  instructions?: string;
}): Promise<Session> {
  return request("/sessions", { method: "POST", body: JSON.stringify(data) });
}

export function updateSession(
  id: string,
  data: Partial<Pick<Session, "title" | "researchQuestion" | "instructions">>
): Promise<Session> {
  return request(`/sessions/${id}`, { method: "PUT", body: JSON.stringify(data) });
}

export function deleteSession(id: string): Promise<{ deleted: boolean }> {
  return request(`/sessions/${id}`, { method: "DELETE" });
}

// ── Sources ───────────────────────────────────────────────────────────────

export function getSources(sessionId: string): Promise<Source[]> {
  return request(`/sessions/${sessionId}/sources`);
}

export function addSource(sessionId: string, url: string): Promise<Source> {
  return request(`/sessions/${sessionId}/sources`, {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export function deleteSource(sourceId: string): Promise<{ deleted: boolean }> {
  return request(`/sources/${sourceId}`, { method: "DELETE" });
}

export function retrySource(sourceId: string): Promise<Source> {
  return request(`/sources/${sourceId}/retry`, { method: "POST" });
}

// ── Digest ────────────────────────────────────────────────────────────────

/**
 * Starts a DigestWorkflow and polls until the digest is ready (up to 60 s).
 * Returns the digest content once available.
 */
export async function generateDigest(sessionId: string): Promise<Digest> {
  // Start the workflow — returns { workflowId, status: "started" }
  await request(`/sessions/${sessionId}/digest`, { method: "POST" });

  // Poll the GET endpoint every 2 s until ready or timeout
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const result = await request<{ ready: boolean } & Partial<Digest>>(
      `/sessions/${sessionId}/digest`
    );
    if (result.ready && result.id) {
      return result as Digest;
    }
  }
  throw new Error("Digest timed out — try again in a moment");
}
