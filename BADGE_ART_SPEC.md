# MangaRecs Badge System — Canonical 70

Written for: you, plus whatever generates the art. This replaces the earlier draft.
Names and categories are yours from the collection sheet; every badge below is bound to
a requirement the engine can actually evaluate.

---

## The shape of it

**70 badges. 6 tiers. 7 categories.**

| Tier | Colour | Count | key | rim | mid | deep |
|---|---|---|---|---|---|---|
| Common | Silver | 7 | `grey` | `#D4DCE8` | `#8A93A3` | `#474E5A` |
| Uncommon | Green | 19 | `green` | `#8CEFB4` | `#27A35E` | `#12512F` |
| Platinum | Cyan | 15 | `blue` | `#8FEFF9` | `#22A7BD` | `#0C5361` |
| Diamond | Dark Blue | 12 | `indigo` | `#7FB2FF` | `#1E46B4` | `#0D1F5E` |
| Legendary | Gold | 10 | `gold` | `#FBE08A` | `#D99A14` | `#6E4A05` |
| Mythic | Red | 7 | `mythic` | `#FF9AAA` | `#D21F3C` | `#5E0C1C` |

| Category | Count |
|---|---|
| Reading | 15 |
| Discovery | 12 |
| Collection | 8 |
| Community | 12 |
| Recommendations & Social | 8 |
| Mastery / Long-term | 7 |
| Secret / Special | 8 |

The sheet's own category labels summed to 84 and about 77 were drawn; this is the cut to
70, keeping the strongest name from each line. Dropped: Completed Collection (duplicated
Completed Hunter), The Archivist (duplicated Massive Library), Recommendation Streak,
Community Veteran, Recommendation Explorer, App Anniversary.

**The 7 Mythics are hidden** — name and requirement both render as `???` until earned.

---

## The 70

`req` is `type:value`. **Bold** reqs need a stat that doesn't exist yet — see "New stats".

### READING · 15 — "Turn pages, open worlds."

| id | name | tier | req |
|---|---|---|---|
| `first_chapter` | First Chapter | Common | chapters:1 |
| `hours_in` | Hours In | Common | hours:1 |
| `page_turner` | Page Turner | Uncommon | chapters:25 |
| `chapter_hunter` | Chapter Hunter | Uncommon | chapters:100 |
| `time_spent` | Time Spent | Uncommon | hours:10 |
| `week_strong` | Week Strong | Uncommon | streak:7 |
| `two_weeks` | Two Weeks | Uncommon | streak:14 |
| `deep_reader` | Deep Reader | Platinum | chapters:250 |
| `five_hundred` | Five Hundred | Platinum | chapters:500 |
| `night_reader` | Night Reader | Platinum | midnight:10 |
| `weekend_reader` | Weekend Reader | Platinum | **weekend:10** |
| `the_thousand` | The Thousand | Diamond | chapters:1000 |
| `speed_reader` | Speed Reader | Diamond | hours:250 |
| `veteran_reader` | Veteran Reader | Legendary | chapters:5000 |
| `bookworm` | Bookworm | Mythic | chapters:15000 |

### DISCOVERY · 12 — "New stories. New worlds."

| id | name | tier | req |
|---|---|---|---|
| `new_series` | New Series | Common | series:1 |
| `genre_hopper` | Genre Hopper | Uncommon | genres:3 |
| `manga_explorer` | Manga Explorer | Uncommon | **manga_titles:10** |
| `manhwa_explorer` | Manhwa Explorer | Uncommon | **manhwa_titles:10** |
| `library_explorer` | Library Explorer | Uncommon | manga:25 |
| `completed_hunter` | Completed Hunter | Platinum | completed:30 |
| `author_explorer` | Author Explorer | Platinum | manga:50 |
| `hidden_gem_hunter` | Hidden Gem Hunter | Diamond | manga:100 |
| `trending_explorer` | Trending Explorer | Diamond | genres:8 |
| `deep_dive` | Deep Dive | Legendary | hours:1000 |
| `world_builder` | World Builder | Legendary | manga:400 |
| `multiverse_seeker` | Multiverse Seeker | Mythic | manga:1000 |

### COLLECTION · 8 — "Build your perfect library."

| id | name | tier | req |
|---|---|---|---|
| `first_save` | First Save | Common | manga:1 |
| `save_10` | Save 10 | Uncommon | manga:10 |
| `save_50` | Save 50 | Uncommon | manga:50 |
| `series_collector` | Series Collector | Uncommon | series:10 |
| `save_100` | Save 100 | Platinum | manga:100 |
| `genre_collector` | Genre Collector | Platinum | genres:5 |
| `massive_library` | Massive Library | Diamond | manga:200 |
| `curator` | Curator | Legendary | ratings:250 |

### COMMUNITY · 12 — "Better readers. Together."

| id | name | tier | req |
|---|---|---|---|
| `first_friend` | First Friend | Common | friends:1 |
| `active_reader` | Active Reader | Common | comments:1 |
| `friend_circle` | Friend Circle | Uncommon | friends:5 |
| `community_contributor` | Community Contributor | Uncommon | comments:10 |
| `helper` | Helper | Uncommon | comments:25 |
| `guild_member` | Guild Member | Platinum | friends:15 |
| `popular_user` | Popular User | Platinum | **followers:25** |
| `mentor` | Mentor | Platinum | comments:50 |
| `discussion_starter` | Discussion Starter | Diamond | **discussions:50** |
| `social_butterfly` | Social Butterfly | Diamond | friends:30 |
| `trusted_member` | Trusted Member | Diamond | account:365 |
| `community_leader` | Community Leader | Legendary | comments:400 |

### RECOMMENDATIONS & SOCIAL · 8 — "Share the stories you love."

| id | name | tier | req |
|---|---|---|---|
| `first_recommendation` | First Recommendation | Common | shares:1 |
| `recommender` | Recommender | Uncommon | shares:5 |
| `recs_10` | 10 Recs | Uncommon | shares:10 |
| `social_reader` | Social Reader | Uncommon | likes:50 |
| `recs_50` | 50 Recs | Platinum | shares:50 |
| `friend_reaction` | Friend Reaction | Platinum | **reactions:25** |
| `recs_100` | 100 Recs | Diamond | shares:100 |
| `shared_discovery` | Shared Discovery | Legendary | likes:1000 |

### MASTERY / LONG-TERM · 7 — "Consistency builds legends."

| id | name | tier | req |
|---|---|---|---|
| `daily_reader` | Daily Reader | Uncommon | streak:3 |
| `monthly_reader` | Monthly Reader | Platinum | streak:30 |
| `milestone_tracker` | Milestone Tracker | Diamond | **badges:25** |
| `the_scholar` | The Scholar | Diamond | hours:500 |
| `yearly_reader` | Yearly Reader | Legendary | streak:180 |
| `the_critic` | The Critic | Legendary | ratings:250 |
| `the_legend` | The Legend | Mythic | **badges:60** |

### SECRET / SPECIAL · 8 — "Some things aren't found, they're earned."

Everything here is `hidden: true`. The five Mythics show `???` for both name and
requirement until unlocked.

| id | name | tier | req |
|---|---|---|---|
| `seasonal_event` | Seasonal Event | Platinum | midnight:13 *(season-gated)* |
| `early_adopter` | Early Adopter | Diamond | account:900 |
| `beta_tester` | Beta Tester | Legendary | account:730 |
| `collab_event` | Collab Event | Legendary | shares:500 |
| `the_oracle` | The Oracle | Mythic | ratings:1500 |
| `the_pillar` | The Pillar | Mythic | comments:2000 |
| `limited_edition` | Limited Edition | Mythic | hours:3000 |
| `the_secret` | ??? | Mythic | completed:300 |

---

## New stats to build

Six badges need data that doesn't exist. Five need a migration; one is free.

| Stat | Powers | Where it comes from | Cost |
|---|---|---|---|
| `badges_earned` | Milestone Tracker, The Legend | `computeEarnedBadgeIds().size`, client-side | **free, no DB** |
| `weekend_reads` | Weekend Reader | new `profiles` column, incremented when a read lands on Sat/Sun — mirrors how `night_reads` already works | 1 column + 1 increment |
| `manga_titles` / `manhwa_titles` | Manga Explorer, Manhwa Explorer | distinct `reading_progress` titles joined to `manga_pool.lang` (`ja` → manga, `ko` → manhwa) | 1 RPC |
| `followers_count` | Popular User | the `followers` table already exists, just never counted onto the profile | 1 RPC or counter |
| `discussions_started` | Discussion Starter | `comments` where `parent_id is null` | 1 column + trigger |
| `reactions_given` | Friend Reaction | `dm_message_reactions` already exists | 1 column + trigger |

**Re-pointed rather than built** — these implied features that don't exist (reputation,
guilds, trending logs, reading-speed timing), so they now ride on stats you already have.
Nothing about the badge is visibly different; only the unlock condition changed: Speed
Reader, Hidden Gem Hunter, Trending Explorer, Author Explorer, World Builder, Guild
Member, Trusted Member, Helper, Mentor, Community Leader, Shared Discovery, Collab
Event, Limited Edition, The Pillar.

---

## Art brief — paste into ChatGPT

> I need 70 achievement badge icons for a manga/manhwa reading app called MangaRecs.
> They are collectible rank tokens in the spirit of League of Legends Challenge tokens,
> but entirely original artwork.
>
> **Shared structure, every badge:**
> - Circular medallion token, centred on a square canvas.
> - Dark near-black inner disc with a subtle tier-coloured sheen.
> - One glowing emblem centred on the disc, in the tier colour. The emblem is the
>   badge's identity.
> - A metal ring around the disc in the tier colour, with a laurel wreath wrapping the
>   lower two thirds and meeting at a tie at the bottom.
> - A faceted gem at the top of the ring, at 12 o'clock.
> - A soft outer glow in the tier colour, stronger as the tier rises.
>
> **Tier treatment** — only the metal, glow and ornament change; the emblem keeps its
> own identity at every tier:
> - Common — silver `#D4DCE8`, matte metal, minimal glow, plain wreath.
> - Uncommon — green `#8CEFB4`, brighter metal, faint glow.
> - Platinum — cyan `#8FEFF9`, polished metal, etched notches on the ring.
> - Diamond — dark blue `#7FB2FF`, faceted crystal highlights, visible glow.
> - Legendary — gold `#FBE08A`, ornate double wreath, strong controlled glow.
> - Mythic — red `#FF9AAA`, iridescent metal shifting through red, violet and gold, a
>   broken outer crown ring, strongest glow. Mythic must look fundamentally different,
>   not merely redder.
>
> **Hard requirements:**
> - Transparent background, PNG, 1024×1024, square, token centred with even margin.
> - No text, letters or numbers anywhere in the artwork.
> - The emblem must stay recognisable shrunk to 40px.
> - No existing manga, anime or game logos, guild marks, or recognisable copyrighted
>   characters. Original shapes only.
> - All 70 must be visually consistent: same ring weight, same wreath, same proportions,
>   same lighting direction. They are one set.
>
> Name each file exactly `<id>.png` using the id column.
>
> [paste the id / name / tier columns from the tables above]

**Delivery:** one PNG per badge, named exactly the `id`, all in `assets/badges/`.
1024×1024, transparent. Overwrite in place to revise — the filename is the contract.

---

## Then I wire it

1. Replace `ALL_BADGES` with these 70; point each at `assets/badges/<id>.png`.
2. Collapse `BADGE_GRADES` / `GRADE_ORDER` to the 6 tiers, retire the `purple` key.
3. Add the six new stats — `badges_earned` first since it needs no migration.
4. Render hidden-unearned Mythics as `???` for both name and requirement.
5. Re-port `docs/assets/badges.js`; website switches to `<img>` off the same files.
6. Re-check: `badge_rarity` RPC inputs, the 3-slot showcase, `nextUpBadges`, the
   ceremony queue, i18n keys for 70 new names.

⚠️ **This retires 180 badge ids.** Showcase pins (`profiles.showcase_badges`) pointing at
dead ids will silently drop, and the 15 hand-rendered Relic Vault badges go with them.
If there are live users with progress, say so and I'll write a migration that clears dead
pins first. The migration for the new stat columns will need applying against Supabase —
per my notes the token on file is dead, so you'll need to supply a fresh one.
