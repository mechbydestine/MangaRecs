// Single source of truth for genres across the app.
// RADAR_GENRES in ForYouScreen is intentionally a fixed 6-item subset — do not touch it.
export const GENRES = [
  { label: 'Action',       emoji: '⚔️'  },
  { label: 'Adventure',    emoji: '🗺️'  },
  { label: 'Comedy',       emoji: '😂'  },
  { label: 'Cyberpunk',    emoji: '🌆'  },
  { label: 'Dark Fantasy', emoji: '🌑'  },
  { label: 'Drama',        emoji: '🎭'  },
  { label: 'Fantasy',      emoji: '🐉'  },
  { label: 'Historical',   emoji: '📜'  },
  { label: 'Horror',       emoji: '💀'  },
  { label: 'Isekai',       emoji: '🌀'  },
  { label: 'Martial Arts', emoji: '🥋'  },
  { label: 'Mystery',      emoji: '🔍'  },
  { label: 'Romance',      emoji: '💕'  },
  { label: 'Sci-Fi',       emoji: '🚀'  },
  { label: 'Slice of Life',emoji: '🌸'  },
  { label: 'Sports',       emoji: '🏆'  },
  { label: 'Supernatural', emoji: '👁️'  },
  { label: 'Thriller',     emoji: '🔪'  },
];

// Picker-compatible format: { label, value }
export const GENRE_PICKER_OPTIONS = GENRES.map(g => ({ label: g.label, value: g.label }));
