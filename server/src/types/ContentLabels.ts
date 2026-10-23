// Display text from the manifest the study note needs: each track's label by id, and each
// misconception's description by id.
type ContentLabels = {
  languages: ReadonlyMap<string, string>;
  misconceptions: ReadonlyMap<string, string>;
};

export type { ContentLabels };
