const CHUNK_SIZE = 500;       // target characters per chunk
const CHUNK_OVERLAP = 80;     // overlap between consecutive chunks
const MIN_CHUNK_LENGTH = 80;  // discard chunks shorter than this

/**
 * Split text into overlapping chunks of roughly CHUNK_SIZE characters.
 * Splits prefer paragraph or sentence boundaries where possible.
 */
export function chunkText(text: string): string[] {
  // Split on double newlines (paragraph breaks) first
  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);

  const chunks: string[] = [];
  let buffer = "";

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (buffer.length + trimmed.length + 1 <= CHUNK_SIZE) {
      buffer = buffer ? `${buffer}\n\n${trimmed}` : trimmed;
    } else {
      // Flush current buffer as a chunk if it's long enough
      if (buffer.length >= MIN_CHUNK_LENGTH) {
        chunks.push(buffer);
      }

      // If the paragraph itself is larger than CHUNK_SIZE, split by sentences
      if (trimmed.length > CHUNK_SIZE) {
        const sentences = splitSentences(trimmed);
        let sentBuf = "";
        for (const sentence of sentences) {
          if (sentBuf.length + sentence.length + 1 <= CHUNK_SIZE) {
            sentBuf = sentBuf ? `${sentBuf} ${sentence}` : sentence;
          } else {
            if (sentBuf.length >= MIN_CHUNK_LENGTH) {
              chunks.push(sentBuf);
            }
            // Carry overlap into next buffer
            const overlap = sentBuf.slice(-CHUNK_OVERLAP);
            sentBuf = overlap ? `${overlap} ${sentence}` : sentence;
          }
        }
        buffer = sentBuf;
      } else {
        // Start new buffer with overlap from previous
        const overlap = buffer.slice(-CHUNK_OVERLAP);
        buffer = overlap ? `${overlap}\n\n${trimmed}` : trimmed;
      }
    }
  }

  if (buffer.length >= MIN_CHUNK_LENGTH) {
    chunks.push(buffer);
  }

  return chunks;
}

function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
