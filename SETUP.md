# Family Display - No-Mac Setup

## 1. Put the site online
The easiest options are GitHub Pages, Cloudflare Pages, or Netlify. Upload the contents of this folder and note the final HTTPS address, for example:

https://yourname.github.io/family-display/

## 2. Create the Google OAuth client
1. Go to Google Cloud Console.
2. Create or choose a project.
3. Enable **Google Calendar API** and **Google Tasks API**.
4. Configure the OAuth consent screen.
5. Create an OAuth Client ID with application type **Web application**.
6. Under **Authorized JavaScript origins**, add the site's origin, for example:
   https://yourname.github.io
   (Use the exact origin shown in Safari; do not include a path.)
7. Copy the Client ID ending in `apps.googleusercontent.com`.

If the OAuth app is in Testing mode, add the Google account used by the iPad as a test user.

## 3. Share family calendars
Have your husband and son share their Google calendars with the Google account that will sign in on the display. Give at least "See all event details" permission if you want event titles/details to appear.

## 4. Configure Family Display
1. Open the hosted Family Display URL on the iPad in Safari.
2. Tap **Settings**.
3. Paste the Google OAuth Web Client ID.
4. Tap **Connect Google** and approve Calendar and Tasks access.
5. Choose the idle timeout and photo rotation interval.
6. Select family photos. They are stored locally in the browser on that iPad using IndexedDB and are not uploaded by this app.

## 5. Add to the iPad Home Screen
In Safari:
1. Tap the Share button.
2. Choose **Add to Home Screen**.
3. Name it **Family Display**.
4. Launch it from the new Home Screen icon.

## 6. Use the old iPad as a display
Keep the iPad powered. For a kiosk-like setup, you can also use iPad Guided Access so accidental touches do not leave Family Display.

## Google task lists used
- **Family**: the app shows tasks due in the current week.
- **Emily Daily**: the app shows today's tasks. New tasks default to today.
- **Eric**: the app shows all incomplete tasks and requires a due/expiration date when adding through the app.
- **Shopping**: all incomplete shopping items.

## Limitation of the no-backend version
Google's browser token model issues short-lived access tokens. For security, the PWA cannot silently keep a refresh token itself. If the token expires, use **Settings -> Connect Google** again. For a truly unattended display that automatically renews Google access, a small secure backend is required.
