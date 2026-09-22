import Gateway from '@/components/gate/gateway';

export default function Home() {
  return (
    <>
      <noscript>
        <div style={{ padding: 32, fontFamily: 'system-ui' }}>
          <a href="/creators">I&apos;m a creator</a> · <a href="/business">I&apos;m a business</a>
        </div>
      </noscript>
      <Gateway />
    </>
  );
}
