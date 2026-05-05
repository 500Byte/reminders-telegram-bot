import TelegramInlineQueryResultArticle from './types/TelegramInlineQueryResultArticle.js';
import TelegramInlineQueryResultPhoto from './types/TelegramInlineQueryResultPhoto.js';
import TelegramInlineQueryResultVideo from './types/TelegramInlineQueryResultVideo.js';

/** Interface for common Telegram API parameters */
interface TelegramApiBaseParams {
  chat_id: number | string;
  business_connection_id?: string | number;
}

/** Interface for message parameters */
interface SendMessageParams extends TelegramApiBaseParams {
  text: string;
  parse_mode: string;
  reply_to_message_id?: number | string;
  disable_web_page_preview?: boolean;
  disable_notification?: boolean;
  protect_content?: boolean;
  reply_markup?: object;
}

/** Interface for message draft parameters */
interface SendMessageDraftParams extends SendMessageParams {
  draft_id: number;
}

/** Interface for photo parameters */
interface SendPhotoParams extends TelegramApiBaseParams {
  photo: string;
  caption?: string;
  parse_mode?: string;
  reply_to_message_id?: number | string;
  disable_notification?: boolean;
  protect_content?: boolean;
  reply_markup?: object;
}

/** Interface for video parameters */
interface SendVideoParams extends TelegramApiBaseParams {
  video: string;
  caption?: string;
  parse_mode?: string;
  reply_to_message_id?: number | string;
  disable_notification?: boolean;
  protect_content?: boolean;
  reply_markup?: object;
}

/** Interface for chat action parameters */
interface SendChatActionParams extends TelegramApiBaseParams {
  action: string;
}

/** Interface for callback query parameters */
interface AnswerCallbackParams {
  callback_query_id: number | string;
  text?: string;
  show_alert?: boolean;
  url?: string;
  cache_time?: number;
}

/** Interface for inline query parameters */
interface AnswerInlineParams {
  inline_query_id: number | string;
  results: TelegramInlineQueryResultArticle[] | TelegramInlineQueryResultPhoto[] | TelegramInlineQueryResultVideo[];
  cache_time?: number;
  is_personal?: boolean;
  next_offset?: string;
}

/** Type for all possible API parameters */
type TelegramApiParams =
  | SendMessageParams
  | SendPhotoParams
  | SendVideoParams
  | SendChatActionParams
  | AnswerCallbackParams
  | AnswerInlineParams
  | Record<string, unknown>;

/** Class representing the Telegram API and all its methods */
export default class TelegramApi {
  /**
   * Get the API URL for a given bot API and slug
   * @param botApi - full URL to the telegram API without slug
   * @param slug - slug to append to the API URL
   * @param data - data to append to the request
   * @returns Request object with the full URL and parameters
   */
  getApiUrl(botApi: string, slug: string, data: TelegramApiParams): Request {
    const request = new URL(botApi + (slug.startsWith('/') || botApi.endsWith('/') ? '' : '/') + slug);
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        params.append(key, typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value));
      }
    }

    return new Request(`${request.toString()}?${params.toString()}`);
  }

  /**
   * Send a chat action to indicate the bot is doing something
   * @param botApi - full URL to the telegram API without slug
   * @param data - data to append to the request
   * @returns Promise with the API response
   */
  async sendChatAction(botApi: string, data: SendChatActionParams): Promise<Response> {
    const url = this.getApiUrl(botApi, 'sendChatAction', data);
    return await fetch(url);
  }

  /**
   * Get a file with a given file_id
   * @param botApi - full URL to the telegram API without slug
   * @param data - data to append to the request
   * @param token - bot token
   * @returns Promise with the file response
   */
  async getFile(botApi: string, data: { file_id: string } & Record<string, number | string | boolean>, token: string): Promise<Response> {
    if (!data.file_id || data.file_id === '') {
      return new Response('No file_id provided', { status: 400 });
    }

    try {
      const url = this.getApiUrl(botApi, 'getFile', data);
      const response = await fetch(url);

      if (!response.ok) {
        return new Response(`API error: ${String(response.status)} ${response.statusText}`, { status: response.status });
      }

      const json: { ok: boolean; result?: { file_path: string }; description?: string } = await response.json();

      if (!json.ok || !json.result?.file_path) {
        return new Response(json.description ?? 'Failed to get file path', { status: 400 });
      }

      return await fetch(`https://api.telegram.org/file/bot${token}/${json.result.file_path}`);
    } catch (e) {
      console.error(`Error in getFile: ${e instanceof Error ? e.message : String(e)}`);
      return new Response(`Error retrieving file: ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
    }
  }

  /**
   * Send a message to a given botApi
   * @param botApi - full URL to the telegram API without slug
   * @param data - data to append to the request
   * @returns Promise with the API response
   */
  async sendMessage(botApi: string, data: SendMessageParams): Promise<Response> {
    const url = this.getApiUrl(botApi, 'sendMessage', data);
    return await fetch(url);
  }

  /**
   * Send a video message to a given botApi
   * @param botApi - full URL to the telegram API without slug
   * @param data - data to append to the request
   * @returns Promise with the API response
   */
  async sendVideo(botApi: string, data: SendVideoParams): Promise<Response> {
    const url = this.getApiUrl(botApi, 'sendVideo', data);
    return await fetch(url);
  }

  /**
   * Send a photo message to a given botApi
   * @param botApi - full URL to the telegram API without slug
   * @param data - data to append to the request
   * @returns Promise with the API response
   */
  async sendPhoto(botApi: string, data: SendPhotoParams): Promise<Response> {
    const url = this.getApiUrl(botApi, 'sendPhoto', data);
    return await fetch(url);
  }

  /**
   * Send an inline response to a given botApi
   * @param botApi - full URL to the telegram API without slug
   * @param data - data to append to the request
   * @returns Promise with the API response
   */
  async answerInline(botApi: string, data: AnswerInlineParams): Promise<Response> {
    const url = this.getApiUrl(botApi, 'answerInlineQuery', {
      inline_query_id: data.inline_query_id,
      results: data.results,
      cache_time: data.cache_time,
      is_personal: data.is_personal,
      next_offset: data.next_offset,
    });
    return await fetch(url);
  }

  /**
   * Send a callback response to a given botApi
   * @param botApi - full URL to the telegram API without slug
   * @param data - data to append to the request
   * @returns Promise with the API response
   */
  async answerCallback(botApi: string, data: AnswerCallbackParams): Promise<Response> {
    const url = this.getApiUrl(botApi, 'answerCallbackQuery', data);
    return await fetch(url);
  }

  /**
   * Delete a message
   * @param botApi - full URL to the telegram API without slug
   * @param data - data to append to the request
   * @returns Promise with the API response
   */
  async deleteMessage(botApi: string, data: { chat_id: number | string; message_id: number }): Promise<Response> {
    const url = this.getApiUrl(botApi, 'deleteMessage', data);
    return await fetch(url);
  }

  /**
   * Edit a message text
   * @param botApi - full URL to the telegram API without slug
   * @param data - data to append to the request
   * @returns Promise with the API response
   */
  async editMessageText(
    botApi: string,
    data: {
      chat_id?: number | string;
      message_id?: number;
      inline_message_id?: string;
      text: string;
      parse_mode?: string;
      disable_web_page_preview?: boolean;
      reply_markup?: object;
    },
  ): Promise<Response> {
    const url = this.getApiUrl(botApi, 'editMessageText', data);
    return await fetch(url);
  }

  /**
   * Get information about a member of a chat.
   * @param botApi - full URL to the telegram API without slug
   * @param data - data to append to the request
   * @returns Promise with the API response
   */
  async getChatMember(botApi: string, data: { chat_id: number | string; user_id: number }): Promise<Response> {
    const url = this.getApiUrl(botApi, 'getChatMember', data);
    return await fetch(url);
  }

  async sendMessageDraft(
    botApi: string,
    data: SendMessageDraftParams,
  ): Promise<Response> {
    const url = this.getApiUrl(botApi, 'sendMessageDraft', data);
    return await fetch(url);
  }
}
