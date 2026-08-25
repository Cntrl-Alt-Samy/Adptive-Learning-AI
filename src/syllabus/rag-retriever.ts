import { getPineconeIndex } from '../pinecone/client.js';
import { getEmbeddingProvider } from '../pinecone/embed.js';
import { buildNamespace } from './ingester.js';

/**
 * RAG retriever for syllabus-aware lesson generation.
 * Queries Pinecone for relevant syllabus chunks given a topic and subject,
 * then formats them as context for the LLM prompt.
 */

export interface RetrievedChunk {
  text: string;
  sectionTitle: string;
  sourceTitle: string;
  score: number;
}

export interface SyllabusContext {
  subject: string;
  chunks: RetrievedChunk[];
  totalTokensEstimate: number;
}

const MAX_CONTEXT_TOKENS = 6000;
const DEFAULT_TOP_K = 8;

/**
 * Retrieve relevant syllabus chunks for a given topic from Pinecone.
 */
export async function retrieveSyllabusContext(
  subject: string,
  topic: string,
  topK: number = DEFAULT_TOP_K
): Promise<SyllabusContext> {
  const index = await getPineconeIndex();
  const embeddings = getEmbeddingProvider();
  const namespace = buildNamespace(subject);

  // Embed the query
  const queryEmbedding = await embeddings.embed(
    `${topic} ${subject} GCSE syllabus specification content`
  );

  // Query Pinecone
  const results = await index.namespace(namespace).query({
    vector: queryEmbedding,
    topK,
    includeMetadata: true
  });

  const chunks: RetrievedChunk[] = [];
  let totalTokensEstimate = 0;

  for (const match of results.matches ?? []) {
    const meta = match.metadata as Record<string, unknown> | undefined;
    if (!meta?.text) continue;

    const text = String(meta.text);
    const tokens = Math.ceil(text.length / 4);

    if (totalTokensEstimate + tokens > MAX_CONTEXT_TOKENS) break;

    chunks.push({
      text,
      sectionTitle: String(meta.section_title ?? ''),
      sourceTitle: String(meta.source_title ?? ''),
      score: match.score ?? 0
    });
    totalTokensEstimate += tokens;
  }

  return {
    subject,
    chunks,
    totalTokensEstimate
  };
}

/**
 * Format retrieved syllabus context for injection into an LLM prompt.
 */
export function formatSyllabusContext(context: SyllabusContext): string {
  if (context.chunks.length === 0) {
    return `[No syllabus content found for ${context.subject}. Lessons will be based on general knowledge.]`;
  }

  const lines: string[] = [
    `=== SYLLABUS CONTEXT: ${context.subject} (UK DfE official content) ===`,
    `Retrieved ${context.chunks.length} relevant sections (~${context.totalTokensEstimate} tokens).\n`
  ];

  for (let i = 0; i < context.chunks.length; i++) {
    const chunk = context.chunks[i];
    if (!chunk) continue;
    lines.push(`--- Section ${i + 1}: ${chunk.sectionTitle} (source: ${chunk.sourceTitle}, relevance: ${(chunk.score * 100).toFixed(0)}%) ---`);
    lines.push(chunk.text);
    lines.push('');
  }

  lines.push('=== END SYLLABUS CONTEXT ===');
  return lines.join('\n');
}
