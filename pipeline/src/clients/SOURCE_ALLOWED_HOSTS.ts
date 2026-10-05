// The documentation hosts a judged card may cite. A URL passes when its host is one of these or a
// subdomain of one. Keep pipeline/prompts/generateSecurityQuestion.md in step (a test checks it).
export const SOURCE_ALLOWED_HOSTS: readonly string[] = [
    'owasp.org',
    'cheatsheetseries.owasp.org',
    'developer.mozilla.org',
    'rfc-editor.org',
    'datatracker.ietf.org',
    'docs.python.org',
    'nodejs.org',
    'postgresql.org',
    'w3.org',
    'whatwg.org',
];
