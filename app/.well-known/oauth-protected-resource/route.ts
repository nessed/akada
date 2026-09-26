import { protectedResourceMetadata } from '@/app/.well-known/oauth-protected-resource/metadata';

export const dynamic = 'force-dynamic';

export function GET() {
  return protectedResourceMetadata();
}
