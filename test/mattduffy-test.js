/**
 * @module @mattduffy/koa-redis
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @summary The test suite to validate node-redis client connections.
 * @file test/test.js
 */
/* eslint-disable max-classes-per-file */
import path from 'node:path'
import fs from 'node:fs'
import {
  afterEach,
  before,
  describe,
  it,
} from 'node:test'
import assert from 'node:assert/strict'
import * as Dotenv from 'dotenv'
import Debug from 'debug'
// import { redisStore } from '../src/index.js'

const log = Debug('TESTING')
const env = path.resolve('.', 'config/redis.env')
// Connection info already present in the environment takes precedence, then any values
// in config/redis.env (if it exists) fill in the gaps.  Dotenv does not overwrite keys
// that are already set.
const redisEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => k.startsWith('REDIS_')),
)
log('dotenv config file:', env)
Dotenv.config({
  path: env,
  processEnv: redisEnv,
  debug: true,
  encoding: 'utf-8',
})
log(redisEnv)
const skip = { skip: true }
log(skip)

// Sentinel hosts are numbered: REDIS_SENTINEL_01, REDIS_SENTINEL_02, ... each with a
// matching REDIS_SENTINEL_PORT_01, REDIS_SENTINEL_PORT_02, ...
const sentinelRootNodes = Object.keys(redisEnv)
  .map((k) => k.match(/^REDIS_SENTINEL_(\d+)$/))
  .filter((m) => m && redisEnv[m[0]])
  .sort((a, b) => Number(a[1]) - Number(b[1]))
  .map(([k, n]) => ({
    host: redisEnv[k],
    port: Number(redisEnv[`REDIS_SENTINEL_PORT_${n}`]) || 26379,
  }))
// Sentinel settings take precedence over REDIS_HOST, since connecting directly to a
// replica set node can land on a read-only replica.
const useSentinel = sentinelRootNodes.length > 0
log('use sentinel?', useSentinel)

// Builds a node-redis client options object with optional auth and TLS.
function clientOptions(username, password, socket = {}) {
  const options = { socket }
  if (username) {
    options.username = username
  }
  if (password) {
    options.password = password
  }
  if (redisEnv.REDIS_CACERT) {
    options.socket.tls = true
    options.socket.rejectUnauthorized = false
    options.socket.ca = fs.readFileSync(redisEnv.REDIS_CACERT)
  }
  return options
}
describe('Test koa-redis session handling using latest node-redis library.', async () => {
  const keyPrefix = redisEnv.REDIS_KEY_PREFIX
  let redisClient
  let redisReplset
  let redisCluster

  class Standalone {
    config = {}

    constructor() {
      log('creating standalone redis client config object')
      this.config.keyPrefix = keyPrefix
      this.config.isRedisCluster = false
      this.config.isRedisReplSet = false
      // Defaults to an unauthenticated standalone redis on localhost:6379.
      Object.assign(this.config, clientOptions(redisEnv.REDIS_USER, redisEnv.REDIS_PASSWORD, {
        port: Number(redisEnv.REDIS_HOST_PORT) || 6379,
        host: redisEnv.REDIS_HOST || 'localhost',
        reconnectStrategy: false,
      }))
    }
  }

  class Replset {
    config = {}

    constructor() {
      log('creating replset redis client config object')
      this.config.keyPrefix = keyPrefix
      this.config.isRedisCluster = false
      this.config.isRedisReplset = true
      this.config.name = redisEnv.REDIS_NAME || 'mymaster'
      this.config.role = 'master'
      this.config.lazyConnect = true
      this.config.sentinelRootNodes = sentinelRootNodes
      // Both socket objects are always created, init() adds a reconnectStrategy to each.
      this.config.sentinelClientOptions = clientOptions(
        redisEnv.REDIS_SENTINEL_USER,
        redisEnv.REDIS_SENTINEL_PASSWORD,
        { reconnectStrategy: false },
      )
      this.config.nodeClientOptions = clientOptions(
        redisEnv.REDIS_USER,
        redisEnv.REDIS_PASSWORD,
        { reconnectStrategy: false },
      )
      if (redisEnv.REDIS_DB) {
        this.config.nodeClientOptions.database = Number(redisEnv.REDIS_DB)
      }
    }
  }

  class Cluster {
    config = {}

    constructor() {
      this.config.keyPrefix = keyPrefix
      this.config.isRedisCluster = true
      this.config.isRedisReplset = false
      this.config.rootNodes = []
      this.config.defaults = {
        username: redisEnv.REDIS_USER,
        password: redisEnv.REDIS_PASSWORD,
      }
      if (redisEnv.REDIS_CACERT !== '') {
        this.config.socket = {}
        this.config.nodeClientOptions.socket.tls = true
        this.config.nodeClientOptions.socket.rejectUnauthorized = false
        this.config.nodeClientOptions.socket.ca = fs.readFileSync(redisEnv.REDIS_CACERT)
      }
    }
  }

  // Connect through the sentinels if any are configured, otherwise standalone.
  function defaultConfig() {
    return (useSentinel ? new Replset() : new Standalone()).config
  }

  before(async () => {

  })

  // Close any connection a test left open (e.g. a failed assertion skipped its quit()),
  // otherwise the open socket keeps the test runner from exiting.
  afterEach(async () => {
    await Promise.all([redisClient, redisReplset, redisCluster].map(async (store) => {
      if (store?.isOpen) {
        try {
          await store.quit()
        } catch (e) {
          log('error closing connection after test', e)
        }
      }
    }))
    redisClient = null
    redisReplset = null
    redisCluster = null
  })

  it('Redis standalone should connect and acknowledge a PING', async () => {
    const {
      RedisStore,
      // redisStore,
    } = await import('../src/index.js')
    const standalone = new Standalone()
    // log('standalone config', standalone.config)
    redisClient = await (new RedisStore()).init(standalone.config)
    assert(await redisClient.ping() === 'PONG')
    await redisClient.quit()
  })

  it('Redis standalone should connect via URL and acknowledge a PING', async () => {
    const standalone = new Standalone()
    const auth = (redisEnv.REDIS_USER || redisEnv.REDIS_PASSWORD)
      ? `${redisEnv.REDIS_USER || ''}:${redisEnv.REDIS_PASSWORD || ''}@`
      : ''
    standalone.config.url = `redis://${auth}`
      + `${standalone.config.socket.host}:${standalone.config.socket.port}`
      + `/${redisEnv.REDIS_DB || ''}`
    delete standalone.config.socket.host
    delete standalone.config.socket.port
    delete standalone.config.username
    delete standalone.config.password
    // log('standalone config w/ url paramater', standalone.config)
    const {
      RedisStore,
      // redisStore,
    } = await import('../src/index.js')
    const _redisClient = new RedisStore()
    redisClient = await _redisClient.init(standalone.config)
    log('what is redis status?', redisClient.status)
    log('is redis connected?', redisClient.connected)
    assert(redisClient.isOpen)
    assert(redisClient.isReady)
    assert(await redisClient.ping() === 'PONG')
    await redisClient.quit()
  })

  it('Redis should set a key (keyPrefix included) { a: 1 }.', async () => {
    const { RedisStore } = await import('../src/index.js')
    const _r = new RedisStore()
    redisClient = await _r.init(defaultConfig())
    const key = 'key:1'
    const val = { a: 1000 } // time in milliseconds
    await redisClient.set(key, val)
    const check = await redisClient.get(key)
    log(`checking the returned value of key ${keyPrefix}${key}`, check)
    await redisClient.quit()
    assert.equal(val.a, check.a)
  })

  it('Redis should set a key (keyPrefix NOT included) { a: 2 }.', async () => {
    const config = defaultConfig()
    delete config.keyPrefix
    const { RedisStore } = await import('../src/index.js')
    const _r = new RedisStore()
    redisClient = await _r.init(config)
    const key = 'test:koa-redis:key:2'
    const val = { a: 2000 } // time in milliseconds
    await redisClient.set(key, val)
    const check = await redisClient.get(key)
    log(`checking the returned value of key ${keyPrefix}${key}`, check)
    await redisClient.quit()
    assert.equal(val.a, check.a)
  })

  it('Redis should set a key with ttl { a: 3 }, { EX: 86400 }.', async () => {
    const { RedisStore } = await import('../src/index.js')
    const _r = new RedisStore()
    redisClient = await _r.init(defaultConfig())
    const key = 'key:ttl:3'
    const val = { a: 3 }
    const ttl = 86400000 // time in milliseconds
    await redisClient.set(key, val, ttl)
    const check = await redisClient.ttl(key)
    // log(`checking the returned ttl ${keyPrefix}${key}`, check)
    await redisClient.quit()
    assert((ttl > check) && (check > 0))
  })

  it('Expired key should return -2 { a: 4 }.', async () => {
    const { RedisStore } = await import('../src/index.js')
    const _r = new RedisStore()
    redisClient = await _r.init(defaultConfig())
    const key = 'key:ttl:4'
    const val = { a: 4000 } // time in milliseconds
    const ttl = 1
    await redisClient.set(key, val, ttl)
    await new Promise((resolve) => { setTimeout(resolve, 2000) })
    const check = await redisClient.ttl(key)
    log(`checking the returned ttl ${keyPrefix}${key}`, check)
    await redisClient.quit()
    assert.equal(check, -2)
  })

  it('should not throw an error with bad JSON { I will cause an error! }', async () => {
    const { RedisStore } = await import('../src/index.js')
    const _r = new RedisStore()
    redisClient = await _r.init(defaultConfig())
    const key = 'key:badKey:5'
    // const val = { I will cause an error! }
    await redisClient.set(key, '{ I will cause an error! }')
    const check = await redisClient.get(key)
    log(`checking the returned key ${keyPrefix}${key}`, check)
    await redisClient.quit()
    assert.equal('{ I will cause an error! }', check)
  })

  it('destroy a key { a: 6 }', async () => {
    const { RedisStore } = await import('../src/index.js')
    const _r = new RedisStore()
    redisClient = await _r.init(defaultConfig())
    const key = 'key:destroy:6'
    await redisClient.set(key, { a: 6000 }) // time in milliseconds
    const check = await redisClient.destroy(key)
    log('destroy', check)
    await redisClient.quit()
    assert(check > 0)
  })

  it('Redis should return available server modules.', async (t) => {
    const { RedisStore } = await import('../src/index.js')
    const _r = new RedisStore()
    const configWithDataType = defaultConfig()
    configWithDataType.dataType = 'ReJSON-RL'
    redisClient = await _r.init(configWithDataType)
    const mods = await redisClient.mods()
    await redisClient.quit()
    assert(Array.isArray(mods))
    if (!mods.includes('ReJSON')) {
      t.skip('ReJSON module is not loaded on this redis server')
      return
    }
    assert(mods.length > 0)
  })

  it('Data type of session value should be ReJSON-RL { a: 7 }.', async () => {
    const { RedisStore } = await import('../src/index.js')
    const _r = new RedisStore()
    const configWithDataType = defaultConfig()
    configWithDataType.dataType = 'ReJSON'
    redisClient = await _r.init(configWithDataType)
    const session = { test: true, name: 'Matt', package: '@mattduffy/koa-redis' }
    const key = 'key:ttl:7'
    const ttl = (((86400 / 24) / 60) * 3) * 1000 // time in milliseconds
    await redisClient.set(key, session, ttl)
    const check = await redisClient.get(key)
    await redisClient.quit()
    log(check)
    assert.equal(session.name, check.name)
  })

  it('Expire a JSON session document after 4 seconds { a: 8 }.', async () => {
    const { RedisStore } = await import('../src/index.js')
    const _r = new RedisStore()
    const configWithDataType = defaultConfig()
    configWithDataType.dataType = 'ReJSON'
    redisClient = await _r.init(configWithDataType)
    const session = { a: 8 }
    const key = 'key:ttl:8'
    const ttl = 4
    await redisClient.set(key, session, ttl)
    await new Promise((resolve) => { setTimeout(resolve, 4100) })
    const check = await redisClient.ttl(key)
    log(`checking for expired ttl ${keyPrefix}${key}`, check)
    await redisClient.quit()
    log(check)
    assert.equal(check, -2)
  })

  it('Redis replset should connect and acknowledge a PING', { skip: !useSentinel }, async () => {
    const replset = new Replset()
    const { RedisStore } = await import('../src/index.js')
    const _redisReplset = new RedisStore()
    redisReplset = await _redisReplset.init(replset.config)
    assert(await redisReplset.ping() === 'PONG')
    log('what does quit say?', await redisReplset.quit())
  })

  it('Redis cluster should connect and acknowledge a PING', skip, async () => {
    const cluster = new Cluster()
    const {
      RedisStore,
      // redisStore,
    } = await import('../src/index.js')
    const _redisCluster = new RedisStore()
    redisCluster = await _redisCluster.init(cluster.config)
    assert(await redisCluster.ping() === 'PONG')
    await redisCluster.quit()
  })
})
