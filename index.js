/**
 * Created by panzhichao on 16/8/2.
 */
"use strict";
const debug = require("debug")("yoke");
const NacosNamingClient = require('nacos').NacosNamingClient;
const {
  Service
} = require("./libs/service");
const EventEmitter = require("events");
const {
  print
} = require("./utils");

class Yoke extends EventEmitter {
  constructor(opt) {
    super();
    this.name = opt.application.name;
    this.group = opt.group;
    this.timeout = opt.timeout || 6000;
    this.root = opt.root || "dubbo";
    this.dependencies = opt.dependencies || {};
    this.nacosIsConnect = false;
    this.dver = opt.dubboVer;
    if (opt.register) {
      print.warn(
        `WARNING: The attribute 'register' is deprecated and will be removed in the future version. Use registry instead.`
      );
    }
    this.registry = opt.registry || opt.register;

    /* setInterval(async () => { 
      try {
        await this.initClient() 
      } catch(e) {
        console.error('update client fail');
        console.error(e);
      }
    }, 20000); */
  }

  async initClient() {
    // this.client = zookeeper.createClient(this.registry, {
    //   sessionTimeout: 30000,
    //   spinDelay: 1000,
    //   retries: 5
    // });

    // this.client.connect();
    // this.client.once("connected", this.onOnceConnected.bind(this));

    const logger = console;
    this.client = new NacosNamingClient({
      logger,
      ...this.registry
    });

    this.checkConnection();
    await this.client.ready();
    await this.onOnceConnected();
    this.client.close();
  }

  checkConnection() {
    const err =
      `FATAL: It seems that nacos cannot be connected, please check registry address or try later.`;
    this.nacosConnectTimeout = setTimeout(() => {
      clearTimeout(this.nacosConnectTimeout);
      if (!this.nacosIsConnect) {
        print.err(err);
        this.client.close();
        throw new Error(err);
      }
    }, 20000);
  }

  async onOnceConnected() {
    await this.retrieveServices();
    debug("nacos connect successfully");
    print.info("Dubbo service init done");
    this.nacosIsConnect = true;
    this.regConsumer();
  }

  retrieveServices() {
    return new Promise(async (resolve, reject) => {
      try {
        setTimeout(() => reject(new Error('retrieveServices timeout')), 200000);
        await Promise.all(Object.entries(this.dependencies).map(
          value => {
            const [key, val] = value;
            const {
              interface: it,
              version,
              group,
              groupName = 'DEFAULT_GROUP',
              category = 'providers'
            } = val;
            const serviceName = `${category}:${it}:${version}:${group}`;
            // this.client.getChildren(
            //   path,
            //   this.watchService.bind(this),
            //   this.resolveService(path, key, val)
            // );
            return new Promise((rl, rj) => {
              setTimeout(() => rj(new Error(`${serviceName} subscribe timeout`)), 20000);
              try {
                this.client.subscribe({
                    groupName,
                    serviceName
                  },
                  hosts => {
                    this.resolveService(serviceName, key, val)(null, hosts);
                    rl();
                  }
                );
              } catch (e) {
                rj(e)
              }
            });
          }));

        resolve();
      } catch (e) {
        reject(e);
      }
    });
  }

  // watchService(event) {
  //   debug(event, "watch event");
  //   this.retrieveServices();
  //   this.emit("service:changed", event);
  // }

  resolveService(serviceName, depKey, depVal) {
    return (error, hosts, stat) => {
      if (error) {
        print.err(error);
        return;
      }
      if (hosts && !hosts.length) {
        const errMsg =
          `WARNING: Can\'t find the service: ${serviceName}, please check!`;
        print.warn(errMsg);
        return;
      }
      const size = hosts.length;
      const providers = [];

      for (let i = 0; i < size; i++) {
        const provider = hosts[i];
        const metadata = provider.metadata;
        if (
          metadata.version === depVal.version &&
          metadata.group === depVal.group &&
          metadata.protocol === "dubbo"
        ) {
          providers.push(provider);
        }
      }
      if (!providers.length) {
        print.warn(
          `WARNING: Please check the version、 group、 protocol(must dubbo) of dependency (${depKey}),`,
          `due to they are not matched with any provider service found in nacos.`
        );

        return;
      }

      this.determineService(depKey, depVal, providers);
    };
  }

  determineService(depKey, depVal, providers) {
    this[depKey] = new Service(depVal, providers, this.dver);
  }

  regConsumer() {
    // reg.consumer.call(this);
  }
}

module.exports = Yoke;
