// The official documentation hosts a track's reference may link to. A link passes when its host is
// one of these or a dot-boundary subdomain of one (see checkSourceUrl).
export const DOC_HOSTS: Readonly<Record<string, readonly string[]>> = {
    'backend-security': ['owasp.org', 'docs.python.org', 'nodejs.org', 'postgresql.org'],
    'frontend-security': ['developer.mozilla.org', 'owasp.org', 'w3.org', 'whatwg.org'],
    go: ['go.dev'],
    javascript: ['developer.mozilla.org', 'tc39.es'],
    postgres: ['postgresql.org'],
    python: ['docs.python.org'],
    rails: ['api.rubyonrails.org', 'guides.rubyonrails.org'],
    ruby: ['docs.ruby-lang.org', 'ruby-doc.org'],
    sql: ['postgresql.org', 'sqlite.org'],
    typescript: ['typescriptlang.org'],
};
