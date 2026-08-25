'use client';

interface CodeBlockProps {
  code: string;
  language?: string;
}

/** §4.5 code block — mono on inset gray fill; theme flips with mode. */
export function CodeBlock({ code, language }: CodeBlockProps) {
  return (
    <pre
      className="overflow-x-auto rounded-[12px] bg-gray6 p-3.5 font-mono text-footnote leading-relaxed dark:bg-gray5"
      aria-label={language !== undefined ? `Code block: ${language}` : 'Code block'}
    >
      <code>{code}</code>
    </pre>
  );
}
