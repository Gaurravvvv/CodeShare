# Use Node.js 22 Alpine as base
FROM node:22-alpine

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Change ownership to non-root user
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 5173

# Command for development (ensure host is set to 0.0.0.0 for Vite)
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
