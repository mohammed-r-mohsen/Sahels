FROM alpine:3.22
RUN apk add --no-cache gettext
COPY render-alertmanager.sh /usr/local/bin/render-alertmanager
ENTRYPOINT ["/bin/sh", "/usr/local/bin/render-alertmanager"]