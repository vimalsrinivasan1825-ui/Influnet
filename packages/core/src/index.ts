/**
 * @influnet/core — platform-agnostic business logic shared by apps/web and
 * apps/mobile. Everything here must be pure TypeScript: no DOM, no Next.js,
 * no React Native. If a module needs a platform API, it belongs in the app.
 */
export * from './constants';
export * from './deal-state';
export * from './entitlements';
export * from './project-lifecycle';
export * from './project-stage-guide';
export * from './project-turn';
export * from './profile-visibility';
export * from './project-cancellation';
export * from './verification-nudge';
export * from './phone';
export * from './validators';
export * from './creator-level';
export * from './metric-state';
