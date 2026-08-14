# Use Node.js 20 Alpine as base
FROM node:20-alpine

# Removed LibreOffice dependencies since PPTX conversion moved to FastAPI
# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy source code
COPY . .

# Set production environment
ENV NODE_ENV=production

# Change ownership to non-root user
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3001

# Command for production (use docker-compose for dev with nodemon)
CMD ["npm", "start"]
