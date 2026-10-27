// Native builds have no static export to crawl, so the track summary renders nothing there (and keeps the
// build-time counts out of the native bundle).
export function TrackSummary(_props: { language: string }) {
  return null;
}
