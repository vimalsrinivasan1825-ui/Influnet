import { describe, it, expect } from 'vitest';
import {
  extractInlineJson,
  extractOwnerSubscriberCount,
  normalizeYouTubeHandle,
  parseSubscriberCount,
  parseVideoFeed,
} from '@/lib/youtube';

/**
 * The shape that broke production: a channel page embeds the subscriber count of
 * every channel it links to, and the featured shelf renders BEFORE the owner's
 * own header. @a2dchannel published a featured channel's 568K in place of its
 * own 2.51M for two days.
 */
function channelPage(opts: { owner?: string; header?: unknown } = {}): string {
  const featured = {
    subscriberCountText: { simpleText: '568K subscribers', accessibility: { accessibilityData: { label: '568 thousand subscribers' } } },
  };
  const data = {
    responseContext: {},
    contents: { shelf: [featured, { subscriberCountText: { simpleText: '413K subscribers' } }] },
    metadata: { channelMetadataRenderer: { externalId: 'UCvyZS6W6zMJCZBVzF-Ei6sw', title: 'A2D Channel' } },
    header: opts.header ?? {
      pageHeaderRenderer: {
        content: {
          pageHeaderViewModel: {
            metadata: {
              contentMetadataViewModel: {
                metadataRows: [
                  { metadataParts: [{ text: { content: `@${opts.owner ?? 'a2dchannel'}` } }] },
                  {
                    metadataParts: [
                      { text: { content: '2.51M subscribers' }, accessibilityLabel: '2.51 million subscribers' },
                      { text: { content: '1.5K videos' } },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    },
  };
  return `<html><body><script nonce="x">var ytInitialData = ${JSON.stringify(data)};</script></body></html>`;
}

describe('extractInlineJson', () => {
  it('reads the whole blob even when a string inside it closes the script tag', () => {
    const html = `<script>var ytInitialData = {"title":"};</script>","n":7};</script>`;
    expect(extractInlineJson(html, 'var ytInitialData = ')).toEqual({ title: '};</script>', n: 7 });
  });

  it('returns null when the marker is absent', () => {
    expect(extractInlineJson('<html></html>', 'var ytInitialData = ')).toBeNull();
  });
});

describe('parseSubscriberCount', () => {
  it('reads every unit YouTube renders', () => {
    expect(parseSubscriberCount('2.51M subscribers')).toBe(2_510_000);
    expect(parseSubscriberCount('2.51 million subscribers')).toBe(2_510_000);
    expect(parseSubscriberCount('92.4K subscribers')).toBe(92_400);
    expect(parseSubscriberCount('568 thousand subscribers')).toBe(568_000);
    expect(parseSubscriberCount('1,284 subscribers')).toBe(1284);
    expect(parseSubscriberCount('1 subscriber')).toBe(1);
  });

  it('returns null for text that carries no count', () => {
    expect(parseSubscriberCount('Subscribe')).toBeNull();
    expect(parseSubscriberCount(null)).toBeNull();
  });
});

describe('extractOwnerSubscriberCount', () => {
  it("takes the owner's count, not the featured channel listed before it", () => {
    expect(extractOwnerSubscriberCount(channelPage(), 'a2dchannel')).toBe(2_510_000);
  });

  it('reads the legacy header when the modern one is absent', () => {
    const html = channelPage({
      header: { c4TabbedHeaderRenderer: { subscriberCountText: { simpleText: '2.51M subscribers' } } },
    });
    expect(extractOwnerSubscriberCount(html, 'a2dchannel')).toBe(2_510_000);
  });

  it('falls back to the header subtitle, which names the channel', () => {
    const html =
      `<html>${channelPage({ header: {} })}` +
      `<script>{"subtitle":{"content":"@a2dchannel • 2.51M subscribers"}}</script></html>`;
    expect(extractOwnerSubscriberCount(html, 'a2dchannel')).toBe(2_510_000);
  });

  it("returns null rather than publish a stranger's subscriber count", () => {
    // No owner header and no subtitle — the page still contains 568K and 413K,
    // and neither of them belongs to this creator.
    const html = channelPage({ header: {} });
    expect(extractOwnerSubscriberCount(html, 'a2dchannel')).toBeNull();
  });

  it('does not confuse a channel whose handle is a prefix of another', () => {
    const html = channelPage({ header: {} }) + '<div>@a2dchannelfanpage • 12K subscribers</div>';
    expect(extractOwnerSubscriberCount(html, 'a2dchannel2')).toBeNull();
  });
});

describe('normalizeYouTubeHandle', () => {
  it('accepts every shape a creator might paste', () => {
    expect(normalizeYouTubeHandle('@a2dchannel')).toBe('a2dchannel');
    expect(normalizeYouTubeHandle('https://www.youtube.com/@a2dchannel')).toBe('a2dchannel');
    expect(normalizeYouTubeHandle('youtube.com/c/A2DChannel/')).toBe('A2DChannel');
    expect(normalizeYouTubeHandle('  ')).toBeNull();
  });
});

describe('parseVideoFeed', () => {
  const feed = `<feed>
    <entry>
      <yt:videoId>ywcNU4qeK8I</yt:videoId>
      <title>Real title</title>
      <published>2026-07-27T13:05:11+00:00</published>
      <media:statistics views="361935"/>
      <media:starRating count="44074" average="5.00" min="1" max="5"/>
    </entry>
    <entry>
      <yt:videoId>HdXd91OxIDw</yt:videoId>
      <title>Fresh upload</title>
      <published>2026-07-26T12:23:06+00:00</published>
    </entry>
  </feed>`;

  it('reads ids, views and likes, and leaves missing stats null rather than zero', () => {
    const videos = parseVideoFeed(feed);
    expect(videos).toHaveLength(2);
    expect(videos[0]).toMatchObject({
      videoId: 'ywcNU4qeK8I',
      title: 'Real title',
      url: 'https://www.youtube.com/watch?v=ywcNU4qeK8I',
      views: 361_935,
      likes: 44_074,
    });
    // A brand-new upload reports no statistics block — that is unknown, not zero.
    expect(videos[1].views).toBeNull();
    expect(videos[1].likes).toBeNull();
  });
});
