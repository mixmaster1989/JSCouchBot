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
  bot.sendMessage(chatId, `👋 Привет, ${msg.from.first_name}!\n\nЯ — JS CouchBot.\nБуду твоим тренером по JavaScript. Готов начать обучение? Напиши /learn`);
});

// === Команда /learn ===
bot.onText(/\/learn/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!lessons.length) {
    return bot.sendMessage(chatId, '⚠️ Пока нет загруженных уроков.');
  }

  const lessonIndex = userProgress[userId] || 0;
  const lesson = lessons[lessonIndex];

  if (!lesson) {
    return bot.sendMessage(chatId, '🎉 Ты прошёл все доступные уроки!');
  }

  bot.sendMessage(chatId, `📘 Урок ${lessonIndex + 1}: ${lesson.title}\n\n${lesson.content}\n\nКогда будешь готов — напиши /task`);
});

// === Команда /task ===
bot.onText(/\/task/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const lessonIndex = userProgress[userId] || 0;
  const lesson = lessons[lessonIndex];

  if (!lesson || !lesson.task) {
    return bot.sendMessage(chatId, '🛠 Задания для этого урока нет.');
  }

  bot.sendMessage(chatId, `🧠 Задание: ${lesson.task.question}`);
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
    bot.sendMessage(chatId, '✅ Верно! Переходим к следующему уроку. Напиши /learn');
  } else if (lesson && lesson.task) {
    bot.sendMessage(chatId, '❌ Неверно. Попробуй ещё раз.');
  }
});
