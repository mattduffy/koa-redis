/**
 * @module  @mattduffy/koa-redis
 * @author  Matthew Duffy <mattduffy@gmail.com>
 * @summary A fork of the original koa/koa-redis package.  This fork replaces ioredis with the
 *          official node-redis package, with support for sentinels and clusters.
 * @file    src/index.js
 */
/* Original Author's attribution. */
/**
 * koa-redis - index.js
 * Copyright(c) 2015
 * MIT Licensed
 *
 * Authors:
 *   dead_horse <dead_horse@qq.com> (http://deadhorse.me)
 */

import Debug from 'debug'
import {
  createClient,
  createCluster,
  createSentinel,
} from 'redis'
import { EventEmitter } from 'node:events'

const debug = Debug('koa-redis')

/**
 * Initialize redis session middleware with `opts` (see the README for more info):
 *
 * @param   {Object}    opts
 * @param   {String}    opts.db                   Redis db.
 * @param   {Object}    opts.client               Redis client (overides all other options
 *                                                except db and duplicate).
 * @param   {String}    opts.socket               Redis socket (DEPRECATED: use 'path' instead).
 * @param   {Boolean}   opts.duplicate            If own client object, will use node redis's
 *                                                duplicate function and pass other options.
 * @param   {String}    opts.password             Redis user password.
 * @param   {String}    [opts.redisUrl]
 * @param   {Boolean}   [opts.isRedisSingle = false]
 * @param   {Boolean}   [opts.isRedisReplset = false]
 * @param   {Boolean}   [opts.isRedisCluster = false]
 * @param   {String}    opts.name
 * @param   {String}    [opts.keyPrefix]
 * @param   {Object[]}  opts.sentinelRootNodes
 * @param   {Object}    opts.sentinelClientOptions
 * @param   {String}    opts.sentinelClientOptions.username
 * @param   {String}    opts.sentinelClientOptions.password
 * @param   {Object}    opts.sentinelClientOptions.socket
 * @param   {Boolean}   opts.sentinelClientOptions.socket.tls
 * @param   {Boolean}   opts.sentinelClientOptions.socket.rejectUnauthorized
 * @param   {Blob}      opts.sentinelClientOptions.socket.ca
 * @param   {Object}    opts.nodeClientOptions
 * @param   {String}    opts.nodeClientOptions.username
 * @param   {String}    opts.nodeClientOptions.password
 * @param   {Object}    opts.nodeClientOptions.socket
 * @param   {Boolean}   opts.nodeClientOptions.socket.tls
 * @param   {Boolean}   opts.nodeClientOptions.socket.rejectUnauthorized
 * @param   {Blob}      opts.nodeClientOptions.socket.ca
 * @param   {String}    opts.role
 * @param   {Object[]}  opts.rootNodes
 * @param   {Object}    opts.defaults
 * @param   {Object}    opts.defaults.username
 * @param   {Object}    opts.defaults.password
 * @param   {Object}    [opts.defaults.socket]
 * @param   {Boolean}   [opts.defaults.socket.tls]
 * @param   {Boolean}   [opts.defaults.socket.rejectUnauthorized]
 * @param   {Blob}      [opts.defaults.socket.ca]
 * @param   {string}    [opts.dataType = string]  Redis data type to use, string or ReJSON-RL.
 * @param   {Any}       [any]                     All other options passed to redis.
 * @returns {Object}                              Redis instance.
 */
class RedisStore extends EventEmitter {
  /**
   * The RedisStore constructor method.
   * @summary Returns an instance, with an empty redis client placeholder.
   * @author Matthew Duffy <mattduffy@gmail.com>
   * @param {Object} [opts = null] - An optional options object.
   * @returns {RedisStore}
   */
  constructor(opts = null) {
    super()
    this.client = null
    this.clientType = null
    this.keyPrefix = ''
    this.dataType = ''
    this.options = opts || {}
  }

  /**
   * Initialized an instance of the RedisStore class with redis client config object.
   * @summary Initialized an instance of the RedisStore class with redis client config object.
   * @author Matthew Duffy <mattduffy@gmail.com>
   * @async
   * @param {Object} opts - Redis client configuration options.
   * @return {RedisStore} Returns the instance with a configured and connected redis client.
   */
  async init(opts) {
    this.options.isRedisSingle = true
    this.options.isRedisReplset = false
    this.options.isRedisCluster = false
    this.options.redisUrl = false
    this.options.lazyConnect = false
    this.options = { ...opts }
    // debug('redisStore init opts', opts)
    if (this.options) {
      this.keyPrefix = this.options?.keyPrefix || ''
    }
    this.dataType = this.options?.dataType || 'string'
    // For backwards compatibility
    this.options.password = this.options.password
      || this.options.auth_pass
      || this.options.pass
      || null
    // For backwards compatibility
    this.options.path = this.options.path
      || this.options.socket
      || null

    if (!this.options.client) {
      // const redisUrl = this.options.url && this.options.url.toString()
      // delete this.options.url

      if (this.options.isRedisCluster) {
        debug('Initializing Redis Cluster')
        delete this.options.isRedisCluster
        delete this.options.isRedisSingle
        delete this.options.isRedisReplset
        this.client = await createCluster(this.options.clusterOptions)
        this.clientType = 'cluster'
      } else if (this.options.sentinelRootNodes
        && this.options.isRedisReplset
        && !this.options.isRedisCluster) {
        delete this.options.isRedisSingle
        delete this.options.isRedisReplset
        delete this.options.isRedisCluster
        debug('Initializing Redis Replica set with Sentinels')
        this.client = await createSentinel(this.options)
        this.clientType = 'sentinel'
      } else {
        debug('Initializing standalone Redis')
        delete this.options.isRedisSingle
        delete this.options.isRedisReplset
        delete this.options.isRedisCluster
        delete this.options.clusterOptions
        delete this.options.nodes
        if (this.options.redisUrl) {
          this.client = await createClient(this.options.redisUrl, this.options)
        } else {
          if (this.options.url) {
            // debug('standalone client, converting url to parts:', this.options.url)
            const url = new URL(this.options.url)
            if (!this.options.socket) {
              this.options.socket = {}
            }
            this.options.socket.host = url.hostname
            this.options.socket.port = url.port
            this.options.username = url.username
            this.options.password = url.password
            delete this.options.url
          }
          // debug('standalone opts', this.options)
          this.client = await createClient(this.options)
          this.clientType = 'single'
          debug('client created?', this.client)
        }
      }
    } else if (this.options.duplicate) {
      // Duplicate client and update with options provided
      debug('Duplicating provided client with new options (if provided)')
      const dupClient = this.options.client
      delete this.options.client
      delete this.options.duplicate
      // Useful if you want to use the DB option without
      // adjusting the client DB outside koa-redis
      this.client = dupClient.duplicate(this.options)
    } else {
      debug('Using provided client')
      this.client = this.options.client
    }

    if (!this.options.client) {
      await this.client.connect()
    }

    if (this.options.db) {
      debug('selecting db %s', this.options.db)
      this.client.select(this.options.db)
      this.client.on('connect', () => {
        this.client.send_anyways = true
        this.client.select(this.options.db)
        this.client.send_anyways = false
      })
    }

    ['connect', 'ready', 'error', 'close', 'reconnecting', 'end'].forEach(
      (name) => {
        this.on(name, () => debug(`redis ${name}`))
        this.client.on(name, this.emit.bind(this, name))
      },
    )

    // For backwards compatibility
    this.client.on('end', this.emit.bind(this, 'disconnect'))

    // This is legacy ioredis stuff, not used in new fork.
    // Object.defineProperty(this, 'status', {
    //   get() {
    //     return this.client.status
    //   },
    // })

    // Object.defineProperty(this, 'connected', {
    //   get() {
    //     return ['connect', 'ready'].includes(this.status)
    //   },
    // })

    // Support optional serialize and unserialize
    this.serialize = (
      typeof this.options.serialize === 'function' && this.options.serialize
    ) || JSON.stringify
    this.unserialize = (
      typeof this.options.unserialize === 'function' && this.options.unserialize
    ) || JSON.parse

    // check the available server modules, is ReJSON included?
    const mods = await this.mods()
    if (this.dataType === 'ReJSON' && mods.includes('ReJSON')) {
      this.useReJSON = true
    } else {
      this.useReJSON = false
    }
    // return the connected redis client instance
    return this
  }

  // util.inherits(RedisStore, EventEmitter)

  /**
   *  Returns PONG if no argument is provided.
   *  @summary Returns PONG if no argument is provided.
   *  @author Matthew Duffy <mattduffy@gmail.com>
   *  @async
   *  @return {string} The string 'PONG'
   */
  async ping() {
    return this.client.ping()
  }

  /**
   * Returns an array of available Redis server modules.
   * @summary Returns an array of available Redis server modules.
   * @author Matthew Duffy <mattduffy@gmail.com>
   * @async
   * @return {string[]} Server module names
   */
  async mods() {
    if (this.modules?.length > 0) {
      return this.modules
    }
    const mods = await this.client.info('modules')
    // debug(mods)
    const lines = mods.split('\r\n')
    const availableModules = lines.filter((m) => /^module:name=.*/.test(m))
    this.modules = availableModules.map((m) => m.slice(m.indexOf('=') + 1, m.indexOf(',')))
    return this.modules
  }

  /**
   *  Returns the string value of the given key.
   *  @summary Returns the string value of the given key.
   *  @author Matthew Duffy <mattduffy@gmail.com>
   *  @async
   *  @param {string} _sid - The name of the key whose value is returned.
   *  @return {string|null} The value of 'key' or nil if key does not exist.
   */
  async get(_sid) {
    let result
    let data
    const sid = `${this.keyPrefix}${_sid}`
    if (!this.useReJSON) {
      debug(`koa-redis->get(${sid})`)
      data = await this.client.get(sid)
    } else {
      debug(`koa-redis->json->get(${sid})`)
      data = await this.client.json.get(sid)
      return data
    }
    debug('get session: %s', data || 'none')
    if (!data) {
      return null
    }
    try {
      result = this.unserialize(data.toString())
    } catch (err) {
      // ignore err
      debug('parse session error: %s', err.message)
    }
    return result
  }

  /**
   * Set the given key to the given value.
   * @summary Set the given key to the given value, optionally with expiry time.
   * @author Matthew Duffy <mattduffy@gmail.com>
   * @async
   * @param {string} _sid - The name of the key whose value is to be set.
   * @param {string|Object} _sess - The value to be set on key <_sid>.
   * @param {number} [_ttl] - An optional time in seconds before key expires.
   * @return {undefined}
   */
  async set(_sid, _sess, _ttl) {
    let ttl = null
    const sid = `${this.keyPrefix}${_sid}`
    debug('what is this.useReJSON?', this.useReJSON)
    const sess = (this.useReJSON) ? _sess : this.serialize(_sess)
    debug('what is _sess now?', _sess)
    if (typeof _ttl === 'number') {
      // ttl = Math.ceil(_ttl / 1000)
      // keep the value as seconds, not milliseconds
      ttl = Math.ceil(_ttl)
      debug('ttl', ttl)
    }
    // eslint-disable-next-line
    debug(`koa-redis->set(${sid}, ${sess}${ttl ? ', { EX: ' + ttl + ' }': ''})`)

    if (ttl) {
      if (!this.useReJSON) {
        debug('SET %s %s %o', sid, sess, { EX: ttl })
        await this.client.set(sid, sess, { EX: ttl })
      } else {
        debug('json.set(%s, %s, %o)', sid, sess)
        await this.client.json.set(sid, '$', sess)
        await this.client.expire(sid, ttl)
      }
    } else {
      switch (this.useReJSON) {
        case false:
          debug('SET %s %s', sid, sess)
          await this.client.set(sid, sess)
          break
        case true:
          debug('json.set(%s, %s)', sid, sess)
          await this.client.json.set(sid, '$', sess)
          break
        default:
          debug('failed to set session (w/out TTL).')
          debug('what was this.useReJSON?', this.useReJSON)
          break
      }
    }
    debug('%s %s complete', (this.useReJSON) ? 'json.set' : 'SET', sid)
  }

  /**
   * Returns the remaining time to live of a key.
   * @summary Returns the remaining time to live of a key.
   * @author Matthew Duffy <mattduffy@gmail.com>
   * @async
   * @param {string} _key - The key whose expiry time is requested.
   * @return {number} The number of seconds remaining before expiration (-2 if key does
   *                  not exist, -1 if the key has no expiration set).
   */
  async ttl(_key) {
    debug(
      `client.ttl(${this.keyPrefix}${_key}`,
      await this.client.ttl(`${this.keyPrefix}${_key}`),
    )
    return this.client.ttl(`${this.keyPrefix}${_key}`)
  }

  /**
   * Removes the specified key.
   * @summary Removes the specified key.
   * @author Matthew Duffy <mattduffy@gmail.com>
   * @async
   * @param {string} _sid - The key to be deleted.
   * @return {number} The number of keys successfully deleted.
   */
  async destroy(_sid) {
    const sid = `${this.keyPrefix}${_sid}`
    debug('DEL %s', sid)
    return this.client.del(sid)
    // debug('DEL %s complete', sid)
  }

  /**
   * Ask the server to close the connection.
   * @summary Ask the server to close the connection.
   * @author Matthew Duffy <mattduffy@gmail.com>
   * @async
   * @return {undefined}
   */
  async quit() {
    // End connection SAFELY
    debug('quitting redis client')
    let _quit
    if (this.clientType === 'cluster') {
      _quit = await this.client.close()
    } else if (this.clientType === 'sentinel') {
      _quit = await this.client.close()
    } else {
      _quit = await this.client.quit()
    }
    return _quit
  }

  /**
   * Ask the server to close the connection.
   * @summary Ask the server to close the connection.
   * @author Matthew Duffy <mattduffy@gmail.com>
   * @async
   * @borrows quit as end
   */
  async end() {
    // End connection SAFELY
    debug('quitting redis client')
    return this.client.quit()
  }

  /**
   * Check if the the client is connected and ready to send commands.
   * @summary Check if the the client is connected and ready to send commands.
   * @author Matthew Duffy <mattduffy@gmail.com>
   * @type {boolean}
   */
  get isReady() {
    return this.client.isReady
  }

  /**
   * Check if the the client is connected and ready to send commands.
   * @summary Check if the the client is connected and ready to send commands.
   * @author Matthew Duffy <mattduffy@gmail.com>
   * @type {boolean}
   */
  get isOpen() {
    return this.client.isOpen
  }

  /**
   * Should return the current state of the redis client [ready, waiting, etc], but currently
   * the client seems to only return 'undefined'.
   * @summary Should return the current state of the redis client [ready, waiting, etc].
   * @author Matthew Duffy <mattduffy@gmail.com>
   * @type {string} open, ready, or waiting
   */
  get status() {
    if (this.client.isOpen) {
      return 'open'
    }
    if (this.client.isReady) {
      return 'ready'
    }
    return 'waiting'
  }

  /**
   * Returns true if the client is connected and ready.
   * @summary Returns true if the client is connected and ready.
   * @author Matthew Duffy <mattduffy@gmail.com>
   * @type {boolean}
   */
  get connected() {
    return this.client.isReady
  }
}
// wrap(RedisStore.prototype)

// End connection SAFELY. The real end() command should
// never be used, as it cuts off to queue.
// RedisStore.prototype.end = RedisStore.prototype.quit

const _redis = new RedisStore()
export {
  RedisStore,
  _redis as redisStore,
}
