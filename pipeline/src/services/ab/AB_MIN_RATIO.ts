// How many times faster the optimal option's median must be than the other's, on every
// benchmark run, before a performance A/B card may name it the winner. A ratio below this is
// inside the noise of a shared CPU and a cold container, so no winner is marked.
export const AB_MIN_RATIO = 2;
