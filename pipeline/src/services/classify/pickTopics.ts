// The manifest's topic list wins; pipeline/topics.json covers a language whose manifest lists none.
export function pickTopics(manifestTopics: { id: string }[], fallback: string[] | undefined): string[] {
    const fromManifest = manifestTopics.map(({ id }) => id);
    return fromManifest.length > 0 ? fromManifest : (fallback ?? []);
}
