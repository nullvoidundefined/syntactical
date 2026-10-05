// Renders one item as a markdown section: its facts, then the two checkboxes the owner
// edits. Every piece of untrusted text is fenced or collapsed to one line.
import type { Question } from '@syntactical/content-schema';

import type { ReviewItem } from '../../types/review/ReviewItem.js';

import { fenceText } from './fenceText.js';
import { fingerprintItem } from './fingerprintItem.js';

function oneLine(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

function describeChoices(question: Question): string {
    if (!('choices' in question)) {
        return `answer: ${String(question.answer)}`;
    }
    const { answerIndex, choices } = question;
    return choices.map(({ text }, index) => `${index === answerIndex ? '*' : ' '} ${index}: ${text}`).join('\n');
}

function renderQuestion(question: Question): string[] {
    const { code, prompt, type } = question;
    return [
        `Question (${type}):`,
        fenceText(prompt),
        ...(code === undefined ? [] : ['Code:', fenceText(code)]),
        'Choices (* marks the claimed answer):',
        fenceText(describeChoices(question)),
    ];
}

function renderDisputed(facts: NonNullable<ReviewItem['disputed']>): string[] {
    const { blindAnswers, claimedIndex, consistency, failure, sources } = facts;
    return [
        `Claimed answer: ${claimedIndex}`,
        `Blind answers: claude ${blindAnswers.claude ?? 'invalid'}, codex ${blindAnswers.codex ?? 'invalid'}`,
        `Failure: ${oneLine(failure)}`,
        'Consistency:',
        fenceText(consistency?.reason ?? '(not run)'),
        // Indent quoted lines inside the fence so source text cannot resemble review controls even as raw Markdown.
        ...sources.flatMap(({ title, url, quote }) => [
            `Source: ${oneLine(title)} (${oneLine(url)})`,
            fenceText(
                quote
                    .split(/\r?\n/)
                    .map((line) => `    ${line}`)
                    .join('\n'),
            ),
        ]),
    ];
}

export function renderReviewItem(item: ReviewItem, decisionLines: string[]): string {
    const { id, kinds, observed, proposedTopic, question, rationales, status } = item;
    return [
        `## ${id} <!-- fp:${fingerprintItem(item)} -->`,
        '',
        `Why it is here: ${oneLine(kinds.join(', '))}`,
        `Validation: ${oneLine(status ?? 'unknown')}`,
        `Proposed topic: ${oneLine(proposedTopic ?? 'none')}`,
        ...(question === undefined
            ? ['Question: not found in the bank or the generated file']
            : renderQuestion(question)),
        ...(item.disputed ? renderDisputed(item.disputed) : []),
        'Oracle output:',
        fenceText(observed ?? '(none: the oracle did not pass)'),
        ...(rationales === undefined
            ? []
            : [
                  'Rationales:',
                  ...rationales.flatMap(({ choiceIndex, misconceptionId, rationale }) => [
                      `Choice ${choiceIndex} (${oneLine(misconceptionId)}):`,
                      fenceText(rationale),
                  ]),
              ]),
        '',
        ...decisionLines,
        '',
    ].join('\n');
}
