# Google Calendar setup

GTD Matrix Tasks uses a personal Google OAuth client and a tiny Apps Script callback. The callback stores nothing; it only returns Google's short-lived authorization response to Obsidian.

## One-time Google setup

1. In Google Cloud Console, create or select a project and enable **Google Calendar API**.
2. Configure the OAuth consent screen as **External / Testing** and add your Google account as a test user. Google expires refresh tokens for external apps left in Testing, so after validation publish the consent screen to **Production** for persistent personal use. An unverified personal app may show Google's warning screen and remains subject to Google's user cap.
3. Create a new Apps Script project, replace `Code.gs` with [`companion/google-oauth-callback/Code.gs`](../companion/google-oauth-callback/Code.gs), then deploy it as a **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Copy the web-app `/exec` URL.
5. In Google Cloud Console, create an OAuth client of type **Web application**. Add the Apps Script `/exec` URL as an authorized redirect URI.
6. In Obsidian → GTD Matrix Tasks settings:
   - paste the OAuth client ID;
   - create/select an Obsidian secret containing the OAuth client secret;
   - paste the Apps Script callback URL;
   - enable calendar sync and click **Connect Google Calendar**.
7. After authorization, click **Load calendars**, choose the destination, and run **Sync now**.

Repeat only step 6's Connect action on each device. Refresh tokens remain in that device's Obsidian Secret Storage and never enter the vault, Git, or plugin `data.json`.

## Sync contract

- Source of truth: open Obsidian tasks with a Start date (`🛫 YYYY-MM-DD`).
- Event: private, busy, 30 minutes at 7:00 AM by default, using the selected calendar timezone.
- Task title/date edits update the same deterministic Google event.
- Completing/cancelling a task or removing Start deletes its managed event.
- Google edits never update Obsidian and are overwritten on a later sync.
- Switching calendars copies current open events into the new calendar and leaves the old calendar untouched.
