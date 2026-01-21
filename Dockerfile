FROM node:20-slim

# Install Python and pip
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-numpy \
    python3-pandas \
    python3-scipy \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node dependencies (force dev deps for build)
ENV NODE_ENV=development
ENV NPM_CONFIG_PRODUCTION=false
RUN npm ci --include=dev

# Copy all source files
COPY . .

# Build the frontend
RUN npm run build

# Expose port
EXPOSE 10000

# Set environment variables for runtime
ENV NODE_ENV=production
ENV NPM_CONFIG_PRODUCTION=true
ENV PORT=10000

# Start the server
CMD ["npm", "run", "start"]
