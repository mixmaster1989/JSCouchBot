const userProgress = {
  1348491591: 39
};

// Получить прогресс пользователя
function getProgress(userId) {
  return userProgress[userId] || 0;
}

// Установить прогресс пользователя
function setProgress(userId, value) {
  userProgress[userId] = value;
}

// Экспорт функций
module.exports = {
  getProgress,
  setProgress
};