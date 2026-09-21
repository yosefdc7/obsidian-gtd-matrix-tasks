import { describe, expect, it } from 'vitest';
import { buildGoogleAuthorizationUrl, validateOAuthCallback } from '../src/calendar/google-oauth';

describe('Google OAuth callback flow', () => {
  it('requests offline calendar event and calendar-list access through the configured HTTPS callback', () => {
    const url = new URL(buildGoogleAuthorizationUrl({
      clientId: 'client-id',
      redirectUri: 'https://script.google.com/macros/s/deployment/exec',
      state: 'random-state',
    }));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('random-state');
    expect(url.searchParams.get('scope')?.split(' ')).toEqual([
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    ]);
  });

  it('rejects a callback with the wrong state', () => {
    expect(() => validateOAuthCallback({ code: 'code', state: 'wrong' }, 'expected')).toThrow(
      'OAuth state mismatch',
    );
  });
});
