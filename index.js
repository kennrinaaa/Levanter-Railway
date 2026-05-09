// ------------------------------------------------------------------
// 1. SUPPRESS GIT NOISE
// ------------------------------------------------------------------
const originalConsoleError = console.error;
console.error = function (...args) {
  const msg = args.join(' ');
  if (msg.includes('not a git repository') || msg.includes('GitError')) return;
  originalConsoleError.apply(console, args);
};

// ------------------------------------------------------------------
// 2. BLOCK PM2 STOP — This is the real killer
// ------------------------------------------------------------------
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  const exports = originalRequire.apply(this, arguments);
  
  if (id === 'pm2') {
    // Wrap pm2 to block stop/delete/kill
    return new Proxy(exports, {
      get(target, prop) {
        const blocked = ['stop', 'delete', 'kill', 'sendSignalToProcessId', 'sendDataToProcessId'];
        if (blocked.includes(prop)) {
          return () => {
            console.log(`[BLOCKED] pm2.${prop}() was called and ignored`);
            return Promise.resolve();
          };
        }
        if (prop === 'connect') {
          return (cb) => {
            if (typeof cb === 'function') cb(null);
          };
        }
        const value = target[prop];
        if (typeof value === 'function') {
          return function (...args) {
            return value.apply(this, args);
          };
        }
        return value;
      }
    });
  }
  
  return exports;
};

// ------------------------------------------------------------------
// 3. FAKE PM2 ENVIRONMENT
// ------------------------------------------------------------------
process.env.PM2_HOME = '/app/.pm2';
process.env.pm_id = '0';
process.env.name = 'levanter';
process.env.PM2_USAGE = 'true';

// ------------------------------------------------------------------
// 4. NOW LOAD THE BOT
// ------------------------------------------------------------------
const { Client, logger } = require('./lib/client');
const { DATABASE, VERSION } = require('./config');
const http = require('http');

// ------------------------------------------------------------------
// 5. GLOBAL HANDLERS
// ------------------------------------------------------------------
process.on('unhandledRejection', (reason) => {
  const msg = reason?.message || '';
  if (msg.includes('not a git repository') || msg.includes('GitError')) return;
  logger.warn({ err: reason }, 'Unhandled rejection');
});

process.on('uncaughtException', (err) => {
  const msg = err?.message || '';
  if (msg.includes('not a git repository') || msg.includes('GitError')) return;
  logger.error({ err }, 'Uncaught exception');
});

// ------------------------------------------------------------------
// 6. BLOCK PROCESS.EXIT
// ------------------------------------------------------------------
const realExit = process.exit.bind(process);
process.exit = (code) => {
  logger.warn(`Blocked process.exit(${code})`);
};

// ------------------------------------------------------------------
// 7. HEALTH SERVER
// ------------------------------------------------------------------
const startServer = (port) => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(req.url === '/health' ? 'OK' : `Levanter v${VERSION} running`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') startServer(port + 1);
  });

  server.listen(port, () => logger.info(`Health server on port ${port}`));
};

startServer(parseInt(process.env.PORT || '3000', 10));

// ------------------------------------------------------------------
// 8. BOT STARTUP
// ------------------------------------------------------------------
const start = async () => {
  logger.info(`Levanter ${VERSION}`);

  try {
    await DATABASE.authenticate({ retry: { max: 3 } });
    logger.info('Database connected');
  } catch (error) {
    realExit(1);
  }

  const bot = new Client();

  // Block any stop methods on the bot instance
  ['close', 'stop', 'shutdown', 'destroy', 'disconnect', 'logout', 'end'].forEach(method => {
    if (typeof bot[method] === 'function') {
      const original = bot[method].bind(bot);
      bot[method] = () => {
        logger.warn(`bot.${method}() blocked`);
        return Promise.resolve();
      };
    }
  });

  try {
    await bot.connect();
    logger.info('✅ Bot connected successfully');
    logger.info('✅ BOT IS LIVE AND WILL STAY RUNNING');
  } catch (error) {
    logger.error({ err: error.message }, 'Bot failed');
    realExit(1);
  }

  return bot;
};

// ------------------------------------------------------------------
// 9. REAL SHUTDOWN
// ------------------------------------------------------------------
let shuttingDown = false;
const graceful = async (bot) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Real shutdown signal received...');
  try { await DATABASE.close(); } catch {}
  realExit(0);
};

const init = async () => {
  const bot = await start();
  process.on('SIGINT', () => graceful(bot));
  process.on('SIGTERM', () => graceful(bot));
};
init();
