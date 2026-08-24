'use client';

import { useEffect, useState } from 'react';
import type * as KatexNamespace from 'katex';

import { hasPendingMath, segmentStream } from '@/src/frontend/katex-stream-buffer.js';

function escapeHtml(tex: string): string {
  return tex.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface KaTeXBlockProps {
  /** Raw (possibly mid-stream) text containing $…$ / $$…$$ math. */
  content: string;
}

/**
 * Math-safe renderer over the Sprint-3 G5 segmentation core.
 * Incomplete math renders as a dimmed skeleton until its closer arrives.
 * KaTeX itself loads as an async chunk — first paint never waits for it
 * (S8A-T8 budget: learner shell first load ≤200KB gz).
 */
export function KaTeXBlock({ content }: KaTeXBlockProps) {
  const [katex, setKatex] = useState<typeof KatexNamespace | null>(null);

  useEffect(() => {
    let mounted = true;
    void import('katex').then((mod) => {
      if (mounted) setKatex(mod.default as unknown as typeof KatexNamespace);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const segments = segmentStream(content);
  const pending = hasPendingMath(segments);

  function renderMath(tex: string, display: boolean): string {
    if (katex === null) return `<code>${escapeHtml(tex)}</code>`;
    try {
      return katex.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
        strict: false,
        output: 'html'
      });
    } catch {
      return `<code>${escapeHtml(tex)}</code>`; // degrade safely — never crash the stream (G5)
    }
  }

  return (
    <div aria-busy={pending} className="text-chat-body leading-relaxed">
      {segments.map((seg, i) => {
        if (seg.kind === 'text') return <span key={i}>{seg.content}</span>;
        return (
          <span
            key={i}
            className={seg.complete ? '' : 'animate-pulse opacity-60'}
            dangerouslySetInnerHTML={{ __html: renderMath(seg.content, seg.display) }}
          />
        );
      })}
    </div>
  );
}
