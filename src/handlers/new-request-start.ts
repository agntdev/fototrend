import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { adminChatId, inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "Создать новое фото", data: "new_request:start", order: 10 });
const composer = new Composer<Ctx>();
const STYLE_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_DAILY_REQUESTS = 5;
const styles: Record<string, { prompt: string }> = {
  natural: { prompt: "natural light editorial photography" }, cinematic: { prompt: "cinematic editorial photography" }, minimal: { prompt: "clean minimal studio photography" }, vintage: { prompt: "warm vintage film photography" }, neon: { prompt: "vibrant neon fashion photography" },
};
export let now = (): number => Date.now();
export function setClockForTests(clock: () => number): void { now = clock; }
const dayKey = (at: number): string => new Date(at).toISOString().slice(0, 10);
const newId = (): string => crypto.randomUUID();
function photoUrl(tags: string[], style: string): string {
  const prompt = `${styles[style].prompt}, ${tags.join(", ")}, single high quality JPEG photo`;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&seed=${encodeURIComponent(newId())}`;
}
function tagsFrom(text: string): string[] | null {
  const tags = text.split(",").map((part) => part.trim()).filter(Boolean);
  if (tags.length === 0 || tags.length > 8 || tags.some((tag) => tag.length > 60 || !/[\p{L}\p{N}]/u.test(tag))) return null;
  return [...new Set(tags.map((tag) => tag.toLocaleLowerCase()))];
}
const stylesKeyboard = () => inlineKeyboard([[inlineButton("Натуральный", "style:natural"), inlineButton("Кино", "style:cinematic")], [inlineButton("Минимализм", "style:minimal"), inlineButton("Винтаж", "style:vintage")], [inlineButton("Неон", "style:neon")], [inlineButton("Отмена", "request:cancel")]]);
async function notifyOwner(ctx: Ctx, text: string): Promise<void> { const owner = adminChatId(ctx as Ctx & { env?: Record<string, unknown> }); if (owner) try { await ctx.api.sendMessage(owner, text); } catch { /* Owner may have blocked the bot. */ } }
async function askForKeywords(ctx: Ctx): Promise<void> { ctx.session.activeRequest = { requestId: newId(), startedAt: now() }; await ctx.reply("Напишите ключевые слова через запятую. Например: кофе, утро, уют.", { reply_markup: { force_reply: true, input_field_placeholder: "кофе, утро, уют" } }); }

composer.callbackQuery("new_request:start", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.session.user?.consentedToHistory) { await ctx.reply("Я могу хранить ваши готовые фото 90 дней, чтобы вы могли скачать их позже. Согласны?", { reply_markup: inlineKeyboard([[inlineButton("Согласен", "retention:yes"), inlineButton("Не сохранять", "retention:no")], [inlineButton("В меню", "menu:main")]]) }); return; }
  await askForKeywords(ctx);
});
composer.callbackQuery(["retention:yes", "retention:no"], async (ctx) => {
  await ctx.answerCallbackQuery(); const userId = ctx.from?.id; const chatId = ctx.chat?.id; if (userId === undefined || chatId === undefined) return;
  ctx.session.user = { userId, chatId, consentedToHistory: ctx.callbackQuery.data === "retention:yes", requestDays: ctx.session.user?.requestDays ?? {} };
  if (ctx.callbackQuery.data === "retention:no") { await ctx.editMessageText("Без согласия я не смогу сохранить фото в истории. Когда будете готовы, выберите создание фото и подтвердите хранение.", { reply_markup: inlineKeyboard([[inlineButton("В меню", "menu:main")]]) }); return; }
  await ctx.editMessageText("Спасибо! Фото будут доступны вам 90 дней."); await askForKeywords(ctx);
});
composer.on("message:text", async (ctx, next) => {
  const active = ctx.session.activeRequest; if (!active || active.tags) return next();
  if (now() - active.startedAt > STYLE_TIMEOUT_MS) { ctx.session.activeRequest = undefined; await ctx.reply("Время выбора истекло. Начните заново — я рядом."); return; }
  const tags = tagsFrom(ctx.message.text); if (!tags) { await ctx.reply("Не получилось прочитать ключевые слова. Напишите от 1 до 8 слов или фраз через запятую.", { reply_markup: { force_reply: true, input_field_placeholder: "кофе, утро, уют" } }); return; }
  active.tags = tags; await ctx.reply("Какое настроение выбрать для фото?", { reply_markup: stylesKeyboard() });
});
composer.callbackQuery(/^style:(natural|cinematic|minimal|vintage|neon)$/, async (ctx) => {
  await ctx.answerCallbackQuery(); const active = ctx.session.activeRequest; const user = ctx.session.user; const style = ctx.match[1];
  if (!active?.tags || !user) { await ctx.reply("Сначала напишите ключевые слова, затем я предложу стили."); return; }
  if (now() - active.startedAt > STYLE_TIMEOUT_MS) { ctx.session.activeRequest = undefined; await ctx.editMessageText("Время выбора истекло. Начните заново — я рядом.", { reply_markup: inlineKeyboard([[inlineButton("Создать фото", "new_request:start")]]) }); return; }
  const day = dayKey(now()); const count = user.requestDays[day] ?? 0;
  if (count >= MAX_DAILY_REQUESTS) { await ctx.editMessageText("Сегодня уже создано 5 фото. Возвращайтесь завтра — я сохраню ваши идеи.", { reply_markup: inlineKeyboard([[inlineButton("Мои фото", "history:view")]]) }); return; }
  user.requestDays = { [day]: count + 1 }; await ctx.editMessageText("Готовлю ваше фото. Это обычно занимает пару минут."); await notifyOwner(ctx, `Новый заказ на фото: ${active.requestId}`);
  const url = photoUrl(active.tags, style);
  try { const photo = { photoId: newId(), userId: user.userId, fileUrl: url, tags: active.tags, style, timestamp: now() }; ctx.session.photos = [...(ctx.session.photos ?? []).filter((item) => now() - item.timestamp <= 90 * 24 * 60 * 60 * 1000), photo]; ctx.session.activeRequest = undefined; await ctx.replyWithPhoto(url, { caption: "Ваше фото готово. Оно будет ждать в «Мои фото» 90 дней.", reply_markup: inlineKeyboard([[inlineButton("Мои фото", "history:view"), inlineButton("Создать ещё", "new_request:start")]]) }); }
  catch (error) { ctx.session.activeRequest = undefined; const summary = error instanceof Error ? error.message.slice(0, 160) : "не удалось доставить изображение"; await notifyOwner(ctx, `Ошибка заказа ${active.requestId}: ${summary}`); await ctx.reply("Не удалось создать фото сейчас. Попробуйте ещё раз чуть позже.", { reply_markup: inlineKeyboard([[inlineButton("Создать ещё", "new_request:start")]]) }); }
});
composer.callbackQuery("request:cancel", async (ctx) => { await ctx.answerCallbackQuery(); ctx.session.activeRequest = undefined; await ctx.editMessageText("Создание отменено. Когда появится идея, возвращайтесь.", { reply_markup: inlineKeyboard([[inlineButton("В меню", "menu:main")]]) }); });
export default composer;
