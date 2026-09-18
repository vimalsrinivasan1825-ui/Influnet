/** Copy for Pro renewal reminders (stage = days before expiry; 0 = just expired). */
export function renewalCopy(stage: number, periodEnd: string): { title: string; body: string } {
  const date = new Date(periodEnd).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata',
  });
  if (stage === 0) {
    return {
      title: 'Your Pro plan has ended',
      body: 'Renew now to keep your Pro limits, badge and insights.',
    };
  }
  return {
    title: stage === 1 ? 'Your Pro plan ends tomorrow' : `Your Pro plan ends in ${stage} days`,
    body: `Pro is active until ${date}. Renew to keep your Pro limits and badge without a gap.`,
  };
}
