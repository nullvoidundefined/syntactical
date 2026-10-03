// Reads the owner's checkboxes back out of a review file. One `## <id> <!-- fp:<hash> -->`
// section per item, each with exactly one `approve` line and one `reject: <reason>` line.
// Anything else is reported on the item as a `problem` and left `pending`, never guessed:
// a malformed heading or checklist, both boxes checked, a reject with no reason, a
// duplicate id. Text inside code fences is ignored, so question text can never forge a
// heading or a checkbox.
import type { ReviewDecision } from '../../types/review/ReviewDecision.js';

const HEADING_PREFIX = '## ';
const HEADING = /^## (\S+) <!-- fp:([0-9a-f]{16}) -->\s*$/;
const APPROVE_LINE = /^- \[( |x|X)\] approve\s*$/;
const REJECT_LINE = /^- \[( |x|X)\] reject:?(.*)$/;
const FENCE_OPEN = /^(`{3,})/;
const REASON_PLACEHOLDER = '<reason>';
const UNKNOWN_ID = '(unknown)';

interface Section {
    approves: boolean[];
    fingerprint?: string;
    headingText: string;
    id: string;
    rejects: { isChecked: boolean; reason: string }[];
}

function splitSections(markdown: string): Section[] {
    const sections: Section[] = [];
    let fence: string | undefined;
    for (const line of markdown.split(/\r?\n/)) {
        if (fence !== undefined) {
            if (new RegExp(`^\`{${fence.length},}\\s*$`).test(line)) {
                fence = undefined;
            }
            continue;
        }
        const opening = FENCE_OPEN.exec(line);
        if (opening) {
            [, fence] = opening;
            continue;
        }
        if (line.startsWith(HEADING_PREFIX)) {
            const heading = HEADING.exec(line);
            const [, id, fingerprint] = heading ?? [];
            sections.push({
                approves: [],
                headingText: line,
                id: id ?? (line.slice(HEADING_PREFIX.length).split(/\s+/)[0] || UNKNOWN_ID),
                rejects: [],
                ...(fingerprint === undefined ? {} : { fingerprint }),
            });
            continue;
        }
        const section = sections.at(-1);
        const approve = APPROVE_LINE.exec(line);
        const reject = REJECT_LINE.exec(line);
        if (section && approve) {
            section.approves.push(approve[1] !== ' ');
        } else if (section && reject) {
            section.rejects.push({ isChecked: reject[1] !== ' ', reason: (reject[2] ?? '').trim() });
        }
    }
    return sections;
}

function decide(section: Section, isDuplicate: boolean): ReviewDecision {
    const { approves, fingerprint, headingText, id, rejects } = section;
    const pending = (problem: string): ReviewDecision => ({
        decision: 'pending',
        id,
        problem,
        ...(fingerprint === undefined ? {} : { fingerprint }),
    });
    if (!HEADING.test(headingText)) {
        return pending('malformed heading: expected "## <id> <!-- fp:<16 hex> -->"');
    }
    if (isDuplicate) {
        return pending('duplicate id');
    }
    if (approves.length !== 1 || rejects.length !== 1) {
        return pending('malformed checklist: expected one approve line and one reject line');
    }
    const [isApproved] = approves;
    const [{ isChecked: isRejected, reason }] = rejects as [{ isChecked: boolean; reason: string }];
    if (isApproved && isRejected) {
        return pending('both approve and reject are checked');
    }
    if (isApproved) {
        return { decision: 'approve', id, ...(fingerprint === undefined ? {} : { fingerprint }) };
    }
    if (!isRejected) {
        return { decision: 'pending', id, ...(fingerprint === undefined ? {} : { fingerprint }) };
    }
    if (reason === '' || reason === REASON_PLACEHOLDER) {
        return pending('reject needs a reason');
    }
    return { decision: 'reject', id, reason, ...(fingerprint === undefined ? {} : { fingerprint }) };
}

export function readReviewDecisions(markdown: string): ReviewDecision[] {
    const seen = new Set<string>();
    return splitSections(markdown).map((section) => {
        const isDuplicate = seen.has(section.id);
        seen.add(section.id);
        return decide(section, isDuplicate);
    });
}
