// api/services/transitions — session/news/market/level change detection.
// Ports check-transitions. Emits notifications + SSE events; tracks last-known
// state in app_settings. Safe to run twice (state-compare, not blind insert).
import { getActiveSession, isMarketOpen, getUpcomingSession } from '@jack-trade/engine';
import { calendarWindow, getSetting, highImpact, notify, setSetting } from '../repositories/repos.js';
import { checkPriceLevelBreaks } from './levels.js';
import { publish } from '../plugins/sse.js';

const PRE_MINUTES = 15;
const POST_MINUTES = 30;

async function activeNewsLabel(): Promise<string | null> {
  const now = new Date();
  const events = await calendarWindow(
    new Date(now.getTime() - POST_MINUTES * 60000).toISOString(),
    new Date(now.getTime() + PRE_MINUTES * 60000).toISOString(),
  );
  const high = highImpact(events);
  if (high.length === 0) return null;
  const e = high[0];
  return `${e.currency ?? ''} ${e.event_name ?? 'economic event'} (${e.impact ?? 'high'} impact)`;
}

export async function signalTransitions(now = new Date()) {
  const results: string[] = [];

  const current = getActiveSession(now);
  const currentName = current?.name ?? '';
  const lastName = (await getSetting('last_known_session')) ?? '';
  if (currentName !== lastName) {
    const message = currentName && lastName
      ? `${lastName} session ended. ${currentName} session has begun.`
      : currentName ? `${currentName} session has begun.` : `${lastName} session ended.`;
    await notify('session_change', message, current?.detail ?? null);
    await setSetting('last_known_session', currentName);
    results.push(`session: ${message}`);
    publish({ kind: 'session_change', message });
  }

  const newsLabel = await activeNewsLabel();
  const newsNow = newsLabel != null;
  const wasNews = (await getSetting('last_known_news_active')) === 'true';
  if (newsNow && !wasNews && newsLabel) {
    await notify('news_live', `News is live: ${newsLabel}`, newsLabel);
    results.push(`news: News is live: ${newsLabel}`);
    publish({ kind: 'news_window', active: true, label: newsLabel });
  }
  if (newsNow !== wasNews) await setSetting('last_known_news_active', String(newsNow));

  const upcoming = getUpcomingSession(now, 10);
  if (upcoming && (await getSetting('last_warned_upcoming_session')) !== upcoming.name) {
    await notify('session_upcoming', `${upcoming.name} session starting soon.`, upcoming.detail);
    await setSetting('last_warned_upcoming_session', upcoming.name);
    results.push(`upcoming: ${upcoming.name} session starting soon.`);
  }

  const openNow = isMarketOpen(now);
  const knownRaw = await getSetting('last_known_market_open');
  if (knownRaw === null) {
    const sessionText = current ? `${current.name} session active` : 'no session currently active';
    await notify('market_status', `Notifications are now live. Currently: markets ${openNow ? 'open' : 'closed'}, ${sessionText}.`, 'Baseline status.');
    results.push('baseline status notification created');
  } else if (openNow !== (knownRaw === 'true')) {
    const message = openNow ? 'Markets are now open.' : 'Markets are now closed for the weekend.';
    await notify('market_status', message);
    results.push(`market: ${message}`);
    publish({ kind: 'market_status', open: openNow });
  }
  await setSetting('last_known_market_open', String(openNow));

  if (openNow) {
    for (const b of await checkPriceLevelBreaks()) {
      const labelMap: Record<string, string> = {
        daily_high: "Yesterday's daily high", daily_low: "Yesterday's daily low",
        weekly_high: "Last week's high", weekly_low: "Last week's low",
      };
      const message = `${labelMap[b.type]} (${b.level.toFixed(2)}) has been broken -- live price ${b.livePrice.toFixed(2)}.`;
      await notify('price_level_break', message, b.type);
      results.push(`price_level: ${message}`);
      publish({ kind: 'level_break', message });
    }
  }

  return { checked: true, transitions: results };
}

export async function newsWindowStatus() {
  const now = new Date();
  const events = await calendarWindow(
    new Date(now.getTime() - POST_MINUTES * 60000).toISOString(),
    new Date(now.getTime() + PRE_MINUTES * 60000).toISOString(),
  );
  const high = highImpact(events);
  if (high.length === 0) return { active: false as const, event: null };
  const e = high[0];
  return {
    active: true as const,
    event: {
      time: e.event_time,
      currency: e.currency,
      name: e.event_name,
      impact: e.impact,
      label: `${e.currency ?? ''} ${e.event_name ?? 'economic event'} (${e.impact ?? 'high'} impact)`,
    },
  };
}

export function marketStatus(now = new Date()) {
  const open = isMarketOpen(now);
  const session = getActiveSession(now);
  return {
    open,
    detail: open ? 'Gold market is open' : 'Gold market is closed until Sunday 22:00 UTC (5pm ET)',
    session,
    eatTime: new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit', hour12: false }).format(now),
  };
}
