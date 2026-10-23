import { describe, expect, it } from 'vitest';

import { readWorkspaceHeaders } from '../../clients/readWorkspaceHeaders.js';

describe('readWorkspaceHeaders', () => {
    it('sends ANTHROPIC_WORKSPACE_ID as anthropic-workspace-id, trimmed', () => {
        expect(readWorkspaceHeaders({ ANTHROPIC_WORKSPACE_ID: ' wrkspc_test ' })).toEqual({
            'anthropic-workspace-id': 'wrkspc_test',
        });
    });

    it.each([[{}], [{ ANTHROPIC_WORKSPACE_ID: '  ' }]])('sends nothing when unset or blank (%o)', (env) => {
        expect(readWorkspaceHeaders(env)).toEqual({});
    });
});
