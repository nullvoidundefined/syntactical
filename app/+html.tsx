// The document shell for every page of the static web export, rendered only in Node at build time: language, charset,
// viewport, the obsidian theme colour (also the body background, so there is no white flash before the styles load),
// and the EthicalAds client script only when extra.ethicalAdsPublisher is configured. The title is not set here:
// each page sets it through components/seo/PageHead, the root layout's default included.
import type { ReactNode } from 'react';

import { ScrollViewStyleReset } from 'expo-router/html';

import { EthicalAdsScript } from '../components/sponsor/EthicalAdsScript';

// The obsidian token in tailwind.config.js; htmlShell.web.test.tsx fails if they drift apart.
const THEME_COLOR = '#05060a';
const BODY_BACKGROUND = `body { background-color: ${THEME_COLOR}; }`;

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content={THEME_COLOR} />
        <ScrollViewStyleReset />
        {/* Plain text children: CodeBlock.test.tsx keeps raw HTML injection out of the app trees. */}
        <style>{BODY_BACKGROUND}</style>
        <EthicalAdsScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
