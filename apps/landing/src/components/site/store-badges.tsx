import { APP_STORE_URL, PLAY_STORE_URL } from './links';

type Props = {
  tone?: 'dark' | 'light';
  size?: 'md' | 'sm';
  className?: string;
};

// App Store and Google Play buttons. A store without a listing yet renders as
// a muted "coming soon" badge instead of a dead link.
export default function StoreBadges({ tone = 'dark', size = 'md', className = '' }: Props) {
  return (
    <div className={`flex flex-wrap gap-2.5 ${className}`}>
      <Badge href={APP_STORE_URL} tone={tone} size={size} over="Download on the" name="App Store" icon={<AppleGlyph />} />
      <Badge href={PLAY_STORE_URL} tone={tone} size={size} over="Get it on" name="Google Play" icon={<PlayGlyph />} />
    </div>
  );
}

function Badge({
  href,
  tone,
  size,
  over,
  name,
  icon,
}: {
  href: string | null;
  tone: 'dark' | 'light';
  size: 'md' | 'sm';
  over: string;
  name: string;
  icon: React.ReactNode;
}) {
  const skin =
    tone === 'dark'
      ? 'bg-white text-ink border-white'
      : 'bg-ink text-white border-ink';
  const dims = size === 'md' ? 'h-14 gap-3 px-5' : 'h-11 gap-2.5 px-3.5';
  const body = (
    <>
      <span className={size === 'md' ? 'size-7' : 'size-5'}>{icon}</span>
      <span className="flex flex-col items-start leading-none">
        <span className={size === 'md' ? 'text-[11px]' : 'text-[9.5px]'}>{href ? over : 'Coming soon on'}</span>
        <span className={`font-display font-bold tracking-[-0.01em] ${size === 'md' ? 'mt-1 text-[19px]' : 'mt-0.5 text-[15px]'}`}>
          {name}
        </span>
      </span>
    </>
  );

  if (!href) {
    return (
      <span aria-label={`${name}: coming soon`} className={`flex items-center rounded-2xl border opacity-60 ${dims} ${skin}`}>
        {body}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center rounded-2xl border transition-transform hover:-translate-y-0.5 ${dims} ${skin}`}
    >
      {body}
    </a>
  );
}

function AppleGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-full">
      <path d="M16.37 12.7c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.28-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.99.72 1.24-.02 2.02-1.12 2.77-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.66ZM14.1 5.95c.63-.77 1.06-1.83.94-2.9-.91.04-2.02.61-2.67 1.37-.58.67-1.1 1.76-.96 2.8 1.02.08 2.06-.52 2.69-1.27Z" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-full">
      <path d="M3.6 2.3 13.4 12l-9.8 9.7c-.35-.2-.6-.6-.6-1.1V3.4c0-.5.25-.9.6-1.1Z" fill="#00d7fe" />
      <path d="m16.8 8.6-3.4 3.4-9.8-9.7c.3-.2.8-.2 1.2 0l12 6.3Z" fill="#00f076" />
      <path d="m16.8 15.4-12 6.3c-.4.2-.9.2-1.2 0l9.8-9.7 3.4 3.4Z" fill="#ff3a44" />
      <path d="m20.4 12.9-3.6 2.5-3.4-3.4 3.4-3.4 3.6 2.5c.8.5.8 1.3 0 1.8Z" fill="#ffd400" />
    </svg>
  );
}
