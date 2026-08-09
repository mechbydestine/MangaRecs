# Recap soundtrack

Four tracks, one per mood. The recap runs **~69 seconds** (the sum of
`SLIDE_DURATIONS` in `screens/RecapScreen.js`) plus a manual finale slide, so
anything from about 1:30 up covers a full play without ever looping.

## How to add them

1. Open a track page below, hit **Download** (a free Pixabay account is needed
   for some tracks — the download itself is free).
2. Save it into this folder under the **exact filename** in the table.
3. In `utils/recapMusic.js`, repoint that mood's `require()` at the new file
   and flip `USING_REAL_MUSIC` to `true` (that raises the mix from 0.18 to
   0.34 — ambience volume is too quiet for music).

Until step 2 happens, each mood falls back to the ambience loop it replaces, so
the recap always has audio.

## The tracks

Each link is a search pre-filled with the track title — the track is the top
result. Artist name is given to disambiguate, because several of these titles
have near-identical uploads from other accounts.

| Save as | Mood | Lanes it scores | Track | Artist | Length |
|---|---|---|---|---|---|
| `epic.mp3` | epic | Battle, Sports, Adventure | [Epic Orchestra – Anime Intro](https://pixabay.com/music/search/?q=epic%20orchestra%20anime%20intro) | **Sekuora** | 1:58 |
| `warm.mp3` | warm | Drama, Slice of Life | [Anime Opening Emotional Journey](https://pixabay.com/music/search/?q=anime%20opening%20emotional%20journey) | **alex-morgan** | 1:44 |
| `dark.mp3` | dark | Suspense, Supernatural | [Japanese Dark – Temple & Samurai (Yōkai)](https://pixabay.com/music/search/?q=japanese%20dark%20temple%20samurai) | **imabo** | 3:15 |
| `synth.mp3` | synth | Sci-Fi | [Synthwave – Anime Cyberpunk](https://pixabay.com/music/search/?q=synthwave%20anime%20cyberpunk) | **YevhenAstafiev** | 2:12 |

### Alternates, if one of the above doesn't land

- **epic** — "Heroic Anime Main Theme BGM" (Sekuora) · "Epic Anime Battle Intro"
  (Sekuora) · "Epic Anime Rock Song with Piano Elements" (HauntSync, 2:22)
- **warm** — "Sakura" (SoulProdMusic, 2:40) · "Fireflies in the City, 2 min edit"
  (kaazoom, 2:00) · "Petals On The Water – Japanese Fusion LoFi" (kaazoom, 3:07)
- **dark** — "180122 – Piano Dark Japan" (WELC0MEИ0, 1:29) · "broken mirrors –
  dark ambient piano" (HarumachiMusic, 3:22) · "The Last Ronin" (9JackJack8, 2:23)
- **synth** — "Electronic – Anime Cyberpunk Music" (HitsLab, 1:42)

## Licence

All of the above are under the **Pixabay Content Licence**:

- Free for commercial use
- **No attribution required**
- Modification and adaptation allowed
- Prohibited: selling or distributing the audio *"on a Standalone basis"*

Shipping a track as an app's background score is incorporation into a larger
work, which the licence permits. What it forbids is selling the music *as
music* — not something MangaRecs does. No credits screen is required.

### Two things to be careful about

**Don't substitute YouTube Audio Library tracks.** Its standard licence is
restricted to YouTube videos; using those in an app breaks the terms. Only its
CC-BY 4.0 subset is usable elsewhere, and that obliges permanent in-app
attribution.

**Pixabay is user-upload.** Moderation is decent but not perfect, and
occasionally someone uploads audio they don't own. Prefer uploaders with large
established catalogues (kaazoom, FASSounds, Sekuora, vjgalaxy all qualify) and
skip anything tagged **AI Music** unless you're comfortable with it — several
Pixabay results carry that tag.

## Encoding

Keep these small. The four ambience loops already cost ~7 MB of bundle; the
recap is a twice-a-year screen and should not double that. 128 kbps stereo MP3
is transparent enough under a 0.34 mix — roughly 1–3 MB per track. If a chosen
track is much longer than needed, trim it to ~90 s before importing.
