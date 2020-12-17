"use strict";

const { Dispatcher, Socket } = require("./socket");
const debug = require("debug")("yoke");
const execute = Symbol("execute");
class Service {
  constructor(dependency, providers, dver) {
    let methods = null;
    this.mdsig = Object.assign({}, dependency.methodSignature);
    this.dispatcher = new Dispatcher();
    for (let i = 0, l = providers.length; i < l; i++) {
      const provider = providers[i];
      const metadata = provider.metadata;
      methods = metadata.methods.split(",");
      this.initSockets(provider.ip, provider.port);
    }
    debug(`The ${dependency.interface} method list: ${methods.join(", ")}`);
    this.injectMethods(methods);

    this.encodeParam = {
      _dver: dver || "2.5.3.6",
      _interface: dependency.interface,
      _version: dependency.version,
      _group: dependency.group,
      _timeout: dependency.timeout
    };

    this.checkReady();
  }

  checkReady() {
    if (this.isReady) return;

    return new Promise((resolve, reject) => {
      const check = async (socket) => {
        await socket.checkConnect();
        this.isReady = true;
        resolve();
      }
      this.dispatcher.queue.forEach(item => check(item));
      setTimeout(() => reject(), 40000);
    });
  }

  initSockets(host, port) {
    this.dispatcher.insert(new Socket(port, host));
    this.dispatcher.insert(new Socket(port, host));
    this.dispatcher.insert(new Socket(port, host));
  }

  injectMethods(methods) {
    for (let i = 0, l = methods.length; i < l; i++) {
      const method = methods[i];

      this[method] = async (...args) => {
        await this.checkReady();
        if (this.mdsig[method]) {
          args = this.mdsig[method](...args);
        }
        return new Promise((resolve, reject) => this[execute](method, args, resolve, reject));
      };
    }
  }

  [execute](method, args, resolve, reject) {
    const attach = Object.assign({}, this.encodeParam, {
      _method: method,
      _args: args
    });
    const el = { attach, resolve, reject };

    this.dispatcher.gain((err, conn) => {
      if (err) {
        return reject(err);
      }

      conn.invoke(el, err => {
        if (err) {
          reject(err);
        }
        this.dispatcher.release(conn);

        if (conn.isConnect === false) {
          this.dispatcher.purgeConn(conn);
        }
      });
    });
  }
}

module.exports = { Service };
