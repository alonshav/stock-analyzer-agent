# Use official Node.js LTS image
FROM node:20-slim

# Create a non-root user
RUN groupadd -r nodejs && useradd -r -g nodejs -m -s /bin/bash nodejs

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy built application
COPY dist ./dist

# Change ownership to non-root user
RUN chown -R nodejs:nodejs /app

# Create home directory for Claude Code configs
RUN mkdir -p /home/nodejs/.claude && chown -R nodejs:nodejs /home/nodejs

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3001

# Start command (will be overridden by Railway)
CMD ["node", "dist/apps/agent/main.js"]
