require('dotenv').config(); // Подключаем .env

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// === Конфиг ===
const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('❌ BOT_TOKEN не найден в .env');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// === Загрузка базы уроков ===
const lessonsPath = path.join(__dirname, 'data', 'lessons.json');
let lessons = [];

try {
  const data = fs.readFileSync(lessonsPath, 'utf-8');
  lessons = JSON.parse(data);
} catch (err) {
  console.error('❌ Ошибка загрузки уроков:', err);
}

// === Хранилище прогресса (в будущем можно сделать через БД) ===
const userProgress = {};

// === Команда /start ===
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `👋 *Привет, ${msg.from.first_name}!*\n\nЯ — *JS CouchBot*.\nБуду твоим тренером по JavaScript. Готов начать обучение? Напиши /learn`, {
    parse_mode: 'Markdown'
  });
});

// === Команда /learn ===
bot.onText(/\/learn/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!lessons.length) {
    return bot.sendMessage(chatId, '⚠️ *Пока нет загруженных уроков.*', { parse_mode: 'Markdown' });
  }

  const lessonIndex = userProgress[userId] || 0;
  const lesson = lessons[lessonIndex];

  if (!lesson) {
    return bot.sendMessage(chatId, '🎉 *Ты прошёл все доступные уроки!*', { parse_mode: 'Markdown' });
  }

  bot.sendMessage(chatId, `📘 *Урок ${lessonIndex + 1}: ${lesson.title}*\n\n${lesson.content}\n\nКогда будешь готов — нажми кнопку ниже, чтобы перейти к заданию.`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🧠 Перейти к заданию', callback_data: 'task' }]
      ]
    }
  });
});

// === Обработка кнопки "Перейти к заданию" ===
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;

  if (query.data === 'task') {
    const lessonIndex = userProgress[userId] || 0;
    const lesson = lessons[lessonIndex];

    if (!lesson || !lesson.task) {
      return bot.sendMessage(chatId, '🛠 *Задания для этого урока нет.*', { parse_mode: 'Markdown' });
    }

    bot.sendMessage(chatId, `🧠 *Задание:*\n${lesson.task.question}`, { parse_mode: 'Markdown' });
  }
});

// === Ответы пользователя на задание ===
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  if (text.startsWith('/')) return;

  const lessonIndex = userProgress[userId] || 0;
  const lesson = lessons[lessonIndex];

  if (lesson && lesson.task && text.trim() === lesson.task.answer.trim()) {
    userProgress[userId] = lessonIndex + 1;
    bot.sendMessage(chatId, '✅ *Верно!*\nПереходим к следующему уроку. Напиши /learn', { parse_mode: 'Markdown' });
  } else if (lesson && lesson.task) {
    bot.sendMessage(chatId, '❌ *Неверно.* Попробуй ещё раз.', { parse_mode: 'Markdown' });
  }
});
