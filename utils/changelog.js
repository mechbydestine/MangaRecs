// What's New entries shown in Settings → About → App Version.
// Newest first. Bump app.json's "version" and add a new entry here on release.
export const CHANGELOG = [
  {
    version: '1.2.0',
    date: 'July 10, 2026',
    highlights: [
      'Tap a recommendation\'s description for a full detail page — synopsis, genres, status, and content warnings',
      'A clean "Reader Mode" for sites other than MangaDex — same distraction-free view MangaDex chapters already get',
      'Notification settings now cover comments and DMs, and DMs actually send a push now',
      'Fixed library saves (bookmarks, progress) silently failing on flaky connections — now retries once',
      'Adult content only blurs true 18+ material, not everyday covers',
    ],
  },
  {
    version: '1.1.0',
    date: 'July 9, 2026',
    highlights: [
      'The app now updates itself — no more reinstalling APKs for most changes',
      'Sign in with your username or email, password underneath',
      'Editable display name, separate from your permanent @handle',
      'Fixed Google sign-in',
      'Redesigned, shorter onboarding',
      'Fixed a crash when swiping recommendation cards, and a username field typing bug',
    ],
  },
  {
    version: '1.0.0',
    date: 'July 9, 2026',
    highlights: [
      'Vertical (webtoon) and paged (manga) reading modes, with ambience sound, force-dark mode, and a screen dimmer',
      'Download chapters for offline reading',
      'Friends, direct messages, and per-series discussion threads with spoiler tagging',
      'Badges, medal tiers, and the Weapon Vault collection',
      'Live leaderboard and personalized "For You" recommendations',
      'Refreshed app icon and brand color, plus reader stability fixes',
    ],
  },
];
