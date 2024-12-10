# syntax = docker/dockerfile:1

# Adjust NODE_VERSION as desired
ARG NODE_VERSION=20.10.0
FROM node:${NODE_VERSION}-slim as base

LABEL fly_launch_runtime="Astro"

# Install code-server
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
    curl \
    git \
    ca-certificates && \
    curl -fsSL https://code-server.dev/install.sh | sh && \
    rm -rf /var/lib/apt/lists/*

# Astro app lives here
WORKDIR /app

# Set production environment
ENV NODE_ENV="production"

# Install pnpm
ARG PNPM_VERSION=9.12.3
RUN npm install -g pnpm@$PNPM_VERSION


# Throw-away build stage to reduce size of final image
FROM base as build

# Install packages needed to build node modules
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3

# Install node modules
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# Copy application code
COPY . .

# Build application
RUN pnpm run build

# Remove development dependencies
RUN pnpm prune --prod

# Install necessary dependencies including ca-certificates
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
    git \
    curl \
    unzip \
    xz-utils \
    ca-certificates

# Install Flutter
ENV FLUTTER_VERSION="stable"
ENV FLUTTER_HOME=/usr/local/flutter
RUN git clone --depth 1 --branch ${FLUTTER_VERSION} https://github.com/flutter/flutter.git ${FLUTTER_HOME}
ENV PATH="${FLUTTER_HOME}/bin:${PATH}"

# Verify Flutter installation
RUN flutter doctor -v

# Final stage for app image
FROM base

# Install necessary dependencies for Flutter
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
    git \
    curl \
    unzip \
    xz-utils \
    ca-certificates && \
    rm -rf /var/lib/apt/lists/* # Clean up apt cache

# Copy Flutter from build stage
COPY --from=build /usr/local/flutter /usr/local/flutter

# Set Flutter environment variables and ensure git is in PATH
ENV FLUTTER_HOME=/usr/local/flutter \
    PATH="/usr/bin:/bin:/usr/local/flutter/bin:${PATH}"

# Verify Flutter installation in final stage
RUN which flutter && flutter --version

# Copy built application
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist
COPY --from=build /app/template /app/template

# Pre-run flutter pub get in template directory
RUN cd /app/template && flutter pub get

ENV PORT=4321
ENV HOST=0.0.0.0

# Start the server by default, this can be overwritten at runtime
EXPOSE 4321
CMD [ "node", "./dist/server/entry.mjs" ]