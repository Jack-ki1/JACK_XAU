'use client';
import { isDemoMode } from '@/lib/env';
import { DEMO_RIBBON_TEXT } from '@/lib/demo';

/** Visible "not connected" state — never a silent blank page (§1, §5.1). */
export default function DemoRibbon() {
  if (!isDemoMode()) return null;
  return (
    <div
      role="status"
      className="px-3 md:px-6 py-1.5 bg-[var(--warn)]/10 border-b border-[var(--warn)]/30 font-mono text-[11px] text-[var(--warn)] text-center"
    >
      {DEMO_RIBBON_TEXT}
    </div>
  );
}
