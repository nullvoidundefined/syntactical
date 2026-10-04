// Representative boundary checks for the manifest caps: a reference id is at most 64
// characters and a language carries at most 40 misconceptions. The limit is accepted
// and one past it is rejected with a rule naming the list at fault.
import { describe, expect, it } from "vitest";

import { validateManifest } from "../validateManifest.js";

const REFERENCE_ID_LENGTH = 64;
const MAX_MISCONCEPTIONS = 40;
const LANGUAGE_PREFIX = "python.";

const VALID_HASH = "a".repeat(32) + "0123456789abcdef".repeat(2);

type Fixture = Record<string, unknown>;

function buildFreeBank(difficulty: string): Fixture {
  return {
    path: `python/${difficulty}.json`,
    hash: VALID_HASH,
    access: "free",
    contentVersion: 1,
    topicCounts: {},
  };
}

function buildPaidBank(difficulty: string): Fixture {
  return {
    path: `python/${difficulty}.json`,
    hash: VALID_HASH,
    access: "paid",
    productId: `syntactical.python.${difficulty}`,
    contentVersion: 1,
    topicCounts: {},
  };
}

// One python language whose banks reference no topics, so the topic and
// misconception lists are the only possible source of a rejection.
function buildManifest(lists: {
  topics?: unknown[];
  misconceptions?: unknown[];
}): Fixture {
  return {
    schemaVersion: 2,
    languages: [
      {
        id: "python",
        label: "Python",
        glyph: "PY",
        tagline: "Runtime semantics, stdlib, and the sharp edges.",
        grammar: "python",
        topics: lists.topics ?? [{ id: "strings", label: "Strings" }],
        misconceptions: lists.misconceptions ?? [
          { id: "python.off-by-one", description: "Counts from one." },
        ],
        banks: {
          easy: buildFreeBank("easy"),
          medium: buildPaidBank("medium"),
          hard: buildPaidBank("hard"),
        },
      },
    ],
  };
}

function buildMisconceptions(count: number): Fixture[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `${LANGUAGE_PREFIX}belief-${index}`,
    description: `Wrong belief ${index}.`,
  }));
}

// A valid kebab-case slug of exactly `length` characters.
function buildSlug(length: number): string {
  return "a".repeat(length);
}

function expectAccepted(input: unknown): void {
  expect(validateManifest(input)).toEqual({ isValid: true, manifest: input });
}

function expectRejectedAt(input: unknown, rulePrefix: string): void {
  const result = validateManifest(input);
  expect(result.isValid).toBe(false);
  if (!result.isValid) {
    expect(
      result.rule.startsWith(rulePrefix),
      `rule "${result.rule}" should start with "${rulePrefix}"`,
    ).toBe(true);
  }
}

describe("validateManifest caps on network input", () => {
  it("accepts a 64-character topic id and rejects a 65-character one", () => {
    const atLimit = buildSlug(REFERENCE_ID_LENGTH);
    const pastLimit = buildSlug(REFERENCE_ID_LENGTH + 1);
    expectAccepted(buildManifest({ topics: [{ id: atLimit, label: "Long" }] }));
    expectRejectedAt(
      buildManifest({ topics: [{ id: pastLimit, label: "Long" }] }),
      "languages[0].topics",
    );
  });

  it("accepts 40 misconceptions in one language and rejects 41", () => {
    expectAccepted(
      buildManifest({
        misconceptions: buildMisconceptions(MAX_MISCONCEPTIONS),
      }),
    );
    expectRejectedAt(
      buildManifest({
        misconceptions: buildMisconceptions(MAX_MISCONCEPTIONS + 1),
      }),
      "languages[0].misconceptions",
    );
  });
});
