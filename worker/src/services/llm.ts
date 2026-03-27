import type { Env } from "../types";

const EMBEDDING_MODEL = "@cf/baai/bge-base-en-v1.5" as const;
const GENERATION_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast" as const;
const MAX_TOKENS = 1200;

/**
 * Generate an embedding vector for a single text string.
 * Returns a float array of 768 dimensions.
 */
export async function embed(text: string, env: Env): Promise<number[]> {
  const result = await env.AI.run(EMBEDDING_MODEL, { text: [text] });
  // Workers AI returns { data: number[][] }
  const data = (result as { data: number[][] }).data;
  if (!data || data.length === 0) {
    throw new Error("Embedding model returned empty result");
  }
  return data[0];
}

/**
 * Generate embeddings for a batch of texts.
 * Batches to avoid hitting context limits.
 */
export async function embedBatch(texts: string[], env: Env): Promise<number[][]> {
  const BATCH_SIZE = 10;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const result = await env.AI.run(EMBEDDING_MODEL, { text: batch });
    const data = (result as { data: number[][] }).data;
    results.push(...data);
  }

  return results;
}

export interface ChatTurn {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Call the LLM with a list of messages. Returns the assistant's reply.
 */
export async function chat(messages: ChatTurn[], env: Env): Promise<string> {
  const result = await env.AI.run(GENERATION_MODEL, {
    messages,
    max_tokens: MAX_TOKENS,
  });

  // Workers AI returns { response: string }
  const response = (result as { response?: string }).response;
  if (!response) {
    throw new Error("LLM returned an empty response");
  }
  return response.trim();
}
