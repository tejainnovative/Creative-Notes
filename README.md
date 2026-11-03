# Creative Notes

Meeting notes that work online and offline and stay on your device. Record a meeting, see the
transcript as people talk, then get a summary, the decisions and who's doing what. Search past
meetings, ask questions about them, export them, and back everything up to an encrypted file.

- **No account.** Everything is stored in your browser (IndexedDB) on this device.
- **Works offline.** Download the speech model once (about 80 MB, Settings → Offline transcription)
  and recordings are transcribed on the device with no connection. Summaries wait in a queue until
  you're back online.
- **Install it** on a phone or computer as a web app (Settings → Install the app), including a Siri
  Shortcut for quick notes on iPhone.
- **Optional server** for Claude summaries and answers, speaker-labelled cloud transcription
  (Deepgram) and a Siri inbox. Without it, the app uses an on-device preview summariser.

## Run it locally

Needs Node 24 and Chrome or Edge.

```bash
npm install
npm run dev            # app on http://127.0.0.1:5173
npm run api:mock       # optional: local server with fake Claude and Deepgram
npm run api            # optional: local server with your keys from .env.local (see .env.example)
```

On some managed Windows machines `npx` and native TypeScript are blocked by policy, so every npm
script calls its tool through `node` directly.

## Tests

```bash
npm run test:server    # server: auth, limits, streaming, inbox (node:test)
npm run test:e2e       # every flow at phone and desktop width, with accessibility scans
npm run test:whisper   # real speech transcribed on the device, offline (downloads the model)
```

The end-to-end tests use your installed Chrome (`channel: 'chrome'`) with a fake microphone.

## Deploy

**GitHub Pages (the app only).** `.github/workflows/pages.yml` builds and deploys on every push to
`main`. In the repository go to Settings → Pages → Build and deployment and set Source to
**GitHub Actions** once. The site is served from `https://<owner>.github.io/<repo>/`. Pages only
serves static files, so the optional server isn't available there. "Connect this device" in
Settings won't find a server, and everything else works.

`scripts/publish.sh` pushes committed work to GitHub. It leaves out the private planning folder,
so run it instead of `git push`:

```bash
bash scripts/publish.sh --dry-run   # see what would be published
bash scripts/publish.sh
```

**Cloudflare (app and server).** `wrangler.toml` serves the app and the API from one Worker with a
D1 database. Set the secrets listed in `.env.example` with `wrangler secret put`.

## Privacy and security

- Notes never leave the device unless you connect your own server, and then only the text needed
  for a summary or answer, plus audio to Deepgram when you record online with cloud speech on.
  "Offline only" in Settings turns all of that off.
- The speech model is downloaded from Hugging Face at a pinned commit. The speech runtime is
  served by this app, not a CDN.
- Backups are encrypted with your passphrase (PBKDF2-SHA256, 600,000 rounds, then AES-GCM) and
  never contain the server device token.
- Check the recording laws where you are: in several Australian states everyone in a private
  conversation must consent to it being recorded. The app reminds you before your first recording.
