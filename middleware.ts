import { NextResponse, type NextRequest } from 'next/server';

import { SESSION_COOKIE, verifySignedSessionEdge } from '@/lib/auth/session-edge';

/**
 * S8B-T1 — edge RBAC gate. Maps the signed session cookie to an identity and
 * enforces route access BEFORE any page/route handler runs (fail closed):
 *
 *   /educator/**          → INSTRUCTOR|ADMIN only; LEARNER gets redirected to
 *                           /today?denied=educator (macOS Alert modal there —
 *                           never a bare 403)
 *   learner workspace +   → any authenticated session; anonymous users are
 *   /api/educator/**        sent to /signin
 *   /signin               → authenticated users bounce back to /today
 */

const PROTECTED_PREFIXES = ['/today', '/plan', '/settings', '/review', '/badges', '/onboarding'];
const EDUCATOR_PREFIX = '/educator';

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname, search } = req.nextUrl;
  const session = await verifySignedSessionEdge(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === '/signin') {
    if (session !== null) return NextResponse.redirect(new URL('/today', req.url));
    return NextResponse.next();
  }

  const isEducator = pathname === EDUCATOR_PREFIX || pathname.startsWith(`${EDUCATOR_PREFIX}/`);
  const isProtected =
    isEducator ||
    PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname.startsWith('/api/educator');

  if (!isProtected || session !== null) {
    if (isEducator && session !== null && session.role === 'LEARNER') {
      // macOS Alert + redirect pattern — never a bare 403.
      return NextResponse.redirect(new URL('/today?denied=educator', req.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  }
  const signIn = new URL('/signin', req.url);
  if (isEducator) signIn.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: [
    '/today/:path*',
    '/plan/:path*',
    '/settings/:path*',
    '/review/:path*',
    '/badges/:path*',
    '/onboarding/:path*',
    '/educator/:path*',
    '/api/educator/:path*',
    '/signin'
  ]
};
