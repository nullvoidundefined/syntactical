// The pipeline CLI's command dispatch, with every side effect injected so the real entry path can be tested:
// `validate`, `draft-oracles [--api]`, `draft-taxonomy <language> [--api]`, `classify [--api]`, `gap-fill [--api]`,
// `enrich [--api] [--judge-without-oracle] [--language <ids>]`, `rewrite-prompts [--api]`, `review`, or `publish`.
// `enrich --judge-without-oracle` also enriches questions with no oracle from their answer key, judged by a second
// model; `write-references [--api] [--language <id>[,<id>...]]` writes before-answer references (two models check
// each one); `verify-doc-links [--recheck]` checks their links over the network; and `apply-staging` merges staged
// rationales and references into every bank. Every command reads banks from `contentDir` and stages under
// `pipelineDir`. The second model is PIPELINE_SECOND_MODEL, by default DEFAULT_SECOND_MODEL.
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { exitCodeFor } from '../services/exitCodeFor.js';
import { pickProviderKind } from '../services/pickProviderKind.js';
import type { SourceFetcher } from '../clients/sourceFetcher.js';
import type { ModelProvider } from '../types/ModelProvider.js';

import type { applyStaging } from './applyStaging.js';

import type { classify } from './classify.js';
import type { draftOracles } from './draftOracles.js';
import type { draftTaxonomy } from './draftTaxonomy.js';
import type { enrich } from './enrich.js';
import type { gapFill } from './gapFill.js';
import type { publish } from './publish.js';
import type { review } from './review.js';
import type { rewritePrompts } from './rewritePrompts.js';
import type { validateContent } from './validate.js';
import type { verifyDocLinks } from './verifyDocLinks.js';
import type { writeReferences } from './writeReferences.js';

export const DEFAULT_SECOND_MODEL = 'claude-haiku-5-5';

export interface CliDeps {
    applyStaging: typeof applyStaging;
    buildManifest: () => Promise<void>;
    classify: typeof classify;
    contentDir: string;
    env: Record<string, string | undefined>;
    createProvider: (kind: 'api' | 'cli', model?: string) => ModelProvider;
    createSourceFetcher: (allowedHosts: readonly string[]) => SourceFetcher;
    draft: typeof draftOracles;
    gapFill: typeof gapFill;
    draftTaxonomy: typeof draftTaxonomy;
    enrich: typeof enrich;
    pipelineDir: string;
    publish: typeof publish;
    review: typeof review;
    rewritePrompts: typeof rewritePrompts;
    stderr: (text: string) => void;
    stdout: (text: string) => void;
    validate: typeof validateContent;
    verifyDocLinks: typeof verifyDocLinks;
    writeReferences: typeof writeReferences;
}

const FIRST_COMMAND_ARG = 2;

async function runStagingCommand(command: 'classify' | 'gap-fill', argv: string[], deps: CliDeps): Promise<number> {
    const { classify: runClassify, contentDir, createProvider, gapFill: runGapFill, pipelineDir, stdout } = deps;
    const shared = {
        contentDir,
        log: (line: string) => stdout(`${line}\n`),
        newRunId: randomUUID,
        now: () => new Date().toISOString(),
        pipelineDir,
        provider: createProvider(pickProviderKind(argv)),
    };
    if (command === 'gap-fill') await runGapFill(shared);
    else await runClassify(shared);
    return 0;
}

// `review` needs no model: it shows each item's oracle output, re-run through the sandbox.
async function runReview(deps: CliDeps): Promise<number> {
    const { contentDir, pipelineDir, review: run, stdout } = deps;
    const result = await run({ contentDir, log: (line) => stdout(`${line}\n`), pipelineDir });
    return result.problems > 0 ? 1 : 0;
}

// The provider for the second judge, on a different model from the first.
function createSecondProvider(argv: string[], deps: CliDeps): ModelProvider {
    const { createProvider, env } = deps;
    return createProvider(pickProviderKind(argv), env.PIPELINE_SECOND_MODEL || DEFAULT_SECOND_MODEL);
}

// The comma-separated ids after `--language`, or undefined without the flag.
function readLanguagesFlag(argv: string[]): string[] | undefined {
    const index = argv.indexOf('--language');
    if (index === -1) return undefined;
    return (argv[index + 1] ?? '').split(',').filter((id) => id !== '');
}

async function runWriteReferences(argv: string[], deps: CliDeps): Promise<number> {
    const { contentDir, createProvider, pipelineDir, stderr, stdout, writeReferences: run } = deps;
    const languages = readLanguagesFlag(argv);
    if (languages !== undefined && languages.length === 0) {
        stderr('--language needs one or more language ids, separated by commas\n');
        return 1;
    }
    const result = await run({
        contentDir,
        ...(languages === undefined ? {} : { languages }),
        log: (line) => stdout(`${line}\n`),
        pipelineDir,
        provider: createProvider(pickProviderKind(argv)),
        secondProvider: createSecondProvider(argv, deps),
    });
    stdout(`${JSON.stringify(result)}\n`);
    return 0;
}

async function runVerifyDocLinks(argv: string[], deps: CliDeps): Promise<number> {
    const { createSourceFetcher, pipelineDir, stdout, verifyDocLinks: run } = deps;
    const { failed } = await run({
        createFetcher: createSourceFetcher,
        log: (line) => stdout(`${line}\n`),
        now: () => new Date().toISOString(),
        pipelineDir,
        recheck: argv.includes('--recheck'),
    });
    return failed === 0 ? 0 : 1;
}

// Every bank; the manifest build afterwards rehashes the banks it changed.
async function runApplyStaging(deps: CliDeps): Promise<number> {
    const { applyStaging: run, buildManifest, contentDir, pipelineDir, stdout } = deps;
    const tally = await run({
        buildManifest,
        contentDir,
        log: (line) => stdout(`${line}\n`),
        pipelineDir,
    });
    stdout(`${JSON.stringify(tally)}\n`);
    return 0;
}

async function runEnrich(argv: string[], deps: CliDeps): Promise<number> {
    const { contentDir, createProvider, enrich: run, pipelineDir, stdout } = deps;
    const isJudgedWithoutOracle = argv.includes('--judge-without-oracle');
    const languages = readLanguagesFlag(argv);
    if (languages !== undefined && languages.length === 0) {
        deps.stderr('--language needs one or more language ids, separated by commas\n');
        return 1;
    }
    await run({
        contentDir,
        ...(languages === undefined ? {} : { languages }),
        log: (line) => stdout(`${line}\n`),
        newRunId: randomUUID,
        now: () => new Date().toISOString(),
        pipelineDir,
        provider: createProvider(pickProviderKind(argv)),
        ...(isJudgedWithoutOracle ? { secondProvider: createSecondProvider(argv, deps) } : {}),
    });
    return 0;
}

async function runPublish(argv: string[], deps: CliDeps): Promise<number> {
    const { buildManifest, contentDir, pipelineDir, publish: run, stderr, stdout } = deps;
    const { banks } = await run({
        buildManifest,
        contentDir,
        log: (line) => stdout(`${line}\n`),
        newRunId: randomUUID,
        now: () => new Date().toISOString(),
        pipelineDir,
    });
    const refusedBanks = Object.entries(banks).filter(([, { isWritten }]) => !isWritten);
    for (const [bankKey] of refusedBanks) {
        stderr(`bank refused: ${bankKey}\n`);
    }
    return refusedBanks.length === 0 ? 0 : 1;
}

export async function runCli(argv: string[], deps: CliDeps): Promise<number> {
    const {
        contentDir,
        createProvider,
        draft,
        draftTaxonomy: draftTaxonomyList,
        pipelineDir,
        stderr,
        stdout,
        validate,
    } = deps;
    const [command] = argv.slice(FIRST_COMMAND_ARG);
    if (command === 'draft-oracles') {
        await draft({
            contentDir,
            log: (line) => stdout(`${line}\n`),
            oraclesDir: join(pipelineDir, 'oracles'),
            provider: createProvider(pickProviderKind(argv)),
        });
        return 0;
    }
    if (command === 'draft-taxonomy') {
        const [language] = argv.slice(FIRST_COMMAND_ARG + 1).filter((arg) => !arg.startsWith('--'));
        if (language === undefined) {
            stderr('draft-taxonomy needs a language\n');
            return 1;
        }
        await draftTaxonomyList({
            contentDir,
            language,
            log: (line) => stdout(`${line}\n`),
            pipelineDir,
            provider: createProvider(pickProviderKind(argv)),
        });
        return 0;
    }
    if (command === 'classify' || command === 'gap-fill') {
        return runStagingCommand(command, argv, deps);
    }
    if (command === 'enrich') {
        return runEnrich(argv, deps);
    }
    if (command === 'review') {
        return runReview(deps);
    }
    if (command === 'write-references') {
        return runWriteReferences(argv, deps);
    }
    if (command === 'verify-doc-links') {
        return runVerifyDocLinks(argv, deps);
    }
    if (command === 'apply-staging') {
        return runApplyStaging(deps);
    }
    if (command === 'rewrite-prompts') {
        await deps.rewritePrompts({
            contentDir,
            log: (line) => stdout(`${line}\n`),
            pipelineDir,
            provider: createProvider(pickProviderKind(argv)),
        });
        return 0;
    }
    if (command === 'publish') {
        return runPublish(argv, deps);
    }
    if (command !== 'validate') {
        stderr(
            'Usage: pipeline validate | draft-oracles [--api] | draft-taxonomy <language> [--api] | classify [--api] | gap-fill [--api] | enrich [--api] [--judge-without-oracle] [--language <ids>] | write-references [--api] [--language <ids>] | verify-doc-links [--recheck] | apply-staging | rewrite-prompts [--api] | review | publish\n',
        );
        return 1;
    }
    const report = await validate({
        contentDir,
        newRunId: randomUUID,
        now: () => new Date().toISOString(),
        pipelineDir,
        reportsDir: join(pipelineDir, 'reports'),
    });
    stdout(`${JSON.stringify(report.counts)}\n`);
    return exitCodeFor(report.counts);
}
