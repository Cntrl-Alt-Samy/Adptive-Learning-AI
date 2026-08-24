'use client';

interface CodeBlockProps {
  code: string;
  language?: string;
}

/** §4.5 code block — mono stack on text-background; theme flips with mode. */
export function CodeBlock({ code, language }: CodeBlockProps) {
  return (
    <pre
      className="overflow-x-auto rounded-card border border-separator bg-text-background p-3 font-mono text-caption-1 leading-relaxed"
      aria-label={language !== undefined ? `Code block: ${language}` : 'Code block'}
    >
      <code>{code}</code>
    </pre>
  );
}
