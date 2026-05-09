const { Client, logger } = require('./lib/client');
const { DATABASE, VERSION } = require('./config');
const http = require('http');

// ------------------------------------------------------------------
// GLOBAL: Suppress simple-git errors caused by missing .git folder
// ------------------------------------------------------------------
process.on('unhandledRejection', (reason) => {
  if (reason && reason.message && reason.message.includes('not a git repository')) {
    return; // Silently ignore git errors
  }
  logger.warn({ err: reason }, 'Unhandled rejection (non-git)');
});

process.on('uncaughtException', (err) => {
  if (err && err.message && err.message.includes('not a git repository')) {
    return;
  }
  logger.error({ err }, 'Uncaught exception');
  process.exit(1);
});

// ------------------------------------------------------------------
// Health server with port-fallback
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
    } else {
      logger.error({ msg: 'Server error', error: err.message });
    }
  });

  server.listen(port, () => {
    logger.info(`Health server listening on port ${port}`);
  });

  return server;
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
    process.exit(1);
  }

  const bot = new Client();
  try {
    await bot.connect();
    logger.info('Bot connected successfully');
  } catch (error) {
    logger.error({ msg: 'Bot client failed to start', error: error.message });
    process.exit(1);
  }
  return bot;
};

// ------------------------------------------------------------------
// Graceful shutdown
// ------------------------------------------------------------------
const shutdown = async (bot) => {
  try {
    if (bot) await bot.close();
    await DATABASE.close();
    process.exit(0);
  } catch (error) {
    logger.error({ msg: 'Error during shutdown', error: error.message });
    process.exit(1);
  }
};

const init = async () => {
  const bot = await start();
  process.on('SIGINT', () => shutdown(bot));
  process.on('SIGTERM', () => shutdown(bot));
};
init();
