// Vitest globalSetup for the server integration tests: provides a local
// Postgres admin URL as `testDatabaseUrl` (see src/testing/setupTestDatabase).
import type { TestProject } from 'vitest/node';

import { setupTestDatabase } from '../../testing/setupTestDatabase.js';

export default function setup({ provide }: TestProject): Promise<() => void> {
    return setupTestDatabase(provide);
}
