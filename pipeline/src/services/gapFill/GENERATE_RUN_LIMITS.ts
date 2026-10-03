// The fixed runner limits for every program gap-fill executes. The model cannot change them.
import type { RunLimits } from '../../types/RunLimits.js';

const GENERATE_TIMEOUT_MS = 5000;

export const GENERATE_RUN_LIMITS: RunLimits = { timeoutMs: GENERATE_TIMEOUT_MS };
