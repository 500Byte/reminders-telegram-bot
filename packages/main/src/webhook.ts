/**
 * Webhook class for managing Telegram bot webhook configuration.
 * Handles setting up and configuring webhooks for Telegram bots.
 */
export default class Webhook {
  /** Base URL for the Telegram Bot API */
  private readonly api: URL;

  /** Webhook URL that Telegram will send updates to */
  private readonly webhook: URL;

  /**
   * Creates a new Webhook instance.
   *
   * @param token - The Telegram bot token
   * @param request - The incoming request object used to determine the webhook URL
   */
  constructor(token: string, request: Request) {
    this.api = new URL(`https://api.telegram.org/bot${token}`);
    this.webhook = new URL(`${new URL(request.url).origin}/${token}`);
  }

  /**
   * Sets the webhook URL for the Telegram bot.
   *
   * @returns Promise that resolves to the fetch response from Telegram
   * @throws Will throw an error if the fetch request fails
   */
  async set(): Promise<Response> {
    const baseUrl = this.api.toString();
    const url = new URL(`${baseUrl}${baseUrl.endsWith('/') ? '' : '/'}setWebhook`);

    // Configure webhook parameters
    const params = new URLSearchParams({
      url: this.webhook.toString(),
      max_connections: '100',
      allowed_updates: JSON.stringify(['message', 'inline_query', 'business_message', 'business_connection']),
      drop_pending_updates: 'true',
    });

    try {
      return await fetch(`${url.toString()}?${params.toString()}`);
    } catch (error) {
      console.error('Failed to set webhook:', error);
      throw error;
    }
  }

  /**
   * Removes the webhook configuration from Telegram.
   *
   * @returns Promise that resolves to the fetch response from Telegram
   * @throws Will throw an error if the fetch request fails
   */
  async delete(): Promise<Response> {
    const baseUrl = this.api.toString();
    const url = new URL(`${baseUrl}${baseUrl.endsWith('/') ? '' : '/'}deleteWebhook`);

    try {
      return await fetch(url.toString());
    } catch (error) {
      console.error('Failed to delete webhook:', error);
      throw error;
    }
  }
}
