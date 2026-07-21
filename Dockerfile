FROM node:22-alpine

WORKDIR /app
COPY package.json ./
COPY server.mjs ./
COPY public ./public
COPY scripts ./scripts

ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false
EXPOSE 8098
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:8098/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
