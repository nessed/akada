/**
 * Canonical public origin, no trailing slash.
 *
 * Drives metadataBase (so OG/Twitter tags and the manifest resolve to real
 * absolute URLs instead of localhost), robots.txt and sitemap.xml. Set
 * NEXT_PUBLIC_SITE_URL in production; the Vercel fallbacks keep preview
 * deployments self-consistent when it is not set.
 */
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');

  const vercelProduction = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProduction) return `https://${vercelProduction}`;

  const vercelDeployment = process.env.NEXT_PUBLIC_VERCEL_URL;
  if (vercelDeployment) return `https://${vercelDeployment}`;

  return 'http://localhost:3000';
}

export const SITE_URL = resolveSiteUrl();
