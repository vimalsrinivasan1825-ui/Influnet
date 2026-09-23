import { describe, expect, it } from 'vitest';
import { parseClientHeader, platformFromUserAgent } from '@/lib/api';

const req = (headers: Record<string, string>) => new Request('https://x.test/api', { headers });

describe('parseClientHeader', () => {
  it('trusts the app header when it sends one', () => {
    expect(parseClientHeader(req({ 'x-influnet-client': 'ios/1.4.2' }))).toEqual({ platform: 'ios', version: '1.4.2' });
    expect(parseClientHeader(req({ 'x-influnet-client': 'web' }))).toEqual({ platform: 'web', version: null });
  });

  it('falls back to the User-Agent for builds older than the header', () => {
    // React Native: okhttp on Android, CFNetwork/Darwin on iOS.
    expect(parseClientHeader(req({ 'user-agent': 'okhttp/4.9.2' })).platform).toBe('android');
    expect(parseClientHeader(req({ 'user-agent': 'Influnet/1.0.0 CFNetwork/1568.100 Darwin/24.0.0' })).platform).toBe('ios');
    expect(parseClientHeader(req({ 'user-agent': 'Mozilla/5.0 (Macintosh) Safari/605' })).platform).toBe('web');
  });

  it('never guesses a version it was not told', () => {
    expect(parseClientHeader(req({ 'user-agent': 'okhttp/4.9.2' })).version).toBeNull();
  });

  it('stays unknown when nothing identifies the client', () => {
    expect(parseClientHeader(req({})).platform).toBe('unknown');
    expect(platformFromUserAgent(null)).toBe('unknown');
    expect(platformFromUserAgent('curl/8.4.0')).toBe('unknown');
  });
});
