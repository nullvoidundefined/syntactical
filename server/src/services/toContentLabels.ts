// The manifest's track labels and misconception descriptions, keyed by id, for the study note.
import type { Manifest } from '@syntactical/content-schema';

import type { ContentLabels } from '../types/ContentLabels.js';

function toContentLabels({ languages }: Manifest): ContentLabels {
  return {
    languages: new Map(languages.map(({ id, label }) => [id, label])),
    misconceptions: new Map(
      languages.flatMap(({ misconceptions }) => misconceptions.map(({ description, id }) => [id, description])),
    ),
  };
}

export { toContentLabels };
