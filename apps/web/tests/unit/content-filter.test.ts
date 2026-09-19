import { describe, it, expect, afterEach } from 'vitest';
import { checkContent, contentProblemBody, objectionableCategory } from '@/lib/content-filter';

/**
 * Objectionable-content filter (Apple 1.2 / Google UGC). Two failure modes
 * matter equally: missing the obvious, and blocking a legitimate profile, brief
 * or business name. Both are pinned here.
 */
describe('refuses the obvious', () => {
  it.each([
    ['plain profanity', 'this brand is a bunch of fuckers'],
    ['a slur', 'you are a faggot'],
    ['Hinglish abuse', 'tu bilkul chutiya hai'],
    ['Devanagari abuse', 'तू चूतिया है'],
    ['explicit adult content', 'check my porn page'],
    ['a threat phrase', 'I will kill you if you post that'],
    ['an adult-service phrase', 'call girl service in Mumbai'],
  ])('%s', (_l, text) => {
    expect(objectionableCategory(text)).not.toBeNull();
  });

  it('reports a category, never the term', () => {
    expect(objectionableCategory('fuck this')).toBe('abuse');
    expect(objectionableCategory('nigger')).toBe('hate');
    expect(objectionableCategory('I will kill you')).toBe('threat');
    expect(objectionableCategory('free porn')).toBe('sexual');
  });
});

describe('sees through the usual evasions', () => {
  it.each([
    ['capitals', 'FUCK'],
    ['trailing punctuation', 'fuck!'],
    ['dots between letters', 'f.u.c.k'],
    ['spaces between letters', 'f u c k'],
    ['a star for a letter', 'f*ck'],
    ['several stars', 'f**k'],
    ['@ for a letter', 'f@ck off'],
    ['# for a letter', 'f#ck'],
    ['a digit for a letter', 'n1gger'],
    ['digit swaps inside a word', 'fuck1ng brilliant'],
    ['repeated letters', 'fuuuuuck'],
    ['a swapped v', 'fvck'],
    ['a hidden zero-width character', 'fu​ck'],
    ['accents', 'fúck'],
    ['a longer word around a long term', 'motherfuckers'],
    ['a doubled letter in the term', 'niggger'],
  ])('%s', (_l, text) => {
    expect(objectionableCategory(text)).not.toBeNull();
  });
});

describe('leaves legitimate text alone', () => {
  it.each([
    // The Scunthorpe problem: bad letters inside good words.
    'Scunthorpe United', 'assassin', 'class action', 'Essex', 'cocktail', 'Dickens', 'Cockburn', 'passionate about cooking',
    'Sussex', 'Lusitania', 'grape harvest', 'therapist', 'analysis', 'Penistone', 'shitake mushroom recipes',
    // Real names and words the term list deliberately does not carry.
    'Maine Coon cats', 'Lund University', 'Niki Lauda', 'Randi Zuckerberg', 'Escorts Kubota tractors', 'Ford Escort',
    'a chink in the armour', 'Spic and Span', 'transmission and tranny fluid',
    // Ordinary double letters must not be squeezed into a term.
    'Pakki Sadak', 'pakki dosti', 'bass guitar', 'sunny weekend',
    // Ordinary marketing copy, prices and punctuation.
    'Launching our new skincare range! ₹5,000 budget, 3 reels + 2 stories.', '100% authentic — DM us @brand_official', 'Fashion & Lifestyle creator from Chennai',
    '**bold** and *italic* markdown', '5 * 3 = 15', 'Q4 2026 (Oct–Dec) campaign brief',
  ])('%s', (text) => {
    expect(objectionableCategory(text)).toBeNull();
  });

  it('ignores empty and non-string input', () => {
    expect(objectionableCategory('')).toBeNull();
    expect(objectionableCategory(undefined as unknown as string)).toBeNull();
    expect(objectionableCategory(42 as unknown as string)).toBeNull();
  });

  it('is fast on the longest text the app accepts', () => {
    const long = 'A perfectly ordinary sentence about a skincare launch. '.repeat(80); // ~4,400 chars
    const t0 = performance.now();
    expect(objectionableCategory(long)).toBeNull();
    expect(performance.now() - t0).toBeLessThan(50);
  });
});

describe('checkContent', () => {
  it('names the field that tripped and never echoes the text', () => {
    const p = checkContent({ name: 'Priya', bio: 'fuck off', city: 'Pune' }, ['name', 'bio', 'city']);
    expect(p).toMatchObject({ status: 422, reason: 'objectionable_content', field: 'bio' });
    expect(p!.error).toMatch(/Your bio contains language/);
    expect(JSON.stringify(contentProblemBody(p!))).not.toMatch(/fuck/i);
  });

  it('uses a human label for the field', () => {
    expect(checkContent({ project_title: 'chutiya deal' }, ['project_title'])!.error).toMatch(/Your project title/);
    expect(checkContent({ deliverables: 'porn' }, ['deliverables'])!.error).toMatch(/Your deliverables/);
  });

  it('returns null when nothing trips, and skips missing or non-string fields', () => {
    expect(checkContent({ name: 'Priya', bio: 'Food creator' }, ['name', 'bio', 'missing'])).toBeNull();
    expect(checkContent({ budget: 500000, title: null }, ['budget', 'title'])).toBeNull();
  });

  it('checks fields in the order given: the first offender wins', () => {
    expect(checkContent({ title: 'porn', description: 'fuck' }, ['description', 'title'])!.field).toBe('description');
  });
});

describe('CONTENT_FILTER_EXTRA_TERMS (extend without a code change)', () => {
  const OLD = process.env.CONTENT_FILTER_EXTRA_TERMS;
  afterEach(() => {
    if (OLD === undefined) delete process.env.CONTENT_FILTER_EXTRA_TERMS;
    else process.env.CONTENT_FILTER_EXTRA_TERMS = OLD;
  });

  it('adds whole-word terms', () => {
    delete process.env.CONTENT_FILTER_EXTRA_TERMS;
    expect(objectionableCategory('this is a zorgblat brand')).toBeNull();
    process.env.CONTENT_FILTER_EXTRA_TERMS = 'zorgblat, Other-Term';
    expect(objectionableCategory('this is a zorgblat brand')).toBe('abuse');
    expect(objectionableCategory('zorgblatted')).toBeNull(); // whole word only
    expect(objectionableCategory('otherterm')).toBe('abuse');
  });

  it('ignores terms shorter than three letters so a typo cannot block everything', () => {
    process.env.CONTENT_FILTER_EXTRA_TERMS = 'a, ab';
    expect(objectionableCategory('a big ab test')).toBeNull();
  });
});
