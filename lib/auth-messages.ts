/**
 * Minimum password length enforced in the UI. Keep this in step with
 * Supabase Auth → Policies → Minimum password length, which is the only
 * enforcement that actually protects the account.
 */
export const MIN_PASSWORD_LENGTH = 8;

/** Codes we attach to /auth?error=... from the callback route. */
export function authRedirectErrorMessage(code: string): string {
  switch (code) {
    case 'missing_code':
      return 'That link is missing its confirmation code. Try signing in instead.';
    case 'link_expired':
      return 'That link has expired or has already been used. Request a new one and try again.';
    case 'supabase_not_configured':
      return 'Sign-in is not configured for this build. Please contact support.';
    case 'callback_failed':
      return 'We could not finish signing you in. Please try again.';
    default:
      return 'Could not complete authentication. Please try again.';
  }
}

/**
 * Supabase error strings are developer-facing and, on sign-up, disclose
 * whether an address already has an account. Map them to copy that is useful
 * to the person typing without confirming or denying that an account exists.
 */
export function friendlyAuthError(
  raw: string,
  context: 'signin' | 'signup' | 'reset',
): string {
  const message = raw.toLowerCase();

  if (message.includes('invalid login credentials')) {
    return 'That email and password combination is not right.';
  }
  if (message.includes('email not confirmed')) {
    return 'Please confirm your email address first, check your inbox for the link.';
  }
  if (
    message.includes('already registered') ||
    message.includes('already been registered') ||
    message.includes('user already exists')
  ) {
    // Deliberately vague: revealing that an address is taken lets anyone
    // enumerate who has an account.
    return 'Check your email to continue setting up your account.';
  }
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (message.includes('password') && message.includes('should be at least')) {
    return `Please choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (message.includes('weak') || message.includes('pwned') || message.includes('compromised')) {
    return 'That password has appeared in a known data breach. Please choose a different one.';
  }
  if (message.includes('same password')) {
    return 'That is already your current password. Please choose a different one.';
  }
  if (message.includes('invalid email') || message.includes('unable to validate email')) {
    return 'Please enter a valid email address.';
  }
  if (
    message.includes('session') ||
    message.includes('expired') ||
    message.includes('jwt')
  ) {
    return 'Your link has expired. Please request a new one.';
  }
  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'We could not reach the server. Check your connection and try again.';
  }

  switch (context) {
    case 'signup':
      return 'We could not create that account. Please try again.';
    case 'reset':
      return 'We could not update your password. Please try again.';
    default:
      return 'We could not sign you in. Please try again.';
  }
}
