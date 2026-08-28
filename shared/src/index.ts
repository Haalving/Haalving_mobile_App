/**
 * @haalving/shared — the one place the API, the console and the client app agree.
 *
 * Everything here is PURE: no database client, no fetch, no React, no Node
 * built-ins beyond types. That is what lets the same permission test run in an
 * Express middleware, a Next.js middleware and a React Native screen, and the
 * same conflict engine run in a service and in a vitest suite that can move the
 * clock.
 */

export * from './rbac.js';
export * from './pillars.js';
export * from './plans.js';
export * from './cycle.js';
export * from './conflicts.js';
export * from './onboardingFlow.js';
export * from './tokens/index.js';
export * as schemas from './schemas/index.js';
