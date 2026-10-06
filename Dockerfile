FROM node:22-slim

# Optional: Blender lets the model pipeline accept .blend and USD/USDZ uploads
# (FBX/OBJ/STL/glTF work without it). Adds roughly 1 GB to the image, so it's
# opt-in: docker compose build --build-arg INSTALL_BLENDER=true
ARG INSTALL_BLENDER=false
ARG BLENDER_VERSION=4.2.3
RUN if [ "$INSTALL_BLENDER" = "true" ]; then \
      apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl xz-utils libgl1 libegl1 libxi6 libxxf86vm1 libxfixes3 \
        libxrender1 libxkbcommon0 libsm6 libice6 && \
      curl -fsSL "https://download.blender.org/release/Blender${BLENDER_VERSION%.*}/blender-${BLENDER_VERSION}-linux-x64.tar.xz" \
        | tar -xJ -C /opt && \
      ln -s "/opt/blender-${BLENDER_VERSION}-linux-x64/blender" /usr/local/bin/blender && \
      rm -rf /var/lib/apt/lists/*; \
    fi

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
