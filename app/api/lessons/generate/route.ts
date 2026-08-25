import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { resolveRoute } from '@/src/ai/router.js';
import { createModelTransport } from '@/src/ai/transport.js';
import { STATIC_PROMPT_PREFIX } from '@/src/ai/prompt-prefix.js';
import { retrieveSyllabusContext, formatSyllabusContext } from '@/src/syllabus/rag-retriever.js';

/**
 * POST /api/lessons/generate — Generate a GCSE-level lesson using RAG-retrieved syllabus content.
 *
 * Accepts: { subject, topic, level, durationMinutes, learningObjectives?, additionalContext? }
 * Returns: Streaming SSE with the lesson content.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const { subject, topic, level = 'mixed', durationMinutes = 30, learningObjectives, additionalContext } = body;

    if (!subject || !topic) {
      return Response.json({ error: 'Missing required fields: subject, topic' }, { status: 400 });
    }

    // Retrieve syllabus context from Pinecone (or fall back gracefully)
    let syllabusContext = '';
    try {
      const context = await retrieveSyllabusContext(subject, topic);
      syllabusContext = formatSyllabusContext(context);
    } catch (err) {
      console.warn('RAG retrieval unavailable, using fallback context:', (err as Error).message);
      syllabusContext = `[Syllabus context unavailable for ${subject}. Generating lesson from general knowledge.]`;
    }

    // Also check for locally stored syllabus documents for reference
    const localContext = getLocalSyllabusContext(subject);

    // Build the lesson generation prompt
    const levelDescription: Record<string, string> = {
      foundation: 'Foundation tier (grades 1-5): focus on core content, accessible explanations, scaffolded examples',
      higher: 'Higher tier (grades 4-9): include extended content, challenging problems, abstract reasoning',
      mixed: 'Mixed tier: cover core content with extension material for higher-attaining students'
    };

    const objectivesBlock = learningObjectives?.length
      ? `\nSpecific learning objectives requested:\n${learningObjectives.map((o: string, i: number) => `${i + 1}. ${o}`).join('\n')}`
      : '';

    const systemPrompt = `You are an expert GCSE tutor creating a structured lesson plan. You MUST:

1. Stay STRICTLY within the UK Department for Education GCSE syllabus content provided below
2. Match the appropriate tier level: ${levelDescription[level] ?? levelDescription.mixed}
3. Structure the lesson for a ${durationMinutes}-minute session
4. Use clear, student-friendly language appropriate for ages 14-16
5. Include worked examples with step-by-step solutions
6. Reference specific syllabus sections where applicable
7. Address common misconceptions for this topic
8. Progress from basic understanding to application${objectivesBlock}

OUTPUT FORMAT — respond with valid JSON matching this exact structure:
{
  "title": "Lesson title",
  "subject": "${subject}",
  "topic": "${topic}",
  "level": "${level}",
  "syllabusReferences": ["Ref to specific syllabus section, e.g. 'DfE GCSE Maths 3.1 Number'"],
  "learningObjectives": ["By the end of this lesson, students will be able to..."],
  "content": "Full lesson content in Markdown format. Include:\\n## Overview\\n## Key Concepts\\n## Worked Examples\\n## Common Pitfalls\\n## Summary",
  "keyTerms": [{"term": "Term", "definition": "Clear definition"}],
  "practiceQuestions": [{"question": "Question text", "hint": "Optional hint", "answer": "Model answer with working"}],
  "commonMisconceptions": ["Misconception 1 and why it's wrong"],
  "nextTopics": ["Logical next topic to study"]
}`;

    const userPrompt = `Generate a ${durationMinutes}-minute GCSE ${level} tier lesson on:

Subject: ${subject}
Topic: ${topic}
${additionalContext ? `Additional context: ${additionalContext}` : ''}

${syllabusContext}

${localContext ? `\nLOCAL SYLLABUS REFERENCE:\n${localContext}` : ''}

Create the lesson following the syllabus content above. Ensure all content falls within the official GCSE specification for ${subject}.`;

    // Resolve model route (Tier 1 for lesson generation — high quality content)
    const route = resolveRoute('TUTOR', undefined);
    const transport = createModelTransport();

    // Stream the response
    const stream = transport.stream({
      provider: route.primary.provider,
      model: route.primary.model,
      systemPrefix: STATIC_PROMPT_PREFIX + '\n\n' + systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      temperature: 0.7,
      maxTokens: 4096
    });

    // Return as SSE stream
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.type === 'token') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', text: chunk.text })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
        } catch (err) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'error', error: (err as Error).message })}\n\n`)
          );
        } finally {
          controller.close();
        }
      }
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      }
    });
  } catch (err) {
    console.error('Lesson generation error:', err);
    return Response.json(
      { error: 'Failed to generate lesson' },
      { status: 500 }
    );
  }
}

/**
 * Get locally stored syllabus context for a subject.
 */
function getLocalSyllabusContext(subject: string): string {
  const docsDir = join(process.cwd(), 'syllabus-docs', 'records');
  if (!existsSync(docsDir)) return '';

  const files = readdirSync(docsDir).filter((f) => f.endsWith('.json'));
  const matching = files
    .map((f) => JSON.parse(readFileSync(join(docsDir, f), 'utf8')))
    .filter((doc: Record<string, unknown>) => {
      const docSubject = String(doc.subject ?? '').toLowerCase();
      return docSubject.includes(subject.toLowerCase()) || subject.toLowerCase().includes(docSubject);
    });

  if (matching.length === 0) return '';

  return `\nAvailable syllabus documents for ${subject}:\n` +
    matching.map((doc: Record<string, unknown>) => `- "${doc.title}" (${doc.examBoard}, ${doc.pageCount} pages, ${doc.chunkCount} chunks)`).join('\n');
}
