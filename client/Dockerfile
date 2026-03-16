# Use Node.js 20 Alpine as base
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 5173

# Command for development (ensure host is set to 0.0.0.0 for Vite)
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
