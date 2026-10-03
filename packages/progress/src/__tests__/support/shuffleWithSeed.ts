// A deterministic Fisher-Yates shuffle driven by mulberry32, so the order
// independence tests replay the same 100 orders on every run.
const MULBERRY_INCREMENT = 0x6d2b79f5;
const MULBERRY_SHIFT_A = 15;
const MULBERRY_SHIFT_B = 7;
const MULBERRY_SHIFT_C = 14;
const MULBERRY_OR_MASK = 61;
const UINT32_RANGE = 4294967296;

function createRandom(seed: number): () => number {
    let state = seed >>> 0;
    return function nextRandom(): number {
        state = (state + MULBERRY_INCREMENT) >>> 0;
        let mixed = Math.imul(state ^ (state >>> MULBERRY_SHIFT_A), state | 1);
        mixed ^= mixed + Math.imul(mixed ^ (mixed >>> MULBERRY_SHIFT_B), mixed | MULBERRY_OR_MASK);
        return ((mixed ^ (mixed >>> MULBERRY_SHIFT_C)) >>> 0) / UINT32_RANGE;
    };
}

export function shuffleWithSeed<T>(items: readonly T[], seed: number): T[] {
    const nextRandom = createRandom(seed);
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(nextRandom() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
}
