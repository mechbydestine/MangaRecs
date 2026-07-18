// Basic pre-submission filter for comments, discussion posts, and DMs —
// blocks the most common slurs/profanity before a post ever reaches the
// database. This is deliberately a blunt, low-maintenance wordlist rather
// than a full moderation model: it's the "filtering objectionable material"
// leg of App Store 1.2 (alongside the report/block/moderation-dashboard
// tooling that already exists), not a substitute for human review.
const BLOCKED_TERMS = [
  'nigger', 'nigga', 'faggot', 'fag', 'retard', 'retarded', 'tranny',
  'chink', 'spic', 'kike', 'gook', 'wetback', 'coon',
  'fuck', 'shit', 'bitch', 'cunt', 'whore', 'slut', 'asshole', 'dick',
  'bastard', 'motherfucker', 'cock', 'pussy',
];

const PATTERN = new RegExp(`\\b(${BLOCKED_TERMS.join('|')})\\w*\\b`, 'i');

export function containsBlockedLanguage(text) {
  return PATTERN.test((text || '').normalize('NFKC'));
}
