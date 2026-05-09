FROM node:20

# Install ffmpeg (git, curl already in node image)
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better caching
COPY package.json yarn.lock ./

# Install dependencies (postinstall handles sharp)
RUN yarn install --frozen-lockfile

# Copy the rest of the app
COPY . .

# Railway sets PORT; expose 3000 as fallback
EXPOSE 3000

# Health check — pings the HTTP server every 30 seconds
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start directly with Node (no PM2)
CMD ["node", "index.js"]
