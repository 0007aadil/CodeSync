FROM node:18-bullseye-slim

# Install language runtimes and compilers
RUN apt-get update && apt-get install -y \
    python3 \
    g++ \
    default-jre \
    default-jdk \
    golang \
    ruby \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy application source
COPY . .

# Start the server
EXPOSE 4000
CMD ["node", "index.js"]
