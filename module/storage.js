const userProgress = {
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