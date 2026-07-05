// Grade keys: grey, green, blue, indigo, purple, gold, mythic
export const BADGE_GRADES = {
  grey:   { label: 'Starter',   color: '#a1a1aa', bg: 'rgba(161,161,170,0.15)', border: '#a1a1aa',                glow: null },
  green:  { label: 'Common',    color: '#34d399', bg: 'rgba(52,211,153,0.15)',  border: '#34d399',                glow: null },
  blue:   { label: 'Rare ',      color: '#38bdf8', bg: 'rgba(56,189,248,0.15)',  border: '#38bdf8',                glow: null },
  indigo: { label: 'Epic',      color: '#818cf8', bg: 'rgba(129,140,248,0.15)', border: '#818cf8',                glow: 'rgba(99,102,241,0.25)' },
  purple: { label: 'Special',   color: '#a78bfa', bg: 'rgba(167,139,250,0.15)', border: '#a78bfa',                glow: 'rgba(139,92,246,0.20)' },
  gold:   { label: 'Legendary', color: '#facc15', bg: 'rgba(250,204,21,0.15)',  border: '#facc15',                glow: 'rgba(234,179,8,0.30)' },
  mythic: { label: 'Mythic',    color: '#fda4af', bg: 'rgba(244,63,94,0.20)',   border: 'rgba(251,113,133,0.60)', glow: 'rgba(244,63,94,0.40)' },
};

export const ALL_BADGES = [

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // GREY STARTER (15)   First steps. Welcome to MangaRecs.
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  { id: 'first_page',       name: 'First Page',         icon: '📄', grade: 'grey', desc: 'Turned your very first page on MangaRecs',          requirement: { type: 'chapters',  value: 1   } },
  { id: 'new_chapter',      name: 'New Chapter',         icon: '📖', grade: 'grey', desc: 'Started your first series',                       requirement: { type: 'series',    value: 1   } },
  { id: 'speak_up',         name: 'Speak Up',            icon: '💬', grade: 'grey', desc: 'Left your first comment on anything',             requirement: { type: 'comments',  value: 1   } },
  { id: 'first_heart',      name: 'First Heart',         icon: '❤️', grade: 'grey', desc: 'Liked something for the very first time',         requirement: { type: 'likes',     value: 1   } },
  { id: 'not_alone',        name: 'Not Alone',           icon: '🤝', grade: 'grey', desc: 'Added your first friend on MangaRecs',              requirement: { type: 'friends',   value: 1   } },
  { id: 'face_of_mangarecs',  name: 'Face of MangaRecs',    icon: '🪞', grade: 'grey', desc: 'Set your profile picture',                        requirement: { type: 'profile',   value: 1   } },
  { id: 'getting_hooked',   name: 'Getting Hooked',      icon: '🪝', grade: 'grey', desc: 'Read ten chapters  you can\'t stop now',         requirement: { type: 'chapters',  value: 10  } },
  { id: 'first_hour',       name: 'First Hour',          icon: '⏱️', grade: 'grey', desc: 'Spent your first hour in the panels',             requirement: { type: 'hours',     value: 1   } },
  { id: 'day_one',          name: 'Day One',             icon: '📅', grade: 'grey', desc: 'Today was day one it starts here',              requirement: { type: 'streak',    value: 1   } },
  { id: 'curious',          name: 'Curious',             icon: '🔍', grade: 'grey', desc: 'Explored your first genre',                       requirement: { type: 'genres',    value: 1   } },
  { id: 'first_word',       name: 'First Word',          icon: '🗣️', grade: 'grey', desc: 'Left three comments you have things to say',   requirement: { type: 'comments',  value: 3   } },
  { id: 'spread_the_word',  name: 'Spread the Word',     icon: '📲', grade: 'grey', desc: 'Shared a series for the first time',              requirement: { type: 'shares',    value: 1   } },
  { id: 'your_verdict',     name: 'Your Verdict',        icon: '⭐', grade: 'grey', desc: 'Gave your first rating to a series',              requirement: { type: 'ratings',   value: 1   } },
  { id: 'more_please',      name: 'More Please',         icon: '📚', grade: 'grey', desc: 'One series wasn\'t enough started a second',   requirement: { type: 'series',    value: 2   } },
  { id: 'sunrise_reader',   name: 'Sunrise Reader',      icon: '🌅', grade: 'grey', desc: 'Read before the sun came up',                     requirement: { type: 'special',   value: 1   }, hidden: true },

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // GREEN COMMON (45)   You're getting into it.
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // Reader Journey
  { id: 'page_turner',       name: 'Page Turner',         icon: '📑', grade: 'green', desc: 'Twenty-five chapters tearing through the panels',   requirement: { type: 'chapters',  value: 25  } },
  { id: 'deep_diver',        name: 'Deep Diver',           icon: '🤿', grade: 'green', desc: 'Fifty chapters in you\'re getting serious',          requirement: { type: 'chapters',  value: 50  } },
  { id: 'getting_warmer',    name: 'Getting Warmer',       icon: '📑', grade: 'green', desc: 'Seventy-five chapters and still going',                requirement: { type: 'chapters',  value: 75  } },
  { id: 'bookworm',          name: 'Bookworm',             icon: '�,', grade: 'green', desc: 'One hundred chapters a true bookworm emerges',       requirement: { type: 'chapters',  value: 100 } },
  { id: 'story_addict',      name: 'Story Addict',         icon: '📘', grade: 'green', desc: 'Two hundred chapters you literally can\'t stop',     requirement: { type: 'chapters',  value: 200 } },

  // Time Spent
  { id: 'regular_reader',    name: 'Regular Reader',       icon: '🕐', grade: 'green', desc: 'Two hours in making reading a habit',               requirement: { type: 'hours',     value: 2   } },
  { id: 'time_well_spent',   name: 'Time Well Spent',      icon: '🕙', grade: 'green', desc: 'Five hours in the panels',                            requirement: { type: 'hours',     value: 5   } },
  { id: 'dedicated',         name: 'Dedicated',            icon: '📌', grade: 'green', desc: 'Ten hours double digits on the clock',              requirement: { type: 'hours',     value: 10  } },
  { id: 'deep_session',      name: 'Deep Session',         icon: '🕕', grade: 'green', desc: 'Twenty hours did you remember to eat?',             requirement: { type: 'hours',     value: 20  } },
  { id: 'committed',         name: 'Committed',            icon: '⏰', grade: 'green', desc: 'Thirty hours reading is your lifestyle now',         requirement: { type: 'hours',     value: 30  } },

  // Streaks
  { id: 'back_again',        name: 'Back Again',           icon: '🔁', grade: 'green', desc: 'Came back the next day that matters',               requirement: { type: 'streak',    value: 2   } },
  { id: 'consistent',        name: 'Consistent',           icon: '🔁', grade: 'green', desc: 'Three days without missing a single one',             requirement: { type: 'streak',    value: 3   } },
  { id: 'week_warrior',      name: 'Week Warrior',         icon: '�,�️', grade: 'green', desc: 'A full week without breaking the chain',              requirement: { type: 'streak',    value: 7   } },
  { id: 'habit_formed',      name: 'Habit Formed',         icon: '💪', grade: 'green', desc: 'They say 14 days makes a habit congratulations',    requirement: { type: 'streak',    value: 14  } },
  { id: 'cant_stop_wont',    name: 'Can\'t Stop Won\'t',   icon: '🔥', grade: 'green', desc: 'Three weeks straight no excuses, no breaks',        requirement: { type: 'streak',    value: 21  } },

  // Social Comments
  { id: 'chatty',            name: 'Chatty',               icon: '�,�️', grade: 'green', desc: 'Five comments dropped into the world',                requirement: { type: 'comments',  value: 5   } },
  { id: 'conversationalist', name: 'Conversationalist',    icon: '�,�️', grade: 'green', desc: 'Ten comments you genuinely have things to say',     requirement: { type: 'comments',  value: 10  } },
  { id: 'vocal',             name: 'Vocal',                icon: '�,�️', grade: 'green', desc: 'Twenty-five comments across the community',           requirement: { type: 'comments',  value: 25  } },

  // Social Likes
  { id: 'appreciator',       name: 'Appreciator',          icon: '👍', grade: 'green', desc: 'Liked ten things that moved you',                     requirement: { type: 'likes',     value: 10  } },
  { id: 'spreading_love',    name: 'Spreading Love',       icon: '💓', grade: 'green', desc: 'Twenty-five things you wanted to appreciate',         requirement: { type: 'likes',     value: 25  } },
  { id: 'fifty_hearts',      name: 'Fifty Hearts',         icon: '❤️', grade: 'green', desc: 'Fifty moments across MangaRecs that hit different',     requirement: { type: 'likes',     value: 50  } },
  { id: 'seventy_five_hearts',name: 'Seventy-Five Hearts', icon: '�,', grade: 'green', desc: 'Seventy-five likes the warmth is real',             requirement: { type: 'likes',     value: 75  } },

  // Social Friends
  { id: 'growing_circle',    name: 'Growing Circle',       icon: '👥', grade: 'green', desc: 'Three readers in your circle',                        requirement: { type: 'friends',   value: 3   } },
  { id: 'squad_goals',       name: 'Squad Goals',          icon: '🤜', grade: 'green', desc: 'Five friends sharing your manga journey',             requirement: { type: 'friends',   value: 5   } },
  { id: 'seven_strong',      name: 'Seven Strong',         icon: '🫂', grade: 'green', desc: 'Seven people in your reading corner',                 requirement: { type: 'friends',   value: 7   } },

  // Discovery
  { id: 'genre_curious',     name: 'Genre Curious',        icon: '🎲', grade: 'green', desc: 'Started crossing genre borders',                      requirement: { type: 'genres',    value: 2   } },
  { id: 'diverse_taste',     name: 'Diverse Taste',        icon: '🎨', grade: 'green', desc: 'Reading across three different genres',               requirement: { type: 'genres',    value: 3   } },
  { id: 'well_rounded',      name: 'Well-Rounded',         icon: '🎯', grade: 'green', desc: 'Four genres explored your palette is expanding',    requirement: { type: 'genres',    value: 4   } },

  // Completed
  { id: 'finisher',          name: 'Finisher',             icon: '✅', grade: 'green', desc: 'You actually finished one start to finish',           requirement: { type: 'completed', value: 1   } },
  { id: 'three_down',        name: 'Three Down',           icon: '🏁', grade: 'green', desc: 'Three endings. Three satisfied sighs.',               requirement: { type: 'completed', value: 3   } },

  // Night
  { id: 'night_reader',      name: 'Night Reader',         icon: '🌙', grade: 'green', desc: 'The night shift begins first midnight read',        requirement: { type: 'midnight',  value: 1   } },
  { id: 'nightcrawler',      name: 'Nightcrawler',         icon: '🌃', grade: 'green', desc: 'Five nights past midnight this is a pattern',       requirement: { type: 'midnight',  value: 5   } },

  // Collection
  { id: 'ten_titles',        name: 'Ten Titles',           icon: '🔟', grade: 'green', desc: 'Ten different worlds explored',                       requirement: { type: 'manga',     value: 10  } },
  { id: 'growing_shelf',     name: 'Growing Shelf',        icon: '📦', grade: 'green', desc: 'Twenty-five titles filling your shelf',               requirement: { type: 'manga',     value: 25  } },
  { id: 'collector',         name: 'Collector',            icon: '�,�️', grade: 'green', desc: 'Fifty titles you earn the title of Collector',      requirement: { type: 'manga',     value: 50  } },
  { id: 'enthusiast',        name: 'Enthusiast',           icon: '📙', grade: 'green', desc: 'Seventy-five titles the enthusiasm is undeniable',  requirement: { type: 'manga',     value: 75  } },

  // Series
  { id: 'multi_fan',         name: 'Multi-Fan',            icon: '📚', grade: 'green', desc: 'Three stories competing for your attention',          requirement: { type: 'series',    value: 3   } },
  { id: 'library_builder',   name: 'Library Builder',      icon: '�,️', grade: 'green', desc: 'Five series on the shelf building something',       requirement: { type: 'series',    value: 5   } },
  { id: 'ten_on_the_go',     name: 'Ten On the Go',        icon: '📚', grade: 'green', desc: 'Following ten series simultaneously',                 requirement: { type: 'series',    value: 10  } },

  // Shares & Ratings
  { id: 'word_spreader',     name: 'Word Spreader',        icon: '📤', grade: 'green', desc: 'Told five people to read something',                  requirement: { type: 'shares',    value: 5   } },
  { id: 'local_guide',       name: 'Local Guide',          icon: '📲', grade: 'green', desc: 'Ten recommendations shared with the world',           requirement: { type: 'shares',    value: 10  } },
  { id: 'early_opinion',     name: 'Early Opinion',        icon: '⭐', grade: 'green', desc: 'Rated five series forming your taste',              requirement: { type: 'ratings',   value: 5   } },
  { id: 'opinionated',       name: 'Opinionated',          icon: '🌟', grade: 'green', desc: 'Rated ten series you know what you like',           requirement: { type: 'ratings',   value: 10  } },

  // Hidden
  { id: 'lucky_seven',       name: 'Lucky Number Seven',   icon: '🎲', grade: 'green', desc: 'Read exactly 7 chapters for 7 consecutive days',      requirement: { type: 'special',   value: 1   }, hidden: true },
  { id: 'cant_sleep',        name: 'Can\'t Sleep',         icon: '🌃', grade: 'green', desc: 'Read past midnight 5 nights in a row',               requirement: { type: 'special',   value: 1   }, hidden: true },

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // BLUE RARE (50)   You're serious now.
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // Reader Journey
  { id: 'chapter_chaser',    name: 'Chapter Chaser',       icon: '⚡', grade: 'blue', desc: 'Two hundred and fifty chapters deep',                  requirement: { type: 'chapters',  value: 250  } },
  { id: 'three_fifty_deep',  name: 'Three-Fifty Deep',     icon: '📒', grade: 'blue', desc: 'Three hundred and fifty chapters no stopping now',  requirement: { type: 'chapters',  value: 350  } },
  { id: 'saga_reader',       name: 'Saga Reader',          icon: '⚔️', grade: 'blue', desc: 'Five hundred chapters you\'ve read entire sagas',   requirement: { type: 'chapters',  value: 500  } },
  { id: 'volume_lord',       name: 'Volume Lord',          icon: '📓', grade: 'blue', desc: 'Seven fifty chapters complete runs under your belt', requirement: { type: 'chapters',  value: 750  } },
  { id: 'four_digits',       name: 'Four Digits',          icon: '🔢', grade: 'blue', desc: 'One thousand chapters. An actual achievement.',         requirement: { type: 'chapters',  value: 1000 } },
  { id: 'and_then_some',     name: 'And Then Some',        icon: '📒', grade: 'blue', desc: 'Eleven hundred chapters and still hungry',             requirement: { type: 'chapters',  value: 1100 } },
  { id: 'fifteen_hundred',   name: 'Fifteen Hundred',      icon: '�,', grade: 'blue', desc: 'Fifteen hundred chapters a staggering count',        requirement: { type: 'chapters',  value: 1500 } },

  // Time Spent
  { id: 'forty_hours',       name: 'Forty Hours',          icon: '🕑', grade: 'blue', desc: 'Forty hours given to the panels',                      requirement: { type: 'hours',     value: 40   } },
  { id: 'fifty_hours',       name: 'Fifty Hours',          icon: '🕔', grade: 'blue', desc: 'Fifty hours you\'re past the casual stage',          requirement: { type: 'hours',     value: 50   } },
  { id: 'night_owl',         name: 'Night Owl',            icon: '🦉', grade: 'blue', desc: 'Seventy-five hours the night is your reading time',  requirement: { type: 'hours',     value: 75   } },
  { id: 'hundred_hours',     name: 'Hundred Hours',        icon: '🕐', grade: 'blue', desc: 'One hundred hours of your life. Worth it.',             requirement: { type: 'hours',     value: 100  } },
  { id: 'marathon_reader',   name: 'Marathon Reader',      icon: '🏃', grade: 'blue', desc: 'One twenty-five hours you run this thing',           requirement: { type: 'hours',     value: 125  } },
  { id: 'time_sink',         name: 'Time Sink',            icon: '⌛', grade: 'blue', desc: 'One fifty hours someone send help',                  requirement: { type: 'hours',     value: 150  } },
  { id: 'reading_machine',   name: 'Reading Machine',      icon: '🤖', grade: 'blue', desc: 'One seventy-five hours you ARE the machine now',     requirement: { type: 'hours',     value: 175  } },

  // Streaks
  { id: 'four_weeks',        name: 'Four Weeks',           icon: '�,�️', grade: 'blue', desc: 'Twenty-eight days without missing a single one',       requirement: { type: 'streak',    value: 28   } },
  { id: 'monthly_master',    name: 'Monthly Master',       icon: '�,�️', grade: 'blue', desc: 'Thirty days of unbroken daily reading',                requirement: { type: 'streak',    value: 30   } },
  { id: 'six_weeks_solid',   name: 'Six Weeks Solid',      icon: '💪', grade: 'blue', desc: 'Forty-five straight days no mercy',                  requirement: { type: 'streak',    value: 45   } },
  { id: 'two_month_titan',   name: 'Two Month Titan',      icon: '🔥', grade: 'blue', desc: 'Sixty days two solid months unbroken',               requirement: { type: 'streak',    value: 60   } },
  { id: 'seventy_five_days', name: 'Seventy-Five Days',    icon: '🔥', grade: 'blue', desc: 'Seventy-five days of pure habit',                      requirement: { type: 'streak',    value: 75   } },
  { id: 'three_months',      name: 'Three Months',         icon: '�,�️', grade: 'blue', desc: 'Ninety days a quarter year of perfect discipline',   requirement: { type: 'streak',    value: 90   } },

  // Collection
  { id: 'triple_digits',     name: 'Triple Digits',        icon: '💥', grade: 'blue', desc: 'One hundred titles triple digits unlocked',          requirement: { type: 'manga',     value: 100  } },
  { id: 'rising_reader',     name: 'Rising Reader',        icon: '📚', grade: 'blue', desc: 'One twenty-five different manga explored',             requirement: { type: 'manga',     value: 125  } },
  { id: 'shelf_filler',      name: 'Shelf Filler',         icon: '🏡', grade: 'blue', desc: 'One fifty titles your shelf is filling up fast',     requirement: { type: 'manga',     value: 150  } },
  { id: 'heavy_shelf',       name: 'Heavy Shelf',          icon: '�,�️', grade: 'blue', desc: 'One seventy-five titles shelves are bending now',   requirement: { type: 'manga',     value: 175  } },
  { id: 'two_hundred_manga', name: '200 Club',             icon: '🎖️', grade: 'blue', desc: 'Two hundred different manga welcome to the 200 Club', requirement: { type: 'manga',   value: 200  } },
  { id: 'two_twenty_five',   name: 'Two Twenty-Five',      icon: '📖', grade: 'blue', desc: 'Two twenty-five titles still hungry for more',       requirement: { type: 'manga',     value: 225  } },

  // Completed
  { id: 'arc_ender',         name: 'Arc Ender',            icon: '🎬', grade: 'blue', desc: 'Completed five series all the way through',            requirement: { type: 'completed', value: 5    } },
  { id: 'seven_complete',    name: 'Seven Complete',       icon: '🎯', grade: 'blue', desc: 'Seven full endings under your belt',                   requirement: { type: 'completed', value: 7    } },
  { id: 'story_slayer',      name: 'Story Slayer',         icon: '�,�️', grade: 'blue', desc: 'Ten series from chapter one to the very last',         requirement: { type: 'completed', value: 10   } },
  { id: 'dozen_done',        name: 'Dozen Done',           icon: '🎬', grade: 'blue', desc: 'A dozen full series completed',                        requirement: { type: 'completed', value: 12   } },

  // Series & Friends
  { id: 'library_lord',      name: 'Library Lord',         icon: '🏰', grade: 'blue', desc: 'Following fifteen different series',                   requirement: { type: 'series',    value: 15   } },
  { id: 'twenty_series',     name: 'Twenty Series',        icon: '📚', grade: 'blue', desc: 'Twenty stories pulling at you at once',                requirement: { type: 'series',    value: 20   } },
  { id: 'social_node',       name: 'Social Node',          icon: '🌐', grade: 'blue', desc: 'Ten friends in your network',                          requirement: { type: 'friends',   value: 10   } },
  { id: 'wide_network',      name: 'Wide Network',         icon: '🌐', grade: 'blue', desc: 'Fifteen connections strong',                           requirement: { type: 'friends',   value: 15   } },
  { id: 'social_butterfly',  name: 'Social Butterfly',     icon: '🦋', grade: 'blue', desc: 'Twenty friends you\'re impossible to miss',          requirement: { type: 'friends',   value: 20   } },

  // Comments & Likes
  { id: 'discussion_king',   name: 'Discussion King',      icon: '👑', grade: 'blue', desc: 'Fifty comments in you\'re royalty around here',      requirement: { type: 'comments',  value: 50   } },
  { id: 'loud_voice',        name: 'Loud Voice',           icon: '📢', grade: 'blue', desc: 'Seventy-five comments people hear you coming',       requirement: { type: 'comments',  value: 75   } },
  { id: 'centurion',         name: 'Centurion',            icon: '💬', grade: 'blue', desc: 'One hundred comments  a true voice of the fandom',    requirement: { type: 'comments',  value: 100  } },
  { id: 'always_there',      name: 'Always There',         icon: '�,�️', grade: 'blue', desc: 'One twenty-five comments you never miss a thread',   requirement: { type: 'comments',  value: 125  } },
  { id: 'love_machine',      name: 'Love Machine',         icon: '💝', grade: 'blue', desc: 'One hundred likes given your love is famous',         requirement: { type: 'likes',     value: 100  } },
  { id: 'two_hundred_hearts',name: 'Two Hundred Hearts',   icon: '💖', grade: 'blue', desc: 'Two hundred moments that moved you',                   requirement: { type: 'likes',     value: 200  } },
  { id: 'two_fifty_hearts',  name: 'Two-Fifty Hearts',     icon: '�,', grade: 'blue', desc: 'Two fifty appreciations and counting',                 requirement: { type: 'likes',     value: 250  } },
  { id: 'three_hundred_hrt', name: 'Three Hundred',        icon: '💕', grade: 'blue', desc: 'Three hundred hearts given out on MangaRecs',            requirement: { type: 'likes',     value: 300  } },

  // Night, Genre, Shares
  { id: 'midnight_regular',  name: 'Midnight Regular',     icon: '🌃', grade: 'blue', desc: 'Fifteen nights past midnight you belong here',       requirement: { type: 'midnight',  value: 15   } },
  { id: 'midnight_scholar',  name: 'Midnight Scholar',     icon: '🌃', grade: 'blue', desc: 'Thirty nights of reading after dark',                  requirement: { type: 'midnight',  value: 30   } },
  { id: 'omnivore',          name: 'Omnivore',             icon: '🌈', grade: 'blue', desc: 'Five genres you\'ll read literally anything',         requirement: { type: 'genres',    value: 5    } },
  { id: 'fifty_shares',      name: 'Town Crier',           icon: '📣', grade: 'blue', desc: 'Shared fifty series the community hears you',         requirement: { type: 'shares',    value: 50   } },

  // Discovery & Hidden
  { id: 'world_traveler',    name: 'World Traveler',       icon: '🌍', grade: 'blue', desc: 'Read manga from Japan, Korea, and China',              requirement: { type: 'special',   value: 1    } },
  { id: 'one_more_chapter',  name: 'One More Chapter',     icon: '🎭', grade: 'blue', desc: 'Read for 4 straight hours in one session',             requirement: { type: 'binge',     value: 1    }, hidden: true },
  { id: 'conversation_start',name: 'Conversation Starter', icon: '💬', grade: 'blue', desc: 'Received replies from 10 different people',            requirement: { type: 'special',   value: 1    }, hidden: true },

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // INDIGO EPIC (50)   Beyond normal reader territory.
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // Reader Journey
  { id: 'chapter_beast',     name: 'Chapter Beast',        icon: '🦁', grade: 'indigo', desc: 'Two thousand chapters you are built different',    requirement: { type: 'chapters',  value: 2000 } },
  { id: 'living_in_pages',   name: 'Living in Pages',      icon: '📚', grade: 'indigo', desc: 'Twenty-five hundred you practically live here',    requirement: { type: 'chapters',  value: 2500 } },
  { id: 'three_thousand',    name: 'Three Thousand',       icon: '🌊', grade: 'indigo', desc: 'Three thousand chapters a wave that never breaks', requirement: { type: 'chapters',  value: 3000 } },
  { id: 'thirty_five_hund',  name: 'Thirty-Five Hundred',  icon: '🌊', grade: 'indigo', desc: 'Thirty-five hundred most readers quit long ago',   requirement: { type: 'chapters',  value: 3500 } },
  { id: 'library_dweller',   name: 'Library Dweller',      icon: '🏛️', grade: 'indigo', desc: 'Four thousand chapters you live in the library',   requirement: { type: 'chapters',  value: 4000 } },
  { id: 'endless_reader',    name: 'Endless Reader',       icon: '📖', grade: 'indigo', desc: 'Forty-five hundred the reading never ends for you', requirement: { type: 'chapters',  value: 4500 } },

  // Time Spent
  { id: 'two_hundred_hrs',   name: 'Two Hundred Hours',    icon: '🕰️', grade: 'indigo', desc: 'Two hundred hours a serious investment',           requirement: { type: 'hours',     value: 200  } },
  { id: 'two_fifty_hrs',     name: 'Two-Fifty Hours',      icon: '🕰️', grade: 'indigo', desc: 'Two fifty hours a quarter thousand hours given',   requirement: { type: 'hours',     value: 250  } },
  { id: 'three_hundred_hrs', name: 'Three Hundred Hours',  icon: '⏰', grade: 'indigo', desc: 'Three hundred hours in the panels',                   requirement: { type: 'hours',     value: 300  } },
  { id: 'year_in_hours',     name: 'A Year in Hours',      icon: '📆', grade: 'indigo', desc: 'Three sixty-five hours a year\'s worth of reading', requirement: { type: 'hours',     value: 365  } },
  { id: 'four_fifty_hrs',    name: 'Four-Fifty Hours',     icon: '⌛', grade: 'indigo', desc: 'Four hundred and fifty hours of your life all here', requirement: { type: 'hours',    value: 450  } },
  { id: 'five_fifty_hrs',    name: 'Five-Fifty Hours',     icon: '🕰️', grade: 'indigo', desc: 'Five hundred and fifty hours an extraordinary count', requirement: { type: 'hours',   value: 550  } },

  // Streaks
  { id: 'century_streak',    name: 'Century Streak',       icon: '🌟', grade: 'indigo', desc: 'One hundred days a century streak',                requirement: { type: 'streak',    value: 100  } },
  { id: 'four_months_str',   name: 'Four Months',          icon: '🏆', grade: 'indigo', desc: 'One twenty days four months without breaking',     requirement: { type: 'streak',    value: 120  } },
  { id: 'one_thirty_str',    name: 'One-Thirty Days',      icon: '🌟', grade: 'indigo', desc: 'One thirty days straight relentless',              requirement: { type: 'streak',    value: 130  } },
  { id: 'five_months_str',   name: 'Five Months',          icon: '🌟', grade: 'indigo', desc: 'One fifty days five months of perfect discipline', requirement: { type: 'streak',    value: 150  } },
  { id: 'one_sixty_str',     name: 'One-Sixty Days',       icon: '🏅', grade: 'indigo', desc: 'One sixty days only the committed reach this',     requirement: { type: 'streak',    value: 160  } },

  // Collection
  { id: 'quarter_thousand',  name: 'Quarter Thousand',     icon: '📚', grade: 'indigo', desc: 'Two hundred and fifty titles explored',              requirement: { type: 'manga',     value: 250  } },
  { id: 'three_hundred_mng', name: 'Three Hundred',        icon: '🔮', grade: 'indigo', desc: 'Three hundred different manga legendary collection', requirement: { type: 'manga',   value: 300  } },
  { id: 'three_fifty_mng',   name: 'Three-Fifty Manga',    icon: '📖', grade: 'indigo', desc: 'Three fifty titles walls of manga knowledge',      requirement: { type: 'manga',     value: 350  } },
  { id: 'the_archivist',     name: 'The Archivist',        icon: '�,�️', grade: 'indigo', desc: 'Four hundred titles you archive what others miss',  requirement: { type: 'manga',     value: 400  } },
  { id: 'four_fifty_mng',    name: 'Four-Fifty Manga',     icon: '�,', grade: 'indigo', desc: 'Four hundred and fifty titles catalogued',            requirement: { type: 'manga',     value: 450  } },
  { id: 'five_hundred_mng',  name: 'Five Hundred Manga',   icon: '📘', grade: 'indigo', desc: 'Five hundred titles a number few will ever reach',  requirement: { type: 'manga',     value: 500  } },

  // Completed
  { id: 'fifteen_done',      name: 'Fifteen Done',         icon: '🎬', grade: 'indigo', desc: 'Fifteen series completed from start to finish',       requirement: { type: 'completed', value: 15   } },
  { id: 'twenty_complete',   name: 'Twenty Complete',      icon: '🏁', grade: 'indigo', desc: 'Twenty full endings you seek closure',              requirement: { type: 'completed', value: 20   } },
  { id: 'series_hunter',     name: 'Series Hunter',        icon: '🎯', grade: 'indigo', desc: 'Twenty-five completed series you hunt and finish',  requirement: { type: 'completed', value: 25   } },
  { id: 'thirty_done',       name: 'Thirty Done',          icon: '🏁', grade: 'indigo', desc: 'Thirty full series nobody makes it this far',       requirement: { type: 'completed', value: 30   } },
  { id: 'thirty_five_done',  name: 'Thirty-Five',          icon: '🎯', grade: 'indigo', desc: 'Thirty-five complete series a rare achievement',    requirement: { type: 'completed', value: 35   } },

  // Friends & Comments
  { id: 'connector',         name: 'Connector',            icon: '�,', grade: 'indigo', desc: 'Twenty-five friends you connect people together',   requirement: { type: 'friends',   value: 25   } },
  { id: 'thirty_strong',     name: 'Thirty Strong',        icon: '🤝', grade: 'indigo', desc: 'Thirty people in your reading network',               requirement: { type: 'friends',   value: 30   } },
  { id: 'thirty_five_frnd',  name: 'Thirty-Five Friends',  icon: '�,', grade: 'indigo', desc: 'Thirty-five friends across MangaRecs',                  requirement: { type: 'friends',   value: 35   } },
  { id: 'voice_carries',     name: 'Voice Carries',        icon: '📣', grade: 'indigo', desc: 'One fifty comments your voice carries far',         requirement: { type: 'comments',  value: 150  } },
  { id: 'voice_of_mangarecs',  name: 'Voice of MangaRecs',     icon: '📢', grade: 'indigo', desc: 'Two hundred comments you speak for the community',  requirement: { type: 'comments',  value: 200  } },
  { id: 'two_fifty_voices',  name: 'Two-Fifty Voices',     icon: '�,�️', grade: 'indigo', desc: 'Two fifty comments left across the platform',         requirement: { type: 'comments',  value: 250  } },
  { id: 'three_fifty_voice', name: 'Three-Fifty Voices',   icon: '📢', grade: 'indigo', desc: 'Three fifty comments relentlessly vocal',           requirement: { type: 'comments',  value: 350  } },

  // Likes & Night
  { id: 'four_hundred_hrt',  name: 'Four Hundred Hearts',  icon: '💕', grade: 'indigo', desc: 'Four hundred appreciations given on MangaRecs',         requirement: { type: 'likes',     value: 400  } },
  { id: 'the_appreciator',   name: 'The Appreciator',      icon: '💎', grade: 'indigo', desc: 'Five hundred likes you are the appreciation engine', requirement: { type: 'likes',    value: 500  } },
  { id: 'six_hundred_hrt',   name: 'Six Hundred Hearts',   icon: '💝', grade: 'indigo', desc: 'Six hundred moments you chose to celebrate',          requirement: { type: 'likes',     value: 600  } },
  { id: 'night_regular',     name: 'Night Regular',        icon: '🌌', grade: 'indigo', desc: 'Fifty nights past midnight it\'s a lifestyle now',  requirement: { type: 'midnight',  value: 50   } },
  { id: 'sixty_midnights',   name: 'Sixty Midnights',      icon: '🌑', grade: 'indigo', desc: 'Sixty nights after dark you own this shift',        requirement: { type: 'midnight',  value: 60   } },
  { id: 'darkness_dweller',  name: 'Darkness Dweller',     icon: '🌌', grade: 'indigo', desc: 'Seventy-five midnights you dwell in the dark',      requirement: { type: 'midnight',  value: 75   } },
  { id: 'nocturnal_soul',    name: 'Nocturnal Soul',       icon: '🌑', grade: 'indigo', desc: 'One hundred nights you are a nocturnal soul',       requirement: { type: 'midnight',  value: 100  } },

  // AI Badges
  { id: 'ai_approved',       name: 'AI Approved',          icon: '🤖', grade: 'indigo', desc: 'Read your first AI-recommended series',               requirement: { type: 'special',   value: 1    }, hidden: true },
  { id: 'trust_the_algo',    name: 'Trust the Algorithm',  icon: '🧠', grade: 'indigo', desc: 'Read 20 AI recommendations consecutively',            requirement: { type: 'special',   value: 1    }, hidden: true },
  { id: 'perfect_match_ai',  name: 'Perfect Match',        icon: '✨', grade: 'indigo', desc: 'Rated 10 AI recommendations 5 stars the AI gets you', requirement: { type: 'special', value: 1    }, hidden: true },

  // Genre, Series, Shares, Ratings
  { id: 'six_genres',        name: 'Six Genres',           icon: '🌈', grade: 'indigo', desc: 'Six genres explored you read anything',             requirement: { type: 'genres',    value: 6    } },
  { id: 'twenty_five_ser',   name: 'Twenty-Five Series',   icon: '📜', grade: 'indigo', desc: 'Following twenty-five series',                        requirement: { type: 'series',    value: 25   } },
  { id: 'thirty_five_ser',   name: 'Thirty-Five Series',   icon: '📜', grade: 'indigo', desc: 'Thirty-five series on your watchlist',                requirement: { type: 'series',    value: 35   } },
  { id: 'seventy_five_shr',  name: 'Making Waves',         icon: '📡', grade: 'indigo', desc: 'Shared seventy-five series across the platform',      requirement: { type: 'shares',    value: 75   } },
  { id: 'fifty_rated',       name: 'Critic',               icon: '🖊️', grade: 'indigo', desc: 'Rated fifty different series a real critic',        requirement: { type: 'ratings',   value: 50   } },

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // PURPLE SPECIAL (45)   The obsessed. The dedicated.
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // Reader Journey
  { id: 'living_encyclopedia',name: 'Living Encyclopedia', icon: '📚', grade: 'purple', desc: 'Five thousand chapters you are a walking encyclopedia', requirement: { type: 'chapters', value: 5000 } },
  { id: 'archive_keeper',    name: 'Archive Keeper',       icon: '�,�️', grade: 'purple', desc: 'Six thousand chapters keeper of every arc and arc',  requirement: { type: 'chapters',  value: 6000 } },
  { id: 'legend_of_ink',     name: 'Legend of Ink',        icon: '📖', grade: 'purple', desc: 'Seventy-five hundred chapters a name becomes legend', requirement: { type: 'chapters', value: 7500 } },

  // Time Spent
  { id: 'five_hundred_hrs',  name: 'Five Hundred Hours',   icon: '�,️', grade: 'purple', desc: 'Five hundred hours given to manga half a thousand', requirement: { type: 'hours',     value: 500  } },
  { id: 'six_hundred_hrs',   name: 'Six Hundred Hours',    icon: '🌀', grade: 'purple', desc: 'Six hundred hours the number should alarm people',  requirement: { type: 'hours',     value: 600  } },
  { id: 'seven_hundred_hrs', name: 'Seven Hundred Hours',  icon: '🌀', grade: 'purple', desc: 'Seven hundred hours more hours than most workweeks', requirement: { type: 'hours',    value: 700  } },
  { id: 'eight_hundred_hrs', name: 'Eight Hundred Hours',  icon: '�,️', grade: 'purple', desc: 'Eight hundred hours an obsessive and proud of it',  requirement: { type: 'hours',     value: 800  } },

  // Streaks
  { id: 'half_year_str',     name: 'Half Year',            icon: '🌠', grade: 'purple', desc: 'One eighty days half a year without missing',       requirement: { type: 'streak',    value: 180  } },
  { id: 'two_hundred_days',  name: 'Two Hundred Days',     icon: '🌠', grade: 'purple', desc: 'Two hundred days straight this is unreal',         requirement: { type: 'streak',    value: 200  } },
  { id: 'eight_months_str',  name: 'Eight Months',         icon: '🏅', grade: 'purple', desc: 'Two forty days eight months of zero breaks',        requirement: { type: 'streak',    value: 240  } },
  { id: 'nine_months_str',   name: 'Nine Months Solid',    icon: '🏅', grade: 'purple', desc: 'Two seventy days nine months of pure commitment',   requirement: { type: 'streak',    value: 270  } },
  { id: 'three_hundred_str', name: 'Three Hundred Days',   icon: '🏆', grade: 'purple', desc: 'Three hundred straight you cannot be stopped',      requirement: { type: 'streak',    value: 300  } },

  // Collection
  { id: 'six_hundred_mng',   name: 'Six Hundred Manga',    icon: '🔭', grade: 'purple', desc: 'Six hundred titles a collection beyond most',       requirement: { type: 'manga',     value: 600  } },
  { id: 'seven_hundred_mng', name: 'Seven Hundred Manga',  icon: '🧿', grade: 'purple', desc: 'Seven hundred titles approaching the impossible',   requirement: { type: 'manga',     value: 700  } },
  { id: 'eight_hundred_mng', name: 'Eight Hundred Manga',  icon: '🔭', grade: 'purple', desc: 'Eight hundred different worlds visited',              requirement: { type: 'manga',     value: 800  } },
  { id: 'nine_hundred_mng',  name: 'Nine Hundred Manga',   icon: '🧿', grade: 'purple', desc: 'Nine hundred titles approaching one thousand',      requirement: { type: 'manga',     value: 900  } },

  // Completed
  { id: 'forty_finisher',    name: 'Forty Finisher',       icon: '🎯', grade: 'purple', desc: 'Forty series finished from first chapter to last',    requirement: { type: 'completed', value: 40   } },
  { id: 'saga_collector',    name: 'Saga Collector',       icon: '🏛️', grade: 'purple', desc: 'Fifty complete series a collector of endings',      requirement: { type: 'completed', value: 50   } },
  { id: 'conclusion_seeker', name: 'Conclusion Seeker',    icon: '🔚', grade: 'purple', desc: 'Seventy-five series completed you always see it through', requirement: { type: 'completed', value: 75  } },

  // Social
  { id: 'forty_strong',      name: 'Forty Strong',         icon: '�,', grade: 'purple', desc: 'Forty friends a proper reading community',          requirement: { type: 'friends',   value: 40   } },
  { id: 'community_pillar',  name: 'Community Pillar',     icon: '🏟️', grade: 'purple', desc: 'Fifty friends you hold this community together',    requirement: { type: 'friends',   value: 50   } },
  { id: 'forum_legend',      name: 'Forum Legend',         icon: '�,�️', grade: 'purple', desc: 'Five hundred comments a legend of the forums',      requirement: { type: 'comments',  value: 500  } },
  { id: 'five_fifty_voices', name: 'Five-Fifty Voices',    icon: '📢', grade: 'purple', desc: 'Five fifty comments and still going',                 requirement: { type: 'comments',  value: 550  } },

  // Genre, Series, Ratings, Likes, Night, Shares
  { id: 'genre_master',      name: 'Genre Master',         icon: '🎭', grade: 'purple', desc: 'Read from every available genre a true omnivore',  requirement: { type: 'genres',    value: 8    } },
  { id: 'grand_library',     name: 'Grand Library',        icon: '📜', grade: 'purple', desc: 'Following fifty series a grand library in motion',  requirement: { type: 'series',    value: 50   } },
  { id: 'sixty_following',   name: 'Sixty Following',      icon: '📜', grade: 'purple', desc: 'Sixty active series the dedication is staggering',  requirement: { type: 'series',    value: 60   } },
  { id: 'century_critic',    name: 'Century Critic',       icon: '✍️', grade: 'purple', desc: 'One hundred ratings your word carries weight',      requirement: { type: 'ratings',   value: 100  } },
  { id: 'prolific_critic',   name: 'Prolific Critic',      icon: '✍️', grade: 'purple', desc: 'One fifty ratings a prolific critical voice',       requirement: { type: 'ratings',   value: 150  } },
  { id: 'thousand_hearts',   name: 'One Thousand Hearts',  icon: '💜', grade: 'purple', desc: 'One thousand likes given a heart that never stops', requirement: { type: 'likes',     value: 1000 } },
  { id: 'midnight_devotee',  name: 'Midnight Devotee',     icon: '🌌', grade: 'purple', desc: 'One twenty-five midnight sessions a devotion',      requirement: { type: 'midnight',  value: 125  } },
  { id: 'movement_maker',    name: 'Movement Maker',       icon: '📡', grade: 'purple', desc: 'One fifty shares you\'re building a movement',      requirement: { type: 'shares',    value: 150  } },

  // Genre Mastery Collection
  { id: 'isekai_survivor',   name: 'Isekai Survivor',      icon: '⚡', grade: 'purple', desc: 'Completed 50 isekai reincarnated into a reader',    requirement: { type: 'special',   value: 1    } },
  { id: 'romance_master',    name: 'Romance Master',       icon: '💖', grade: 'purple', desc: 'Completed 50 romance series you believe in love',   requirement: { type: 'special',   value: 1    } },
  { id: 'murim_disciple',    name: 'Murim Disciple',       icon: '⚔️', grade: 'purple', desc: 'Completed 30 murim stories a disciple of the path',  requirement: { type: 'special',  value: 1    } },
  { id: 'tower_climber',     name: 'Tower Climber',        icon: '�,�', grade: 'purple', desc: 'Completed 30 tower manhwa still climbing',          requirement: { type: 'special',   value: 1    } },
  { id: 'regression_expert', name: 'Regression Expert',   icon: '♻️', grade: 'purple', desc: 'Completed 30 regression manhwa you\'ve lived many lives', requirement: { type: 'special', value: 1  } },

  // Social Mastery Hidden
  { id: 'reading_buddy',     name: 'Reading Buddy',        icon: '🤝', grade: 'purple', desc: 'Kept a shared reading streak with a friend for 30 days', requirement: { type: 'special', value: 1   }, hidden: true },
  { id: 'book_club',         name: 'Book Club',            icon: '📚', grade: 'purple', desc: 'Read the same series as 3 friends at the same time',  requirement: { type: 'special',   value: 1    }, hidden: true },
  { id: 'debate_club',       name: 'Debate Club',          icon: '💬', grade: 'purple', desc: 'Received 100 likes on your comments',                 requirement: { type: 'special',   value: 1    }, hidden: true },

  // Quirky Hidden
  { id: 'touch_grass',       name: 'Touch Grass',          icon: '🌱', grade: 'purple', desc: 'Read for 12 hours in a single day',                   requirement: { type: 'special',   value: 1    }, hidden: true },
  { id: 'double_feature',    name: 'Double Feature',       icon: '🎬', grade: 'purple', desc: 'Finished two completely different series in one day',  requirement: { type: 'special',   value: 1    }, hidden: true },
  { id: 'silent_reader',     name: 'Silent Reader',        icon: '🤫', grade: 'purple', desc: 'Read 500 chapters without ever leaving a comment',    requirement: { type: 'special',   value: 1    }, hidden: true },
  { id: 'speed_reader',      name: 'Speed Reader',         icon: '💨', grade: 'purple', desc: 'Read 50 chapters in a single day',                    requirement: { type: 'special',   value: 1    }, hidden: true },
  { id: 'the_return',        name: 'The Return',           icon: '🔄', grade: 'purple', desc: 'Came back after 6 months away and read 50 chapters',  requirement: { type: 'special',   value: 1    }, hidden: true },
  { id: 'true_completionist',name: 'True Completionist',   icon: '🎯', grade: 'purple', desc: 'Finished a series without skipping a single day',     requirement: { type: 'special',   value: 1    }, hidden: true },

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // GOLD LEGENDARY (30)   Legends. Events. The endgame.
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  // Reader Journey
  { id: 'ten_thousand',      name: 'Ten Thousand',         icon: '🔑', grade: 'gold', desc: 'Ten thousand chapters a number that unlocks everything', requirement: { type: 'chapters', value: 10000 } },
  { id: 'fifteen_thousand',  name: 'Fifteen Thousand',     icon: '🌐', grade: 'gold', desc: 'Fifteen thousand chapters unprecedented',              requirement: { type: 'chapters',  value: 15000 } },

  // Time Spent
  { id: 'thousand_hours',    name: 'One Thousand Hours',   icon: '🕯️', grade: 'gold', desc: 'One thousand hours given to manga  breathtaking',       requirement: { type: 'hours',     value: 1000  } },
  { id: 'fifteen_h_hrs',     name: 'Fifteen Hundred Hours',icon: '⚜️', grade: 'gold', desc: 'Fifteen hundred hours you\'ve built a second life here', requirement: { type: 'hours',   value: 1500  } },
  { id: 'two_thousand_hrs',  name: 'Two Thousand Hours',   icon: '🔱', grade: 'gold', desc: 'Two thousand hours a feat beyond comprehension',       requirement: { type: 'hours',     value: 2000  } },

  // Streaks
  { id: 'full_year',         name: 'Full Year',            icon: '🎊', grade: 'gold', desc: 'Three sixty-five days a full year without missing once', requirement: { type: 'streak',   value: 365   } },
  { id: 'unstoppable',       name: 'Unstoppable',          icon: '⚡', grade: 'gold', desc: 'Five hundred days you simply cannot be stopped',       requirement: { type: 'streak',    value: 500   } },
  { id: 'two_year_streak',   name: 'Two Year Streak',      icon: '�,️', grade: 'gold', desc: 'Seven thirty days two full years without breaking',    requirement: { type: 'streak',    value: 730   } },

  // Collection
  { id: 'the_thousand',      name: 'The Thousand',         icon: '🏆', grade: 'gold', desc: 'One thousand different manga titles the Thousand',     requirement: { type: 'manga',     value: 1000  } },
  { id: 'twelve_hundred_mng',name: 'Twelve Hundred',       icon: '🥇', grade: 'gold', desc: 'Twelve hundred titles you never run out of things to read', requirement: { type: 'manga', value: 1200  } },
  { id: 'fifteen_h_manga',   name: 'Fifteen Hundred Manga',icon: '👑', grade: 'gold', desc: 'Fifteen hundred titles an imperial collection',        requirement: { type: 'manga',     value: 1500  } },
  { id: 'two_thousand_manga',name: 'Two Thousand Manga',   icon: '🌟', grade: 'gold', desc: 'Two thousand titles you\'ve read more than most publish', requirement: { type: 'manga',  value: 2000  } },

  // Completed, Friends, Comments, Likes, Night
  { id: 'the_completionist', name: 'The Completionist',    icon: '🎖️', grade: 'gold', desc: 'One hundred series finished front to back, no gaps',  requirement: { type: 'completed', value: 100   } },
  { id: 'grand_finisher',    name: 'Grand Finisher',       icon: '🏁', grade: 'gold', desc: 'One fifty complete series a grand finisher of stories', requirement: { type: 'completed', value: 150   } },
  { id: 'two_hundred_comp',  name: 'Two Hundred',          icon: '📰', grade: 'gold', desc: 'Two hundred completed series no equal in the app',     requirement: { type: 'completed', value: 200   } },
  { id: 'hundred_strong',    name: 'Hundred Strong',       icon: '🌏', grade: 'gold', desc: 'One hundred friends a community unto yourself',        requirement: { type: 'friends',   value: 100   } },
  { id: 'community_builder', name: 'Community Builder',    icon: '🏙️', grade: 'gold', desc: 'Two hundred friends you built this community',         requirement: { type: 'friends',   value: 200   } },
  { id: 'comment_god',       name: 'Comment God',          icon: '🎙️', grade: 'gold', desc: 'One thousand comments the gods of discourse',          requirement: { type: 'comments',  value: 1000  } },
  { id: 'endless_love',      name: 'Endless Love',         icon: '💛', grade: 'gold', desc: 'Two thousand likes given a heart that never empties',  requirement: { type: 'likes',     value: 2000  } },
  { id: 'eternal_night',     name: 'Eternal Night',        icon: '🌑', grade: 'gold', desc: 'Three sixty-five nights past midnight the eternal shift', requirement: { type: 'midnight', value: 365  } },

  // Account / Veteran
  { id: 'veteran_1yr',       name: '1 Year Veteran',       icon: '🎂', grade: 'gold', desc: 'Been on MangaRecs for one full year',                      requirement: { type: 'account',   value: 365   } },
  { id: 'veteran_2yr',       name: '2 Year Legend',        icon: '🎁', grade: 'gold', desc: 'Two years on MangaRecs a legend in longevity',           requirement: { type: 'account',   value: 730   } },
  { id: 'veteran_3yr',       name: '3 Year Deity',         icon: '🎇', grade: 'gold', desc: 'Three years you were here before it was cool',         requirement: { type: 'account',   value: 1095  } },

  // Shares & Series
  { id: 'the_spreader',      name: 'The Spreader',         icon: '🌍', grade: 'gold', desc: 'Five hundred shares you grew this community',          requirement: { type: 'shares',    value: 500   } },
  { id: 'epic_library',      name: 'Epic Library',         icon: '�,�', grade: 'gold', desc: 'Following one hundred series simultaneously',            requirement: { type: 'series',    value: 100   } },

  // Event & Social Legends (hidden)
  { id: 'founding_member',   name: 'Founding Member',      icon: '🏛️', grade: 'gold', desc: 'Joined MangaRecs in the very first month of launch',       requirement: { type: 'special',   value: 1     }, hidden: true },
  { id: 'trusted_recomm',    name: 'Trusted Recommender',  icon: '🏅', grade: 'gold', desc: 'Five friends started a manga because of your recommendation', requirement: { type: 'special', value: 1  }, hidden: true },
  { id: 'taste_maker',       name: 'Taste Maker',          icon: '👑', grade: 'gold', desc: 'Ten users bookmarked something from your profile',       requirement: { type: 'special',   value: 1     }, hidden: true },
  { id: 'community_fav',     name: 'Community Favorite',   icon: '💫', grade: 'gold', desc: 'Received 250 profile likes from the community',          requirement: { type: 'special',   value: 1     }, hidden: true },
  { id: 'iron_will',         name: 'Iron Will',            icon: '🪨', grade: 'gold', desc: 'Kept a 365-day streak without breaking it once',         requirement: { type: 'special',   value: 1     }, hidden: true },

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // MYTHIC (15)   The impossible. Few will ever see these.
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  { id: 'mythic_transcendent',  name: 'The Transcendent',      icon: '🌌', grade: 'mythic', desc: 'Read 5, 000 different manga beyond mortal comprehension',         requirement: { type: 'manga',     value: 5000  }, hidden: true },
  { id: 'mythic_time_devourer', name: 'Time Devourer',         icon: '⏳', grade: 'mythic', desc: 'Read for 10, 000 hours an entire year of nonstop reading',        requirement: { type: 'hours',     value: 10000 }, hidden: true },
  { id: 'mythic_unbroken',      name: 'The Unbroken',          icon: '🔥', grade: 'mythic', desc: 'Maintain a 1, 000-day streak a thousand days without faltering',  requirement: { type: 'streak',    value: 1000  }, hidden: true },
  { id: 'mythic_three_year',    name: 'Three Year Immortal',   icon: '♾️', grade: 'mythic', desc: '1, 095-day streak three full years. Not a single break.',         requirement: { type: 'streak',    value: 1095  }, hidden: true },
  { id: 'mythic_singularity',   name: 'Chapter Singularity',   icon: '🌠', grade: 'mythic', desc: '50, 000 chapters a number that shouldn\'t exist for one person',  requirement: { type: 'chapters',  value: 50000 }, hidden: true },
  { id: 'mythic_grand_comp',    name: 'Grand Completionist',   icon: '👁️', grade: 'mythic', desc: 'Completed 500 series every single one from first to last',       requirement: { type: 'completed', value: 500   }, hidden: true },
  { id: 'mythic_god_community', name: 'God of Community',      icon: '🌐', grade: 'mythic', desc: 'Made 1, 000 friends you ARE the community',                      requirement: { type: 'friends',   value: 1000  }, hidden: true },
  { id: 'mythic_eternal_voice', name: 'The Eternal Voice',     icon: '📯', grade: 'mythic', desc: '10, 000 comments your words shaped countless readers',            requirement: { type: 'comments',  value: 10000 }, hidden: true },
  { id: 'mythic_love_deity',    name: 'The Love Deity',        icon: '�,', grade: 'mythic', desc: 'Liked 50, 000 things your approval is sacred',                   requirement: { type: 'likes',     value: 50000 }, hidden: true },
  { id: 'mythic_night_dwell',   name: 'Eternal Night Dweller', icon: '🌑', grade: 'mythic', desc: '1, 000 nights past midnight you live in the dark',               requirement: { type: 'midnight',  value: 1000  }, hidden: true },
  { id: 'mythic_grand_curator', name: 'The Grand Curator',     icon: '📚', grade: 'mythic', desc: 'Following 500 different series simultaneously',                   requirement: { type: 'series',    value: 500   }, hidden: true },
  { id: 'mythic_supreme_spr',   name: 'The Spreader Supreme',  icon: '🌍', grade: 'mythic', desc: 'Shared 5, 000 series you single-handedly built the community',   requirement: { type: 'shares',    value: 5000  }, hidden: true },
  { id: 'mythic_oracle',        name: 'The Oracle',            icon: '🔮', grade: 'mythic', desc: 'Rated 1, 000 different series your word is law',                 requirement: { type: 'ratings',   value: 1000  }, hidden: true },
  { id: 'mythic_decade',        name: 'A Decade on MangaRecs',   icon: '🪐', grade: 'mythic', desc: 'A member for 10 full years here before it was anything',        requirement: { type: 'account',   value: 3650  }, hidden: true },
  { id: 'mythic_incarnate',     name: 'MangaRecs Incarnate',     icon: '✴️', grade: 'mythic', desc: 'Earned every other badge the true and only final achievement',  requirement: { type: 'special',   value: 1     }, hidden: true },
];

// â”€â”€ Dynamic badge engine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function profileToBadgeStats(profile) {
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

export function computeEarnedBadgeIds(stats = {}) {
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

export const EARNED_BADGE_IDS = new Set([
  'first_page', 'new_chapter', 'speak_up', 'first_heart', 'not_alone',
  'face_of_mangarecs', 'getting_hooked', 'first_hour', 'day_one', 'curious',
  'first_word', 'spread_the_word', 'your_verdict', 'more_please',
  'page_turner', 'deep_diver', 'bookworm', 'story_addict',
  'regular_reader', 'time_well_spent', 'dedicated', 'deep_session',
  'back_again', 'consistent', 'week_warrior', 'habit_formed',
  'chatty', 'conversationalist', 'appreciator', 'spreading_love',
  'growing_circle', 'squad_goals', 'genre_curious', 'diverse_taste',
  'finisher', 'night_reader', 'ten_titles', 'growing_shelf', 'collector',
  'multi_fan', 'library_builder', 'word_spreader', 'early_opinion',
  'chapter_chaser', 'night_owl', 'monthly_master',
  'triple_digits', 'arc_ender', 'social_node', 'discussion_king',
  'love_machine', 'omnivore', 'midnight_scholar',
]);

export const LEADERBOARD = [
  { rank: 1,  name: 'ShadowMaster99',  avatar: 'S', hours: 14200, badges: ['mythic_time_devourer', 'full_year', 'the_thousand'],       online: true },
  { rank: 2,  name: 'MangaQueen',      avatar: 'M', hours: 9840,  badges: ['fifteen_h_hrs', 'unstoppable', 'the_completionist'],       online: true },
  { rank: 3,  name: 'VoidWalkerX',     avatar: 'V', hours: 7350,  badges: ['thousand_hours', 'full_year', 'ten_thousand'],             online: false },
  { rank: 4,  name: 'LunaEclipse',     avatar: 'L', hours: 5120,  badges: ['thousand_hours', 'nine_months_str', 'fifteen_h_manga'],    online: true },
  { rank: 5,  name: 'ChapterKing',     avatar: 'C', hours: 4800,  badges: ['the_completionist', 'ten_thousand'],                       online: false },
  { rank: 6,  name: 'AkiraFan99',      avatar: 'A', hours: 3980,  badges: ['full_year', 'the_thousand'],                              online: true },
  { rank: 7,  name: 'NeonReader',      avatar: 'N', hours: 3200,  badges: ['living_encyclopedia', 'genre_master'],                     online: false },
  { rank: 8,  name: 'DarkKnight42',    avatar: 'D', hours: 2760,  badges: ['two_thousand_hrs', 'eternal_night'],                       online: false },
  { rank: 9,  name: 'StargazerMei',    avatar: 'S', hours: 2100,  badges: ['half_year_str', 'seven_hundred_mng'],                      online: true },
  { rank: 10, name: 'InkReader',       avatar: 'I', hours: 1890,  badges: ['century_streak', 'saga_collector'],                        online: true,  isMe: true },
  { rank: 11, name: 'TwilightSage',    avatar: 'T', hours: 1540,  badges: ['five_hundred_mng', 'century_streak'],                      online: false },
  { rank: 12, name: 'CosmicReader',    avatar: 'C', hours: 1290,  badges: ['thousand_hours', 'living_encyclopedia'],                   online: true },
  { rank: 13, name: 'LunaReads',       avatar: 'L', hours: 1100,  badges: ['century_streak', 'three_hundred_mng'],                     online: true },
  { rank: 14, name: 'PhantomScribe',   avatar: 'P', hours: 840,   badges: ['saga_collector', 'nocturnal_soul'],                        online: false },
  { rank: 15, name: 'OniSlayer',       avatar: 'O', hours: 720,   badges: ['three_hundred_mng', 'six_weeks_solid'],                    online: false },
];

