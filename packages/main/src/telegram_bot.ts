import TelegramUpdate from './types/TelegramUpdate.js';
import TelegramExecutionContext from './telegram_execution_context.js';
import Webhook from './webhook.js';

/** Class representing a telegram bot. */
export default class TelegramBot {
  /** The telegram token */
  token: string;
  /** The telegram api URL */
  api: URL;
  /** The telegram webhook object */
  webhook: Webhook = new Webhook('', new Request('http://127.0.0.1'));
  /** The telegram update object */
  update: TelegramUpdate = new TelegramUpdate({});
  /** The telegram commands record map */
  commands: Record<string, (ctx: TelegramExecutionContext) => Promise<Response>> = {};
  /** The current bot context */
  currentContext!: TelegramExecutionContext;
  /** Default command to use when no matching command is found */
  defaultCommand = ':message';

  /**
   *	Create a bot
   *	@param token - the telegram secret token
   *	@param options - optional configuration for the bot
   */
  constructor(token: string, options?: { defaultCommand?: string }) {
    this.token = token;
    this.api = new URL('https://api.telegram.org/bot' + token);

    if (options?.defaultCommand) {
      this.defaultCommand = options.defaultCommand;
    }

    // Register default handler for the default command to avoid errors
    this.commands[this.defaultCommand] = () => Promise.resolve(new Response('Command not implemented'));
  }

  /**
   * Register a function on the bot
   * @param event - the event or command name
   * @param callback - the bot context
   */
  on(event: string, callback: (ctx: TelegramExecutionContext) => Promise<Response>) {
    this.commands[event] = callback;
    return this;
  }

  /**
   * Register multiple command handlers at once
   * @param handlers - object mapping command names to handler functions
   */
  registerHandlers(handlers: Record<string, (ctx: TelegramExecutionContext) => Promise<Response>>) {
    for (const [event, callback] of Object.entries(handlers)) {
      this.on(event, callback);
    }
    return this;
  }

  /**
   * Determine the command from the update
   * @param ctx - the execution context
   * @param args - command arguments
   * @returns the command string
   */
  private determineCommand(ctx: TelegramExecutionContext, args: string[]): string {
    // First check if it's a special update type
    switch (ctx.update_type) {
      case 'photo':
        return ':photo' in this.commands ? ':photo' : this.defaultCommand;
      case 'document':
        return ':document' in this.commands ? ':document' : this.defaultCommand;
      case 'callback':
        return ':callback' in this.commands ? ':callback' : this.defaultCommand;
      case 'inline':
        return ':inline' in this.commands ? ':inline' : this.defaultCommand;
    }

    // Then check if it's a command starting with /
    if (args[0].startsWith('/')) {
      const command = args[0].substring(1, args[0].lastIndexOf('@') > -1 ? args[0].lastIndexOf('@') : args[0].length);
      return command in this.commands ? command : this.defaultCommand;
    }

    return this.defaultCommand;
  }

  /**
   * Parse arguments from the update
   * @param ctx - the execution context
   * @returns array of argument strings
   */
  private parseArguments(ctx: TelegramExecutionContext): string[] {
    switch (ctx.update_type) {
      case 'message':
      case 'business_message':
        return this.update.message?.text?.split(' ') ?? [];
      case 'inline':
        return this.update.inline_query?.query.split(' ') ?? [];
      default:
        return [];
    }
  }

  /**
   * Handle a request on a given bot
   * @param request - the request to handle
   */
  async handle(request: Request): Promise<Response> {
    this.webhook = new Webhook(this.token, request);
    const url = new URL(request.url);

    // Check if the request is for this bot
    if (`/${this.token}` !== url.pathname) {
      return new Response('Invalid token', { status: 404 });
    }

    // Handle different HTTP methods
    switch (request.method) {
      case 'POST': {
        try {
          this.update = await request.json();
          console.log(this.update);

          const ctx = new TelegramExecutionContext(this, this.update);
          this.currentContext = ctx;

          const args = this.parseArguments(ctx);
          const command = this.determineCommand(ctx, args);

          return await this.commands[command](ctx);
        } catch (error) {
          console.error('Error handling Telegram update:', error);
          return new Response('Error processing request', { status: 500 });
        }
      }

      case 'GET': {
        const command = url.searchParams.get('command');
        if (command === 'set') {
          return this.webhook.set();
        }
        return new Response('Invalid command', { status: 400 });
      }

      default:
        return new Response('Method not allowed', { status: 405 });
    }
  }
}
