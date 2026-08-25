import { getPineconeIndex } from '../pinecone/client.js';
import { getEmbeddingProvider } from '../pinecone/embed.js';
import type { SyllabusChunk } from './chunker.js';

/**
 * Syllabus ingestion pipeline — embeds chunked syllabus text into Pinecone
 * with metadata for RAG retrieval during lesson generation.
 */

export interface IngestResult {
  upsertedCount: number;
  namespace: string;
}

const NAMESPACE_PREFIX = 'syllabus';

/**
 * Build a Pinecone vector ID for a syllabus chunk.
 */
export function buildSyllabusVectorId(documentId: string, chunkIndex: number): string {
  return `${NAMESPACE_PREFIX}:${documentId}:chunk:${chunkIndex}`;
}

/**
 * Build the Pinecone namespace for a syllabus document.
 */
export function buildNamespace(subject: string): string {
  return `${NAMESPACE_PREFIX}_${subject.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
}

/**
 * Upsert syllabus chunks into Pinecone with embeddings.
 */
export async function ingestSyllabusChunks(
  documentId: string,
  subject: string,
  chunks: SyllabusChunk[],
  metadata: {
    examBoard: string;
    stage: string;
    sourceTitle: string;
  }
): Promise<IngestResult> {
  const index = await getPineconeIndex();
  const embeddings = getEmbeddingProvider();
  const namespace = buildNamespace(subject);

  // Embed in batches of 10 to avoid rate limits
  const BATCH_SIZE = 10;
  let upsertedCount = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    // Generate embeddings for batch
    const embeddingPromises = batch.map((chunk) => embeddings.embed(chunk.text));
    const embeddingResults = await Promise.all(embeddingPromises);

    // Build vectors
    const vectors = batch.map((chunk, j) => ({
      id: buildSyllabusVectorId(documentId, chunk.chunkIndex),
      values: embeddingResults[j],
      metadata: {
        document_id: documentId,
        subject,
        exam_board: metadata.examBoard,
        stage: metadata.stage,
        source_title: metadata.sourceTitle,
        section_title: chunk.sectionTitle,
        chunk_index: chunk.chunkIndex,
        token_estimate: chunk.tokenEstimate,
        text: chunk.text.slice(0, 3000), // Pinecone metadata value limit
        type: 'syllabus_chunk' as const
      }
    }));

    // Upsert to Pinecone
    await index.namespace(namespace).upsert(vectors);
    upsertedCount += vectors.length;
  }

  return { upsertedCount, namespace };
}

/**
 * Delete all vectors for a syllabus document from Pinecone.
 */
export async function deleteSyllabusFromPinecone(
  documentId: string,
  subject: string
): Promise<void> {
  const index = await getPineconeIndex();
  const namespace = buildNamespace(subject);

  // Query for all vectors with this document_id
  const results = await index.namespace(namespace).query({
    vector: new Array(1536).fill(0), // Dummy vector
    filter: { document_id: documentId },
    topK: 10000,
    includeMetadata: false
  });

  if (results.matches && results.matches.length > 0) {
    const ids = results.matches.map((m) => m.id);
    await index.namespace(namespace).deleteMany(ids);
  }
}
