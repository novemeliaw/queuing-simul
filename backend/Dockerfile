FROM node:18-alpine

WORKDIR /usr/app

COPY . .

COPY worker.js .

RUN npm install 

CMD ["node", "src/index.js"] 
