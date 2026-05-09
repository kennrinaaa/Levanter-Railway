FROM node:20

# Install ffmpeg only (pm2 is already in package.json dependencies)
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better caching
COPY package.json yarn.lock ./

# Install dependencies (this installs pm2 locally from package.json)
RUN yarn install --frozen-lockfile

# Copy the rest of the app
COPY . .

# Railway sets PORT; expose 3000 as fallback
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start with PM2 using the correct syntax
CMD ["npx", "pm2-runtime", "index.js", "--name", "levanter"]
