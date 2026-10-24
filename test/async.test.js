/**
 * @module @mattduffy/koa-redis
 * @summary Async/await tests of the RedisStore api, run with mocha.
 * @file test/async.test.js
 */
import path from 'node:path'
import fs from 'node:fs'
import * as Dotenv from 'dotenv'
import should from 'should'
import { RedisStore } from '../src/index.js'

// Connection info already present in the environment takes precedence, then any values
// in config/redis.env (if it exists) fill in the gaps.  Dotenv does not overwrite keys
// that are already set.
const redisEnv = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => k.startsWith('REDIS_')),
)
Dotenv.config({
  path: path.resolve('.', 'config/redis.env'),
  processEnv: redisEnv,
  quiet: true,
  encoding: 'utf-8',
})
const keyPrefix = redisEnv.REDIS_KEY_PREFIX || ''

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

// Connect through the sentinels so writes go to the current primary.
function replsetConfig() {
  const nodeClientOptions = clientOptions(redisEnv.REDIS_USER, redisEnv.REDIS_PASSWORD)
  if (redisEnv.REDIS_DB) {
    nodeClientOptions.database = Number(redisEnv.REDIS_DB)
  }
  return {
    keyPrefix,
    isRedisReplset: true,
    name: redisEnv.REDIS_NAME || 'mymaster',
    role: 'master',
    sentinelRootNodes,
    sentinelClientOptions: clientOptions(
      redisEnv.REDIS_SENTINEL_USER,
      redisEnv.REDIS_SENTINEL_PASSWORD,
    ),
    nodeClientOptions,
  }
}

// Defaults to an unauthenticated standalone redis on localhost:6379 if no connection
// info was found.
function standaloneConfig() {
  return {
    keyPrefix,
    ...clientOptions(redisEnv.REDIS_USER, redisEnv.REDIS_PASSWORD, {
      host: redisEnv.REDIS_HOST || 'localhost',
      port: Number(redisEnv.REDIS_HOST_PORT) || 6379,
    }),
  }
}

// Sentinel settings take precedence over REDIS_HOST, since connecting directly to a
// replica set node can land on a read-only replica.
async function createStore() {
  const config = (sentinelRootNodes.length > 0) ? replsetConfig() : standaloneConfig()
  return (new RedisStore()).init(config)
}

function sleep(t) {
  return new Promise((resolve) => {
    setTimeout(resolve, t)
  })
}

describe('test/async.test.js', () => {
  let store

  afterEach(async () => {
    // Always close the connection, even after a failed assertion, so mocha can exit.
    if (store?.isOpen) {
      await store.quit()
    }
    store = null
  })

  it('should set with ttl ok', async () => {
    store = await createStore()
    // ttl is given in milliseconds
    await store.set('key:ttl', { a: 1 }, 86400000)
    const value = await store.get('key:ttl')
    console.log('value', value)
    value.should.eql({ a: 1 })
    const ttl = await store.ttl('key:ttl')
    console.log('ttl', ttl)
    ttl.should.equal(86400)
  })

  it('should not throw error with bad JSON', async () => {
    store = await createStore()
    // Bypass serialization by using the underlying node-redis client directly.
    await store.client.set(`${keyPrefix}key:badKey`, '{I will cause an error!}')
    should.not.exist(await store.get('key:badKey'))
  })

  it('should set without ttl ok', async () => {
    store = await createStore()
    await store.set('key:nottl', { a: 1 })
    const value = await store.get('key:nottl')
    console.log('value', value)
    value.should.eql({ a: 1 })
    const ttl = await store.ttl('key:nottl')
    console.log('ttl', ttl)
    ttl.should.equal(-1)
  })

  it('should destroy ok', async () => {
    store = await createStore()
    await store.destroy('key:nottl')
    await store.destroy('key:ttl')
    await store.destroy('key:badKey')
    should.not.exist(await store.get('key:nottl'))
    should.not.exist(await store.get('key:ttl'))
    should.not.exist(await store.get('key:badKey'))
  })

  it('should expire after 1s', async function expireAfter1s() {
    this.timeout(3000)
    store = await createStore()
    await store.set('key:ttl2', { a: 1, b: 2 }, 1000)
    await sleep(1200)
    should.not.exist(await store.get('key:ttl2'))
  })
})
