const { Client, logger } = require('./lib/client');
const { DATABASE, VERSION } = require('./config');
const http = require('http');

// Health-check server so Railway knows the container is alive
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`Levanter v${VERSION} is running`);
  }
});
server.listen(PORT, () => {
  logger.info(`Health server listening on port ${PORT}`);
});

// Bot startup
const start = async () => {
  logger.info(`Levanter ${VERSION}`);

  // Test database connection
  try {
    await DATABASE.authenticate({ retry: { max: 3 } });
  } catch (error) {
    logger.error({
      msg: 'Database connection failed',
      error: error.message,
      url: process.env.DATABASE_URL,
    });
    process.exit(1);
  }

  const bot = new Client();
  try {
    await bot.connect();
  } catch (error) {
    logger.error({ msg: 'Bot client failed to start', error: error.message });
    process.exit(1);
  }
  return bot;
};

// Graceful shutdown
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

// Entry point
const init = async () => {
  const bot = await start();
  process.on('SIGINT', () => shutdown(bot));
  process.on('SIGTERM', () => shutdown(bot));
};
init();
