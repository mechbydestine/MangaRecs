/**
 * Every MangaRecap slide must render for every shape of reader — including the
 * brand-new account with no series, no genres and no badges. A slide that
 * throws takes the whole story down mid-playback, which is exactly what an
 * autoplay recap must never do.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('expo-audio', () => ({
  createAudioPlayer: () => ({ play() {}, pause() {}, remove() {} }),
  setAudioModeAsync: async () => {},
}));
jest.mock('expo-sensors', () => ({
  DeviceMotion: { setUpdateInterval() {}, addListener: () => ({ remove() {} }) },
}));
jest.mock('expo-sharing', () => ({ isAvailableAsync: async () => false, shareAsync: async () => {} }));
jest.mock('react-native-view-shot', () => {
  const R = require('react');
  const { View } = require('react-native');
  return R.forwardRef((props, ref) => {
    R.useImperativeHandle(ref, () => ({ capture: async () => null }));
    return R.createElement(View, null, props.children);
  });
});
jest.mock('expo-image', () => ({ Image: require('react-native').View }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: require('react-native').View }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: require('react-native').Text }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack() {} }) }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('../utils/LanguageContext', () => ({ useT: () => (k) => k }));
jest.mock('../components/BadgeIcon', () => require('react-native').View);
jest.mock('../utils/haptics', () => ({ selection() {}, light() {}, success() {} }));
jest.mock('../utils/ambiencePlayer', () => ({ getState: () => ({ presetId: 'x' }) }));
jest.mock('../utils/mangaCovers', () => ({ fetchMangaInfo: async () => null }));
jest.mock('../utils/recapHistory', () => ({
  fetchPreviousSnapshot: async () => null,
  fetchOldestSnapshot: async () => null,
  fetchFriendsRecap: async () => [],
  saveSnapshot: async () => {},
  readingDnaCode: () => 'DNA-TEST',
  ratingPersonality: () => null,
}));
jest.mock('../utils/ProfileContext', () => ({
  useProfile: () => ({ userId: 'u1', loading: false, profile: { username: 'tester' } }),
}));

const { SLIDES } = require('../screens/RecapScreen');
const { buildIdentity, surfaceFor } = require('../utils/recapIdentity');

const identity = buildIdentity(
  [{ color: '#B0362F', weight: 5, country: 'JP' }],
  { genre: 'Action', genres: ['Action', 'Drama'] }
);

// A reader with a full half behind them.
const rich = {
  username: 'tester',
  period: { label: 'First Half 2025', short: 'Jan – Jun 2025', start: new Date(2025, 0, 1), end: new Date(2025, 5, 30) },
  identity,
  covers: ['https://x/1.jpg', 'https://x/2.jpg'],
  topSeries: [
    { title: 'Berserk', chapters: 120, cover: 'https://x/1.jpg', color: '#B0362F', country: 'JP', genres: ['Action'] },
    { title: 'Vagabond', chapters: 90, cover: 'https://x/2.jpg', color: '#333', country: 'JP', genres: ['Drama'] },
  ],
  genres: [{ label: 'Action', pct: 60 }, { label: 'Drama', pct: 40 }],
  dailyLog: { '2025-01-05': 1.5, '2025-02-11': 3 },
  chapters: 210,
  series: 2,
  completed: 1,
  hours: 48,
  readingDays: 2,
  longest: 12,
  streakRange: 'Jan 5 → Jan 16',
  weekday: { totals: [1, 2, 3, 4, 5, 6, 7], best: 6, bestName: 'Saturday', weekendShare: 0.4 },
  peakWindow: { startHour: 22, label: '10pm – 12am', pct: 44 },
  firstDayLabel: 'January 5',
  badgesEarned: 12,
  badgesTotal: 200,
  showcaseBadges: [{ id: 'b1', name: 'First Steps', grade: 'bronze' }],
  tierLabel: 'Gold',
  tierColor: '#D4AF37',
  comments: 9,
  ratings: 4,
  personalityPool: 13,
  waiting: 3,
  hourPulse: Array.from({ length: 24 }, (_, i) => i),
  hourPulseMax: 23,
  lateNightHours: 3.2,
  topComment: { text: 'peak fiction', likes: 12 },
  ratingPersona: { label: 'a generous rater' },
  friendRank: 2,
  friendsReadingSame: ['kai'],
  firstEverTopSeries: 'Naruto',
  deltas: { chapters: 40, hours: 5, longest: 2 },
  dnaCode: 'DNA-TEST',
  chaptersPerHour: 4.3,
  personality: { icon: 'moon', seal: '夜', title: 'The Night Owl', desc: 'After midnight.' },
};

// A brand-new account: nothing read, nothing rated, nothing earned.
const empty = {
  ...rich,
  covers: [],
  topSeries: [],
  genres: [],
  dailyLog: {},
  chapters: 0,
  series: 0,
  completed: 0,
  hours: 0,
  readingDays: 0,
  longest: 0,
  streakRange: null,
  weekday: { totals: [0, 0, 0, 0, 0, 0, 0], best: -1, bestName: null, weekendShare: 0 },
  peakWindow: null,
  firstDayLabel: null,
  badgesEarned: 0,
  showcaseBadges: [],
  tierLabel: null,
  waiting: 0,
  hourPulse: Array.from({ length: 24 }, () => 0),
  hourPulseMax: 0.5,
  lateNightHours: 0,
  topComment: null,
  ratingPersona: null,
  friendRank: null,
  friendsReadingSame: [],
  firstEverTopSeries: null,
  deltas: null,
  chaptersPerHour: 0,
};

function renderSlide(slide, i, d) {
  const s = surfaceFor(d.identity, i);
  const el = React.createElement(slide.Comp, {
    d, s, id: d.identity, w: 390, h: 844, cw: 314,
    onShareImage() {}, onCompare() {}, exporting: false, onDone() {},
  });
  let tree;
  act(() => { tree = renderer.create(el); });
  act(() => { tree.unmount(); });
}

describe('MangaRecap slides', () => {
  SLIDES.forEach((slide, i) => {
    it(`slide ${i + 1} (${slide.key}) renders for an established reader`, () => {
      expect(() => renderSlide(slide, i, rich)).not.toThrow();
    });
    it(`slide ${i + 1} (${slide.key}) renders for a brand-new account`, () => {
      expect(() => renderSlide(slide, i, empty)).not.toThrow();
    });
  });

  SLIDES.forEach((slide, i) => {
    it(`stage ${i + 1} (${slide.key}) renders`, () => {
      const s = surfaceFor(identity, i);
      const el = React.createElement(slide.Stage, {
        covers: rich.covers, s, id: identity, w: 390, h: 844, night: true, intensity: 0.4, reduced: false,
      });
      let tree;
      expect(() => { act(() => { tree = renderer.create(el); }); }).not.toThrow();
      act(() => { tree.unmount(); });
    });
  });
});
