FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Baked into the frontend bundle at build time (see src/frontend/config/api.ts).
# Override with --build-arg if the API will be reached at a different origin.
ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

EXPOSE 3001

CMD ["npx", "ts-node", "src/backend/server.ts"]
