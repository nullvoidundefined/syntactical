// The grammar a topic-track card gets from the runner its oracle chose.
import type { Grammar } from '@syntactical/content-schema';

import type { OracleLanguage } from '../types/OracleLanguage.js';

export const RUNNER_GRAMMARS: Record<OracleLanguage, Grammar> = {
    go: 'go',
    jsdom: 'javascript',
    node: 'javascript',
    postgres: 'sql',
    python: 'python',
    rails: 'ruby',
    ruby: 'ruby',
    typescript: 'typescript',
};
