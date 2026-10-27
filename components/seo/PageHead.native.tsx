// Native apps have no document head; the page title and links are for the web build only.
export const SITE_ORIGIN = 'https://syntactical.dev';

export function PageHead(_props: { canonicalPath?: string; description?: string; title: string }) {
  return null;
}
