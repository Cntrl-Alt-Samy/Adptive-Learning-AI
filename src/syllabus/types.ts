import { z } from 'zod';

/**
 * Syllabus Library — Zod schemas for document upload, chunking, and RAG.
 */

export const SyllabusUploadSchema = z.object({
  title: z.string().min(1).max(255),
  subject: z.string().min(1).max(128),
  examBoard: z.string().min(1).max(128).default('DfE'),
  stage: z.enum(['gcse', 'alevel']).default('gcse')
});
export type SyllabusUpload = z.infer<typeof SyllabusUploadSchema>;

export const SyllabusDocumentSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  uploadedBy: z.string().uuid(),
  title: z.string(),
  subject: z.string(),
  examBoard: z.string(),
  stage: z.string(),
  fileName: z.string(),
  filePath: z.string(),
  fileSizeBytes: z.number(),
  pageCount: z.number(),
  chunkCount: z.number(),
  status: z.enum(['uploaded', 'processing', 'indexed', 'error']),
  errorMessage: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  processedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type SyllabusDocument = z.infer<typeof SyllabusDocumentSchema>;

export const SyllabusChunkSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
  chunkIndex: z.number(),
  sectionTitle: z.string().nullable().optional(),
  text: z.string(),
  tokenEstimate: z.number(),
  pineconeId: z.string().nullable().optional(),
  createdAt: z.string()
});
export type SyllabusChunk = z.infer<typeof SyllabusChunkSchema>;

export const LessonRequestSchema = z.object({
  subject: z.string().min(1).max(128),
  topic: z.string().min(1).max(255),
  level: z.enum(['foundation', 'higher', 'mixed']).default('mixed'),
  durationMinutes: z.number().int().min(5).max(60).default(30),
  learningObjectives: z.array(z.string()).optional(),
  additionalContext: z.string().max(2000).optional()
});
export type LessonRequest = z.infer<typeof LessonRequestSchema>;

export const GeneratedLessonSchema = z.object({
  title: z.string(),
  subject: z.string(),
  topic: z.string(),
  level: z.string(),
  syllabusReferences: z.array(z.string()),
  learningObjectives: z.array(z.string()),
  content: z.string(),
  keyTerms: z.array(z.object({ term: z.string(), definition: z.string() })),
  practiceQuestions: z.array(z.object({
    question: z.string(),
    hint: z.string().optional(),
    answer: z.string()
  })),
  commonMisconceptions: z.array(z.string()),
  nextTopics: z.array(z.string())
});
export type GeneratedLesson = z.infer<typeof GeneratedLessonSchema>;
