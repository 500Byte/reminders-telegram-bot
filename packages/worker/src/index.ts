import TelegramBot, { TelegramExecutionContext, TelegramApi, getEffectiveTimezone, parseTime, addReminder } from '../../main/src/main.js';
import { marked } from 'marked';

export interface Environment {
	SECRET_TELEGRAM_API_TOKEN: string;
	SECRET_TELEGRAM_API_TOKEN2: string;
	SECRET_TELEGRAM_API_TOKEN3: string;
	AI: Ai;
	DB: D1Database;
	R2: R2Bucket;
}

type promiseFunc<T> = (resolve: (result: T) => void, reject: (e?: Error) => void) => Promise<T>;

/**
 * Wrap setTimeout in a Promise
 * @param func - function to call after setTimeout
 * @param time - delay in milliseconds (default: 1000)
 */
function wrapPromise<T>(func: promiseFunc<T>, time = 1000) {
	return new Promise((resolve, reject) => {
		setTimeout(() => {
			func(resolve, reject).catch((e: unknown) => {
				console.error('Error in wrapPromise:', e);
			});
		}, time);
	});
}

/**
 * Convert markdown to html that Telegram can parse
 * @param s - the string containing markdown
 * @returns HTML formatted string compatible with Telegram
 */
async function markdownToHtml(s: string): Promise<string> {
	marked.setOptions(marked.getDefaults());
	const parsed = (await marked.parse(s)) as string | { toString(): string };
	const parsedString = typeof parsed === 'string' ? parsed : parsed.toString();
	const tagsToRemove = ['p', 'ol', 'ul', 'li', 'h1', 'h2', 'h3'];
	const tagPattern = new RegExp(tagsToRemove.map((tag) => `<${tag}>|</${tag}>`).join('|'), 'g');
	return parsedString.replace(tagPattern, '');
}

/**
 * Stream AI response and send periodic updates via bot.streamReply
 * @param bot - the telegram execution context
 * @param env - the environment
 * @param model - the AI model to use
 * @param messages - the messages to send
 * @returns the full response string
 */
async function streamAiResponse(
	bot: TelegramExecutionContext,
	env: Environment,
	model: string,
	messages: { role: string; content: string }[],
): Promise<string> {
	// @ts-expect-error broken bindings
	const response = (await env.AI.run(model, {
		messages,
		stream: true,
	}));

	const reader = response.getReader();
	const decoder = new TextDecoder();
	const draft_id = Math.floor(Math.random() * 1000000) + 1;
	let fullResponse = '';
	let lastUpdate = 0;

	for (;;) {
		const result = (await reader.read()) as ReadableStreamReadResult<Uint8Array>;
		if (result.done) break;

		const chunk = decoder.decode(result.value);
		const lines = chunk.split('\n');

		for (const line of lines) {
			if (line.startsWith('data: ') && line !== 'data: [DONE]') {
				try {
					const data = JSON.parse(line.slice(6)) as { response: string | undefined };
					if (data.response) {
						fullResponse += data.response;

						if (Date.now() - lastUpdate > 1000) {
							await bot.streamReply(await markdownToHtml(fullResponse), draft_id, 'HTML');
							lastUpdate = Date.now();
						}
					}
				} catch (e) {
					console.error('Error parsing AI stream:', e);
				}
			}
		}
	}
	return fullResponse;
}

async function streamAiResponseGemma(
	bot: TelegramExecutionContext,
	env: Environment,
	model: string,
	messages: { role: string; content: string }[],
	max_completion_tokens?: number,
): Promise<string> {
	// @ts-expect-error broken bindings
	const response = (await env.AI.run(model, {
		messages,
		stream: true,
		max_completion_tokens
	})) as ReadableStream;

	const reader = response.getReader();
	const decoder = new TextDecoder();
	const draft_id = Math.floor(Math.random() * 1000000) + 1;
	let fullResponse = '';
	let lastUpdate = 0;
	let buffer = '';

	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		let lines = buffer.split('\n');
		buffer = lines.pop() || '';

		for (const line of lines) {
			const trimmedLine = line.trim();
			if (!trimmedLine || trimmedLine === 'data: [DONE]') continue;

			if (trimmedLine.startsWith('data: ')) {
				try {
					const data = JSON.parse(trimmedLine.slice(6));
					
					// Use the new OpenAI-style path or the legacy response key
					const content = data.choices?.[0]?.delta?.content ?? data.response ?? '';

					if (content) {
						fullResponse += content;

						// Throttle updates to Telegram (1000ms is sensible to avoid rate limits)
						if (Date.now() - lastUpdate > 1000) {
							await bot.streamReply(await markdownToHtml(fullResponse), draft_id, 'HTML');
							lastUpdate = Date.now();
						}
					}
				} catch (e) {
					// We ignore parse errors for lines that aren't valid JSON (like heartbeats)
					console.error('Error parsing AI stream chunk:', e);
				}
			}
		}
	}
	
	// Final update to ensure the message is complete in Telegram
	try {
		const timeToWait = Math.max(0, 1000 - (Date.now() - lastUpdate));
		if (timeToWait > 0) {
			await new Promise(resolve => setTimeout(resolve, timeToWait));
		}
		
		// Also process any leftover buffer just in case
		if (buffer.trim()) {
			const trimmedLine = buffer.trim();
			if (trimmedLine.startsWith('data: ') && trimmedLine !== 'data: [DONE]') {
				try {
					const data = JSON.parse(trimmedLine.slice(6));
					const content = data.choices?.[0]?.delta?.content ?? data.response ?? '';
					if (content) fullResponse += content;
				} catch(e) {}
			}
		}
		
		await bot.streamReply(await markdownToHtml(fullResponse), draft_id, 'HTML');
	} catch (e) {
		console.error('Final streamReply failed:', e);
	}
	
	return fullResponse;
}

// Constants for system prompts
const SYSTEM_PROMPTS = {
	TUX_ROBOT: 'You are a friendly assistant named TuxRobot.',
	SEAN: 'You are a friendly person named Sean. Sometimes just acknowledge messages with okay. You are working on coding a cool telegram bot.',
};

// AI model constants
const AI_MODELS = {
	LLAMA: '@cf/meta/llama-3.2-11b-vision-instruct',
	CODER: '@hf/thebloke/deepseek-coder-6.7b-instruct-awq',
	FLUX: '@cf/black-forest-labs/flux-1-schnell',
	STABLE_DIFFUSION: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
	GEMMA: '@cf/google/gemma-4-26b-a4b-it',
};

export default {
	fetch: async (request: Request, env: Environment, ctx: ExecutionContext) => {
		const tuxrobot = new TelegramBot(env.SECRET_TELEGRAM_API_TOKEN);
		const duckduckbot = new TelegramBot(env.SECRET_TELEGRAM_API_TOKEN2);
		const translatepartybot = new TelegramBot(env.SECRET_TELEGRAM_API_TOKEN3);

		await Promise.all([
			tuxrobot
				.on(':document', async (bot: TelegramExecutionContext) => {
					const fileId: string = bot.update.message?.document?.file_id ?? '';
					const fileResponse = await bot.getFile(fileId);
					const id = crypto.randomUUID().slice(0, 5);
					await env.R2.put(id, await fileResponse.arrayBuffer());
					await bot.reply(`https://r2.seanbehan.ca/${id}`);
					return new Response('ok');
				})
				.on('epoch', async (bot: TelegramExecutionContext) => {
					if (bot.update_type === 'message') {
						await bot.reply(Math.floor(Date.now() / 1000).toString());
					}
					return new Response('ok');
				})
				.on('start', async (bot: TelegramExecutionContext) => {
				        if (bot.update_type === 'message') {
				                await bot.reply(
				                        'Send me a message to talk to llama3. Use /clear to wipe history. Use /photo to generate a photo. Use /code to generate code.',
				                );
				        }
				        return new Response('ok');
				})
				.on(':callback', async (bot: TelegramExecutionContext) => {
				        const callback_data = bot.update.callback_query?.data;
				        if (!callback_data) return new Response('ok');

				        const parts = callback_data.split('_');
				        const action = parts[0];
				        const reminderId = parts[1];

				        const { results } = await env.DB.prepare("SELECT * FROM reminders WHERE id = ?")
				                .bind(reminderId)
				                .all();

				        const reminder = results[0];
				        if (!reminder) {
				                await bot.answerCallback('Este recordatorio ya no existe', true);
				                return new Response('ok');
				        }

				        const user_id = bot.update.callback_query?.from.id;
				        const chat_id = bot.update.callback_query?.message.chat.id.toString();

				        if (!user_id || !chat_id) return new Response('ok');

				        // Permission check
				        const isCreator = user_id.toString() === reminder.user_id;
				        let isAdmin = false;
				        if (!isCreator) {
				                const memberResponse = await bot.getChatMember(chat_id, user_id);
				                if (memberResponse.ok) {
				                        const memberData = await memberResponse.json() as { ok: boolean, result: { status: string } };
				                        isAdmin = memberData.result.status === 'administrator' || memberData.result.status === 'creator';
				                }
				        }

				        if (!isCreator && !isAdmin) {
				                await bot.answerCallback('No tienes permiso para realizar esta acción', true);
				                return new Response('ok');
				        }

				        const username = bot.update.callback_query?.from.username || bot.update.callback_query?.from.first_name || user_id.toString();

				        if (action === 'done') {
				                if (reminder.recurrence === 'daily') {
				                        // It's already been updated by the scheduler, so we just acknowledge it
				                        await bot.answerCallback('Anotado como completado por hoy');
				                        await bot.editMessageText(`✅ Recordatorio completado por hoy por ${username}:\n\n${reminder.message}`);
				                } else {
				                        await env.DB.prepare("UPDATE reminders SET status = 'completed' WHERE id = ?")
				                                .bind(reminderId)
				                                .run();
				                        await bot.answerCallback('Recordatorio completado');
				                        await bot.editMessageText(`✅ Recordatorio completado por ${username}:\n\n${reminder.message}`);
				                }
				        } else if (action === 'snooze') {
				                const minutes = parseInt(parts[2] || '15');
				                const now = Math.floor(Date.now() / 1000);
				                await env.DB.prepare("UPDATE reminders SET scheduled_at = ?, status = 'active' WHERE id = ?")
				                        .bind(now + (minutes * 60), reminderId)
				                        .run();
				                await bot.answerCallback(`Pospuesto ${minutes} minutos`);
				                await bot.editMessageText(`⏰ Recordatorio pospuesto ${minutes}m por ${username}:\n\n${reminder.message}`);
				        } else if (action === 'delete') {
				                await env.DB.prepare("DELETE FROM reminders WHERE id = ?")
				                        .bind(reminderId)
				                        .run();
				                await bot.answerCallback('Recordatorio eliminado');
				                await bot.deleteMessage(chat_id, bot.update.callback_query?.message.message_id);
				        }

				        return new Response('ok');
				})
				.on('code', async (bot: TelegramExecutionContext) => {					if (bot.update_type === 'message') {
						await bot.sendTyping();
						const prompt = bot.update.message?.text?.toString().split(' ').slice(1).join(' ') ?? '';
						const messages = [{ role: 'user', content: prompt }];

						try {
							// @ts-expect-error broken bindings
							const response = await env.AI.run(AI_MODELS.CODER, { messages });

								// @ts-expect-error broken bindings
							if ('response' in response) {
								await bot.reply(
									await markdownToHtml(
										typeof response.response === 'string' 
											? response.response 
											: JSON.stringify(response.response)
									), 
									'HTML'
								);
							}
						} catch (e) {
							console.error('Error in code handler:', e);
							await bot.reply(`Error: ${e as string}`);
						}
					}
					return new Response('ok');
				})
				.on('clear', async (bot: TelegramExecutionContext) => {
					if (bot.update_type === 'message') {
						await env.DB.prepare('DELETE FROM Messages WHERE userId=?').bind(bot.update.message?.from.id).run();
						await bot.reply('History cleared');
					}
					return new Response('ok');
				})
				.on('timezone', async (bot: TelegramExecutionContext) => {
					const tz = bot.update.message?.text?.split(' ')[1] || 'UTC';
					// Basic validation: check if Intl supports it
					try {
						Intl.DateTimeFormat(undefined, { timeZone: tz });
					} catch (e) {
						return bot.reply('Zona horaria inválida. Ejemplo: Europe/Madrid');
					}
					const target_id = bot.update.message?.chat.id.toString();
					if (!target_id) return bot.reply('Error al identificar el chat');

					// For simplicity, we save it as a chat setting if in a group, or user setting if private
					const type = bot.update.message?.chat.type === 'private' ? 'user' : 'chat';

					await env.DB.prepare('INSERT OR REPLACE INTO user_settings (target_id, type, timezone) VALUES (?, ?, ?)')
						.bind(target_id, type, tz)
						.run();

					return bot.reply(`Zona horaria configurada a ${tz}`);
					})
					.on('recordar', async (bot: TelegramExecutionContext) => {
					if (bot.update_type !== 'message') return new Response('ok');

					const text = bot.update.message?.text?.toString() || '';
					const args = text.split(' ').slice(1);

					if (args.length < 2) {
					        await bot.reply('Uso: /recordar <tiempo> <mensaje>\nEjemplos:\n/recordar 10m Sacar basura\n/recordar 1h Ir al gimnasio\n/recordar 15:30 Recoger niños');
					        return new Response('ok');
					}

					const timeArg = args[0];
					const message = args.slice(1).join(' ');

					const chat_id = bot.update.message?.chat.id.toString() || '';
					const user_id = bot.update.message?.from.id.toString() || '';

					const timezone = await getEffectiveTimezone(env.DB, chat_id, user_id);
					const scheduled_at = parseTime(timeArg, timezone);

					if (!scheduled_at) {
					        await bot.reply('Formato de tiempo inválido. Usa 10m, 1h o HH:MM.');
					        return new Response('ok');
					}

					await addReminder(env.DB, {
					        chat_id,
					        user_id,
					        message,
					        scheduled_at,
					        recurrence: 'none'
					});

					const dateStr = new Date(scheduled_at * 1000).toLocaleString('es-ES', { timeZone: timezone });
					await bot.reply(`Recordatorio guardado para: ${dateStr}\nMensaje: ${message}`);

					return new Response('ok');
					})
					.on(':message', async (bot: TelegramExecutionContext) => {					switch (bot.update_type) {
						case 'message': {
							// await bot.sendTyping();
							const prompt = bot.update.message?.text?.toString() ?? '';

							const { results } = await env.DB.prepare('SELECT * FROM Messages WHERE userId=?')
								.bind(bot.update.message?.from.id)
								.all();
							const messageHistory = results.map((col) => ({ role: 'system', content: col.content as string }));

							const messages = [
								{ role: 'system', content: SYSTEM_PROMPTS.TUX_ROBOT },
								...messageHistory,
								{ role: 'user', content: prompt },
							];

							try {
								console.log('Processing text message:', prompt);
								const response = await streamAiResponseGemma(bot, env, AI_MODELS.GEMMA, messages, 50000);

								if (response) {
									await bot.reply(await markdownToHtml(response), 'HTML');

									await env.DB.prepare('INSERT INTO Messages (id, userId, content) VALUES (?, ?, ?)')
										.bind(crypto.randomUUID(), bot.update.message?.from.id, `[INST] ${prompt} [/INST] \n ${response}`)
										.run();
								}
							} catch (e) {
								console.error('Error in message handler:', e);
								await bot.reply(`Error: ${e as string}`);
							}
							break;
						}

						case 'photo': {
							await bot.sendTyping();
							const photo = bot.update.message?.photo;
							const fileId: string = photo ? photo[photo.length - 1]?.file_id ?? '' : '';
							const prompt = bot.update.message?.caption ?? 'Please describe this image';

							console.log('Processing photo:', { fileId, prompt });

							const { results } = await env.DB.prepare('SELECT * FROM Messages WHERE userId=?')
								.bind(bot.update.message?.from.id)
								.all();
							const messageHistory = results.map((col) => ({ role: 'system', content: col.content as string }));

							const messages = [
								{ role: 'system', content: SYSTEM_PROMPTS.TUX_ROBOT },
								...messageHistory,
								{ role: 'user', content: prompt },
							];

							try {
								const fileResponse = await bot.getFile(fileId);
								const blob = await fileResponse.arrayBuffer();
								// @ts-expect-error broken bindings
								const response = await env.AI.run(AI_MODELS.GEMMA, { 
									messages, 
									image: [...new Uint8Array(blob)] 
								});

								// @ts-expect-error broken bindings
								if ('response' in response && response.response) {
									await bot.reply(
										await markdownToHtml(
											typeof response.response === 'string' 
												? response.response 
												: JSON.stringify(response.response)
										), 
										'HTML'
									);

									await env.DB.prepare('INSERT INTO Messages (id, userId, content) VALUES (?, ?, ?)')
										.bind(
											crypto.randomUUID(), 
											bot.update.message?.from.id, 
											`'[INST] ${prompt} [/INST] \n ${typeof response.response === 'string' ? response.response : JSON.stringify(response.response)}'`
										)
										.run();
								}
							} catch (e) {
								console.error('Error in photo handler:', e);
								await bot.reply(`Error processing image: ${e as string}`);
							}
							break;
						}

						case 'inline': {
							const query = bot.update.inline_query?.query.toString() ?? '';
							
							// Check if query ends with proper punctuation
							if (!query.endsWith('.') && !query.endsWith('?')) {
								await bot.replyInline(
									"Please complete your sentence",
									"End your sentence with a period (.) or question mark (?) to get an AI response",
									'HTML'
								);
								break;
							}

							const messages = [
								{ role: 'system', content: SYSTEM_PROMPTS.TUX_ROBOT },
								{ role: 'user', content: query },
							];

							try {
								// @ts-expect-error broken bindings
								const response = await env.AI.run(AI_MODELS.LLAMA, { messages, max_completion_tokens: 100 });

								// @ts-expect-error broken bindings
								if ('response' in response) {
									await bot.replyInline(
										(typeof response.response === 'string' ? response.response : ''),
										await markdownToHtml(typeof response.response === 'string' ? response.response : ''),
										'HTML'
									);
								}
							} catch (e) {
								console.error('Error in inline handler:', e);
								await bot.reply(`Error: ${e as string}`);
							}
							break;
						}

						case 'business_message': {
							await bot.sendTyping();
							const photo = bot.update.business_message?.photo;
							const fileId: string = photo ? photo[photo.length - 1]?.file_id ?? '' : '';
							const prompt = bot.update.business_message?.text?.toString() ?? bot.update.business_message?.caption ?? '';

							if (bot.update.business_message?.from.id !== 69148517) {
								const { results } = await env.DB.prepare('SELECT * FROM Messages WHERE userId=?')
									.bind(bot.update.business_message?.from.id)
									.all();

								const messageHistory = results.map((col) => ({ role: 'system', content: col.content as string }));
								const messages = [{ role: 'system', content: SYSTEM_PROMPTS.SEAN }, ...messageHistory, { role: 'user', content: prompt }];

								try {
									let response;
									
									if (fileId) {
										const fileResponse = await bot.getFile(fileId);
										const blob = await fileResponse.arrayBuffer();
										// @ts-expect-error broken bindings
										response = await env.AI.run(AI_MODELS.LLAMA, { messages, image: [...new Uint8Array(blob)] });
									} else {
										// @ts-expect-error broken bindings
										response = await env.AI.run(AI_MODELS.LLAMA, { messages });
									}

								// @ts-expect-error broken bindings
									if ('response' in response && response.response) {
										await bot.reply(
											await markdownToHtml(
												typeof response.response === 'string' 
													? response.response 
													: JSON.stringify(response.response)
											), 
											'HTML'
										);

										await env.DB.prepare('INSERT INTO Messages (id, userId, content) VALUES (?, ?, ?)')
											.bind(
												crypto.randomUUID(), 
												bot.update.business_message?.from.id, 
												`'[INST] ${prompt} [/INST] \n ${typeof response.response === 'string' ? response.response : JSON.stringify(response.response)}'`
											)
											.run();
									}
								} catch (e) {
									console.error('Error in business message handler:', e);
									await bot.reply(`Error: ${e as string}`);
								}
							}
							break;
						}
					}
					return new Response('ok');
				})
				.on('photo', async (bot: TelegramExecutionContext) => {
					if (bot.update_type === 'message') {
						await bot.sendTyping();
						const prompt = bot.update.message?.text?.toString() ?? '';

						try {
							// @ts-expect-error broken bindings
							const photo = (await env.AI.run(AI_MODELS.FLUX, { prompt, steps: 8 })) as { image: string };

							const binaryString = atob(photo.image);
							// @ts-expect-error broken bindings
							const img = Uint8Array.from(binaryString, (m) => m.codePointAt(0));
							const photoFile = new File([await new Response(img).blob()], 'photo');
							const id = crypto.randomUUID();

							await env.R2.put(id, photoFile);
							console.log(`https://r2.seanbehan.ca/${id}`);
							await bot.replyPhoto(`https://r2.seanbehan.ca/${id}`);

							ctx.waitUntil(
								wrapPromise(async () => {
									await env.R2.delete(id);
								}, 500),
							);
						} catch (e) {
							console.error('Error in photo handler:', e);
							await bot.reply(`Error: ${e as string}`);
						}
					}
					return new Response('ok');
				})
				.handle(request.clone()),

			duckduckbot
				.on(':message', async (bot: TelegramExecutionContext) => {
					switch (bot.update_type) {
						case 'message': {
							await bot.reply('https://duckduckgo.com/?q=' + encodeURIComponent(bot.update.message?.text?.toString() ?? ''));
							break;
						}
						case 'inline': {
							await bot.reply('https://duckduckgo.com/?q=' + encodeURIComponent(bot.update.inline_query?.query ?? ''));
							break;
						}
					}
					return new Response('ok');
				})
				.handle(request.clone()),

			translatepartybot
				.on(':message', async (bot: TelegramExecutionContext) => {
					switch (bot.update_type) {
						case 'inline': {
							try {
								const query = encodeURIComponent(bot.update.inline_query?.query.toString() ?? '');
								const response = await fetch(
									`https://translate.googleapis.com/translate_a/single?sl=auto&tl=en&dt=t&dj=1&prev=input&ie=utf-8&oe=utf-8&client=gtx&q=${query}`,
								);

								const json = await response.json();
								const translatedText = (json as { sentences: [{ trans: string; orig: string; backend: number }] }).sentences[0].trans;

								await bot.reply(translatedText);
							} catch (e) {
								console.error('Error in translate handler:', e);
								await bot.reply(`Translation error: ${e as string}`);
							}
							break;
						}
						case 'message':
							await bot.reply('Use me in inline mode by typing @TranslatePartyBot and the text you want to translate.');
							break;
					}
					return new Response('ok');
				})
				.handle(request.clone()),
		]);

		return new Response('ok');
	},

	scheduled: async (event: ScheduledEvent, env: Environment, ctx: ExecutionContext) => {
	        const api = new TelegramApi();
	        const botApi = `https://api.telegram.org/bot${env.SECRET_TELEGRAM_API_TOKEN}`;
	        const now = Math.floor(Date.now() / 1000);

	        // Query D1 for active reminders that are due, limit to 50
	        const { results } = await env.DB.prepare(
	                "SELECT * FROM reminders WHERE status = 'active' AND scheduled_at <= ? LIMIT 50"
	        )
	                .bind(now)
	                .all();

	        for (const reminder of results) {
	                ctx.waitUntil((async () => {
	                        try {
	                                const response = await api.sendMessage(botApi, {
	                                        chat_id: reminder.chat_id as string,
	                                        text: `🔔 <b>Recordatorio:</b>\n\n${reminder.message}`,
	                                        parse_mode: 'HTML',
	                                        reply_markup: {
	                                                inline_keyboard: [
	                                                        [
	                                                                { text: '✅ Hecho', callback_data: `done_${reminder.id}` },
	                                                                { text: '⏰ Posponer 15m', callback_data: `snooze_${reminder.id}_15` },
	                                                                { text: '🗑️ Eliminar', callback_data: `delete_${reminder.id}` }
	                                                        ]
	                                                ]
	                                        }
	                                });

	                                if (!response.ok) {
	                                        const errorData = await response.json() as { description?: string; error_code?: number };
	                                        console.error(`Failed to send reminder ${reminder.id}:`, errorData);

	                                        if (errorData.error_code === 403 || errorData.error_code === 401) {
	                                                await env.DB.prepare("UPDATE reminders SET status = 'failed' WHERE id = ?").bind(reminder.id).run();
	                                        } else {
	                                                // Increment fail_count and set status to failed if > 3
	                                                await env.DB.prepare(
	                                                        "UPDATE reminders SET status = CASE WHEN fail_count >= 3 THEN 'failed' ELSE status END, fail_count = fail_count + 1 WHERE id = ?"
	                                                )
	                                                        .bind(reminder.id)
	                                                        .run();
	                                        }
	                                        return;
	                                }

	                                // If successfully sent, update status or scheduled_at
	                                if (reminder.recurrence === 'daily') {
	                                        await env.DB.prepare("UPDATE reminders SET scheduled_at = scheduled_at + 86400, fail_count = 0 WHERE id = ?")
	                                                .bind(reminder.id)
	                                                .run();
	                                } else {
	                                        await env.DB.prepare("UPDATE reminders SET status = 'completed', fail_count = 0 WHERE id = ?")
	                                                .bind(reminder.id)
	                                                .run();
	                                }
	                        } catch (e) {
	                                console.error(`Error processing reminder ${reminder.id}:`, e);
	                                await env.DB.prepare(
	                                        "UPDATE reminders SET status = CASE WHEN fail_count >= 3 THEN 'failed' ELSE status END, fail_count = fail_count + 1 WHERE id = ?"
	                                )
	                                        .bind(reminder.id)
	                                        .run();
	                        }
	                })());
	        }
	},
	};
