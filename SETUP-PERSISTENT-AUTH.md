# Family Display: persistent Google authentication

This build uses Cloudflare Pages Functions plus Workers KV. The browser never stores the Google client secret or refresh token.

## 1. Google Cloud
1. Enable **Google Calendar API** and **Google Tasks API**.
2. Configure the OAuth consent screen.
3. Create an OAuth 2.0 Client ID of type **Web application**.
4. Add this exact Authorized redirect URI:
   `https://YOUR-SITE.example/api/auth/callback`
5. Save the Client ID and Client Secret.

For initial testing, add the Google account used by the Family Display as a test user. **Before relying on persistent authentication, change the OAuth app publishing status to In production.** For an External app left in Testing, Google normally issues refresh tokens that expire after 7 days when Calendar/Tasks scopes are used.

## 2. Cloudflare Pages
Deploy this entire folder as a Cloudflare Pages project. The `/functions` folder must be deployed with the site.

Create a Workers KV namespace and bind it to the Pages project with variable name:
`FAMILY_DISPLAY_KV`

Add these encrypted environment variables/secrets to the Pages project:
- `GOOGLE_CLIENT_ID` = your Google OAuth Web client ID
- `GOOGLE_CLIENT_SECRET` = your Google OAuth client secret
- `PAIRING_KEY` = a long private phrase you choose, e.g. 4-6 random words
- Optional: `PUBLIC_BASE_URL` = your exact site origin, such as `https://family.example.com`

Redeploy after adding the binding and secrets.

## 3. Pair the iPad once
1. Open Family Display on the iPad.
2. Settings -> **Connect / Pair Google**.
3. Enter the `PAIRING_KEY` you configured in Cloudflare.
4. Complete Google authorization once.
5. The iPad receives a secure HttpOnly session cookie. The refresh token stays in Workers KV.

After that, the app automatically requests fresh short-lived Google access tokens from `/api/auth/token` and should no longer require hourly reconnection.

## 4. Home Screen
After deploying this version, remove the old Home Screen icon, open the updated site in Safari, and use **Share -> Add to Home Screen** again.

## Notes
- `Disconnect this iPad` removes only that iPad's local server session. It does not delete the server's Google refresh token.
- To completely remove Google authorization, revoke the app from your Google Account permissions and delete the `google_refresh_token` key from `FAMILY_DISPLAY_KV`.
- Keep `GOOGLE_CLIENT_SECRET`, `PAIRING_KEY`, and the KV data server-side. Never put them in `app.js`, `index.html`, or localStorage.
