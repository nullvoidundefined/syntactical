type PlayTarget = { count?: number; difficulty: string; language: string; screen?: 'length' | 'play'; topic?: string };

// The round (or length step) route for a bank, with the optional topic and sample length as
// query params.
export function buildPlayHref({ count, difficulty, language, screen = 'play', topic }: PlayTarget): string {
  const query = [
    topic === undefined ? '' : `topic=${encodeURIComponent(topic)}`,
    count === undefined ? '' : `count=${count}`,
  ].filter(Boolean);
  return `/${language}/${difficulty}/${screen}${query.length > 0 ? `?${query.join('&')}` : ''}`;
}
