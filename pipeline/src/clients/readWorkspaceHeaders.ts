// The anthropic-workspace-id header for the API provider, from ANTHROPIC_WORKSPACE_ID in the
// environment. An organization-level ANTHROPIC_API_KEY is refused without it; a workspace-scoped
// key needs none, and an unset or blank value sends nothing.
export function readWorkspaceHeaders(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
    const workspaceId = env.ANTHROPIC_WORKSPACE_ID?.trim();
    return workspaceId ? { 'anthropic-workspace-id': workspaceId } : {};
}
