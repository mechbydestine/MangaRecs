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

// The trailing \w* is what catches inflections — "fucking", "bitches",
// "retarded" — but that same tolerance also swallows ordinary words that merely
// start with a blocked term. That's the Scunthorpe problem pointed the other
// way: "cockpit", "Dickens" and "coonhound" are not slurs, and a bio containing
// one used to be rejected with no indication of which word tripped it. Only
// words that START with a term are at risk (\b requires it), so a fixed
// allowlist of those is sufficient — "raccoon" and "cocoon" never matched.
const ALLOWED_WORDS = new Set([
  'cockpit', 'cockpits', 'cocktail', 'cocktails', 'cockney', 'cockroach',
  'cockroaches', 'cockatoo', 'cockatoos', 'cockatiel', 'cockatiels', 'cockle',
  'cockles', 'cocker', 'cockerel',
  'dickens', 'dickensian', 'dickinson',
  'coonhound', 'coonhounds', 'coonskin',
  'spick', 'fagot', 'fagots', 'shitake', 'shitakes',
]);

const PATTERN = new RegExp(`\\b(?:${BLOCKED_TERMS.join('|')})\\w*\\b`, 'gi');

export function containsBlockedLanguage(text) {
  const normalized = (text || '').normalize('NFKC');
  PATTERN.lastIndex = 0;
  let match;
  while ((match = PATTERN.exec(normalized)) !== null) {
    if (!ALLOWED_WORDS.has(match[0].toLowerCase())) return true;
  }
  return false;
}
