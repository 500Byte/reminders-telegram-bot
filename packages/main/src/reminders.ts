import { D1Database } from '@cloudflare/workers-types';

export function parseTime(text: string, timezone: string): number | null {
    const now = Math.floor(Date.now() / 1000);
    
    // Relative: 10m, 1h, 1d, 1w
    const relativeMatch = /^(\d+)([mhdw])$/.exec(text);
    if (relativeMatch) {
        const value = parseInt(relativeMatch[1]);
        const unit = relativeMatch[2];
        const multipliers: Record<string, number> = { m: 60, h: 3600, d: 86400, w: 604800 };
        return now + value * multipliers[unit];
    }
    
    // Absolute: HH:MM
    const absoluteMatch = /^(\d{1,2}):(\d{2})$/.exec(text);
    if (absoluteMatch) {
        const hours = parseInt(absoluteMatch[1]);
        const minutes = parseInt(absoluteMatch[2]);
        
        const d = new Date();
        // Convert current time to target timezone
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            hour12: false
        });
        
        const parts = formatter.formatToParts(d);
        const dateParts: Record<string, number> = {};
        parts.forEach(part => {
            if (part.type !== 'literal') {
                dateParts[part.type] = parseInt(part.value);
            }
        });

        // Create target date in that timezone
        // Note: This is tricky in JS. A simple way is to use the parts to build a date
        // and then adjust for the offset, or just use the parts to calculate the target timestamp.
        
        // We need to account for the timezone offset of 'timezone' relative to UTC at that target time.
        // A better way is to use the fact that we want "today at HH:MM in timezone".
        
        // Let's use the toLocaleString trick from the prompt but carefully.
        
        // Construct target date string for the target timezone
        
        // This is still hard because we don't know the offset.
        // Let's use a simpler approach: 
        // 1. Get current time in target timezone as a Date object that "looks like" that time in UTC.
        // 2. Set hours/minutes.
        // 3. Convert back? No.
        
        // Actually, the easiest way to get "timestamp for 10:00 in Europe/Madrid" is:
        // new Date("2023-10-27T10:00:00").toLocaleString("en-US", {timeZone: "Europe/Madrid"}) ... no.
        
        // Let's stick to the prompt's suggested implementation if possible, 
        // but it has a bug: new Date(d.toLocaleString(...)) creates a date in LOCAL timezone 
        // that matches the STRING of the target timezone.
        
        const localNow = new Date();
        const targetNowStr = localNow.toLocaleString('en-US', { timeZone: timezone, hour12: false });
        const targetNow = new Date(targetNowStr); // This is local timezone now, but hours match target timezone
        
        targetNow.setHours(hours, minutes, 0, 0);
        
        let targetTs = Math.floor(targetNow.getTime() / 1000);
        const nowTsInTarget = Math.floor(new Date(targetNowStr).getTime() / 1000);

        if (targetTs <= nowTsInTarget) {
            targetTs += 86400;
        }
        
        // Now targetTs is "timestamp if UTC was the target timezone". 
        // We need to adjust it by the difference between local and target timezone.
        const offset = (new Date(targetNowStr).getTime() - localNow.getTime());
        return targetTs - Math.floor(offset / 1000);
    }
    
    return null;
}

export async function addReminder(db: D1Database, reminder: {
    chat_id: string,
    user_id: string,
    message: string,
    scheduled_at: number,
    recurrence: string
}) {
    return await db.prepare(
        "INSERT INTO reminders (chat_id, user_id, message, scheduled_at, recurrence, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(
        reminder.chat_id,
        reminder.user_id,
        reminder.message,
        reminder.scheduled_at,
        reminder.recurrence,
        Math.floor(Date.now() / 1000)
    ).run();
}
