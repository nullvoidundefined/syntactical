// The direct sponsor in content/sponsor.json: card text, an https link, an optional icon under content/,
// and the first and last day (inclusive, YYYY-MM-DD) it shows.
export type Sponsor = {
  headline: string;
  body: string;
  href: string;
  iconPath?: string;
  startsOn: string;
  endsOn: string;
};
