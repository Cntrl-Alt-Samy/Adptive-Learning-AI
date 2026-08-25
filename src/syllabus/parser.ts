import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFParse } from 'pdf-parse';

/**
 * Syllabus PDF parser — extracts structured text from GCSE syllabus PDFs.
 * Returns raw text split by approximate page boundaries.
 */

export interface ParsedSyllabus {
  title: string;
  pageCount: number;
  text: string;
  pages: string[];
}

const PDF_DIR = join(process.cwd(), 'syllabus-docs');

/**
 * Parse a PDF from the syllabus-docs directory by filename.
 */
export async function parseSyllabusPdf(fileName: string): Promise<ParsedSyllabus> {
  const filePath = join(PDF_DIR, fileName);
  const buffer = readFileSync(filePath);
  return parseSyllabusBuffer(buffer, fileName);
}

/**
 * Parse a PDF from an arbitrary buffer (for user uploads).
 */
export async function parseSyllabusBuffer(
  buffer: Buffer,
  fallbackName: string
): Promise<ParsedSyllabus> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });

  try {
    const textResult = await parser.getText();

    const pages: string[] = [];
    for (const page of textResult.pages) {
      const trimmed = page.text.trim();
      if (trimmed.length > 0) {
        pages.push(trimmed);
      }
    }

    return {
      title: extractTitle(textResult.text, fallbackName),
      pageCount: textResult.total || pages.length,
      text: textResult.text,
      pages
    };
  } finally {
    await parser.destroy();
  }
}

/**
 * Heuristic title extraction — look for the first prominent line in the PDF.
 */
function extractTitle(text: string, fallbackName: string): string {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  // Look for lines that look like titles (GCSE, subject name, etc.)
  for (const line of lines.slice(0, 15)) {
    if (/^GCSE\b/i.test(line) && line.length < 120) {
      return line.replace(/\s+/g, ' ');
    }
    if (/subject content/i.test(line) && line.length < 120) {
      return line.replace(/\s+/g, ' ');
    }
  }

  // Fallback: first non-trivial line
  for (const line of lines.slice(0, 5)) {
    if (line.length > 5 && line.length < 150) {
      return line.replace(/\s+/g, ' ');
    }
  }

  // Final fallback: derive from filename
  return fallbackName
    .replace(/\.pdf$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
