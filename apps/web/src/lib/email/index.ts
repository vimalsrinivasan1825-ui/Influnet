/**
 * Influnet email.
 *
 *   templates.ts  what the mail looks like (pure functions of their data)
 *   layout.ts     the shared shell + blocks every template is built from
 *   client.ts     the only code that talks to Resend
 *   policy.ts     every "should we send this?" decision
 *   unsubscribe.ts signed opt-out links
 *
 * Product code should almost always call deliverEmail() from policy.ts — or
 * better, just notifyUser(), which routes through it.
 */
export { deliverEmail, renderAndSend, hourBucket } from './policy';
export type { DeliverInput, DeliveryResult, SkipReason } from './policy';
export { sendEmail, emailsEnabled, emailConfigured, fromAddress, isValidEmail } from './client';
export { TEMPLATES, getTemplate, listTemplates } from './templates';
export type { TemplateId, TemplateDef, EmailTier, EmailCategory } from './templates';
export { unsubscribeUrl, unsubscribeToken, verifyUnsubscribeToken } from './unsubscribe';
export { appUrl, absoluteUrl, supportEmail, theme } from './theme';
