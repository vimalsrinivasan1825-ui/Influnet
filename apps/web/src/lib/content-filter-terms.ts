/**
 * Terms the objectionable-content filter refuses (see content-filter.ts).
 *
 * WHY THIS EXISTS: Apple 1.2 and Google's UGC policy require "a method for
 * filtering objectionable material" before it is posted. This list is that
 * method's data, kept apart from the matching code so a person can maintain it
 * without touching logic.
 *
 * HOW TO EXTEND IT
 *   - Add lowercase, plain-letter terms. The matcher already handles case,
 *     accents, common letter swaps (@→a, 0→o, 1→i, 3→e, $→s), repeated letters
 *     and spaced-out letters ("f u c k"), so do not add those variants.
 *   - `WHOLE_WORD` terms match only as a complete word. That is what keeps
 *     "assassin", "class", "Scunthorpe", "Essex" and "cocktail" clean. Anything
 *     short or that is a common substring belongs here.
 *   - `ANYWHERE` terms also match inside a longer word ("motherfuckers",
 *     "chutiyapanti"). Only put long, unambiguous terms here.
 *   - `PHRASES` are matched as a run of whole words.
 *   - Without a deploy: set CONTENT_FILTER_EXTRA_TERMS (comma separated) in the
 *     container's environment. Those are treated as WHOLE_WORD terms.
 *
 * WHAT IT IS NOT: a moderation system. It is a first gate against the obvious.
 * Chat is moderated by Stream's own filters; reports go to the admin queue.
 * Keep this list to terms that are abusive in essentially any context, so it
 * never blocks a legitimate profile, brief or business name.
 */

export type TermCategory = 'hate' | 'abuse' | 'sexual' | 'threat';

/**
 * Match only as a complete word.
 *
 * Deliberately NOT here, because each is a real name or ordinary word somewhere:
 * "coon" (Maine Coon cats), "lund" (Lund University), "lauda" (Niki Lauda),
 * "randi" (a first name), "escort(s)" (Escorts Kubota, Ford Escort), "chink"
 * ("a chink in the armour"), "tranny" (a gearbox), "spic" (Spic and Span),
 * "bastard" (a TV show). A first gate that blocks a legitimate business name
 * teaches people to distrust it, so this list holds only what is abusive in
 * essentially every context.
 */
export const WHOLE_WORD: Record<TermCategory, string[]> = {
  hate: ['nigger', 'niggers', 'nigga', 'niggas', 'faggot', 'faggots', 'kike', 'kikes', 'paki', 'gook'],
  abuse: [
    'fuck', 'fucks', 'fucked', 'fucker', 'fuckers', 'fucking', 'fuk', 'fck',
    'cunt', 'cunts', 'whore', 'whores', 'slut', 'sluts',
    // Common Hindi / Hinglish abuse, transliterated.
    'chutiya', 'chutiye', 'chutiyapa', 'madarchod', 'behenchod', 'bhenchod', 'bhosdike', 'bhosdi', 'bhosda',
    'gandu', 'gaandu', 'haramkhor',
  ],
  sexual: [
    'porn', 'porno', 'pornhub', 'xvideos', 'xnxx', 'nudes', 'sexcam', 'camgirl', 'camgirls',
    'callgirl', 'callgirls', 'onlyfans',
  ],
  threat: [],
};

/** Long and unambiguous enough to match inside a longer word. */
export const ANYWHERE: Record<TermCategory, string[]> = {
  hate: ['nigger', 'faggot'],
  abuse: ['motherfucker', 'madarchod', 'behenchod', 'bhenchod', 'chutiya', 'bhosdike'],
  sexual: ['pornhub', 'xvideos'],
  threat: [],
};

/** Runs of whole words. */
export const PHRASES: Record<TermCategory, string[]> = {
  hate: [],
  abuse: [],
  sexual: ['sex chat', 'sex video', 'sex videos', 'call girl', 'call girls', 'escort service', 'nude pics', 'nude photos'],
  threat: [
    'kill yourself', 'kill you', 'kill u', 'rape you', 'rape u', 'i will find you', 'go die', 'hope you die',
    'you should die', 'bomb threat',
  ],
};

/**
 * Devanagari (Hindi) abuse, matched as a substring of the text as typed. The
 * Latin normalisation above cannot see these. Other scripts are NOT covered yet;
 * add them here (with a native speaker's review) as they turn up in reports.
 */
export const NATIVE_SCRIPT: string[] = ['चूतिया', 'मादरचोद', 'भेनचोद', 'बहनचोद', 'गांडू', 'भोसड़ीके', 'भोसडीके', 'रंडी'];
