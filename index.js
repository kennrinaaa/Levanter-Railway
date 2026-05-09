const { Client, logger } = require('./lib/client');
const { DATABASE, VERSION } = require('./config');
const http = require('http');

// ------------------------------------------------------------------
// FAKE PM2 ENVIRONMENT — The obfuscated code checks these
// ------------------------------------------------------------------
process.env.PM2_HOME = process.env.PM2_HOME || '/app/.pm2';
process.env.pm_id = process.env.pm_id || '0';
process.env.name = process.env.name || 'levanter';
process.env.PM2_USAGE = 'true';

// ------------------------------------------------------------------
// GLOBAL: Suppress simple-git errors
// ------------------------------------------------------------------
process.on('unhandledRejection', (reason) => {
  if (reason && reason.message && reason.message.includes('not a git repository')) {
    return;
  }
  logger.warn({ err: reason }, 'Unhandled rejection');
});

process.on('uncaughtException', (err) => {
  if (err && err.message && err.message.includes('not a git repository')) {
    return;
  }
  logger.error({ err }, 'Uncaught exception');
});

// ------------------------------------------------------------------
// BLOCK PROCESS.EXIT — The obfuscated code calls this to stop
// ------------------------------------------------------------------
const realExit = process.exit.bind(process);
process.exit = (code) => {
  logger.warn(`Blocked process.exit(${code}) — keeping bot alive`);
};

// ------------------------------------------------------------------
// Health server
// ------------------------------------------------------------------
const startServer = (port) => {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    } else {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(`Levanter v${VERSION} is running`);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn(`Port ${port} in use, trying ${port + 1}...`);
      startServer(port + 1);
    }
  });

  server.listen(port, () => {
    logger.info(`Health server on port ${port}`);
  });
};

const PORT = parseInt(process.env.PORT || '3000', 10);
startServer(PORT);

// ------------------------------------------------------------------
// Bot startup
// ------------------------------------------------------------------
const start = async () => {
  logger.info(`Levanter ${VERSION}`);

  try {
    await DATABASE.authenticate({ retry: { max: 3 } });
    logger.info('Database connected');
  } catch (error) {
    logger.error({ msg: 'Database connection failed', error: error.message });
    realExit(1);
  }

  const bot = new Client();

  // Intercept any stop/close/shutdown methods
  const originalClose = bot.close?.bind(bot);
  const originalStop = bot.stop?.bind(bot);
  const originalShutdown = bot.shutdown?.bind(bot);

  if (bot.close) {
    bot.close = function () {
      logger.warn('bot.close() was called — ignoring');
      return Promise.resolve();
    };
  }
  if (bot.stop) {
    bot.stop = function () {
      logger.warn('bot.stop() was called — ignoring');
      return Promise.resolve();
    };
  }
  if (bot.shutdown) {
    bot.shutdown = function () {
      logger.warn('bot.shutdown() was called — ignoring');
      return Promise.resolve();
    };
  }

  try {
    await bot.connect();
    logger.info('Bot connected successfully');
    logger.info('========================================');
    logger.info('   BOT IS NOW RUNNING ON RAILWAY 🚀');
    logger.info('========================================');
  } catch (error) {
    logger.error({ msg: 'Bot failed to start', error: error.message });
    realExit(1);
  }

  return { bot, originalClose, originalStop, originalShutdown };
};

// ------------------------------------------------------------------
// Graceful shutdown (only on real SIGINT/SIGTERM)
// ------------------------------------------------------------------
let shutdownInProgress = false;
const gracefulShutdown = async (botData) => {
  if (shutdownInProgress) return;
  shutdownInProgress = true;
  logger.info('Real shutdown signal received...');

  const { bot, originalClose } = botData;
  try {
    if (originalClose) await originalClose();
    else if (bot) await bot.close?.();
    await DATABASE.close();
  } catch (e) {
    logger.error({ err: e }, 'Shutdown error');
  }
  realExit(0);
};

const init = async () => {
  const botData = await start();
  process.on('SIGINT', () => gracefulShutdown(botData));
  process.on('SIGTERM', () => gracefulShutdown(botData));
};
init();
