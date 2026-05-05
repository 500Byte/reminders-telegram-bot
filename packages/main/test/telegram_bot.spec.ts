import { describe, it, expect } from 'vitest';
import TelegramBot from '../src/telegram_bot';

describe('telegram bot', () => {
  // Test for inline query handling
  it('inline response', async () => {
    const bot = new TelegramBot('123456789').on(':message', async () => {
      return Promise.resolve(new Response('ok'));
    });
    const request = new Request('http://example.com/123456789', {
      method: 'POST',
      body: JSON.stringify({ inline_query: { query: 'hello' } }),
    });
    expect(await (await bot.handle(request)).text()).toBe('ok');
    expect(bot.currentContext.update_type).toBe('inline');
  });

  // Test for message handling
  it('message response', async () => {
    const bot = new TelegramBot('123456789').on(':message', async () => {
      return Promise.resolve(new Response('ok'));
    });
    const request = new Request('http://example.com/123456789', {
      method: 'POST',
      body: JSON.stringify({ message: { text: 'hello' } }),
    });
    expect(await (await bot.handle(request)).text()).toBe('ok');
    expect(bot.currentContext.update_type).toBe('message');
  });
});
