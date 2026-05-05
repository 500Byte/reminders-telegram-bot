import { D1Database } from '@cloudflare/workers-types';

export async function getEffectiveTimezone(db: D1Database, chat_id: string, user_id: string): Promise<string> {
    const userSettings = await db.prepare("SELECT timezone FROM user_settings WHERE target_id = ?").bind(user_id).first<{timezone: string}>();
    if (userSettings?.timezone) return userSettings.timezone;

    const chatSettings = await db.prepare("SELECT timezone FROM user_settings WHERE target_id = ?").bind(chat_id).first<{timezone: string}>();
    return chatSettings?.timezone || 'UTC';
}
