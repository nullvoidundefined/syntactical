// The parts of the GET /v1/me profile the app reads: the daily goal in force
// today, the day streak, and XP today, all computed by the server from
// synced events in the user's stored timezone. The account email and whether it has a password
// come from the same response; a response without them leaves them out.
export type Profile = { dailyGoal: number; dayStreak: number; email?: string; hasPassword?: boolean; xpToday: number };
