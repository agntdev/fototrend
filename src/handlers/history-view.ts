import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard, registerMainMenuItem } from "../toolkit/index.js";

registerMainMenuItem({ label: "Мои фото", data: "history:view", order: 20 });
const composer = new Composer<Ctx>();
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const now = (): number => Date.now();
function userPhotos(ctx: Ctx) {
  const fresh = (ctx.session.photos ?? []).filter((photo) => now() - photo.timestamp <= RETENTION_MS);
  ctx.session.photos = fresh;
  return fresh.filter((photo) => photo.userId === ctx.from?.id);
}
const actions = (id: string) => inlineKeyboard([[inlineButton("Скачать", `photo:download:${id}`), inlineButton("Удалить", `photo:delete:${id}`)], [inlineButton("В меню", "menu:main")]]);
composer.callbackQuery("history:view", async (ctx) => {
  await ctx.answerCallbackQuery(); const photos = userPhotos(ctx);
  if (photos.length === 0) { await ctx.reply("Пока нет сохранённых фото — создайте первое, и оно появится здесь.", { reply_markup: inlineKeyboard([[inlineButton("Создать фото", "new_request:start")], [inlineButton("В меню", "menu:main")]]) }); return; }
  await ctx.reply(`Ваши фото за последние 90 дней: ${photos.length}.`);
  for (const photo of [...photos].reverse()) await ctx.replyWithPhoto(photo.fileUrl, { caption: `Стиль: ${photo.style}. Ключевые слова: ${photo.tags.join(", ")}.`, reply_markup: actions(photo.photoId) });
});
composer.callbackQuery(/^photo:download:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const photo = userPhotos(ctx).find((item) => item.photoId === ctx.match[1]); if (!photo) { await ctx.reply("Это фото уже недоступно. Создайте новое — я помогу."); return; } await ctx.replyWithPhoto(photo.fileUrl, { caption: "Вот ваше фото. Сохраните его в Telegram, чтобы оставить навсегда." }); });
composer.callbackQuery(/^photo:delete:(.+)$/, async (ctx) => { await ctx.answerCallbackQuery(); const photo = userPhotos(ctx).find((item) => item.photoId === ctx.match[1]); if (!photo) { await ctx.reply("Это фото уже недоступно."); return; } ctx.session.photos = (ctx.session.photos ?? []).filter((item) => item.photoId !== photo.photoId); await ctx.reply("Фото удалено из истории."); });
export default composer;
