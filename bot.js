require('dotenv').config(); // Подключаем .env

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const { getProgress, setProgress } = require('./module/storage');

// === Конфиг ===
const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('❌ BOT_TOKEN не найден в .env');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// === Загрузка базы уроков ===
const lessonsPathBeginner = path.join(__dirname, 'data', 'lessons.json');
const lessonsPathIntermediate = path.join(__dirname, 'data', 'intermediate_lessons.json');

let beginnerLessons = [];
let intermediateLessons = [];

try {
  const beginnerData = fs.readFileSync(lessonsPathBeginner, 'utf-8');
  beginnerLessons = JSON.parse(beginnerData);

  const intermediateData = fs.readFileSync(lessonsPathIntermediate, 'utf-8');
  intermediateLessons = JSON.parse(intermediateData);
} catch (err) {
  console.error('❌ Ошибка загрузки уроков:', err);
}

// === Хранилище прогресса (в будущем можно сделать через БД) ===
const userProgress = {};

// === Команда /start ===
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `👋 *Привет, ${msg.from.first_name}!*\n\nЯ — *JS CouchBot*.\nБуду твоим тренером по JavaScript. Выбери, с чего начать:`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🚀 Начать обучение', callback_data: 'start_learning' }],
        [{ text: '📚 Я не новичок', callback_data: 'start_intermediate' }]
      ]
    }
  });
});

// === Обработка кнопок "Начать обучение" и "Я не новичок" ===
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;

  if (query.data === 'start_learning') {
    // Начать уроки для новичков
    setProgress(userId, 0); // Устанавливаем прогресс на начало
    startLesson(chatId, userId);
  } else if (query.data === 'start_intermediate') {
    // Начать уроки для продвинутого уровня
    setProgress(userId, beginnerLessons.length); // Устанавливаем прогресс на начало продвинутого уровня
    startLesson(chatId, userId);
  } else if (query.data.startsWith('answer_')) {
    const [_, lessonIndex, selectedAnswer] = query.data.split('_');
    checkAnswer(chatId, userId, parseInt(lessonIndex, 10), selectedAnswer);
  }
});

// === Функция для начала урока ===
function startLesson(chatId, userId) {
  const lessons = getLessonsForUser(userId);
  const lessonIndex = getProgress(userId) - (lessons === intermediateLessons ? beginnerLessons.length : 0);

  if (lessonIndex >= lessons.length || lessons.length === 0) {
    console.log(`User ${userId} завершил все уровни.`);
    return safeSend(chatId, '🎉 *Ты завершил все уровни обучения! Отличная работа!*', { parse_mode: 'Markdown' });
  }

  const lesson = lessons[lessonIndex];
  console.log(`User ${userId} начал урок ${lessonIndex + 1}: ${lesson.title}`);
  safeSend(chatId, `📘 *Урок ${lessonIndex + 1}: ${lesson.title}*\n\n${lesson.content}\n\nКогда будешь готов — нажми кнопку ниже, чтобы перейти к заданию.`, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🧠 Перейти к заданию', callback_data: `task_${lessonIndex}` }]
      ]
    }
  });
}

// === Обработка кнопки "Перейти к заданию" ===
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;

  if (query.data.startsWith('task_')) {
    const lessonIndex = parseInt(query.data.split('_')[1], 10);
    const lessons = getLessonsForUser(userId);
    const lesson = lessons[lessonIndex];

    if (!lesson || !lesson.task) {
      return bot.sendMessage(chatId, '🛠 *Задания для этого урока нет.*', { parse_mode: 'Markdown' });
    }

    // Собираем варианты ответов
    const answers = shuffleAnswers([
      lesson.task.answer,
      ...lesson.task.wrongAnswers
    ]);

    bot.sendMessage(chatId, `🧠 *Задание:*\n${lesson.task.question}`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: answers.map((answer) => [
          { text: answer, callback_data: `answer_${lessonIndex}_${answer}` }
        ])
      }
    });
  }
});

// === Проверка ответа ===
function checkAnswer(chatId, userId, lessonIndex, selectedAnswer) {
  const lessons = getLessonsForUser(userId);
  const lesson = lessons[lessonIndex];
  const correctAnswer = lesson.task.answer;

  if (lesson && lesson.task && selectedAnswer === correctAnswer) {
    console.log(`User ${userId} ответил правильно на урок ${lessonIndex + 1}`);
    setProgress(userId, lessonIndex + 1);
    safeSend(chatId, '✅ *Верно!*\nПереходим к следующему уроку.', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '➡️ Следующий урок', callback_data: 'start_learning' }]
        ]
      }
    });
  } else {
    console.log(`User ${userId} ответил неверно на урок ${lessonIndex + 1}`);
    safeSend(chatId, '❌ *Неверно.* Попробуй ещё раз.', { parse_mode: 'Markdown' });
  }
}

// === Перемешивание вариантов ответа ===
function shuffleAnswers(answers) {
  return answers
    .map((answer) => ({ answer, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ answer }) => answer);
}

// === Безопасная отправка сообщений ===
function safeSend(chatId, text, options = {}) {
  bot.sendMessage(chatId, text, options).catch((err) => {
    console.error(`Ошибка отправки сообщения пользователю ${chatId}:`, err.message);
  });
}

// === Получение уроков для пользователя ===
function getLessonsForUser(userId) {
  const progress = getProgress(userId);

  // Если пользователь завершил все уроки для новичков, переключаем на продвинутый уровень
  if (progress >= beginnerLessons.length && progress < beginnerLessons.length + intermediateLessons.length) {
    console.log(`User ${userId} перешёл на уровень "Продвинутый".`);
    return intermediateLessons;
  }

  // Если пользователь завершил все уроки для обоих уровней
  if (progress >= beginnerLessons.length + intermediateLessons.length) {
    console.log(`User ${userId} завершил все уровни.`);
    return [];
  }

  return beginnerLessons;
}
