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

const log = Debug('koa-redis')
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
      this.config.isRedisCluster = false
      this.config.isRedisReplSet = false
      this.config.username = redisEnv.REDIS_USER
      this.config.password = redisEnv.REDIS_PASSWORD
      this.config.keyPrefix = keyPrefix
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

  before(async () => {

  })

  after(async () => {
    if (redisClient) {
      // await redisClient.quit()
    }
    if (redisReplset) {
      await redisReplset.quit()
    }
    if (redisCluster) {
      await redisCluster.quit()
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
    assert(await redisClient.ping() === 'PONG')
    await redisClient.quit()
  })

  it('Redis replset should connect and acknowledge a PING', async () => {
    const replset = new Replset()
    const {
      RedisStore,
      // redisStore,
    } = await import('../src/index.js')
    const _redisReplset = new RedisStore()
    redisReplset = await _redisReplset.init(replset.config)
    assert(await redisReplset.ping() === 'PONG')
    await redisReplset.quit()
  })
})
