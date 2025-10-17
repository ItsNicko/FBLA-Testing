# FBLACER

FBLACER a lightweight, client-side flashcard / quiz app with leaderboard and user analytics features. It uses static frontend files (HTML/CSS/JS) and optional Firebase backend services for authentication, Firestore-based leaderboards, reports, and saved user analytics.

Key features

- Instant client-only quiz experience using the included `tests.json` and per-test JSON files.
- Polished UI with light/dark themes, responsive layout, and accessibility-minded controls.
- Optional Firebase integration for:
  - Anonymous or email/password authentication
  - Public leaderboards (submit/read scores)
  - Per-user saved scores, topics, analytics, and public profiles
  - Anonymous reports and logs

Repository structure

- `index.html` — main single-page app. Loads Firebase client SDKs and exposes small helper APIs.
- `script.js` — primary application logic (quiz flow, leaderboard UI, analytics, profiles).
- `style.css` — UI styles, theming, and responsive rules.
- `tests.json` — index of available tests (used to populate the UI dropdown).
- `questions/` — folder containing per-test question files referenced by `tests.json`.
- `legal/` — privacy & terms HTML files used in the settings modal.
- `firebase.rules` — example Firestore security rules matching the app's expectations.

Firebase (optional)

The app includes optional Firebase integrations. The project currently initializes Firebase using the config embedded in `index.html` for the project `fblacer`.

Relevant Firestore collections & purposes

- `config/bannedWords` — optional configuration doc holding a `words` array used to filter display names.
- `leaderboards/{testId}/scores/{scoreId}` — public leaderboard entries (app expects client-create rules).
- `reports/{id}` — anonymous feedback submitted from the app settings modal.
- `logs/{id}` — non-sensitive telemetry written by the client when available.
- `users/{uid}/scores`, `users/{uid}/topics`, `users/{uid}/analytics` — per-user saved analytics and topic breakdowns (read/write restricted to the user).
- `usernames/{username}` — mapping from username -> uid to support public profile lookups.
- `accounts/{uid}` — per-user account data, editable only by the owner.

Firestore security rules

An example `firebase.rules` is included. Important points:

- Public reads are allowed for `config/*`, `accounts/*`, `usernames/*`, and leaderboard reads.
- Leaderboard creates are validated for expected fields and sizes; updates/deletes are denied.
- `users/*` data and its subcollections are readable/writable only by the authenticated owner.

If you deploy your own Firebase project, review and adapt `firebase.rules` to match your security/privacy requirements before enabling production writes.

Developing and testing

- Edit `questions/*.json` or `tests.json` to add or change quizzes.
- The app dynamically fetches selected test JSON files listed in `tests.json`.
- For Firebase-backed features (leaderboard, auth, saved analytics), you'll need to host the app on HTTPS or run on `localhost` and configure a Firebase project and API keys.

Contribution

- Fixes, issues, and pull requests are welcome. Keep changes small and focused.
- If adding tests or new features, please include or update `tests.json` and add example question files under `questions/`.

Notes and caveats

- The app uses the Firebase Web v12 modular SDK via CDN imports inside `index.html`. If you change SDK versions, update the imports.
- The leaderboard and many Firestore-backed operations assume the client can write to specific collections. The included `firebase.rules` lock down most sensitive operations to authenticated users and validate leaderboard writes, but you should audit rules before using real user data.
- Usernames are mapped to uids via the `usernames` collection; race conditions are guarded in client code using transactions where available.

## Want to learn more? [here you go](./learn.md)
