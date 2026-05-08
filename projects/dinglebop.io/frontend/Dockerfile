FROM alpine:3.20 AS prep
WORKDIR /web
COPY static/ ./
RUN sed -i 's|content="http://localhost:8080"|content=""|' index.html

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY --from=prep /web /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/nginx.conf
EXPOSE 8080
