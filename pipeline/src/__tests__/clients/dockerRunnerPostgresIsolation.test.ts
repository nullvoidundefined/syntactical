// A Postgres oracle runs as a non-superuser role, so it cannot run programs on
// the runner (pr14 HIGH: COPY TO PROGRAM worked as the bootstrap superuser).
//
// Real Docker, same as dockerRunner.test.ts. Set SKIP_DOCKER_TESTS=1 to skip.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { runOracle } from "../../clients/dockerRunner.js";
import { ensureRunnerImage } from "../../clients/ensureRunnerImage.js";
import {
  acquireDockerTestLock,
  DOCKER_LOCK_WAIT_MS,
  killLeftoverRunnerContainers,
  releaseDockerTestLock,
  runningRunnerContainers,
} from "../fixtures/dockerTestLock.js";

const SKIP_DOCKER = process.env.SKIP_DOCKER_TESTS === "1";

const RUN_TIMEOUT_MS = 60_000;

// SQLSTATE insufficient_privilege.
const INSUFFICIENT_PRIVILEGE = "42501";

describe.skipIf(SKIP_DOCKER)(
  "runOracle Postgres privilege isolation (B-8c)",
  () => {
    beforeAll(async () => {
      await acquireDockerTestLock();
      await ensureRunnerImage("postgres");
    }, DOCKER_LOCK_WAIT_MS + 300_000);

    afterEach(() => {
      killLeftoverRunnerContainers();
    });

    afterAll(() => {
      releaseDockerTestLock();
    });

    describe("superuser-only capabilities are denied", () => {
      it(
        "refuses COPY TO PROGRAM with insufficient_privilege",
        async () => {
          const run = await runOracle({
            language: "postgres",
            code: "COPY (SELECT 1) TO PROGRAM 'id'",
          });

          expect(run.outcome, JSON.stringify(run)).toBe("exception");
          expect(run.exceptionType).toBe(INSUFFICIENT_PRIVILEGE);
          expect(run.value).toBeUndefined();
          expect(runningRunnerContainers("postgres")).toBe("");
        },
        RUN_TIMEOUT_MS,
      );
    });
  },
);
