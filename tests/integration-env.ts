// Make BASE_URL available to integration tests
// The Next.js dev server is started by integration.setup.ts on port 3999
process.env.INTEGRATION_BASE_URL = "http://127.0.0.1:3999";
