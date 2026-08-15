import cron, { type ScheduledTask } from 'node-cron';
import type { AppSettings } from '../src/types';
import { app } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Auto-refresh scheduler. Cron jobs fire at market open (9:30), midday (12:00),
 * and close (16:00) Eastern, on weekdays only. node-cron handles the timezone.
 */
const TIMEZONE = 'America/New_York';

const CRON_TIMES = {
  marketOpen: '30 9 * * 1-5', // 9:30 AM ET, Mon–Fri
  midday: '0 12 * * 1-5', // 12:00 PM ET
  close: '0 16 * * 1-5', // 4:00 PM ET
} as const;

let tasks: ScheduledTask[] = [];

export function stopScheduler(): void {
  for (const t of tasks) {
    try {
      t.stop();
    } catch {
      /* ignore */
    }
  }
  tasks = [];
}

/**
 * Robustly converts New York time (ET, e.g. "09:30") to user's local system time (HH:MM)
 * based on current active Daylight Saving Time offsets.
 */
export function getLocalTimeForET(etTimeStr: string): string {
  const [etHour, etMinute] = etTimeStr.split(':').map(Number);
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const date = now.getDate();

  // Guess UTC time by shifting approx 4 hours
  const utcGuess = Date.UTC(year, month, date, etHour + 4, etMinute);

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  for (let adjust = -3; adjust <= 3; adjust++) {
    const testTime = utcGuess + adjust * 60 * 60 * 1000;
    try {
      const parts = formatter.formatToParts(new Date(testTime));
      const formattedHour = Number(parts.find((p) => p.type === 'hour')?.value);
      const formattedMinute = Number(parts.find((p) => p.type === 'minute')?.value);

      if (formattedHour === etHour && formattedMinute === etMinute) {
        const localDate = new Date(testTime);
        const localHour = String(localDate.getHours()).padStart(2, '0');
        const localMinute = String(localDate.getMinutes()).padStart(2, '0');
        return `${localHour}:${localMinute}`;
      }
    } catch {
      /* ignore */
    }
  }

  // Fallback: New York offset is typically -4 (EDT) or -5 (EST)
  const fallbackHour = (etHour + 4) % 24;
  return `${String(fallbackHour).padStart(2, '0')}:${String(etMinute).padStart(2, '0')}`;
}

export async function syncTaskScheduler(settings: AppSettings): Promise<void> {
  if (process.platform !== 'win32') return;

  const exePath = app.getPath('exe');
  const consolidatedTaskName = 'InsiderWhaleTerminal_DailyScrape';

  // 1. Always delete the old separate tasks to clean up previous versions, and delete consolidated one to recreate
  const tasksToDelete = [
    'InsiderWhaleTerminal_MarketOpen',
    'InsiderWhaleTerminal_Midday',
    'InsiderWhaleTerminal_MarketClose',
    consolidatedTaskName
  ];
  for (const t of tasksToDelete) {
    try {
      await execFileAsync('schtasks', ['/delete', '/tn', t, '/f']);
    } catch {
      // Ignore errors if the task doesn't exist
    }
  }

  // 2. If schedule is enabled, check which times are enabled
  if (settings.scheduleEnabled) {
    const triggers: string[] = [];
    const days = 'Monday,Tuesday,Wednesday,Thursday,Friday';

    if (settings.scheduleTimes.marketOpen) {
      const localTimeStr = getLocalTimeForET('09:30');
      triggers.push(`(New-ScheduledTaskTrigger -Weekly -DaysOfWeek ${days} -At '${localTimeStr}')`);
    }
    if (settings.scheduleTimes.midday) {
      const localTimeStr = getLocalTimeForET('12:00');
      triggers.push(`(New-ScheduledTaskTrigger -Weekly -DaysOfWeek ${days} -At '${localTimeStr}')`);
    }
    if (settings.scheduleTimes.close) {
      const localTimeStr = getLocalTimeForET('16:00');
      triggers.push(`(New-ScheduledTaskTrigger -Weekly -DaysOfWeek ${days} -At '${localTimeStr}')`);
    }

    if (triggers.length > 0) {
      try {
        // Escape single quotes for PowerShell single-quoted strings ('' = literal ').
        const safeExe = exePath.replace(/'/g, "''");
        const psCommand = `
          $action = New-ScheduledTaskAction -Execute '${safeExe}' -Argument '--scheduled-scrape'
          $triggers = @(
            ${triggers.join(',\n            ')}
          )
          $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -WakeToRun
          Register-ScheduledTask -TaskName '${consolidatedTaskName}' -Action $action -Trigger $triggers -Settings $settings -Force
        `;
        await execFileAsync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommand]);
        console.log(`[scheduler] Created consolidated Windows Task Scheduler task "${consolidatedTaskName}" with ${triggers.length} trigger(s) (StartWhenAvailable=true)`);
      } catch (err: any) {
        console.error(`[scheduler] Failed to create consolidated task "${consolidatedTaskName}":`, err.message || err);
      }
    }
  }
}

/**
 * (Re)configure the scheduler from settings. Call again whenever settings change.
 */
export function configureScheduler(
  settings: AppSettings,
  triggerMain: () => void,
  triggerNews: () => void,
): void {
  stopScheduler();

  // Synchronize Windows Task Scheduler tasks in background
  syncTaskScheduler(settings).catch((err) => {
    console.error('[scheduler] Task Scheduler sync failed:', err);
  });

  if (!settings.scheduleEnabled) return;

  const add = (expr: string) => {
    const task = cron.schedule(expr, triggerMain, { timezone: TIMEZONE });
    tasks.push(task);
  };

  if (settings.scheduleTimes.marketOpen) add(CRON_TIMES.marketOpen);
  if (settings.scheduleTimes.midday) add(CRON_TIMES.midday);
  if (settings.scheduleTimes.close) add(CRON_TIMES.close);

  // Live News cron: every 15 minutes (24/7). A fresh headless browser launch +
  // x.com scrape every 5 min was heavy and a bot-detection trigger; the scrape is
  // also single-flighted (see runTwitterScrape) so overlapping ticks are no-ops.
  const newsTask = cron.schedule('*/15 * * * *', triggerNews);
  tasks.push(newsTask);

  // Trigger news scrape immediately on startup/config
  Promise.resolve().then(triggerNews).catch(() => undefined);
}

/** Human-readable summary of the next scheduled runs (for the UI/logs). */
export function describeSchedule(settings: AppSettings): string[] {
  if (!settings.scheduleEnabled) return [];
  const out: string[] = [];
  if (settings.scheduleTimes.marketOpen) out.push('9:30 AM ET — Market Open');
  if (settings.scheduleTimes.midday) out.push('12:00 PM ET — Midday');
  if (settings.scheduleTimes.close) out.push('4:00 PM ET — Market Close');
  return out;
}
