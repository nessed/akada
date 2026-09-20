import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';
import { cleanDisplayName } from '@/lib/planner-safety';

const OTP_TYPES: readonly EmailOtpType[] = [
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
];

function isOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (OTP_TYPES as readonly string[]).includes(value);
}

/**
 * Only same-origin relative paths are allowed as a post-auth destination.
 * Anything protocol-relative ("//evil.com"), backslash-smuggled ("/\evil.com")
 * or absolute is rejected, so `?next=` can never become an open redirect.
 */
function safeNextPath(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/')) return null;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null;
  return raw;
}

/**
 * Supabase hands back `error` / `error_code` / `error_description` on the
 * query string when a link is expired, already consumed, or declined. Map it
 * onto the small set of codes the /auth page knows how to phrase.
 */
function normalizeCallbackError(
  error: string | null,
  errorCode: string | null,
): string {
  const raw = (errorCode || error || '').toLowerCase();
  if (raw.includes('expired') || raw.includes('otp')) return 'link_expired';
  if (raw === 'access_denied') return 'link_expired';
  return 'callback_failed';
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.redirect(new URL('/auth?error=supabase_not_configured', origin));
  }

  // Cookies Supabase asks us to write are collected here and then applied to
  // whichever response we actually return, with their options intact. Setting
  // them on a throwaway response and copying only name/value dropped maxAge,
  // httpOnly, sameSite, secure and path, which downgraded the refresh token to
  // a session cookie and logged people out at random.
  const pendingCookies: {
    name: string;
    value: string;
    options: Record<string, unknown>;
  }[] = [];

  function redirectTo(path: string) {
    const response = NextResponse.redirect(new URL(path, origin));
    for (const { name, value, options } of pendingCookies) {
      response.cookies.set(name, value, options);
    }
    return response;
  }

  const errorParam = searchParams.get('error');
  const errorCodeParam = searchParams.get('error_code');
  if (errorParam || errorCodeParam) {
    return redirectTo(`/auth?error=${normalizeCallbackError(errorParam, errorCodeParam)}`);
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          pendingCookies.push(
            ...cookiesToSet.map(({ name, value, options }) => ({
              name,
              value,
              options: (options ?? {}) as Record<string, unknown>,
            })),
          );
        },
      },
    },
  );

  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const otpType = searchParams.get('type');

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return redirectTo('/auth?error=link_expired');
  } else if (tokenHash && isOtpType(otpType)) {
    const { error } = await supabase.auth.verifyOtp({
      type: otpType,
      token_hash: tokenHash,
    });
    if (error) return redirectTo('/auth?error=link_expired');
  } else {
    return redirectTo('/auth?error=missing_code');
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return redirectTo('/auth?error=callback_failed');

  // A recovery link means "let this person set a new password", never
  // "drop them on the dashboard".
  if (otpType === 'recovery') {
    return redirectTo('/auth/reset');
  }

  const { data: settings } = await supabase
    .from('user_settings')
    .select('onboarding_complete, display_name')
    .eq('user_id', user.id)
    .maybeSingle();

  // Seed the display name captured at sign-up, but never clobber a name the
  // user has since changed in settings.
  const signupName =
    typeof user.user_metadata?.display_name === 'string'
      ? cleanDisplayName(user.user_metadata.display_name)
      : '';
  if (signupName && !settings?.display_name) {
    await supabase.from('user_settings').upsert(
      {
        user_id: user.id,
        display_name: signupName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
  }

  const fallback = settings?.onboarding_complete ? '/dashboard' : '/onboarding';
  return redirectTo(safeNextPath(searchParams.get('next')) ?? fallback);
}
