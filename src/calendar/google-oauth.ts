import type { HttpTransport } from './google-calendar-client';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
];

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface OAuthCallback {
  code?: string;
  state?: string;
  error?: string;
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
}

export interface SecretStore {
  getSecret(id: string): string | null;
  setSecret(id: string, value: string): void;
  deleteSecret(id: string): void;
}

export function buildGoogleAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const query = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state: input.state,
  });
  return `${AUTH_URL}?${query.toString()}`;
}

export function validateOAuthCallback(callback: OAuthCallback, expectedState: string): string {
  if (callback.error) throw new Error(`Google authorization failed: ${callback.error}`);
  if (!callback.state || callback.state !== expectedState) throw new Error('OAuth state mismatch.');
  if (!callback.code) throw new Error('Google authorization returned no code.');
  return callback.code;
}

export class GoogleTokenManager {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  constructor(
    private readonly http: HttpTransport,
    private readonly secrets: SecretStore,
    private readonly config: GoogleOAuthConfig,
    private readonly refreshTokenSecretId: string,
  ) {}

  async exchangeCode(code: string): Promise<void> {
    const body = new URLSearchParams({
      code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
      grant_type: 'authorization_code',
    });
    const token = await this.requestToken(body);
    if (!token.refresh_token) throw new Error('Google returned no refresh token. Reconnect with consent.');
    this.secrets.setSecret(this.refreshTokenSecretId, token.refresh_token);
    this.rememberAccessToken(token);
  }

  async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt - 60_000) return this.accessToken;
    const refreshToken = this.secrets.getSecret(this.refreshTokenSecretId);
    if (!refreshToken) throw new Error('Google Calendar is not connected on this device.');
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    const token = await this.requestToken(body);
    this.rememberAccessToken(token);
    return token.access_token;
  }

  disconnect(): void {
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
    this.secrets.deleteSecret(this.refreshTokenSecretId);
  }

  isConnected(): boolean {
    return Boolean(this.secrets.getSecret(this.refreshTokenSecretId));
  }

  private async requestToken(body: URLSearchParams): Promise<GoogleTokenResponse> {
    const response = await this.http.request({
      url: TOKEN_URL,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (response.status < 200 || response.status >= 300) {
      const error = response.json as { error_description?: string; error?: string };
      throw new Error(error.error_description || error.error || `Google token request failed (${response.status}).`);
    }
    return response.json as GoogleTokenResponse;
  }

  private rememberAccessToken(token: GoogleTokenResponse): void {
    this.accessToken = token.access_token;
    this.accessTokenExpiresAt = Date.now() + token.expires_in * 1000;
  }
}
