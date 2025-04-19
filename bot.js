require("dotenv").config(); // Подключаем .env

const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");
const { getProgress, setProgress } = require("./module/storage");
const { logger } = require("./logger");

// === Конфиг ===
const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
  logger.error("❌ BOT_TOKEN не найден в .env");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// === Загрузка базы уроков ===
const lessonsPathBeginner = path.join(__dirname, "data", "lessons.json");
const lessonsPathIntermediate = path.join(
  __dirname,
  "data",
  "intermediate_lessons.json"
);

let beginnerLessons = [];
let intermediateLessons = [];

try {
  const beginnerData = fs.readFileSync(lessonsPathBeginner, "utf-8");
  beginnerLessons = JSON.parse(beginnerData);

  const intermediateData = fs.readFileSync(lessonsPathIntermediate, "utf-8");
  intermediateLessons = JSON.parse(intermediateData);
} catch (err) {
  logger.error("❌ Ошибка загрузки уроков:", err);
}

// === Хранилище прогресса (в будущем можно сделать через БД) ===
const userProgress = {};

// === Команда /start ===
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    `👋 *Привет, ${msg.from.first_name}!*\n\nЯ — *JS CouchBot*.\nБуду твоим тренером по JavaScript. Выбери, с чего начать:`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🚀 Начать обучение", callback_data: "start_learning" }],
          [{ text: "Проверить себя", callback_data: "start_tests" }],
          [{ text: "Случайный тест", callback_data: "start_random_test" }],
        ],
      },
    }
  );
});

const startTest = (chatId, userId) => {
  const lessons = getLessonsForUser(userId);
  let lessonIndex = userProgress[userId];
  if (!lessonIndex) {
    userProgress[userId] = 0;
    lessonIndex = 0;
  }

  if (lessonIndex >= lessons.length || lessons.length === 0) {
    logger.info(`User ${userId} завершил все уроки.`);
    return safeSend(chatId, "🎉 *Ты завершил все тесты! Отличная работа!*", {
      parse_mode: "Markdown",
    });
  }
  const lesson = lessons[lessonIndex];
  logger.info(`User ${userId} начал тест ${lessonIndex + 1}: ${lesson.title}`);
  // Собираем варианты ответов
  const answers = shuffleAnswers([
    lesson.task.answer,
    ...lesson.task.wrongAnswers,
  ]);
  safeSend(chatId, `🧠 *Задание:*\n${lesson.task.question}`, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: answers.map((answer) => [
        { text: answer, callback_data: `test_${lessonIndex}_${answer}` },
      ]),
    },
  });
};

// === Обработка кнопок "Начать обучение" и "Я не новичок" ===
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const progress = getProgress(userId);
  if (query.data === "start_learning") {
    // Начать уроки для новичков
    if (!progress) setProgress(userId, 0);
    startLesson(chatId, userId);
  } else if (query.data.startsWith("answer_")) {
    const [_, lessonIndex, selectedAnswer] = query.data.split("_");
    checkAnswer(chatId, userId, parseInt(lessonIndex, 10), selectedAnswer);
  } else if (query.data.startsWith("test_")) {
    const [_, lessonIndex, selectedAnswer] = query.data.split("_");
    const lessons = getLessonsForUser(userId);
    const lesson = lessons[lessonIndex];
    const correctAnswer = lesson.task.answer;
    if (lesson && lesson.task && selectedAnswer === correctAnswer) {
      ++userProgress[userId];
      safeSend(chatId, "✅ *Верно!*\nПереходим к следующему тесту.", {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "➡️ Следующий тест", callback_data: "start_tests" }],
          ],
        },
      });
      return;
    }
    safeSend(chatId, "❌ *Неверно.* Попробуй ещё раз.", {
      parse_mode: "Markdown",
    });
  } else if (query.data.startsWith("randomtest_")) {
    const [_, lessonIndex, selectedAnswer] = query.data.split("_");
    const lessons = getLessonsForUser(userId);
    const lesson = lessons[lessonIndex];
    const correctAnswer = lesson.task.answer;
    if (lesson && lesson.task && selectedAnswer === correctAnswer) {
      safeSend(chatId, "✅ *Верно!*\nПереходим к следующему тесту.", {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "➡️ Следующий тест", callback_data: "start_random_test" }],
          ],
        },
      });
      return;
    }
    safeSend(chatId, "❌ *Неверно.* Попробуй ещё раз.", {
      parse_mode: "Markdown",
    });
  } else if (query.data === "start_tests") {
    // Начать тесты
    startTest(chatId, userId);
  } else if (query.data === "start_random_test") {
    // Начать тесты
    startRandomTest(chatId, userId);
  }
});

const startRandomTest = (chatId, userId) => {
  const lessons = getLessonsForUser(userId);
  const lessonIndex = Math.floor(Math.random() * lessons.length);
  const lesson = lessons[lessonIndex];
  logger.info(`User ${userId} начал тест ${lessonIndex + 1}: ${lesson.title}`);
  const answers = shuffleAnswers([
    lesson.task.answer,
    ...lesson.task.wrongAnswers,
  ]);
  safeSend(chatId, `🧠 *Задание:*\n${lesson.task.question}`, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: answers.map((answer) => [
        { text: answer, callback_data: `randomtest_${lessonIndex}_${answer}` },
      ]),
    },
  });
};

// === Функция для начала урока ===
function startLesson(chatId, userId) {
  const lessons = getLessonsForUser(userId);
  const lessonIndex = getProgress(userId);

  if (lessonIndex >= lessons.length || lessons.length === 0) {
    logger.info(`User ${userId} завершил все уровни.`);
    return safeSend(
      chatId,
      "🎉 *Ты завершил все уровни обучения! Отличная работа!*",
      { parse_mode: "Markdown" }
    );
  }

  const lesson = lessons[lessonIndex];
  logger.info(`User ${userId} начал урок ${lessonIndex + 1}: ${lesson.title}`);
  safeSend(
    chatId,
    `📘 *Урок ${lessonIndex + 1}: ${lesson.title}*\n\n${
      lesson.content
    }\n\nКогда будешь готов — нажми кнопку ниже, чтобы перейти к заданию.`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🧠 Перейти к заданию",
              callback_data: `task_${lessonIndex}`,
            },
          ],
        ],
      },
    }
  );
}

// === Обработка кнопки "Перейти к заданию" ===
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;

  if (query.data.startsWith("task_")) {
    const lessonIndex = parseInt(query.data.split("_")[1], 10);
    const lessons = getLessonsForUser(userId);
    const lesson = lessons[lessonIndex];

    if (!lesson || !lesson.task) {
      return bot.sendMessage(chatId, "🛠 *Задания для этого урока нет.*", {
        parse_mode: "Markdown",
      });
    }

    // Собираем варианты ответов
    const answers = shuffleAnswers([
      lesson.task.answer,
      ...lesson.task.wrongAnswers,
    ]);

    bot.sendMessage(chatId, `🧠 *Задание:*\n${lesson.task.question}`, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: answers.map((answer) => [
          { text: answer, callback_data: `answer_${lessonIndex}_${answer}` },
        ]),
      },
    });
  }
});

// === Проверка ответа ===
function checkAnswer(chatId, userId, lessonIndex, selectedAnswer) {
  const lessons = getLessonsForUser(userId);
  const lesson = lessons[lessonIndex];
  const correctAnswer = lesson.task.answer;

  if (lesson && lesson.task && selectedAnswer === correctAnswer) {
    logger.info(`User ${userId} ответил правильно на урок ${lessonIndex + 1}`);
    setProgress(userId, lessonIndex + 1);
    safeSend(chatId, "✅ *Верно!*\nПереходим к следующему уроку.", {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "➡️ Следующий урок", callback_data: "start_learning" }],
        ],
      },
    });
  } else {
    logger.info(`User ${userId} ответил неверно на урок ${lessonIndex + 1}`);
    safeSend(chatId, "❌ *Неверно.* Попробуй ещё раз.", {
      parse_mode: "Markdown",
    });
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
    logger.error(
      `Ошибка отправки сообщения пользователю ${chatId}`,
      err
    );
  });
}

// === Получение уроков для пользователя ===
function getLessonsForUser(userId) {
  const progress = getProgress(userId);

  // Если пользователь завершил все уроки для обоих уровней
  if (progress >= beginnerLessons.length + intermediateLessons.length) {
    logger.info(`User ${userId} завершил все уровни.`);
    return [];
  }

  return beginnerLessons;
}
