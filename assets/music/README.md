# Recap soundtrack

Four tracks, one per mood, mapped from the reader's genre lane in
`utils/recapMusic.js`. The recap runs **~69 seconds** (the sum of
`SLIDE_DURATIONS` in `screens/RecapScreen.js`) plus a manual finale slide, so
every track below covers a full play; `loop` is on only for a reader who holds
to pause.

## What's shipping

All four are **CC0 1.0 (public domain)** from Freesound, each verified on its
own Freesound page rather than trusted from a search filter. CC0 means no
attribution is owed, no credits screen is required, and no licence can be
revoked later.

| File | Mood | Lanes it scores | Source | Length | Size |
|---|---|---|---|---|---|
| `epic.mp3` | epic | Battle, Sports, Adventure | [Epic Synth/Orchestral Music](https://freesound.org/s/545459/) | 1:14 | 1.7 MB |
| `warm.mp3` | warm | Drama, Slice of Life | [Atmospheric Piano & Violin 01](https://freesound.org/s/478255/) | 2:00 | 2.8 MB |
| `dark.mp3` | dark | Suspense, Supernatural | [Suspense Orchestral – Hurricane](https://freesound.org/s/608813/) | 1:56 | 2.7 MB |
| `synth.mp3` | synth | Sci-Fi | [Circuit Synthwave Alt](https://freesound.org/s/460358/) | 1:56 | 2.7 MB |

Total added to the bundle: **~9.4 MB**, on top of the ~7 MB of ambience loops.

### These were chosen on metadata, not by ear

Nobody has listened to them yet. They were picked from title, duration, genre
tags and uploader — which is enough to be confident they're *appropriate*, and
not enough to be confident they're *good*. Play the recap and swap anything
that doesn't land; each swap is one line in `utils/recapMusic.js`.

## Better-fitting alternatives (Pixabay)

These suit an anime recap considerably better than public-domain stock — they
were written for the genre rather than adapted to it. They can't be fetched
automatically (Pixabay's terms prohibit automated downloading), so they need a
few manual clicks. Each link is a search pre-filled with the title; artist is
bolded because several titles have near-identical uploads from other accounts.

| Replaces | Track | Artist | Length |
|---|---|---|---|
| `epic.mp3` | [Epic Orchestra – Anime Intro](https://pixabay.com/music/search/?q=epic%20orchestra%20anime%20intro) | **Sekuora** | 1:58 |
| `warm.mp3` | [Anime Opening Emotional Journey](https://pixabay.com/music/search/?q=anime%20opening%20emotional%20journey) | **alex-morgan** | 1:44 |
| `dark.mp3` | [Japanese Dark – Temple & Samurai (Yōkai)](https://pixabay.com/music/search/?q=japanese%20dark%20temple%20samurai) | **imabo** | 3:15 |
| `synth.mp3` | [Synthwave – Anime Cyberpunk](https://pixabay.com/music/search/?q=synthwave%20anime%20cyberpunk) | **YevhenAstafiev** | 2:12 |

To swap: download, overwrite the file of the same name in this folder, ship an
OTA. No code change at all — the filenames are the contract.

The Pixabay Content Licence allows commercial use with no attribution and
permits incorporating content into a larger work; it only forbids selling the
audio *"on a Standalone basis"*, which an app soundtrack is not. So swapping
introduces no credits obligation either.

## Two traps worth remembering

**Don't substitute YouTube Audio Library tracks.** Its standard licence is
restricted to YouTube videos, so using those in an app breaks the terms. Only
its CC-BY 4.0 subset is usable elsewhere, and that obliges permanent in-app
attribution.

**Watch the bundle.** There's no `ffmpeg` in this environment, so nothing here
was trimmed or re-encoded — these are the files as published. If you swap in
longer tracks, trim them to ~90 s first; the recap can never play more than
that, and the rest is dead weight in every install.
