# Family Display PWA

A Safari/Home Screen family dashboard for iPad.

## Features
- Idle clock/date and rotating locally stored photos
- Combined Google Calendar view for all calendars shared with the signed-in account
- Family tasks: current week
- Emily Daily tasks: today
- Eric tasks: all incomplete tasks with due/expiration date
- Shopping list
- Google Tasks lists are created automatically when missing: Family, Emily Daily, Eric, Shopping
- Home Screen/PWA support

## Important Google login behavior
This client-only PWA uses Google Identity Services' browser token model. Access tokens are intentionally short-lived. When Google authorization expires, tap Settings -> Connect Google again. A true always-signed-in background refresh requires a backend service using the authorization-code model and securely stored refresh tokens.

## Hosting
The app must be served from HTTPS for reliable PWA and Google OAuth behavior. GitHub Pages, Cloudflare Pages, Netlify, or similar static hosting works.

See SETUP.md for step-by-step instructions.
