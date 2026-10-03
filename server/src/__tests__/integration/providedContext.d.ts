// The values globalSetup.ts provides to integration tests through inject().
import 'vitest';

declare module 'vitest' {
    export interface ProvidedContext {
        testDatabaseUrl: string;
    }
}
