# MangaRecs legal pages

`index.html` is a single self-contained page with both the **Privacy Policy** (`#privacy`)
and **Terms of Use** (`#terms`) — same content as the in-app Legal screen.

## Why you need this
Both the App Store and Google Play **require a publicly-hosted Privacy Policy URL** in your
store listing. You cannot submit without one.

## How to host it (pick one, all free)
- **GitHub Pages**: push this `legal/` folder to a repo, enable Pages → your URL is
  `https://<you>.github.io/<repo>/` (privacy at `…/#privacy`, terms at `…/#terms`).
- **Vercel / Netlify**: drag-and-drop this folder, get an instant URL.
- **Your own domain**: upload `index.html` to `mangarecs.app` so the links become
  `https://mangarecs.app/#privacy` and `https://mangarecs.app/#terms`.

## After hosting
1. Put the Privacy URL in App Store Connect + Play Console listing metadata.
2. (Optional) The in-app Settings → Privacy/Terms rows currently open the in-app
   `LegalScreen`. If you'd rather they open the hosted page, tell me and I'll switch them
   to `Linking.openURL(...)`.

The `support@mangarecs.app` contact email in the text needs to be a real, monitored inbox
before submission — update it here and in `screens/LegalScreen.js` if it changes.
