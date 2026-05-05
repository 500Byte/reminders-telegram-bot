CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    message TEXT NOT NULL,
    scheduled_at INTEGER NOT NULL,
    recurrence TEXT DEFAULT 'none',
    status TEXT DEFAULT 'active',
    created_at INTEGER NOT NULL,
    fail_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_settings (
    target_id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    timezone TEXT DEFAULT 'UTC'
);
