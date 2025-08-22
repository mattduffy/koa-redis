/** !
 * koa-redis - index.js
 * Copyright(c) 2015
 * MIT Licensed
 *
 * Authors:
 *   dead_horse <dead_horse@qq.com> (http://deadhorse.me)
 */

/**
 * Module dependencies.
 */

import Debug from 'debug'
import {
  createClient,
  createCluster,
  createSentinel,
} from 'redis'
import { EventEmitter } from 'node:events'

// const util = require('util')
// const { EventEmitter } = require('events')
// const debug = require('debug')('koa-redis')
// const Redis = require('ioredis')
// const wrap = require('co-wrap-all')

const debug = Debug('koa-redis')

/**
 * Initialize redis session middleware with `opts` (see the README for more info):
 *
 * @param   {Object}    opts
 * @param   {Boolean}   opts.isRedisCluster redis is cluster
 * @param   {Object}    opts.client         redis client (overides all other options except db
 *                                          and duplicate)
 * @param   {String}    opts.socket         redis socket (DEPRECATED: use 'path' instead)
 * @param   {String}    opts.db             redis db
 * @param   {Boolean}   opts.duplicate      if own client object, will use node redis's
 *                                          duplicatefunction and pass other options
 * @param   {String}    opts.password       redis password
 * @param   {String}    opts.name
 * @param   {String}    opts.keyPrefix
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
 * @param   {Any}       [any]               all other options including above passed to redis
 * @returns {Object}    Redis instance
 */
// function RedisStore(opts) {
class RedisStore extends EventEmitter {
  constructor(opts) {
    super()
    // if (!(this instanceof RedisStore)) {
    //   return new RedisStore(opts)
    // }
    // EventEmitter.call(this)
    this.client = null
    this.keyPrefix = ''
    this.options = opts || {}
  }

  async init(opts) {
    this.options = { ...opts }
    debug('koa-redis redisStore init opts', opts)
    if (this.options) {
      this.keyPrefix = this.options.keyPrefix
    }
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
      //
      // TODO: we should probably omit custom options we have
      // in this lib from `options` passed to instances below
      //
      const redisUrl = this.options.url && this.options.url.toString()
      delete this.options.url

      if (this.options.isRedisCluster) {
        debug('Initializing Redis Cluster')
        delete this.options.isRedisCluster
        this.client = await createCluster(this.options.clusterOptions)
      } else if (this.options.sentinelRootNodes) {
        debug('Initializing Redis Replica set with Sentinels')
        this.client = await createSentinel(this.options)
      } else {
        debug('Initializing standalone Redis')
        delete this.options.isRedisCluster
        delete this.options.nodes
        delete this.options.clusterOptions
        if (redisUrl) {
          this.client = await createClient(redisUrl, this.options)
        } else {
          this.client = await createClient(this.options)
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
    this.client
      .on('error', (err) => console.log('Redis Client Error', err))
      .connect()

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

    // this.client = client

    Object.defineProperty(this, 'status', {
      get() {
        return this.client.status
      },
    })

    Object.defineProperty(this, 'connected', {
      get() {
        return ['connect', 'ready'].includes(this.status)
      },
    })

    // Support optional serialize and unserialize
    this.serialize = (
      typeof this.options.serialize === 'function' && this.options.serialize
    ) || JSON.stringify
    this.unserialize = (
      typeof this.options.unserialize === 'function' && this.options.unserialize
    ) || JSON.parse

    // return the connected redis client instance
    return this
  }

  // util.inherits(RedisStore, EventEmitter)

  async ping() {
    return this.client.ping()
  }

  async get(_sid) {
    let result
    const sid = `${this.keyPrefix}${_sid}`
    debug(`koa-redis->get(${sid})`)
    const data = await this.client.get(sid)
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

  async set(_sid, _sess, _ttl) {
    let ttl
    const sid = `${this.keyPrefix}${_sid}`
    debug(`koa-redis->set(${sid}, ${_sess}, ${_ttl})`)
    if (typeof ttl === 'number') {
      ttl = Math.ceil(_ttl / 1000)
    }
    const sess = this.serialize(_sess)
    if (ttl) {
      debug('SETEX %s %s %s', sid, ttl, sess)
      await this.client.setex(sid, ttl, sess)
    } else {
      debug('SET %s %s', sid, sess)
      await this.client.set(sid, sess)
    }
    debug('SET %s complete', sid)
  }

  async destroy(_sid) {
    const sid = `${this.keyPrefix}${_sid}`
    debug('DEL %s', sid)
    await this.client.del(sid)
    debug('DEL %s complete', sid)
  }

  async quit() {
    // End connection SAFELY
    debug('quitting redis client')
    await this.client.quit()
  }

  async end() {
    // End connection SAFELY
    debug('quitting redis client')
    await this.client.quit()
  }
}
// wrap(RedisStore.prototype)

// End connection SAFELY. The real end() command should
// never be used, as it cuts off to queue.
// RedisStore.prototype.end = RedisStore.prototype.quit

const _redis = new RedisStore()
export { _redis as redisStore }
