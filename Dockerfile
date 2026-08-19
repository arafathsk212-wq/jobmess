FROM node:22-alpine

WORKDIR /app

# Install Python and build tools for better-sqlite3
RUN apk add --no-cache python3 make g++ sqlite

COPY package*.json ./

# Install dependencies with legacy peer deps
RUN npm install --legacy-peer-deps

COPY . .

# Create data directory
RUN mkdir -p server/data

EXPOSE 3000

CMD ["npm", "start"]
