// The weakness report: still gathering answers (`remaining` is how many
// more the last 7 days need, with no spots), or ready with the most-missed
// misconceptions of that window (`remaining` is 0).
export type WeakSpot = { attempts: number; description: string; misconceptionId: string; misses: number; missRate: number };

export type WeaknessReport = { remaining: number; spots: WeakSpot[]; status: 'gathering' | 'ready' };
