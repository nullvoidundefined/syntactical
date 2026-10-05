// Gap-fill checks CLI readiness before spending any generation calls.
import type { JudgeDeps } from './JudgeDeps.js';
export interface GapFillJudge extends JudgeDeps {
    assertReady: () => Promise<void>;
}
