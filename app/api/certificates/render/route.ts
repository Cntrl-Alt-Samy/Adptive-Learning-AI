import { getCertificate, certificateSvg, certificatePdf } from '@/lib/server/certificates';

/**
 * S8B-T4 — certificate render endpoint. SVG/PDF generation lives in the S5
 * engine (node:crypto Buffer) so this must stay on the Node runtime.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const type = url.searchParams.get('type') === 'pdf' ? 'pdf' : 'svg';
  const code = url.searchParams.get('code') ?? '';

  if (getCertificate(code) === null) {
    return Response.json({ error: 'UNKNOWN_CODE' }, { status: 404 });
  }

  try {
    if (type === 'pdf') {
      const bytes = certificatePdf(code);
      return bytes === null
        ? Response.json({ error: 'RENDER_FAILED' }, { status: 500 })
        : new Response(new Uint8Array(bytes), {
            headers: {
              'content-type': 'application/pdf',
              'content-disposition': `attachment; filename="learnos-certificate.pdf"`,
              'cache-control': 'no-store'
            }
          });
    }
    const svg = certificateSvg(code);
    return svg === null
      ? Response.json({ error: 'RENDER_FAILED' }, { status: 500 })
      : new Response(svg, {
          headers: {
            'content-type': 'image/svg+xml',
            'content-disposition': `attachment; filename="learnos-certificate.svg"`,
            'cache-control': 'no-store'
          }
        });
  } catch {
    return Response.json({ error: 'RENDER_FAILED' }, { status: 500 });
  }
}
