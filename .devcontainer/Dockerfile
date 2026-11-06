FROM mcr.microsoft.com/devcontainers/javascript-node:22

# xvfb: fallback display for E2E when headless extension loading misbehaves (HEADED=1)
RUN apt-get update \
    && export DEBIAN_FRONTEND=noninteractive \
    && apt-get install -y --no-install-recommends xvfb \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*
