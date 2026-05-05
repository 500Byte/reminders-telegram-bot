# Reminders Telegram Bot

A Telegram bot designed for scheduling and managing reminders within groups, powered by **Cloudflare Workers** and **D1 Database**.

## Features

- **Flexible Scheduling**: Set reminders using relative time (`10m`, `2h`) or absolute time (`18:30`).
- **Recurrence**: Support for daily reminders.
- **Timezone Management**: User-specific and chat-specific timezone configurations (`/timezone Europe/Madrid`).
- **Interactive Buttons**: Manage reminders directly from the notification (Done, Snooze, Delete).
- **Group Permissions**: Only the creator of a reminder or group administrators can manage it.
- **Scalable**: Uses Cloudflare D1 for persistence and Cron Triggers for reliable delivery.

## Commands

- `/recordar [tiempo] [mensaje]`: Schedule a new reminder.
- `/lista`: See all active reminders in the current group.
- `/timezone [IANA_TZ]`: Set your personal or group timezone.
- `/ayuda`: Show help and examples.

## Setup

1. **Clone and Install**:
   ```sh
   git clone https://github.com/500Byte/reminders-telegram-bot.git
   cd reminders-telegram-bot
   npm install
   ```

2. **Database Setup**:
   ```sh
   npx wrangler d1 create reminders-db
   # Copy the database_id to wrangler.toml
   npx wrangler d1 execute reminders-db --file=schema.sql --local
   npx wrangler d1 execute reminders-db --file=schema.sql --remote
   ```

3. **Configure Secrets**:
   ```sh
   npx wrangler secret put SECRET_TELEGRAM_API_TOKEN
   ```

4. **Deploy**:
   ```sh
   npx wrangler deploy
   ```

5. **Set Webhook**:
   Open the following URL in your browser:
   `https://reminders-telegram-bot.<your-username>.workers.dev/<SECRET_TELEGRAM_API_TOKEN>?command=set`

## Tech Stack

- **Cloudflare Workers**: Serverless execution.
- **Cloudflare D1**: SQLite-based relational database.
- **TypeScript**: Type-safe development.
- **Telegram Bot API**: Interaction layer.

---
Built with ❤️ for productivity.
