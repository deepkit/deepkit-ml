.PHONY: server build

NODE_VERSION=v12.6.0
RELEASES := $(PWD)/releases
LAST_RELEASE=$(RELEASES)/last_release

VERSION=$(shell sh ./release-version.sh)
VERSION_FILE_PATH=$(shell sh ./release-version-file-path.sh)

ifeq ($(shell uname), Darwin)
	target=darwin
else ifeq ($(shell uname), Linux)
	target=linux
else
	target=$()
endif


fresh-install:
	rm -rf packages/*/node-modules
	npm run bootstrap

docker-image:
	docker build -t registry.gitlab.com/deepkit/deepkit-project/server .

docker-push:
	docker push registry.gitlab.com/deepkit/deepkit-project/server

docker-linux-build-image:
	docker build -t deepkit/build-linux -f docker-build/Dockerfile .

test-ci:
	id
	echo $(PWD)
	ls -al $(PWD)
	npm install -g coveralls lerna yarn npm-local-development
	lerna bootstrap --nohoist \* --no-ci
	npm-local-development --no-watcher
	cd packages/core && npm run test
	cd packages/core-node && npm run test
#	cd packages/server && npm run test
#	./node_modules/.bin/jest --coverage
#	cat ./coverage/lcov.info | ./node_modules/coveralls/bin/coveralls.js

release:
	echo "Build release $(RELEASES)/$(VERSION), target=$(target)"
	-[ -f "$(RELEASES)/$(VERSION)" ] && echo "Release already exists $(RELEASES)/$(VERSION)"
	[ ! -f "$(RELEASES)/$(VERSION)" ] && make release-$(target)

# CLI LINUX
/tmp/node-$(NODE_VERSION)-linux-x64/bin/node:
	rm -rf /tmp/node-$(NODE_VERSION)-linux-x64-tar
	rm -rf /tmp/node-$(NODE_VERSION)-linux-x64
	mkdir -p /tmp/node-$(NODE_VERSION)-linux-x64-tar
	tar xf libs/node/node-$(NODE_VERSION)-linux-x64.tar.gz -C /tmp/node-$(NODE_VERSION)-linux-x64-tar
	mv /tmp/node-$(NODE_VERSION)-linux-x64-tar/* /tmp/node-$(NODE_VERSION)-linux-x64


build/linux/cli/bin/node: /tmp/node-$(NODE_VERSION)-linux-x64/bin/node
	mkdir -p build/linux/cli/bin
	cp /tmp/node-$(NODE_VERSION)-linux-x64/bin/node  build/linux/cli/bin;

#/docker/deepkit/docker-image-cli-linux:
#	@if ! docker images | grep deepkit/build-cli-linux; then \
#		docker build -t deepkit/build-cli-linux -f docker-build/npm-install.Dockerfile packages/cli; \
#	fi

#docker/build/linux/cli/node_modules: /docker/deepkit/docker-image-cli-linux
#	mkdir -p build/linux/cli/
#	@id=$(shell docker create deepkit/build-cli-linux); \
#	docker cp $$id:/app/node_modules build/linux/cli/node_modules; \
#	docker rm -v $$id;

cli-linux-clean:
	rm -rf build/linux/cli
	rm -rf build/linux/deepkit-cli-linux.tar.gz
	rm -f packages/cli/dist/main.js

# this is required to use when building cli-linux on linux/windows
#cli-linux-local-rebuild: cli-linux-clean docker/build/linux/cli/node_modules cli-linux


build/linux/cli/bin: build/linux/cli/bin/node
	mkdir -p build/linux/cli/bin
	cp packages/cli/bin/deepkit build/linux/cli/bin/deepkit

_always/build/linux/cli/node_modules: build/linux/cli/bin
	cp packages/cli/package.json build/linux/cli/
	cd build/linux/cli && npm version $(VERSION_FILE_PATH) --allow-same-version && cd -
	cp packages/cli/package-lock.json build/linux/cli/
	cd build/linux/cli && npm install --only=prod

cli-linux: build/linux/cli/bin _always/build/linux/cli/node_modules packages/cli/dist/main.js
	cp packages/cli/dist/main.js build/linux/cli/main.js
	cp packages/cli/dist/main.js.map build/linux/cli/main.js.map
	tar -C build/linux/cli -czf build/linux/deepkit-cli-linux.tar.gz .
	@echo "build/linux/deepkit-cli-linux.tar.gz Done"

build/linux/deepkit-cli-linux.tar.gz: cli-linux

cli-linux-rebuild: cli-linux-clean
	make cli-linux

# CLI GENERAL
packages/cli/dist/main.js:
	cd packages/cli && npm run build


cli-linux-standalone: _always/build/linux/cli/node_modules
	make cli-linux



# CLI DARWIN
build/darwin/cli/bin:
	mkdir -p build/darwin/cli/bin
	cp packages/cli/bin/deepkit build/darwin/cli/bin/deepkit

cli-darwin: build/darwin/cli/bin packages/cli/dist/main.js
	cp packages/cli/package.json build/darwin/cli/package.json
	cd build/darwin/cli/ && npm version $(VERSION_FILE_PATH) --allow-same-version && cd -
	cp packages/cli/dist/main.js build/darwin/cli/main.js
	cp packages/cli/dist/main.js.map build/darwin/cli/main.js.map
	cd build/darwin/cli && npm install --only=prod --unsafe
#	cd build/darwin/cli && zip -8 -qr $(RELEASES)/$(VERSION)/deepkit-cli-macOS-$(VERSION).zip .

cli-darwin-clean:
	rm -rf build/darwin/cli
	rm -f packages/cli/dist/main.js

cli-darwin-rebuild: cli-darwin-clean
	make cli-darwin

# SERVER
packages/server/dist/main.js:
	cd packages/server && npm run build


# SERVER DARWIN
build/darwin/server/libs:
	mkdir -p build/darwin/server/libs
	cp packages/server/libs/mongod-darwin-x64 build/darwin/server/libs

server-darwin: packages/server/dist/main.js build/darwin/server/libs
	cp packages/server/package.json build/darwin/server/package.json
	cd build/darwin/server/ && npm version $(VERSION_FILE_PATH) --allow-same-version && cd -
	cp packages/server/dist/main.js build/darwin/server/main.js
#	cd build/darwin/server && zip -8 -qr $(RELEASES)/$(VERSION)/deepkit-server-macOS-$(VERSION).zip .

server-darwin-clean:
	rm -rf build/darwin/server
	rm -rf build/darwin/server.tar.gz
	rm -f packages/server/dist/*

server-darwin-rebuild: server-darwin-clean
	make server-darwin


# SERVER WINDOWS
build/windows/server/libs:
	mkdir -p build/windows/server/libs
	cp packages/server/libs/mongod-win32-x64.exe build/windows/server/libs

build/windows/server/bin:
	mkdir -p build/windows/server/bin
	cp packages/server/bin/deepkit-server build/windows/server/bin/deepkit-server

server-windows: build/windows/server/bin packages/server/dist/main.js build/windows/server/libs
	cp packages/server/package.json build/windows/server/package.json
	cd build/windows/server/ && npm version $(VERSION_FILE_PATH) --allow-same-version && cd -
	cp packages/server/dist/main.js build/windows/server/main.js
#	cd build/windows/server && zip -8 -qr $(RELEASES)/$(VERSION)/deepkit-server-windows-$(VERSION).zip .

server-windows-clean:
	rm -rf build/windows/server
	rm -rf build/windows/server.tar.gz
	rm -f packages/server/dist/*

server-windows-rebuild: server-windows-clean
	make server-windows





# SERVER LINUX
build/linux/server/bin/node: /tmp/node-$(NODE_VERSION)-linux-x64/bin/node
	mkdir -p build/linux/server/bin
	cp /tmp/node-$(NODE_VERSION)-linux-x64/bin/node build/linux/server/bin/node;

build/linux/server/libs/mongod-linux-x64:
	mkdir -p build/linux/server/libs
	cp packages/server/libs/mongod-linux-x64 build/linux/server/libs

build/linux/server/libs: build/linux/server/libs/mongod-linux-x64

_always/build/linux/server/node_modules:
	mkdir -p build/linux/server/
	cp packages/server/package.json build/linux/server/package.json
	cd build/linux/server/ && npm version $(VERSION_FILE_PATH) --allow-same-version && cd -
	docker build -t deepkit/npm-install -f docker-build/npm-install.Dockerfile docker-build
	docker run -v `pwd`/build/linux/server:/app deepkit/npm-install

build/linux/server/bin: build/linux/server/bin/node
	mkdir -p build/linux/server/bin
	cp packages/server/bin/deepkit-server build/linux/server/bin/deepkit-server

server-linux: build/linux/server/bin packages/server/dist/main.js build/linux/server/libs packages/deepkit/dist/deepkit/index.html
	cp packages/server/package.json build/linux/server/package.json
	cd build/linux/server/ && npm version $(VERSION_FILE_PATH) --allow-same-version && cd -
	cp packages/server/dist/main.js build/linux/server/main.js

server-linux-clean:
	rm -rf build/linux/server
	rm -rf build/linux/server.tar.gz
	rm -f packages/server/dist/*

server-linux-rebuild: server-linux-clean
	make server-linux

#server-linux-in-docker:
#	docker build -t deepkit/ci -f docker-build/ci.Dockerfile .
#	docker run deepkit/ci sh -c "cd deepkit && make server-linux"


deepkit-frontend:
	rm -rf build/frontend
	cd packages/deepkit && npm version $(VERSION_FILE_PATH) --allow-same-version && cd -
	cd packages/deepkit && npm run build && cd - && cp -r packages/deepkit/dist/deepkit build/frontend

# deepkit team server
server-linux-standalone: _always/build/linux/server/node_modules
	make server-linux-rebuild deepkit-frontend
	cp -r build/frontend build/linux/server/frontend
	cd build/linux/server && zip -8 -qr $(RELEASES)/$(VERSION)/deepkit-server-linux-x64-$(VERSION).zip .


# Electron
packages/electron/dist/main.js:
	cd packages/electron && ./node_modules/.bin/webpack-cli --mode development --config webpack.config.js;

#electron-darwin: build/electron/main.js build/darwin/server/main.js build/darwin/cli/main.js build/linux/deepkit-cli-linux.tar.gz build/frontend/index.html
electron-darwin-prebuild:
	cd packages/electron && npm version $(VERSION_FILE_PATH) --allow-same-version && cd -
	cd packages/electron && ./macos-build.sh;

_always/electron:
	rm -rf packages/electron/dist/main.js
	make packages/electron/dist/main.js
	mkdir -p build/electron
	cp packages/electron/dist/main.js build/electron/main.js

electron-darwin-local: _always/electron cli-darwin-rebuild cli-linux-rebuild deepkit-frontend server-darwin-rebuild
	make electron-darwin-prebuild

mac-store:
	echo Did you correctly tag a version? No dev versions allowed now.
	echo We got: `sh release-version.sh`
	read
	make electron-darwin-local
	# at this point we need all certs in apple-certificates in keychain including the private keys
	cd packages/electron && ./macos-sign-mas.sh
	cd packages/electron && ./macos-upload-store.sh

electron-linux-prebuild:
	cd packages/electron && npm version $(VERSION_FILE_PATH) --allow-same-version && cd -
	cd packages/electron && ./linux-build.sh;

electron-linux-local: _always/electron cli-linux-rebuild deepkit-frontend server-linux-rebuild
	make electron-linux-prebuild

electron-linux-rebuild:
	rm -r packages/electron/dist
	make electron-linux

electron-windows-local: _always/electron cli-linux-rebuild deepkit-frontend server-windows-rebuild
	cd packages/electron && npm version $(VERSION_FILE_PATH) --allow-same-version && cd -
	cd packages/electron && ./windows-build.sh;


all-darwin-rebuild:
	make server-darwin-rebuild
	make cli-darwin-rebuild
	make deepkit-angular-rebuild
	make electron-darwin-rebuild

all-linux-rebuild:
	make server-linux-rebuild
	make cli-linux-rebuild
	make deepkit-angular-rebuild
	make electron-linux-rebuild


all-rebuild:
	make cli-darwin-rebuild
	make server-linux-rebuild
	make server-darwin-rebuild
	make deepkit-angular-rebuild
	make electron-darwin
	make electron-linux

# Deepkit
packages/deepkit/dist/deepkit/index.html:
	cd packages/deepkit && npm run build

deepkit-angular: packages/deepkit/dist/deepkit/index.html

deepkit-angular-rebuild:
	rm -rf packages/deepkit/dist
	make deepkit-angular



upload-macos-release:
	#pip install --upgrade pip wheel; pip install b2
	#python -m b2 authorize-account ${{B2_APPKEY_ID}} ${{B2_APPKEY}}
	python -m b2 upload-file deepkit-releases releases/$(VERSION_FILE_PATH)/deepkit-app-macOS-$(VERSION_FILE_PATH).zip releases/$(VERSION_FILE_PATH)/deepkit-app-macOS-$(VERSION_FILE_PATH).zip
	python -m b2 clear-account

upload-linux-release:
	#pip install --upgrade pip wheel; pip install b2
	#python -m b2 authorize-account ${{B2_APPKEY_ID}} ${{B2_APPKEY}}
	python -m b2 upload-file deepkit-releases releases/$(VERSION_FILE_PATH)/deepkit-app-linux-x64-$(VERSION_FILE_PATH).zip releases/$(VERSION_FILE_PATH)/deepkit-app-linux-x64-$(VERSION_FILE_PATH).zip
	python -m b2 upload-file deepkit-releases releases/$(VERSION_FILE_PATH)/deepkit-server-linux-x64-$(VERSION_FILE_PATH).tar.gz releases/$(VERSION_FILE_PATH)/deepkit-server-linux-x64-$(VERSION_FILE_PATH).tar.gz
	python -m b2 upload-file deepkit-releases releases/$(VERSION_FILE_PATH)/deepkit-cli-linux-x64-$(VERSION_FILE_PATH).tar.gz releases/$(VERSION_FILE_PATH)/deepkit-cli-linux-x64-$(VERSION_FILE_PATH).tar.gz
	python -m b2 clear-account


cli-nexe-build:
	docker run -ti \
	-v `pwd`/packages/cli/src:/app/packages/cli/src \
	-v `pwd`/packages/cli/package.json:/app/packages/cli/package.json \
	-v `pwd`/packages/cli/dist:/app/packages/cli/dist \
	deepkit/build sh -c 'cd packages/cli && npm run build-binary'

dev-setup:
	cd packages/core && npm link --only=production && cd -
	cd packages/core-node && npm link --only=production && cd -

	cd packages/server && npm link @deepkit/core && cd -
	cd packages/server && npm link @deepkit/core-node && cd -

	cd packages/cli && npm link @deepkit/core && cd -
	cd packages/cli && npm link @deepkit/core-node && cd -

	cd packages/deepkit && npm link @deepkit/core && cd -

all:
	echo hi
#
#	rm -rf build
#	make cli-linux
#	make cli-darwin
#	make build-packages
#	make build-electron

build-packages-darwin: deepkit-angular cli-darwin server-darwin


website-image:
	docker build -t deepkit/website -f docker-build/website.Dockerfile .

angular-watch:
	cd packages/deepkit && ./node_modules/.bin/ng build --watch

angular-prod:
	cd packages/deepkit && npm run build

icon-font:
	cd packages/deepkit && npm run icon-font

server:
	cd packages/server && ./node_modules/.bin/webpack

server-run:
	cd packages/server && node dist/main.js

server-watch-only:
	cd packages/server && ./node_modules/.bin/webpack --watch

server-watch:
	cd packages/server && ./node_modules/.bin/webpack --watch --start

cli-watch:
	cd packages/cli && ./node_modules/.bin/webpack --watch

electron-build:
	cd packages/electron && npm run build

electron:
	cd packages/electron && npm run electron:start

cli:
	mkdir -p build/cli/packages

	rsync -a --progress packages/cli build/cli/packages --exclude node_modules
	rsync -a --progress packages/core build/cli/packages --exclude node_modules
	rsync -a --progress packages/core-node build/cli/packages --exclude node_modules

	cd build/cli/packages/cli && npm install && cd -

	cd build/cli/packages/core && rm -rf node_modules && npm install --production && cd -
	cd build/cli/packages/core-node && rm -rf node_modules && npm install --production  && cd -

	cd build/cli/packages/cli && DEBUG=* NODE_PRESERVE_SYMLINKS=1 TS_NODE_IGNORE=false oclif-dev pack && cd -
