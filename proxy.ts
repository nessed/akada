import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Default-deny: every route is private unless it is listed here. A page added
 * next week is protected until someone deliberately makes it public, which is
 * the opposite of the old hardcoded PROTECTED list.
 */
const PUBLIC_PATHS = new Set([
  '/',
  '/auth',
  '/auth/callback',
  '/auth/reset',
  '/auth/check-email',
  // Both have to be readable by someone who has not signed up, and by a
  // crawler.
  '/privacy',
  '/terms',
  // Next metadata route with no file extension. Social crawlers fetch it
  // unauthenticated, so leaving it protected silently kills link previews.
  '/opengraph-image',
  // Crash reporting has to work on the signed-out pages too.
  '/api/client-error',
]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // Static assets served out of /public, manifest, robots, sitemap, icons,
  // audio, always carry a file extension and must stay reachable signed out.
  return /\.[a-z0-9]+$/i.test(pathname);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = isPublicPath(pathname);

  let supabaseResponse = NextResponse.next({ request });

  const hasSupabaseConfig = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  // Dev-only escape hatch, matching the one in lib/data/index.ts: with
  // NEXT_PUBLIC_USE_LOCAL_DATA=true the app runs entirely off localStorage
  // and there is no auth to enforce. Never available in a production build.
  const localDataMode =
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_USE_LOCAL_DATA === 'true';

  if (localDataMode) return supabaseResponse;

  // Fail closed. Without auth configured we cannot tell anyone apart, so
  // private routes stay shut rather than opening to everybody.
  if (!hasSupabaseConfig) {
    if (isPublic) return supabaseResponse;
    const url = request.nextUrl.clone();
    url.pathname = '/auth';
    url.search = '?error=supabase_not_configured';
    return NextResponse.redirect(url);
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: Use getUser() instead of getSession(); it validates the JWT
  // server-side and refreshes the access token when it has expired.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Signed-in users have no reason to see the landing or sign-in page.
  // /auth/reset is deliberately excluded: reaching it means the user is
  // mid-recovery and does need to set a new password.
  if (user && (pathname === '/' || pathname === '/auth')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Keep authenticated pages out of shared and intermediary caches, so a
  // signed-out browser cannot be handed a previous user's rendered page.
  if (!isPublic) {
    supabaseResponse.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate');
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - images, svgs, etc.
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
