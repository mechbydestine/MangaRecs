// Ported from utils/badges.js (the app's real badge engine) so the website
// profile page computes the exact same earned badges from the same profiles
// row. Kept in sync by hand — if utils/badges.js's ALL_BADGES/engine changes,
// re-port here. Excludes: badge rarity (needs a Supabase RPC round-trip) and
// the unused LEADERBOARD/relic/EARLY-MOMENTS tail in the source file, which
// ProfileScreen.js itself never imports.

var BADGE_GRADES = {
  grey:   { label: 'Bronze',   color: '#D08A4E', bg: 'rgba(208,138,78,0.15)',  border: '#D08A4E',                glow: null },
  green:  { label: 'Silver',   color: '#C4CCD8', bg: 'rgba(196,204,216,0.15)', border: '#C4CCD8',                glow: null },
  blue:   { label: 'Gold',     color: '#F2B93B', bg: 'rgba(242,185,59,0.15)',  border: '#F2B93B',                glow: null },
  indigo: { label: 'Platinum', color: '#4ECDC0', bg: 'rgba(78,205,192,0.15)',  border: '#4ECDC0',                glow: 'rgba(62,201,181,0.25)' },
  purple: { label: 'Diamond',  color: '#7CC6FF', bg: 'rgba(124,198,255,0.15)', border: '#7CC6FF',                glow: 'rgba(90,169,240,0.20)' },
  gold:   { label: 'Master',   color: '#B48CFF', bg: 'rgba(180,140,255,0.15)', border: '#B48CFF',                glow: 'rgba(143,92,240,0.30)' },
  mythic: { label: 'Mythic',   color: '#FF5C7A', bg: 'rgba(244,63,94,0.20)',   border: 'rgba(251,113,133,0.60)', glow: 'rgba(244,63,94,0.40)' },
};

var ALL_BADGES = [

  // BRONZE (15)   First steps. Welcome to MangaRecs.

  { id: 'first_page',       name: 'First Page',         icon: '📄', grade: 'grey', desc: 'Your very first page turned here',          requirement: { type: 'chapters',  value: 1   } },
  { id: 'new_chapter',      name: 'New Chapter',         icon: '📖', grade: 'grey', desc: 'Your first series journey begins',                       requirement: { type: 'series',    value: 1   } },
  { id: 'speak_up',         name: 'Speak Up',            icon: '💬', grade: 'grey', desc: 'First words shared with everyone',             requirement: { type: 'comments',  value: 1   } },
  { id: 'first_heart',      name: 'First Heart',         icon: '❤️', grade: 'grey', desc: 'First heart given to a story',         requirement: { type: 'likes',     value: 1   } },
  { id: 'not_alone',        name: 'Not Alone',           icon: '🤝', grade: 'grey', desc: 'Your first reading companion found',              requirement: { type: 'friends',   value: 1   } },
  { id: 'face_of_mangarecs',  name: 'Fresh Face',    icon: '🪞', grade: 'grey', desc: 'Your face, now part of MangaRecs',                        requirement: { type: 'profile',   value: 1   } },
  { id: 'getting_hooked',   name: 'Getting Hooked',      icon: '🪝', grade: 'grey', desc: '10 chapters down, the hook is set',         requirement: { type: 'chapters',  value: 10  } },
  { id: 'first_hour',       name: 'First Hour',          icon: '⏱️', grade: 'grey', desc: 'One full hour lost in story',             requirement: { type: 'hours',     value: 1   } },
  { id: 'day_one',          name: 'Day One',             icon: '📅', grade: 'grey', desc: 'Day one of the reading habit',              requirement: { type: 'streak',    value: 1   } },
  { id: 'curious',          name: 'Curious',             icon: '🔍', grade: 'grey', desc: 'First genre of many explored',                       requirement: { type: 'genres',    value: 1   } },
  { id: 'first_word',       name: 'First Word',          icon: '🗣️', grade: 'grey', desc: '3 comments echoing through the community',   requirement: { type: 'comments',  value: 3   } },
  { id: 'spread_the_word',  name: 'Spread the Word',     icon: '📲', grade: 'grey', desc: 'Your first recommendation sent out',              requirement: { type: 'shares',    value: 1   } },
  { id: 'your_verdict',     name: 'Your Verdict',        icon: '⭐', grade: 'grey', desc: 'Your first verdict on a story',              requirement: { type: 'ratings',   value: 1   } },
  { id: 'more_please',      name: 'More Please',         icon: '📚', grade: 'grey', desc: 'Following 2 series all at once',   requirement: { type: 'series',    value: 2   } },
  { id: 'sunrise_reader',   name: 'Sunrise Reader',      icon: '🌅', grade: 'grey', desc: 'Reading before the sun even rises',                     requirement: { type: 'special',   value: 1   }, hidden: true },

  // SILVER (45)   You're getting into it.

  // Reader Journey
  { id: 'page_turner',       name: 'Page Turner',         icon: '📑', grade: 'green', desc: '40 chapters down, the hook is set',   requirement: { type: 'chapters',  value: 40  } },
  { id: 'deep_diver',        name: 'Panel Hopper',           icon: '🤿', grade: 'green', desc: '75 chapters down, the hook is set',          requirement: { type: 'chapters',  value: 75  } },
  { id: 'bookworm',          name: 'Binge Reader',             icon: '📗', grade: 'green', desc: '150 chapters deep into the panels',       requirement: { type: 'chapters',  value: 150 } },
  { id: 'story_addict',      name: 'Deep Diver',         icon: '📘', grade: 'green', desc: '300 chapters deep into the panels',     requirement: { type: 'chapters',  value: 300 } },

  // Time Spent
  { id: 'regular_reader',    name: 'Time Dipper',       icon: '🕐', grade: 'green', desc: '3 hours given to the panels',               requirement: { type: 'hours',     value: 3   } },
  { id: 'time_well_spent',   name: 'Regular Reader',      icon: '🕙', grade: 'green', desc: '8 hours given to the panels',                            requirement: { type: 'hours',     value: 8   } },
  { id: 'dedicated',         name: 'Hooked Hours',            icon: '📌', grade: 'green', desc: '15 hours given to the panels',              requirement: { type: 'hours',     value: 15  } },
  { id: 'deep_session',      name: 'Deep Session',         icon: '🕕', grade: 'green', desc: '30 hours given to the panels',             requirement: { type: 'hours',     value: 30  } },
  { id: 'committed',         name: 'Committed',            icon: '⏰', grade: 'green', desc: '50 hours given to the panels',         requirement: { type: 'hours',     value: 50  } },

  // Streaks
  { id: 'back_again',        name: 'Back Again',           icon: '🔁', grade: 'green', desc: '2 days straight without missing one',               requirement: { type: 'streak',    value: 2   } },
  { id: 'consistent',        name: 'Three Straight',           icon: '🔁', grade: 'green', desc: '3 days straight without missing one',             requirement: { type: 'streak',    value: 3   } },
  { id: 'week_warrior',      name: 'Week Warrior',         icon: '🗓️', grade: 'green', desc: '7 days straight without missing one',              requirement: { type: 'streak',    value: 7   } },
  { id: 'habit_formed',      name: 'Habit Formed',         icon: '💪', grade: 'green', desc: '14 days straight without missing one',    requirement: { type: 'streak',    value: 14  } },
  { id: 'cant_stop_wont',    name: 'Three Weeks',   icon: '🔥', grade: 'green', desc: '21 days straight without missing one',        requirement: { type: 'streak',    value: 21  } },

  // Social Comments
  { id: 'chatty',            name: 'Chatty',               icon: '💬', grade: 'green', desc: '8 comments echoing through the community',                requirement: { type: 'comments',  value: 8   } },
  { id: 'vocal',             name: 'Vocal',                icon: '📣', grade: 'green', desc: '40 comments echoing through the community',           requirement: { type: 'comments',  value: 40  } },

  // Social Likes
  { id: 'appreciator',       name: 'Appreciator',          icon: '👍', grade: 'green', desc: '15 hearts spread across MangaRecs',                     requirement: { type: 'likes',     value: 15  } },
  { id: 'fifty_hearts',      name: 'Fifty Hearts',         icon: '❤️', grade: 'green', desc: '75 hearts spread across MangaRecs',     requirement: { type: 'likes',     value: 75  } },
  { id: 'seventy_five_hearts',name: 'Heart Giver', icon: '💗', grade: 'green', desc: '120 hearts spread across MangaRecs',             requirement: { type: 'likes',     value: 120  } },

  // Social Friends
  { id: 'growing_circle',    name: 'Growing Circle',       icon: '👥', grade: 'green', desc: '5 readers riding with you now',                        requirement: { type: 'friends',   value: 5   } },
  { id: 'squad_goals',       name: 'Squad Goals',          icon: '🤜', grade: 'green', desc: '8 readers riding with you now',             requirement: { type: 'friends',   value: 8   } },

  // Discovery
  { id: 'genre_curious',     name: 'Genre Curious',        icon: '🎲', grade: 'green', desc: 'Reading across 2 different genres',                      requirement: { type: 'genres',    value: 2   } },
  { id: 'diverse_taste',     name: 'Diverse Taste',        icon: '🎨', grade: 'green', desc: 'Reading across 3 different genres',               requirement: { type: 'genres',    value: 3   } },
  { id: 'well_rounded',      name: 'Well-Rounded',         icon: '🎯', grade: 'green', desc: 'Reading across 4 different genres',    requirement: { type: 'genres',    value: 4   } },

  // Completed
  { id: 'finisher',          name: 'Finisher',             icon: '✅', grade: 'green', desc: '2 stories finished, no loose ends',           requirement: { type: 'completed', value: 2   } },
  { id: 'three_down',        name: 'Three Down',           icon: '🏁', grade: 'green', desc: '5 stories finished, no loose ends',               requirement: { type: 'completed', value: 5   } },

  // Night
  { id: 'night_reader',      name: 'Night Reader',         icon: '🌙', grade: 'green', desc: '2 nights reading past midnight',        requirement: { type: 'midnight',  value: 2   } },
  { id: 'nightcrawler',      name: 'Nightcrawler',         icon: '🌃', grade: 'green', desc: '8 nights reading past midnight',       requirement: { type: 'midnight',  value: 8   } },

  // Collection
  { id: 'ten_titles',        name: 'Ten Titles',           icon: '🔟', grade: 'green', desc: '15 different worlds explored so far',                       requirement: { type: 'manga',     value: 15  } },
  { id: 'growing_shelf',     name: 'Shelf Starter',        icon: '📦', grade: 'green', desc: '40 different worlds explored so far',               requirement: { type: 'manga',     value: 40  } },
  { id: 'collector',         name: 'Collector',            icon: '🗃️', grade: 'green', desc: '75 different worlds explored so far',      requirement: { type: 'manga',     value: 75  } },
  { id: 'enthusiast',        name: 'Enthusiast',           icon: '📙', grade: 'green', desc: '120 different worlds explored so far',  requirement: { type: 'manga',     value: 120  } },

  // Series
  { id: 'library_builder',   name: 'Library Builder',      icon: '🏗️', grade: 'green', desc: 'Following 8 series all at once',       requirement: { type: 'series',    value: 8   } },
  { id: 'ten_on_the_go',     name: 'Ten On the Go',        icon: '📚', grade: 'green', desc: 'Following 15 series all at once',                 requirement: { type: 'series',    value: 15  } },

  // Shares & Ratings
  { id: 'word_spreader',     name: 'Word Spreader',        icon: '📤', grade: 'green', desc: '8 series recommended to other readers',                  requirement: { type: 'shares',    value: 8   } },
  { id: 'early_opinion',     name: 'Early Opinion',        icon: '⭐', grade: 'green', desc: '8 series judged and rated',              requirement: { type: 'ratings',   value: 8   } },
  { id: 'opinionated',       name: 'Opinionated',          icon: '🌟', grade: 'green', desc: '15 series judged and rated',           requirement: { type: 'ratings',   value: 15  } },

  // Hidden
  { id: 'lucky_seven',       name: 'Lucky Seven',   icon: '🎲', grade: 'green', desc: 'Seven chapters daily for seven days',      requirement: { type: 'special',   value: 1   }, hidden: true },
  { id: 'cant_sleep',        name: 'Can\'t Sleep',         icon: '🌃', grade: 'green', desc: 'Five straight nights reading past midnight',               requirement: { type: 'special',   value: 1   }, hidden: true },

  // GOLD (50)   You're serious now.

  // Reader Journey
  { id: 'chapter_chaser',    name: 'Story Addict',       icon: '⚡', grade: 'blue', desc: '500 chapters deep into the panels',                  requirement: { type: 'chapters',  value: 500  } },
  { id: 'saga_reader',       name: 'Panel Storm',          icon: '⚔️', grade: 'blue', desc: '1,000 chapters — most readers never get here',   requirement: { type: 'chapters',  value: 1000  } },
  { id: 'four_digits',       name: 'Volume Lord',          icon: '🔢', grade: 'blue', desc: '2,000 chapters — most readers never get here',         requirement: { type: 'chapters',  value: 2000 } },
  { id: 'fifteen_hundred',   name: 'Ink Devourer',      icon: '📚', grade: 'blue', desc: '3,000 chapters — most readers never get here',        requirement: { type: 'chapters',  value: 3000 } },

  // Time Spent
  { id: 'forty_hours',       name: 'Night Owl',          icon: '🕑', grade: 'blue', desc: '80 hours given to the panels',                      requirement: { type: 'hours',     value: 80   } },
  { id: 'fifty_hours',       name: 'Marathon Reader',          icon: '🕔', grade: 'blue', desc: '100 hours lived inside other worlds',          requirement: { type: 'hours',     value: 100   } },
  { id: 'night_owl',         name: 'Time Sink',            icon: '🦉', grade: 'blue', desc: '150 hours lived inside other worlds',  requirement: { type: 'hours',     value: 150   } },
  { id: 'marathon_reader',   name: 'Clock Breaker',      icon: '🏃', grade: 'blue', desc: '250 hours lived inside other worlds',           requirement: { type: 'hours',     value: 250  } },
  { id: 'time_sink',         name: 'Hour Hoarder',            icon: '⌛', grade: 'blue', desc: '300 hours lived inside other worlds',                  requirement: { type: 'hours',     value: 300  } },

  // Streaks
  { id: 'monthly_master',    name: 'Monthly Master',       icon: '🗓️', grade: 'blue', desc: '30 straight days of pure discipline',                requirement: { type: 'streak',    value: 30   } },
  { id: 'six_weeks_solid',   name: 'Six Weeks',      icon: '💪', grade: 'blue', desc: '45 straight days of pure discipline',                  requirement: { type: 'streak',    value: 45   } },
  { id: 'two_month_titan',   name: 'Two Month Titan',      icon: '🔥', grade: 'blue', desc: '60 straight days of pure discipline',               requirement: { type: 'streak',    value: 60   } },

  // Collection
  { id: 'triple_digits',     name: 'World Hopper',        icon: '💥', grade: 'blue', desc: '200 different worlds explored so far',          requirement: { type: 'manga',     value: 200  } },
  { id: 'rising_reader',     name: 'Triple Digits',        icon: '📚', grade: 'blue', desc: '250 different worlds explored so far',             requirement: { type: 'manga',     value: 250  } },
  { id: 'heavy_shelf',       name: 'Shelf Filler',          icon: '🗄️', grade: 'blue', desc: '400 different worlds explored so far',   requirement: { type: 'manga',     value: 400  } },
  { id: 'two_hundred_manga', name: 'Heavy Shelf',             icon: '🎖️', grade: 'blue', desc: '500 different worlds explored so far', requirement: { type: 'manga',   value: 500  } },

  // Completed
  { id: 'arc_ender',         name: 'Arc Ender',            icon: '🎬', grade: 'blue', desc: '10 stories finished, no loose ends',            requirement: { type: 'completed', value: 10    } },
  { id: 'seven_complete',    name: 'Closer',       icon: '🎯', grade: 'blue', desc: '15 stories finished, no loose ends',                   requirement: { type: 'completed', value: 15    } },
  { id: 'dozen_done',        name: 'Dozen Done',           icon: '🎬', grade: 'blue', desc: '25 stories finished, no loose ends',                        requirement: { type: 'completed', value: 25   } },

  // Series & Friends
  { id: 'twenty_series',     name: 'Twenty Series',        icon: '📚', grade: 'blue', desc: 'Following 40 series all at once',                requirement: { type: 'series',    value: 40   } },
  { id: 'social_node',       name: 'Social Node',          icon: '🌐', grade: 'blue', desc: '20 readers riding with you now',                          requirement: { type: 'friends',   value: 20   } },
  { id: 'wide_network',      name: 'Wide Network',         icon: '🌐', grade: 'blue', desc: '30 readers riding with you now',                           requirement: { type: 'friends',   value: 30   } },

  // Comments & Likes
  { id: 'discussion_king',   name: 'Discussion King',      icon: '👑', grade: 'blue', desc: '100 comments echoing through the community',      requirement: { type: 'comments',  value: 100   } },
  { id: 'loud_voice',        name: 'Loud Voice',           icon: '📢', grade: 'blue', desc: '150 comments echoing through the community',       requirement: { type: 'comments',  value: 150   } },
  { id: 'always_there',      name: 'Always There',         icon: '🗨️', grade: 'blue', desc: '250 comments echoing through the community',   requirement: { type: 'comments',  value: 250  } },
  { id: 'love_machine',      name: 'Love Machine',         icon: '💝', grade: 'blue', desc: '200 hearts spread across MangaRecs',         requirement: { type: 'likes',     value: 200  } },
  { id: 'two_fifty_hearts',  name: 'Heart Cannon',     icon: '💞', grade: 'blue', desc: '500 hearts spread across MangaRecs',                 requirement: { type: 'likes',     value: 500  } },

  // Night, Genre, Shares
  { id: 'midnight_regular',  name: 'Midnight Club',     icon: '🌃', grade: 'blue', desc: '30 nights reading past midnight',       requirement: { type: 'midnight',  value: 30   } },
  { id: 'omnivore',          name: 'Omnivore',             icon: '🌈', grade: 'blue', desc: 'Reading across 5 different genres',         requirement: { type: 'genres',    value: 5    } },
  { id: 'fifty_shares',      name: 'Town Crier',           icon: '📣', grade: 'blue', desc: '100 series recommended to other readers',         requirement: { type: 'shares',    value: 100   } },

  // Discovery & Hidden
  { id: 'world_traveler',    name: 'World Traveler',       icon: '🌍', grade: 'blue', desc: 'Manga, manhwa and manhua all read',              requirement: { type: 'special',   value: 1    } },
  { id: 'one_more_chapter',  name: 'One More Chapter',     icon: '🎭', grade: 'blue', desc: 'Four straight hours in one sitting',             requirement: { type: 'binge',     value: 1    }, hidden: true },
  { id: 'conversation_start',name: 'Icebreaker', icon: '💬', grade: 'blue', desc: 'Ten different readers replied to you',            requirement: { type: 'special',   value: 1    }, hidden: true },

  // PLATINUM (50)   Beyond normal reader territory.

  // Reader Journey
  { id: 'three_thousand',    name: 'Panel Sage',       icon: '🌊', grade: 'indigo', desc: '6,000 chapters read — a living legend', requirement: { type: 'chapters',  value: 6000 } },
  { id: 'library_dweller',   name: 'Library Ghost',      icon: '🏛️', grade: 'indigo', desc: '8,000 chapters read — a living legend',   requirement: { type: 'chapters',  value: 8000 } },

  // Time Spent
  { id: 'two_hundred_hrs',   name: 'Panel Dweller',    icon: '🕰️', grade: 'indigo', desc: '500 hours lived inside other worlds',           requirement: { type: 'hours',     value: 500  } },
  { id: 'three_hundred_hrs', name: 'Time Bender',  icon: '⏰', grade: 'indigo', desc: '700 hours lived inside other worlds',                   requirement: { type: 'hours',     value: 700  } },
  { id: 'year_in_hours',     name: 'Hour Legend',      icon: '📆', grade: 'indigo', desc: '750 hours lived inside other worlds', requirement: { type: 'hours',     value: 750  } },
  { id: 'five_fifty_hrs',    name: 'Time Lord',     icon: '🕰️', grade: 'indigo', desc: '950 hours lived inside other worlds', requirement: { type: 'hours',   value: 950  } },

  // Streaks
  { id: 'century_streak',    name: 'Century Streak',       icon: '🌟', grade: 'indigo', desc: '100 straight days of pure discipline',                requirement: { type: 'streak',    value: 100  } },
  { id: 'four_months_str',   name: 'Four Months',          icon: '🏆', grade: 'indigo', desc: '120 straight days of pure discipline',     requirement: { type: 'streak',    value: 120  } },
  { id: 'one_sixty_str',     name: 'Iron Routine',       icon: '🏅', grade: 'indigo', desc: '160 straight days of pure discipline',     requirement: { type: 'streak',    value: 160  } },

  // Collection
  { id: 'three_hundred_mng', name: 'Archivist',        icon: '🔮', grade: 'indigo', desc: '750 different worlds explored so far', requirement: { type: 'manga',   value: 750  } },
  { id: 'the_archivist',     name: 'Grand Curator',        icon: '🗄️', grade: 'indigo', desc: '900 different worlds explored so far',  requirement: { type: 'manga',     value: 900  } },
  { id: 'five_hundred_mng',  name: 'Realm Collector',   icon: '📘', grade: 'indigo', desc: '1,200 different worlds explored so far',  requirement: { type: 'manga',     value: 1200  } },

  // Completed
  { id: 'fifteen_done',      name: 'Ending Hunter',         icon: '🎬', grade: 'indigo', desc: '30 stories finished, no loose ends',       requirement: { type: 'completed', value: 30   } },
  { id: 'series_hunter',     name: 'Series Hunter',        icon: '🎯', grade: 'indigo', desc: '50 stories finished, no loose ends',  requirement: { type: 'completed', value: 50   } },
  { id: 'thirty_five_done',  name: 'Forty Finisher',          icon: '🎯', grade: 'indigo', desc: '70 stories finished, no loose ends',    requirement: { type: 'completed', value: 70   } },

  // Friends & Comments
  { id: 'thirty_strong',     name: 'Crew Captain',        icon: '🤝', grade: 'indigo', desc: '60 readers riding with you now',               requirement: { type: 'friends',   value: 60   } },
  { id: 'thirty_five_frnd',  name: 'Guild Leader',  icon: '👥', grade: 'indigo', desc: '70 readers riding with you now',                  requirement: { type: 'friends',   value: 70   } },
  { id: 'voice_of_mangarecs',  name: 'The Voice',     icon: '📢', grade: 'indigo', desc: '400 comments echoing through the community',  requirement: { type: 'comments',  value: 400  } },
  { id: 'two_fifty_voices',  name: 'Thread Weaver',     icon: '🗣️', grade: 'indigo', desc: '500 comments echoing through the community',         requirement: { type: 'comments',  value: 500  } },

  // Likes & Night
  { id: 'four_hundred_hrt',  name: 'Love Tsunami',  icon: '💕', grade: 'indigo', desc: '800 hearts spread across MangaRecs',         requirement: { type: 'likes',     value: 800  } },
  { id: 'the_appreciator',   name: 'The Appreciator',      icon: '💎', grade: 'indigo', desc: '1,000 hearts spread across MangaRecs', requirement: { type: 'likes',    value: 1000  } },
  { id: 'night_regular',     name: 'Night Regular',        icon: '🌌', grade: 'indigo', desc: '100 nights reading past midnight',  requirement: { type: 'midnight',  value: 100   } },
  { id: 'darkness_dweller',  name: 'Nocturnal Soul',     icon: '🌌', grade: 'indigo', desc: '150 nights reading past midnight',      requirement: { type: 'midnight',  value: 150   } },
  { id: 'nocturnal_soul',    name: 'Moon Reader',       icon: '🌑', grade: 'indigo', desc: '200 nights reading past midnight',       requirement: { type: 'midnight',  value: 200  } },

  // AI Badges
  { id: 'ai_approved',       name: 'AI Approved',          icon: '🤖', grade: 'indigo', desc: 'Took the algorithm up on one',               requirement: { type: 'special',   value: 1    }, hidden: true },
  { id: 'trust_the_algo',    name: 'Trust the Algo',  icon: '🧠', grade: 'indigo', desc: 'Twenty AI picks read back to back',            requirement: { type: 'special',   value: 1    }, hidden: true },
  { id: 'perfect_match_ai',  name: 'Perfect Match',        icon: '✨', grade: 'indigo', desc: 'Ten AI picks rated five stars', requirement: { type: 'special', value: 1    }, hidden: true },

  // Genre, Series, Shares, Ratings
  { id: 'six_genres',        name: 'Six Genres',           icon: '🌈', grade: 'indigo', desc: 'Reading across 6 different genres',             requirement: { type: 'genres',    value: 6    } },
  { id: 'thirty_five_ser',   name: 'Grand Library',   icon: '📜', grade: 'indigo', desc: 'Following 70 series all at once',                requirement: { type: 'series',    value: 70   } },

  // DIAMOND (45)   The obsessed. The dedicated.

  // Reader Journey
  { id: 'living_encyclopedia',name: 'Ink Legend', icon: '📚', grade: 'purple', desc: '10,000 chapters read — a living legend', requirement: { type: 'chapters', value: 10000 } },
  { id: 'archive_keeper',    name: 'Page Emperor',       icon: '🗄️', grade: 'purple', desc: '12,000 chapters read — a living legend',  requirement: { type: 'chapters',  value: 12000 } },
  { id: 'legend_of_ink',     name: 'Chapter Titan',        icon: '📖', grade: 'purple', desc: '15,000 chapters read — a living legend', requirement: { type: 'chapters', value: 15000 } },

  // Time Spent
  { id: 'five_hundred_hrs',  name: 'Chrono Reader',   icon: '🕰️', grade: 'purple', desc: '1,000 hours — reading is your life', requirement: { type: 'hours',     value: 1000  } },
  { id: 'six_hundred_hrs',   name: 'Eternal Clock',    icon: '🌀', grade: 'purple', desc: '1,500 hours — reading is your life',  requirement: { type: 'hours',     value: 1500  } },
  { id: 'seven_hundred_hrs', name: 'Hour Deity',  icon: '🌀', grade: 'purple', desc: '2,000 hours — reading is your life', requirement: { type: 'hours',    value: 2000  } },
  { id: 'eight_hundred_hrs', name: 'Chrono Titan',  icon: '⏱️', grade: 'purple', desc: '2,500 hours — reading is your life',  requirement: { type: 'hours',     value: 2500  } },

  // Streaks
  { id: 'half_year_str',     name: 'Half Year Soul',            icon: '🌠', grade: 'purple', desc: '180 straight days of pure discipline',       requirement: { type: 'streak',    value: 180  } },
  { id: 'eight_months_str',  name: 'Eight Months',         icon: '🏅', grade: 'purple', desc: '240 straight days of pure discipline',        requirement: { type: 'streak',    value: 240  } },
  { id: 'nine_months_str',   name: 'Nine Months',    icon: '🏅', grade: 'purple', desc: '270 straight days of pure discipline',   requirement: { type: 'streak',    value: 270  } },
  { id: 'three_hundred_str', name: '300 Day Club',   icon: '🏆', grade: 'purple', desc: '300 straight days of pure discipline',      requirement: { type: 'streak',    value: 300  } },

  // Collection
  { id: 'seven_hundred_mng', name: 'Atlas Reader',  icon: '🧿', grade: 'purple', desc: '2,000 different worlds explored so far',   requirement: { type: 'manga',     value: 2000  } },
  { id: 'eight_hundred_mng', name: 'Myriad Worlds',  icon: '🔭', grade: 'purple', desc: '2,500 different worlds explored so far',              requirement: { type: 'manga',     value: 2500  } },
  { id: 'nine_hundred_mng',  name: 'Infinite Shelf',   icon: '🧿', grade: 'purple', desc: '3,000 different worlds explored so far',      requirement: { type: 'manga',     value: 3000  } },

  // Completed
  { id: 'forty_finisher',    name: 'Saga Collector',       icon: '🎯', grade: 'purple', desc: '80 stories finished, no loose ends',    requirement: { type: 'completed', value: 80   } },
  { id: 'conclusion_seeker', name: 'Grand Finisher',    icon: '🔚', grade: 'purple', desc: '150 stories finished, no loose ends', requirement: { type: 'completed', value: 150  } },

  // Social
  { id: 'community_pillar',  name: 'Hundred Strong',     icon: '🏟️', grade: 'purple', desc: '100 readers riding with you now',    requirement: { type: 'friends',   value: 100   } },
  { id: 'forum_legend',      name: 'Debate Master',         icon: '🗿', grade: 'purple', desc: '1,000 comments echoing through the community',      requirement: { type: 'comments',  value: 1000  } },

  // Genre, Series, Ratings, Likes, Night, Shares
  { id: 'genre_master',      name: 'Genre Master',         icon: '🎭', grade: 'purple', desc: 'Reading across 8 different genres',  requirement: { type: 'genres',    value: 8    } },
  { id: 'grand_library',     name: 'Sixty Following',        icon: '📜', grade: 'purple', desc: 'Following 100 series all at once',  requirement: { type: 'series',    value: 100   } },
  { id: 'century_critic',    name: 'Century Critic',       icon: '✍️', grade: 'purple', desc: '200 series judged and rated',      requirement: { type: 'ratings',   value: 200  } },
  { id: 'prolific_critic',   name: 'Prolific Critic',      icon: '✍️', grade: 'purple', desc: '300 series judged and rated',       requirement: { type: 'ratings',   value: 300  } },
  { id: 'thousand_hearts',   name: 'Endless Love',  icon: '💜', grade: 'purple', desc: '2,000 hearts spread across MangaRecs', requirement: { type: 'likes',     value: 2000 } },
  { id: 'movement_maker',    name: 'Movement Maker',       icon: '📡', grade: 'purple', desc: '300 series recommended to other readers',      requirement: { type: 'shares',    value: 300  } },

  // Genre Mastery Collection
  { id: 'isekai_survivor',   name: 'Isekai Survivor',      icon: '⚡', grade: 'purple', desc: 'Fifty isekai worlds survived and finished',    requirement: { type: 'special',   value: 1    } },
  { id: 'romance_master',    name: 'Romance Master',       icon: '💖', grade: 'purple', desc: 'Fifty romance stories loved to completion',   requirement: { type: 'special',   value: 1    } },
  { id: 'murim_disciple',    name: 'Murim Disciple',       icon: '⚔️', grade: 'purple', desc: 'Thirty murim paths walked to mastery',  requirement: { type: 'special',  value: 1    } },
  { id: 'tower_climber',     name: 'Tower Climber',        icon: '🗼', grade: 'purple', desc: 'Thirty towers climbed to the top',          requirement: { type: 'special',   value: 1    } },
  { id: 'regression_expert', name: 'Regressor',   icon: '♻️', grade: 'purple', desc: 'Thirty regressions lived all over again', requirement: { type: 'special', value: 1  } },

  // Social Mastery Hidden
  { id: 'reading_buddy',     name: 'Reading Buddy',        icon: '🤝', grade: 'purple', desc: 'A thirty-day streak shared with a friend', requirement: { type: 'special', value: 1   }, hidden: true },
  { id: 'book_club',         name: 'Book Club',            icon: '📚', grade: 'purple', desc: 'Same series, same time, three friends',  requirement: { type: 'special',   value: 1    }, hidden: true },
  { id: 'debate_club',       name: 'Debate Club',          icon: '💬', grade: 'purple', desc: 'One hundred likes on your comments',                 requirement: { type: 'special',   value: 1    }, hidden: true },

  // Quirky Hidden
  { id: 'touch_grass',       name: 'Touch Grass',          icon: '🌱', grade: 'purple', desc: 'Twelve hours read in one day',                   requirement: { type: 'special',   value: 1    }, hidden: true },
  { id: 'double_feature',    name: 'Double Feature',       icon: '🎬', grade: 'purple', desc: 'Two different finales in one day',  requirement: { type: 'special',   value: 1    }, hidden: true },
  { id: 'silent_reader',     name: 'Silent Reader',        icon: '🤫', grade: 'purple', desc: 'Five hundred chapters, not one comment',    requirement: { type: 'special',   value: 1    }, hidden: true },
  { id: 'speed_reader',      name: 'Speed Reader',         icon: '💨', grade: 'purple', desc: 'Fifty chapters devoured in one day',                    requirement: { type: 'special',   value: 1    }, hidden: true },
  { id: 'the_return',        name: 'The Return',           icon: '🔄', grade: 'purple', desc: 'Gone six months, came back hungry',  requirement: { type: 'special',   value: 1    }, hidden: true },
  { id: 'true_completionist',name: 'Flawless Run',   icon: '🎯', grade: 'purple', desc: 'Finished without skipping a single day',     requirement: { type: 'special',   value: 1    }, hidden: true },

  // MASTER (30)   Legends. Events. The endgame.

  // Reader Journey
  { id: 'ten_thousand',      name: 'Panel Master',         icon: '🔑', grade: 'gold', desc: '20,000 chapters read — a living legend', requirement: { type: 'chapters', value: 20000 } },
  { id: 'fifteen_thousand',  name: 'Ink Sovereign',     icon: '🌐', grade: 'gold', desc: '30,000 chapters read — a living legend',              requirement: { type: 'chapters',  value: 30000 } },

  // Time Spent
  { id: 'thousand_hours',    name: 'Hour Infinity',   icon: '🕯️', grade: 'gold', desc: '3,000 hours — reading is your life',       requirement: { type: 'hours',     value: 3000  } },
  { id: 'fifteen_h_hrs',     name: 'Time Absolute',icon: '⚜️', grade: 'gold', desc: '4,000 hours — reading is your life', requirement: { type: 'hours',   value: 4000  } },
  { id: 'two_thousand_hrs',  name: 'Beyond Time',   icon: '🔱', grade: 'gold', desc: '5,000 hours — reading is your life',       requirement: { type: 'hours',     value: 5000  } },

  // Streaks
  { id: 'full_year',         name: 'Year of Ink',            icon: '🎊', grade: 'gold', desc: '365 days unbroken — truly unstoppable', requirement: { type: 'streak',   value: 365   } },
  { id: 'unstoppable',       name: 'Unstoppable',          icon: '⚡', grade: 'gold', desc: '500 days unbroken — truly unstoppable',       requirement: { type: 'streak',    value: 500   } },
  { id: 'two_year_streak',   name: 'Two Year Flame',      icon: '🎗️', grade: 'gold', desc: '730 days unbroken — truly unstoppable',    requirement: { type: 'streak',    value: 730   } },

  // Collection
  { id: 'the_thousand',      name: 'World Sovereign',         icon: '🏆', grade: 'gold', desc: '4,000 different worlds explored so far',     requirement: { type: 'manga',     value: 4000  } },
  { id: 'twelve_hundred_mng',name: 'Realm Emperor',       icon: '🥇', grade: 'gold', desc: '5,000 different worlds explored so far', requirement: { type: 'manga', value: 5000  } },
  { id: 'fifteen_h_manga',   name: 'World Eater',icon: '👑', grade: 'gold', desc: '6,000 different worlds explored so far',        requirement: { type: 'manga',     value: 6000  } },
  { id: 'two_thousand_manga',name: 'Omniverse',   icon: '🌟', grade: 'gold', desc: '7,000 different worlds explored so far', requirement: { type: 'manga',  value: 7000  } },

  // Completed, Friends, Comments, Likes, Night
  { id: 'the_completionist', name: 'Finale King',    icon: '🎖️', grade: 'gold', desc: '200 stories finished, no loose ends',  requirement: { type: 'completed', value: 200   } },
  { id: 'grand_finisher',    name: 'Ending Emperor',       icon: '🏁', grade: 'gold', desc: '300 stories finished, no loose ends', requirement: { type: 'completed', value: 300   } },
  { id: 'two_hundred_comp',  name: 'Finale Deity',          icon: '📰', grade: 'gold', desc: '400 stories finished, no loose ends',     requirement: { type: 'completed', value: 400   } },
  { id: 'hundred_strong',    name: 'The Architect',       icon: '🌏', grade: 'gold', desc: '200 readers riding with you now',        requirement: { type: 'friends',   value: 200   } },
  { id: 'community_builder', name: 'Server Famous',    icon: '🏙️', grade: 'gold', desc: '400 readers riding with you now',         requirement: { type: 'friends',   value: 400   } },
  { id: 'comment_god',       name: 'Eternal Voice',          icon: '🎙️', grade: 'gold', desc: '2,000 comments echoing through the community',          requirement: { type: 'comments',  value: 2000  } },
  { id: 'endless_love',      name: 'Love Deity',         icon: '💛', grade: 'gold', desc: '4,000 hearts spread across MangaRecs',  requirement: { type: 'likes',     value: 4000  } },
  { id: 'eternal_night',     name: 'Night Sovereign',        icon: '🌑', grade: 'gold', desc: '750 nights reading past midnight', requirement: { type: 'midnight', value: 750  } },

  // Account / Veteran
  { id: 'veteran_1yr',       name: '1 Year Veteran',       icon: '🎂', grade: 'gold', desc: 'One full year with MangaRecs',                      requirement: { type: 'account',   value: 365   } },
  { id: 'veteran_2yr',       name: '2 Year Legend',        icon: '🎁', grade: 'gold', desc: 'Two loyal years with MangaRecs',           requirement: { type: 'account',   value: 730   } },
  { id: 'veteran_3yr',       name: '3 Year Deity',         icon: '🎇', grade: 'gold', desc: 'Three legendary years with MangaRecs',         requirement: { type: 'account',   value: 1095  } },

  // Shares & Series
  { id: 'the_spreader',      name: 'The Spreader',         icon: '🌍', grade: 'gold', desc: '1,000 series recommended to other readers',          requirement: { type: 'shares',    value: 1000   } },
  { id: 'epic_library',      name: 'Story Ocean',         icon: '🏛️', grade: 'gold', desc: 'Following 200 series all at once',            requirement: { type: 'series',    value: 200   } },

  // Event & Social Legends (hidden)
  { id: 'founding_member',   name: 'Founding Member',      icon: '🏛️', grade: 'gold', desc: 'Here in the very first month',       requirement: { type: 'special',   value: 1     }, hidden: true },
  { id: 'trusted_recomm',    name: 'Trendsetter',  icon: '🏅', grade: 'gold', desc: 'Five friends started reading your picks', requirement: { type: 'special', value: 1  }, hidden: true },
  { id: 'taste_maker',       name: 'Taste Maker',          icon: '👑', grade: 'gold', desc: 'Ten readers bookmarked from your profile',       requirement: { type: 'special',   value: 1     }, hidden: true },
  { id: 'community_fav',     name: 'Crowd Favorite',   icon: '💫', grade: 'gold', desc: 'Two hundred fifty profile likes earned',          requirement: { type: 'special',   value: 1     }, hidden: true },
  { id: 'iron_will',         name: 'Iron Will',            icon: '🪨', grade: 'gold', desc: 'A full year without breaking once',         requirement: { type: 'special',   value: 1     }, hidden: true },

  // MYTHIC (15)   The impossible. Few will ever see these.

  { id: 'mythic_transcendent',  name: 'Transcendent',      icon: '🌌', grade: 'mythic', desc: '7,500 different worlds explored so far',         requirement: { type: 'manga',     value: 7500  }, hidden: true },
  { id: 'mythic_time_devourer', name: 'Time Devourer',         icon: '⏳', grade: 'mythic', desc: '15,000 hours — reading is your life',        requirement: { type: 'hours',     value: 15000 }, hidden: true },
  { id: 'mythic_unbroken',      name: 'The Unbroken',          icon: '🔥', grade: 'mythic', desc: '1,000 days unbroken — truly unstoppable',  requirement: { type: 'streak',    value: 1000  }, hidden: true },
  { id: 'mythic_three_year',    name: 'Immortal',   icon: '♾️', grade: 'mythic', desc: '1,095 days unbroken — truly unstoppable',         requirement: { type: 'streak',    value: 1095  }, hidden: true },
  { id: 'mythic_singularity',   name: 'Singularity',   icon: '🌠', grade: 'mythic', desc: '75,000 chapters read — a living legend',  requirement: { type: 'chapters',  value: 75000 }, hidden: true },
  { id: 'mythic_grand_comp',    name: 'Grand Finale',   icon: '👁️', grade: 'mythic', desc: '750 stories finished, no loose ends',       requirement: { type: 'completed', value: 750   }, hidden: true },
  { id: 'mythic_god_community', name: 'God of Community',      icon: '🌐', grade: 'mythic', desc: '1,500 readers riding with you now',                      requirement: { type: 'friends',   value: 1500  }, hidden: true },
  { id: 'mythic_eternal_voice', name: 'Voice of Ages',     icon: '📯', grade: 'mythic', desc: '15,000 comments echoing through the community',            requirement: { type: 'comments',  value: 15000 }, hidden: true },
  { id: 'mythic_love_deity',    name: 'Boundless Heart',        icon: '💘', grade: 'mythic', desc: '75,000 hearts spread across MangaRecs',                   requirement: { type: 'likes',     value: 75000 }, hidden: true },
  { id: 'mythic_night_dwell',   name: 'Night Eternal', icon: '🌑', grade: 'mythic', desc: '1,500 nights reading past midnight',               requirement: { type: 'midnight',  value: 1500  }, hidden: true },
  { id: 'mythic_grand_curator', name: 'Story Sovereign',     icon: '📚', grade: 'mythic', desc: 'Following 750 series all at once',                   requirement: { type: 'series',    value: 750   }, hidden: true },
  { id: 'mythic_supreme_spr',   name: 'Evangelist',  icon: '🌍', grade: 'mythic', desc: '7,500 series recommended to other readers',   requirement: { type: 'shares',    value: 7500  }, hidden: true },
  { id: 'mythic_oracle',        name: 'The Oracle',            icon: '🔮', grade: 'mythic', desc: '1,500 series judged and rated',                 requirement: { type: 'ratings',   value: 1500  }, hidden: true },
  { id: 'mythic_decade',        name: 'The Decade',   icon: '🪐', grade: 'mythic', desc: 'A whole decade with MangaRecs',        requirement: { type: 'account',   value: 3650  }, hidden: true },
  { id: 'mythic_incarnate',     name: 'Incarnate',     icon: '✴️', grade: 'mythic', desc: 'Every single badge — the final one',  requirement: { type: 'special',   value: 1     }, hidden: true },

  // ═══ SEASONAL EVENTS — visible & earnable only inside their window ═══
  { id: 'event_halloween26', name: "Night Shift '26", icon: '🎃', grade: 'purple', desc: '13 nights reading past midnight', requirement: { type: 'midnight', value: 13 }, season: { start: '2026-10-18', end: '2026-11-02' } },
  { id: 'event_newyear27',   name: "New Year '27",    icon: '🎆', grade: 'purple', desc: '7 days straight without missing one',      requirement: { type: 'streak',   value: 7  }, season: { start: '2026-12-26', end: '2027-01-08' } },
  // ═══ WEAPON VAULT — 7 legendary arms per family, Bronze → Mythic.
  //     Pure emblems (no frame, no icon); the higher the tier, the finer the
  //     steel. desc names the wielder + series where the weapon is canon. ═══

  // Swords — the swordsman's road (chapters read)

  // Katanas — the way of discipline (reading streak)

  // Greatswords — carried through long hours (time read)

  // Bows — precision earned (series rated)

  // Daggers — the Shadow Monarch's path (midnight reads)

  // Scythes — reapers of worlds (titles read)

  // Shovels — the estate developer's arsenal (series finished)
];

function profileToBadgeStats(profile) {
  if (!profile) return {};
  const cr = profile.chapters_read || 0;
  return {
    chapters_read:  cr,
    hours_read:     profile.hours_read      || 0,
    streak_count:   profile.streak_count    || 0,
    series_count:   profile.series_count    || 0,
    friends_count:  profile.friends_count   || 0,
    comments_count: profile.comments_count  || 0,
    likes_given:    profile.likes_given     || 0,
    completed_count:profile.completed_count || 0,
    night_reads:    profile.night_reads     || 0,
    genres_count:   profile.genres_count    || (cr > 0 ? 1 : 0),
    shares_count:   profile.shares_count    || 0,
    manga_count:    profile.manga_count     || Math.floor(cr / 12),
    ratings_count:  profile.ratings_count   || 0,
    account_days:   profile.created_at
      ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / 86400000)
      : (profile.account_days || 0),
    has_avatar:  !!profile.avatar_url,
    has_friend:  (profile.friends_count  || 0) >= 1,
    has_comment: (profile.comments_count || 0) >= 1,
    has_like:    (profile.likes_given    || 0) >= 1,
  };
}

function computeEarnedBadgeIds(stats = {}) {
  const {
    chapters_read   = 0, hours_read      = 0, streak_count    = 0,
    series_count    = 0, friends_count   = 0, comments_count  = 0,
    likes_given     = 0, completed_count = 0, night_reads     = 0,
    genres_count    = 0, shares_count    = 0, manga_count     = 0,
    ratings_count   = 0, account_days    = 0,
    has_avatar = false, has_friend = false, has_comment = false, has_like = false,
  } = stats;

  const earned = new Set();

  if (chapters_read  >= 1)  earned.add('first_page');
  if (series_count   >= 1)  earned.add('new_chapter');
  if (has_comment || comments_count >= 1) earned.add('speak_up');
  if (has_like    || likes_given    >= 1) earned.add('first_heart');
  if (has_friend  || friends_count  >= 1) earned.add('not_alone');
  if (has_avatar)                         earned.add('face_of_mangarecs');
  if (series_count   >= 2 || chapters_read >= 30) earned.add('more_please');
  if (genres_count   >= 1 || chapters_read >= 1)  earned.add('curious');

  for (const badge of ALL_BADGES) {
    if (badge.requirement.type === 'special' || badge.requirement.type === 'binge') continue;
    if (badge.season && !seasonActive(badge)) continue;
    const { type, value } = badge.requirement;
    if (type === 'chapters'  && chapters_read   >= value) earned.add(badge.id);
    if (type === 'hours'     && hours_read       >= value) earned.add(badge.id);
    if (type === 'streak'    && streak_count     >= value) earned.add(badge.id);
    if (type === 'series'    && series_count     >= value) earned.add(badge.id);
    if (type === 'friends'   && friends_count    >= value) earned.add(badge.id);
    if (type === 'comments'  && comments_count   >= value) earned.add(badge.id);
    if (type === 'likes'     && likes_given      >= value) earned.add(badge.id);
    if (type === 'completed' && completed_count  >= value) earned.add(badge.id);
    if (type === 'midnight'  && night_reads      >= value) earned.add(badge.id);
    if (type === 'genres'    && genres_count     >= value) earned.add(badge.id);
    if (type === 'shares'    && shares_count     >= value) earned.add(badge.id);
    if (type === 'manga'     && manga_count      >= value) earned.add(badge.id);
    if (type === 'ratings'   && ratings_count    >= value) earned.add(badge.id);
    if (type === 'account'   && account_days     >= value) earned.add(badge.id);
    if (type === 'profile'   && has_avatar)                earned.add(badge.id);
  }

  return earned;
}

var GRADE_ORDER = ['grey', 'green', 'blue', 'indigo', 'purple', 'gold', 'mythic'];

var STAT_KEY_BY_TYPE = {
  chapters: 'chapters_read', hours: 'hours_read', streak: 'streak_count',
  series: 'series_count', friends: 'friends_count', comments: 'comments_count',
  likes: 'likes_given', completed: 'completed_count', midnight: 'night_reads',
  genres: 'genres_count', shares: 'shares_count', manga: 'manga_count',
  ratings: 'ratings_count', account: 'account_days',
};

var PROGRESS_GRADES = new Set(['grey', 'green', 'blue']);

function badgeProgress(badge, stats = {}) {
  const { type, value } = badge.requirement || {};
  const key = STAT_KEY_BY_TYPE[type];
  if (!key || !value) return null;
  const current = Math.max(0, stats[key] || 0);
  return { current: Math.min(current, value), target: value, pct: Math.max(0, Math.min(1, current / value)) };
}

function seasonActive(badge, now = new Date()) {
  if (!badge.season) return true;
  const t = now.getTime();
  return t >= new Date(badge.season.start).getTime() && t < new Date(badge.season.end).getTime();
}

function nextUpBadges(stats = {}, earnedIds = new Set(), count = 3) {
  const candidates = [];
  for (const b of ALL_BADGES) {
    if (earnedIds.has(b.id) || b.hidden) continue;
    if (b.season && !seasonActive(b)) continue;
    const prog = badgeProgress(b, stats);
    if (!prog || prog.pct >= 1) continue;
    candidates.push({ badge: b, ...prog });
  }
  candidates.sort((a, b) => b.pct - a.pct || a.target - b.target);
  return candidates.slice(0, count);
}

function highestGradeEarned(earnedIds = new Set()) {
  let best = -1;
  for (const b of ALL_BADGES) {
    if (!earnedIds.has(b.id)) continue;
    const rank = GRADE_ORDER.indexOf(b.grade);
    if (rank > best) best = rank;
  }
  return best >= 0 ? GRADE_ORDER[best] : null;
}

function gradeAtLeast(grade, required) {
  return GRADE_ORDER.indexOf(grade) >= GRADE_ORDER.indexOf(required);
}
