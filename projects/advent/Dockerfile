FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/nginx.conf
COPY site/ /usr/share/nginx/html/

# Cache busting. Cloudflare tells browsers to keep .js/.css for 4 hours, so a
# phone could mix a new page with yesterday's style.css or felles.js. Every
# build therefore gets its own URLs: each quoted absolute "/….js" or "/….css"
# in our HTML and JS (imports, <script>, <link>, workers) gets ?v=<build time>.
# All references get the same version, so every module is still loaded once.
# (tools/serve.mjs ignores the query, so local development needs nothing.)
USER root
RUN V=$(date +%s) \
 && find /usr/share/nginx/html -path /usr/share/nginx/html/vendor -prune -o -type f \( -name '*.html' -o -name '*.js' \) -print \
  | xargs sed -i -E "s#([\"'])(/[A-Za-z0-9_./-]+\.(js|css))([\"'])#\1\2?v=${V}\4#g"
USER 101

EXPOSE 8080
