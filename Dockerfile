# Multi-stage build for Nx monorepo
FROM node:20-slim AS builder

# Install dependencies for build
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code and Nx configuration
COPY . .

# Build the agent application
RUN npm run build:agent

# Production stage
FROM node:20-slim

# Create a non-root user
RUN groupadd -r nodejs && useradd -r -g nodejs -m -s /bin/bash nodejs

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Change ownership to non-root user
RUN chown -R nodejs:nodejs /app

# Create home directory for Claude Code configs with correct permissions
RUN mkdir -p /home/nodejs/.claude && \
    chown -R nodejs:nodejs /home/nodejs && \
    chmod 755 /home/nodejs/.claude

# Switch to non-root user
USER nodejs

# Set HOME environment variable
ENV HOME=/home/nodejs

# Expose port
EXPOSE 3001

# Start command
CMD ["node", "dist/apps/agent/main.js", "--skip-nx-cache"]
