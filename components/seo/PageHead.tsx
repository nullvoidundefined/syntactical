// The document head of one web page: its title and, when given, a description and a canonical URL on the site's
// origin. Expo Router's Head writes it into the static HTML at build time and keeps it current in the browser; a
// PageHead deeper in the tree overrides one above it, so a route's title replaces the root layout's default.
import Head from 'expo-router/head';

export const SITE_ORIGIN = 'https://syntactical.dev';

type PageHeadProps = { canonicalPath?: string; description?: string; title: string };

export function PageHead({ canonicalPath, description, title }: PageHeadProps) {
  return (
    <Head>
      <title>{title}</title>
      {description === undefined ? null : <meta name="description" content={description} />}
      {canonicalPath === undefined ? null : <link rel="canonical" href={`${SITE_ORIGIN}${canonicalPath}`} />}
    </Head>
  );
}
