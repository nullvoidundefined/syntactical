// Whether the database-backed tests skip: SKIP_DOCKER_TESTS=1 tells the integration globalSetup
// to start no container, and with no TEST_DATABASE_URL either there is no Postgres to run them
// against. CI sets TEST_DATABASE_URL, so the tests always run there.
export const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;
