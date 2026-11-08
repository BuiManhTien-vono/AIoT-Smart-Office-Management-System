# Multi-stage build cho React Frontend (Vite + TypeScript)
FROM node:20-alpine AS build
WORKDIR /app

# Biến VITE_* được nhúng vào bundle lúc build (trình duyệt gọi trực tiếp các URL này)
ARG VITE_BACKEND_API_URL=http://localhost:5000/api/v1
ARG VITE_AI_SERVICE_URL=http://localhost:8000
ENV VITE_BACKEND_API_URL=$VITE_BACKEND_API_URL
ENV VITE_AI_SERVICE_URL=$VITE_AI_SERVICE_URL

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Tầng chạy thực tế bằng Nginx Alpine gọn nhẹ, hỗ trợ SPA Routing
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
