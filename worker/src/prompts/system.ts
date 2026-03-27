/**
 * Build the system prompt for the research assistant.
 * The assistant is grounded in retrieved source chunks and should
 * cite its evidence and admit uncertainty when the sources are weak.
 */
export function buildSystemPrompt(opts: {
  researchQuestion: string;
  instructions: string | null;
}): string {
  const customInstructions = opts.instructions
    ? `\n\nUser's custom instructions for this session: ${opts.instructions}`
    : "";

  return `You are a research assistant helping the user reason over a curated set of sources they have provided.

The user's primary research question is: "${opts.researchQuestion}"

Your job:
- Answer questions based primarily on the retrieved source excerpts provided in each message.
- When citing, include the source title or URL and a brief snippet that supports your claim.
- If multiple sources agree or conflict, note this explicitly.
- If the retrieved evidence is weak, incomplete, or absent, say so clearly — do not invent source-backed claims.
- Keep answers well-structured: use short paragraphs or bullet points for clarity.
- If the user asks something unrelated to the sources, you may answer from general knowledge but clearly label it as such.
- Prefer precision over length. Be concise unless the user asks to go deep.${customInstructions}`;
}

/**
 * Build the prompt section that injects retrieved source chunks.
 * Called once per chat turn.
 */
export function buildContextBlock(
  chunks: Array<{ text: string; sourceUrl: string; sourceTitle: string | null }>
): string {
  if (chunks.length === 0) {
    return "No source excerpts were retrieved for this question. Answer from general knowledge if possible and note the absence of source evidence.";
  }

  const formatted = chunks
    .map((c, i) => {
      const label = c.sourceTitle ?? c.sourceUrl;
      return `[Source ${i + 1}: ${label}]\n${c.text}`;
    })
    .join("\n\n---\n\n");

  return `Here are the most relevant excerpts from the user's indexed sources:\n\n${formatted}\n\nUse these excerpts to answer the user's question. Cite sources by their label (e.g. "Source 1") or URL.`;
}

/**
 * Prompt used to generate a digest / summary of all indexed session sources.
 */
export function buildDigestPrompt(opts: {
  researchQuestion: string;
  chunks: Array<{ text: string; sourceUrl: string; sourceTitle: string | null }>;
}): string {
  const contextBlock = buildContextBlock(opts.chunks);

  return `You are producing a research digest for the following question: "${opts.researchQuestion}"

${contextBlock}

Write a structured digest that:
1. Summarizes the key themes and findings across all sources.
2. Highlights agreements and disagreements between sources.
3. Identifies gaps or unanswered aspects of the research question.
4. Ends with 3-5 takeaways or recommended next steps.

Format the digest in clear Markdown with headers.`;
}
