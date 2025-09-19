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
  after,
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
const redisEnv = {}
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
      this.config.username = redisEnv.REDIS_USER
      this.config.password = redisEnv.REDIS_PASSWORD
      this.config.socket = {
        port: redisEnv.REDIS_HOST_PORT,
        host: redisEnv.REDIS_HOST,
        reconnectStrategy: false,
      }
      if (redisEnv.REDIS_CACERT !== '') {
        this.config.socket.tls = true
        this.config.socket.rejectUnauthorized = false
        this.config.socket.ca = fs.readFileSync(redisEnv.REDIS_CACERT)
      }
    }
  }

  class Replset {
    config = {}

    constructor() {
      log('creating replset redis client config object')
      this.config.keyPrefix = keyPrefix
      this.config.isRedisCluster = false
      this.config.isRedisReplset = true
      this.config.name = redisEnv.REDIS_NAME
      this.config.database = redisEnv.REDIS_DB
      this.config.role = 'master'
      this.config.lazyConnect = true
      this.config.sentinelRootNodes = [
        { host: redisEnv.REDIS_SENTINEL_01, port: redisEnv.REDIS_SENTINEL_PORT_01 },
        { host: redisEnv.REDIS_SENTINEL_02, port: redisEnv.REDIS_SENTINEL_PORT_02 },
        { host: redisEnv.REDIS_SENTINEL_03, port: redisEnv.REDIS_SENTINEL_PORT_03 },
      ]
      this.config.sentinelClientOptions = {
        username: redisEnv.REDIS_SENTINEL_USER,
        password: redisEnv.REDIS_SENTINEL_PASSWORD,
      }
      if (redisEnv.REDIS_CACERT !== '') {
        this.config.sentinelClientOptions.socket = {}
        this.config.sentinelClientOptions.socket.reconnectStrategy = false
        this.config.sentinelClientOptions.socket.tls = true
        this.config.sentinelClientOptions.socket.rejectUnauthorized = false
        this.config.sentinelClientOptions.socket.ca = fs.readFileSync(redisEnv.REDIS_CACERT)
      }
      this.config.nodeClientOptions = {
        username: redisEnv.REDIS_USER,
        password: redisEnv.REDIS_PASSWORD,
      }
      if (redisEnv.REDIS_CACERT !== '') {
        this.config.nodeClientOptions.socket = {}
        this.config.nodeClientOptions.socket.reconnectStrategy = false
        this.config.nodeClientOptions.socket.tls = true
        this.config.nodeClientOptions.socket.rejectUnauthorized = false
        this.config.nodeClientOptions.socket.ca = fs.readFileSync(redisEnv.REDIS_CACERT)
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

  before(async () => {

  })

  after(async () => {
    if (redisClient) {
      // await redisClient.quit()
    }
    if (redisReplset) {
      // await redisReplset.quit()
    }
    if (redisCluster) {
      // await redisCluster.quit()
    }
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
    standalone.config.url = `redis://${redisEnv.REDIS_USER}:${redisEnv.REDIS_PASSWORD}`
      + `@${redisEnv.REDIS_HOST}:${redisEnv.REDIS_HOST_PORT}`
      + `/${redisEnv.REDIS_DB}`
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

  it('Redis standalone should set a key (keyPrefix included) { a: 1 }.', async () => {
    const standalone = new Standalone()
    const { RedisStore } = await import('../src/index.js')
    const _r = new RedisStore()
    redisClient = await _r.init(standalone.config)
    const key = 'key:1'
    const val = { a: 1 }
    await redisClient.set(key, val)
    const check = await redisClient.get(key)
    log(`checking the returned value of key ${keyPrefix}${key}`, check)
    await redisClient.quit()
    assert.equal(val.a, check.a)
  })

  it('Redis standalone should set a key (keyPrefix NOT included) { a: 2 }.', async () => {
    const standalone = new Standalone()
    delete standalone.config.keyPrefix
    const { RedisStore } = await import('../src/index.js')
    const _r = new RedisStore()
    redisClient = await _r.init(standalone.config)
    const key = 'test:koa-redis:key:2'
    const val = { a: 2 }
    await redisClient.set(key, val)
    const check = await redisClient.get(key)
    log(`checking the returned value of key ${keyPrefix}${key}`, check)
    await redisClient.quit()
    assert.equal(val.a, check.a)
  })

  it('Redis standalone should set a key with ttl { a: 3 }, { EX: 86400 }.', async () => {
    const standalone = new Standalone()
    const { RedisStore } = await import('../src/index.js')
    const _r = new RedisStore()
    redisClient = await _r.init(standalone.config)
    const key = 'key:ttl:3'
    const val = { a: 3 }
    const ttl = 86400
    await redisClient.set(key, val, ttl)
    const check = await redisClient.ttl(key)
    // log(`checking the returned ttl ${keyPrefix}${key}`, check)
    await redisClient.quit()
    assert((ttl > check) && (check > 0))
  })

  it('Expired key should return -2 { a: 4 }.', async () => {
    const standalone = new Standalone()
    const { RedisStore } = await import('../src/index.js')
    const _r = new RedisStore()
    redisClient = await _r.init(standalone.config)
    const key = 'key:ttl:4'
    const val = { a: 4 }
    const ttl = 1
    await redisClient.set(key, val, ttl)
    await new Promise((resolve) => { setTimeout(resolve, 2000) })
    const check = await redisClient.ttl(key)
    log(`checking the returned ttl ${keyPrefix}${key}`, check)
    await redisClient.quit()
    assert.equal(check, -2)
  })

  it('should not throw an error with bad JSON { I will cause an error! }', async () => {
    const standalone = new Standalone()
    const { RedisStore } = await import('../src/index.js')
    const _r = new RedisStore()
    redisClient = await _r.init(standalone.config)
    const key = 'key:badKey:5'
    // const val = { I will cause an error! }
    await redisClient.set(key, '{ I will cause an error! }')
    const check = await redisClient.get(key)
    log(`checking the returned key ${keyPrefix}${key}`, check)
    await redisClient.quit()
    assert.equal('{ I will cause an error! }', check)
  })

  it('destroy a key { a: 6 }', async () => {
    const standalone = new Standalone()
    const { RedisStore } = await import('../src/index.js')
    const _r = new RedisStore()
    redisClient = await _r.init(standalone.config)
    const key = 'key:destroy:6'
    await redisClient.set(key, { a: 6 })
    const check = await redisClient.destroy(key)
    log('destroy', check)
    await redisClient.quit()
    assert(check > 0)
  })

  it('Redis should return available server modules.', async () => {
    const standalone = new Standalone()
    const { RedisStore } = await import('../src/index.js')
    const _r = new RedisStore()
    const configWithDataType = standalone.config
    configWithDataType.dataType = 'ReJSON-RL'
    redisClient = await _r.init(configWithDataType)
    const mods = await redisClient.mods()
    await redisClient.quit()
    assert(mods.length > 0)
    assert(mods.includes('ReJSON'))
  })

  it('Data type of session value should be ReJSON-RL { a: 7 }.', async () => {
    const standalone = new Standalone()
    const { RedisStore } = await import('../src/index.js')
    const _r = new RedisStore()
    const configWithDataType = standalone.config
    configWithDataType.dataType = 'ReJSON'
    redisClient = await _r.init(configWithDataType)
    const session = { test: true, name: 'Matt', package: '@mattduffy/koa-redis' }
    const key = 'key:ttl:7'
    const ttl = ((86400 / 24) / 60) * 3
    await redisClient.set(key, session, ttl)
    const check = await redisClient.get(key)
    await redisClient.quit()
    log(check)
    assert.equal(session.name, check.name)
  })

  it('Expire a JSON session document after 4 seconds { a: 8 }.', async () => {
    const standalone = new Standalone()
    const { RedisStore } = await import('../src/index.js')
    const _r = new RedisStore()
    const configWithDataType = standalone.config
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

  it('Redis replset should connect and acknowledge a PING', async () => {
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
