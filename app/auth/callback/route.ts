import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${origin}/auth?error=missing_code`);
  }

  const cookieStore = request.cookies;
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.redirect(`${origin}/dashboard`);
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(`${origin}/auth?error=callback_failed`);
  }

  // Check if user has completed onboarding
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: settings } = await supabase
      .from('user_settings')
      .select('onboarding_complete')
      .eq('user_id', user.id)
      .maybeSingle();

    const destination =
      settings?.onboarding_complete ? '/dashboard' : '/onboarding';

    const redirectUrl = new URL(destination, origin);
    // Re-create response to use correct redirect URL
    const finalResponse = NextResponse.redirect(redirectUrl);
    // Copy cookies from the supabase response
    response.cookies.getAll().forEach((cookie) => {
      finalResponse.cookies.set(cookie.name, cookie.value);
    });
    return finalResponse;
  }

  return response;
}
