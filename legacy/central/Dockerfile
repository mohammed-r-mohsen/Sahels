FROM node:20.18.0-alpine3.20
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 4000
CMD ["node", "Server_1.js"]