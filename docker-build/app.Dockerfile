FROM ubuntu:16.04

ENV DEEPKIT_SERVER_MODE=1
ENV DEEPKIT_HTTP_PORT=80
ENV DEEPKIT_MONGO_DIR=/app/data/mongo
ENV DEEPKIT_MONGO_UNIX_SOCKET=/app/data/mongo/deepkit-mongo-server.sock
ENV DEEPKIT_FS_DIR=/app/data/fs
ENV DEEPKIT_PROJECT_GIT_DIR=/app/data/project-git

# libgssapi-krb5-2 for nodegit
RUN apt-get update && apt-get install -y unzip libgssapi-krb5-2

ADD prebuild-server /app/

EXPOSE 80
WORKDIR /app
CMD /app/bin/deepkit-server

