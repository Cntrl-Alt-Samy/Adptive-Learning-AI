/**
 * Syllabus text chunker — splits parsed syllabus text into optimally-sized
 * chunks for Pinecone embedding and RAG retrieval.
 *
 * Strategy:
 * 1. Split by section headings (common in DfE syllabus PDFs)
 * 2. Further split long sections by paragraph boundaries
 * 3. Target ~500 tokens per chunk (~2000 chars) with 200 char overlap
 * 4. Preserve section titles as metadata for contextual retrieval
 */

export interface SyllabusChunk {
  chunkIndex: number;
  sectionTitle: string;
  text: string;
  tokenEstimate: number;
}

const TARGET_CHUNK_CHARS = 2000;
const OVERLAP_CHARS = 200;
const MIN_CHUNK_CHARS = 200;

// Common section heading patterns in DfE syllabus documents
const SECTION_HEADING_PATTERNS = [
  /^[A-Z]\.\s+.+$/m,                          // "A. Title"
  /^[\d]+\.\s+[A-Z].+$/m,                     // "1. Title"
  /^[\d]+\.[\d]+\s+[A-Z].+$/m,                // "1.1 Title"
  /^Section\s+\d+/im,                          // "Section 1"
  /^(?:Subject content|Assessment|Introduction|Appendix)/im,
  /^[IVXLC]+\.\s+.+$/m,                       // Roman numerals
  /^Part\s+\d+/im,                             // "Part 1"
];

export function chunkSyllabusText(pages: string[]): SyllabusChunk[] {
  // Join all pages with page markers
  const fullText = pages.join('\n\n---PAGE_BREAK---\n\n');

  // Step 1: Split into sections by headings
  const sections = splitByHeadings(fullText);

  // Step 2: Further split long sections into target-sized chunks
  const chunks: SyllabusChunk[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    if (section.text.length <= TARGET_CHUNK_CHARS) {
      const tokenEstimate = Math.ceil(section.text.length / 4);
      chunks.push({
        chunkIndex,
        sectionTitle: section.title,
        text: section.text.trim(),
        tokenEstimate
      });
      chunkIndex++;
    } else {
      // Split long section by paragraphs, then group into target-sized chunks
      const paragraphs = section.text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
      let currentChunk = '';

      for (const para of paragraphs) {
        const trimmed = para.trim();
        if (currentChunk.length + trimmed.length > TARGET_CHUNK_CHARS && currentChunk.length > MIN_CHUNK_CHARS) {
          // Emit current chunk
          const tokenEstimate = Math.ceil(currentChunk.length / 4);
          chunks.push({
            chunkIndex,
            sectionTitle: section.title,
            text: currentChunk.trim(),
            tokenEstimate
          });
          chunkIndex++;
          // Overlap: include tail of previous chunk
          currentChunk = currentChunk.slice(-OVERLAP_CHARS) + '\n\n' + trimmed;
        } else {
          currentChunk += (currentChunk.length > 0 ? '\n\n' : '') + trimmed;
        }
      }

      // Emit remaining
      if (currentChunk.trim().length > MIN_CHUNK_CHARS) {
        const tokenEstimate = Math.ceil(currentChunk.length / 4);
        chunks.push({
          chunkIndex,
          sectionTitle: section.title,
          text: currentChunk.trim(),
          tokenEstimate
        });
        chunkIndex++;
      }
    }
  }

  return chunks;
}

interface Section {
  title: string;
  text: string;
}

function splitByHeadings(text: string): Section[] {
  const lines = text.split('\n');
  const sections: Section[] = [];
  let currentTitle = 'Introduction';
  let currentLines: string[] = [];

  for (const line of lines) {
    if (isSectionHeading(line)) {
      if (currentLines.length > 0) {
        sections.push({
          title: currentTitle,
          text: currentLines.join('\n')
        });
      }
      currentTitle = line.trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  // Emit final section
  if (currentLines.length > 0) {
    sections.push({
      title: currentTitle,
      text: currentLines.join('\n')
    });
  }

  return sections;
}

function isSectionHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 2 || trimmed.length > 150) return false;
  // Skip page breaks
  if (trimmed === '---PAGE_BREAK---') return false;

  for (const pattern of SECTION_HEADING_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }

  return false;
}
