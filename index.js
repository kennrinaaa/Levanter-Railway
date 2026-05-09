// ------------------------------------------------------------------
// NUCLEAR: Delete PM2 module cache before bot loads
// ------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

// Find and corrupt PM2 module cache
const pm2Paths = [
  path.join(__dirname, 'node_modules', 'pm2'),
  path.join(__dirname, 'node_modules', '.bin', 'pm2'),
];

// Overwrite require cache for pm2
const originalConsoleError = console.error;
console.error = function (...args) {
  const msg = args.join(' ');
  if (msg.includes('not a git repository') || msg.includes('GitError')) return;
  originalConsoleError.apply(console, args);
};

// ------------------------------------------------------------------
// INTERCEPT REQUIRE — Block pm2 loading
// ------------------------------------------------------------------
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'pm2' || id.endsWith('/pm2')) {
    console.log('[BLOCKED] require(pm2) intercepted');
    // Return a fake pm2 object
    return {
      connect: (cb) => cb && cb(null),
      stop: () => Promise.resolve(),
      delete: () => Promise.resolve(),
      kill: () => Promise.resolve(),
      restart: () => Promise.resolve(),
      list: (cb) => cb && cb(null, []),
      sendSignalToProcessId: () => Promise.resolve(),
      sendDataToProcessId: () => Promise.resolve(),
      start: () => Promise.resolve(),
      describeProcess: (name, cb) => cb && cb(null, { pm2_env: { status: 'online' } }),
      Client: {
        executeRemote: () => Promise.resolve(),
      },
    };
  }
  return originalRequire.apply(this, arguments);
};

// ------------------------------------------------------------------
// FAKE ENV
// ------------------------------------------------------------------
process.env.PM2_HOME = '/tmp/.pm2';
process.env.pm_id = '0';
process.env.name = 'levanter';
process.env.PM2_USAGE = 'true';

// ------------------------------------------------------------------
// GLOBAL HANDLERS
// ------------------------------------------------------------------
process.on('unhandledRejection', () => {});
process.on('uncaughtException', () => {});

// ------------------------------------------------------------------
// BLOCK EXIT
// ------------------------------------------------------------------
const realExit = process.exit.bind(process);
process.exit = () => {};

// ------------------------------------------------------------------
// NOW LOAD BOT
// ------------------------------------------------------------------
const { Client, logger } = require('./lib/client');
const { DATABASE, VERSION } = require('./config');
const http = require('http');

// ------------------------------------------------------------------
// HEALTH SERVER
// ------------------------------------------------------------------
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('OK');
});
server.listen(parseInt(process.env.PORT || '3000', 10));

// ------------------------------------------------------------------
// START
// ------------------------------------------------------------------
(async () => {
  logger.info(`Levanter ${VERSION}`);
  await DATABASE.authenticate({ retry: { max: 3 } });
  logger.info('DB connected');

  const bot = new Client();
  await bot.connect();
  logger.info('✅ BOT LIVE');
})();
