/**
 * Simple structured console logger
 */
const formatTime = () => new Date().toISOString();

export const logger = {
  info: (...args) => console.log(`[${formatTime()}] [INFO]`, ...args),
  warn: (...args) => console.warn(`[${formatTime()}] [WARN]`, ...args),
  error: (...args) => console.error(`[${formatTime()}] [ERROR]`, ...args),
  debug: (...args) => {
    if (process.env.DEBUG || process.env.NODE_ENV === "development") {
      console.debug(`[${formatTime()}] [DEBUG]`, ...args);
    }
  },
};

export default logger;
