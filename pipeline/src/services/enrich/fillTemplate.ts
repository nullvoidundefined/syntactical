// Fills `{{NAME}}` placeholders in one pass over the template, so substituted text (which
// may be untrusted question content) is never rescanned for placeholders. An unknown
// placeholder is left as written.
export function fillTemplate(template: string, values: Record<string, string>): string {
    return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, name: string) => (Object.hasOwn(values, name) ? (values[name] as string) : match));
}
