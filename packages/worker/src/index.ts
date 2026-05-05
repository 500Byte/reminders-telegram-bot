import TelegramBot, { TelegramExecutionContext, TelegramApi, getEffectiveTimezone, parseTime, addReminder } from '../../main/src/main.js';

export interface Environment {
	SECRET_TELEGRAM_API_TOKEN: string;
	DB: D1Database;
}

export default {
	fetch: async (request: Request, env: Environment, ctx: ExecutionContext) => {
		const bot = new TelegramBot(env.SECRET_TELEGRAM_API_TOKEN);

		await bot
			.on('start', async (ctx: TelegramExecutionContext) => {
				await ctx.reply(
					'¡Hola! Soy tu bot de recordatorios. 🔔\n\nPuedo ayudarte a programar avisos para que no olvides nada en este grupo.\n\nUsa /ayuda para ver cómo configurarme.'
				);
				return new Response('ok');
			})
			.on('ayuda', async (ctx: TelegramExecutionContext) => {
				await ctx.reply(
					'<b>Guía de Uso de Recordatorios</b> 🔔\n\n' +
					'<b>Comandos:</b>\n' +
					'/recordar [tiempo] [mensaje] - Programa un recordatorio.\n' +
					'/lista - Lista tus recordatorios activos en este chat.\n' +
					'/timezone [zona] - Configura tu zona horaria (ej: Europe/Madrid).\n\n' +
					'<b>Ejemplos de tiempo:</b>\n' +
					'• Relativo: <code>10m</code>, <code>2h</code>, <code>1d</code>\n' +
					'• Absoluto: <code>15:30</code>, <code>09:00</code>\n\n' +
					'<b>Recurrencia:</b>\n' +
					'Añade "cada dia" al final para que se repita diariamente.\n' +
					'Ejemplo: <code>/recordar 08:00 Tomar medicina cada dia</code>',
					'HTML'
				);
				return new Response('ok');
			})
			.on('timezone', async (ctx: TelegramExecutionContext) => {
				const tz = ctx.update.message?.text?.split(' ')[1] || 'UTC';
				try {
					Intl.DateTimeFormat(undefined, { timeZone: tz });
				} catch (e) {
					return ctx.reply('Zona horaria inválida. Ejemplo: Europe/Madrid');
				}
				const target_id = ctx.update.message?.chat.id.toString();
				if (!target_id) return ctx.reply('Error al identificar el chat');

				const type = ctx.update.message?.chat.type === 'private' ? 'user' : 'chat';

				await env.DB.prepare('INSERT OR REPLACE INTO user_settings (target_id, type, timezone) VALUES (?, ?, ?)')
					.bind(target_id, type, tz)
					.run();

				return ctx.reply(`Zona horaria configurada a ${tz}`);
			})
			.on('recordar', async (ctx: TelegramExecutionContext) => {
				if (ctx.update_type !== 'message') return new Response('ok');

				const text = ctx.update.message?.text?.toString() || '';
				const args = text.split(' ').slice(1);

				if (args.length < 2) {
					await ctx.reply('Uso: /recordar <tiempo> <mensaje>\nEjemplo: /recordar 10m Sacar basura');
					return new Response('ok');
				}

				const timeArg = args[0];
				let message = args.slice(1).join(' ');
				let recurrence = 'none';

				if (message.toLowerCase().includes('cada dia')) {
					recurrence = 'daily';
					message = message.replace(/cada dia/i, '').trim();
				}

				const chat_id = ctx.update.message?.chat.id.toString() || '';
				const user_id = ctx.update.message?.from.id.toString() || '';

				const timezone = await getEffectiveTimezone(env.DB, chat_id, user_id);
				const scheduled_at = parseTime(timeArg, timezone);

				if (!scheduled_at) {
					await ctx.reply('Formato de tiempo inválido. Usa 10m, 1h o HH:MM.');
					return new Response('ok');
				}

				await addReminder(env.DB, {
					chat_id,
					user_id,
					message,
					scheduled_at,
					recurrence
				});

				const dateStr = new Date(scheduled_at * 1000).toLocaleString('es-ES', { timeZone: timezone });
				await ctx.reply(`✅ Recordatorio guardado para: ${dateStr}\nMensaje: ${message}${recurrence === 'daily' ? ' (Diario)' : ''}`);

				return new Response('ok');
			})
			.on('lista', async (ctx: TelegramExecutionContext) => {
				const chat_id = ctx.update.message?.chat.id.toString() || '';
				const { results } = await env.DB.prepare("SELECT * FROM reminders WHERE chat_id = ? AND status = 'active' ORDER BY scheduled_at ASC")
					.bind(chat_id)
					.all();

				if (results.length === 0) {
					await ctx.reply('No tienes recordatorios activos en este chat.');
					return new Response('ok');
				}

				let list = '<b>Tus recordatorios:</b>\n\n';
				const timezone = await getEffectiveTimezone(env.DB, chat_id, '');
				
				for (const r of results) {
					const dateStr = new Date((r.scheduled_at as number) * 1000).toLocaleString('es-ES', { 
						timeZone: timezone,
						hour: '2-digit',
						minute: '2-digit',
						day: '2-digit',
						month: '2-digit'
					});
					list += `• <code>${dateStr}</code>: ${r.message}${r.recurrence === 'daily' ? ' (Diario)' : ''}\n`;
				}

				await ctx.reply(list, 'HTML');
				return new Response('ok');
			})
			.on(':callback', async (ctx: TelegramExecutionContext) => {
				const callback_data = ctx.update.callback_query?.data;
				if (!callback_data) return new Response('ok');

				const parts = callback_data.split('_');
				const action = parts[0];
				const reminderId = parts[1];

				const { results } = await env.DB.prepare("SELECT * FROM reminders WHERE id = ?")
					.bind(reminderId)
					.all();

				const reminder = results[0];
				if (!reminder) {
					await ctx.answerCallback('Este recordatorio ya no existe', true);
					return new Response('ok');
				}

				const user_id = ctx.update.callback_query?.from.id;
				const chat_id = ctx.update.callback_query?.message.chat.id.toString();

				if (!user_id || !chat_id) return new Response('ok');

				// Permission check: Creator or Admin
				const isCreator = user_id.toString() === reminder.user_id;
				let isAdmin = false;
				if (!isCreator) {
					const memberResponse = await ctx.getChatMember(chat_id, user_id);
					if (memberResponse.ok) {
						const memberData = await memberResponse.json() as { ok: boolean, result: { status: string } };
						isAdmin = memberData.result.status === 'administrator' || memberData.result.status === 'creator';
					}
				}

				if (!isCreator && !isAdmin) {
					await ctx.answerCallback('No tienes permiso para realizar esta acción', true);
					return new Response('ok');
				}

				const username = ctx.update.callback_query?.from.username || ctx.update.callback_query?.from.first_name || user_id.toString();

				if (action === 'done') {
					if (reminder.recurrence === 'daily') {
						await ctx.answerCallback('Anotado como completado por hoy');
						await ctx.editMessageText(`✅ Recordatorio completado por hoy por ${username}:\n\n${reminder.message}`);
					} else {
						await env.DB.prepare("UPDATE reminders SET status = 'completed' WHERE id = ?")
							.bind(reminderId)
							.run();
						await ctx.answerCallback('Recordatorio completado');
						await ctx.editMessageText(`✅ Recordatorio completado por ${username}:\n\n${reminder.message}`);
					}
				} else if (action === 'snooze') {
					const minutes = parseInt(parts[2] || '15');
					const now = Math.floor(Date.now() / 1000);
					await env.DB.prepare("UPDATE reminders SET scheduled_at = ?, status = 'active' WHERE id = ?")
						.bind(now + (minutes * 60), reminderId)
						.run();
					await ctx.answerCallback(`Pospuesto ${minutes} minutos`);
					await ctx.editMessageText(`⏰ Recordatorio pospuesto ${minutes}m por ${username}:\n\n${reminder.message}`);
				} else if (action === 'delete') {
					await env.DB.prepare("DELETE FROM reminders WHERE id = ?")
						.bind(reminderId)
						.run();
					await ctx.answerCallback('Recordatorio eliminado');
					await ctx.deleteMessage(chat_id, ctx.update.callback_query?.message.message_id);
				}

				return new Response('ok');
			})
			.handle(request.clone());

		return new Response('ok');
	},

	scheduled: async (event: ScheduledEvent, env: Environment, ctx: ExecutionContext) => {
		const api = new TelegramApi();
		const botApi = `https://api.telegram.org/bot${env.SECRET_TELEGRAM_API_TOKEN}`;
		const now = Math.floor(Date.now() / 1000);

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
						const errorData = await response.json() as { error_code?: number };
						if (errorData.error_code === 403 || errorData.error_code === 401) {
							await env.DB.prepare("UPDATE reminders SET status = 'failed' WHERE id = ?").bind(reminder.id).run();
						} else {
							await env.DB.prepare(
								"UPDATE reminders SET status = CASE WHEN fail_count >= 3 THEN 'failed' ELSE status END, fail_count = fail_count + 1 WHERE id = ?"
							)
								.bind(reminder.id)
								.run();
						}
						return;
					}

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
				}
			})());
		}
	},
};
