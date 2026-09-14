# Use official Node.js LTS Alpine image
FROM node:20-alpine

# Set working directory inside container
WORKDIR /usr/src/app

# Set production environment
ENV NODE_ENV=production
ENV PORT=5000

# Install dependencies first (leverage Docker layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source code and assets
COPY models/ ./models/
COPY middleware/ ./middleware/
COPY routes/ ./routes/
COPY controllers/ ./controllers/
COPY public/ ./public/
COPY scripts/ ./scripts/
COPY server.js ./
COPY sample_planning_data.csv ./

# Create uploads volume directory
RUN mkdir -p uploads

# Expose ERP API & Frontend port
EXPOSE 5000

# Start production server
CMD ["node", "server.js"]
