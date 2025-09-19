# @mattduffy/koa-redis
This is a fork of the [koa-redis](https://www.npmjs.com/package/koa-redis) package, updated to work with the official [Redis](https://www.npmjs.com/package/redis) client library, rather than [ioredis](https://www.npmjs.com/package/ioredis), now that it fully supports connecting to redis sentinel hosts.  This package is almost completely api-compatible with the original koa-redis package, with the exception of supporting `async/await` methods and a `redisStore.init(config)` initialization method.

## Now Supports Saving Session Data as Native JSON Documents!
With the inclusion of the configuration parameter `dataType: 'ReJSON-RL'`, you can store your session data as native JSON documents instead of serialized strings. The Redis server needs to include the `ReJSON` module for this to work.  `RedisStore` verifies this module is included and enabled, otherwise reverts to the default `string` storage behavior.  See below for examples.

## Install
```bash
npm install --save @mattduffy/koa-redis
```

## Usage
`@mattduffy/koa-redis` works with [koa-session](https://www.npmjs.com/package/koa-session)@7.x.  It is not compatible with koa-session@6.x as it only supports ESM style imports.  Please see the koa-session documentation for a full explanation of how to implement session handling in a Koa app.  In general, structure the client connection options object like you normally would for a regular redis client.  There is a small number of `RedisStore` specific options to use, but they all have default values to create a simple, standalone redis client connection.

```javascript
import * as Koa from 'koa'
import session from 'koa-session'
import { redisStore } from '@mattduffy/koa-redis'
// simple standalone redis host
const redisConfigOpts = {
  url: "redis://username:password@<redis_host>:<redis_port>",
  keyPrefix: <ioredis-style-transparent-prefix>,
  dataType: 'string',
}
const redis = await (new redisStore()).init(redisConfigOpts)
const app = new Koa.default()
app.use(session({
  store: redis,
  ...
}))
```

### Sentinel Support
```javascript
const redisSentinelOpts = {
  isRedisReplset: true,
  name: <your_replicaset_name>,
  keyPrefix: <ioredis-style-transparent-prefix>,
  dataType: 'ReJSON-RL',
  lazyConnect: <true|false>,
  role: 'master',
  sentinelRootNodes: [
    { host: '192.168.1.145', port: 6379 },
    { host: '192.168.1.146', port: 6379 },
    { host: '192.168.1.147', port: 6379 },
  ],
  sentinelClientOptions: {
    username: <your_sentinel_user>,
    password: <your_sentinel_password>,
    // optional TLS settings
    socket: {
      tls: true,
      ca: <path_to_your_ca_cert_pem_file>
    },
  },
  nodeClientOptions: {
    username: <your_app_db_username>,
    password: <your_app_db_password>,
    // optional TLS settings
    socket: {
      tls: true,
      ca: <path_to_your_ca_cert_pem_file>
    },
  },
}
const sentinel = await (new redisStore()).init(redisSentinelOpts)
const app = new Koa.default()
app.use(session({
  store: sentinel,
  ... // rest of koa-session options
}))
```

### Cluster
```javascript
const redisClusterOpts = {
  isRedisCluster: true,
  keyPrefix: <ioredis-style-transparent-prefix>,
  dataType: 'ReJSON-RL',
  rootNodes: [
    { url: 'redis://10.0.0.1:30001' },
    { url: 'redis://10.0.0.2:30001' },
    { url: 'redis://10.0.0.3:30001' },
  ],
  defaults: {
    username: <your_app_db_username>,
    password: <your_app_db_password>,
    // optional TLS setup
    socket: {
      ...
    },
  },
}
const cluster = await (new redisStore()).init(redisClusterOpts)
const app = new Koa.default()
app.use(session({
  store: cluster,
  ... // rest of koa-session options
}))
```


## Options
* `db` (number) - will run `client.select(db)` after connection
* `client` (object) - supply your own client, all other options are ignored unless `duplicate` is also supplied.
* `duplicate` (boolean) - When true, it will run `client.duplicate()` on the supplied `client` and use all other options supplied. This is useful if you want to select a different DB for sessions but also want to base from the same client object.
* `serialize` - Used to serialize the data that is saved into the store.
* `unserialize` - Used to unserialize the data that is fetched from the store.
* `isRedisCluster` (boolean) - Used for creating a Redis cluster instance.  The default value is `false`.
* `isRedisReplset` (boolean) - Used for creating a Redis Sentinel instance.  The default value is `false`
* `isRedisSingle` (boolean) - Used for creating a simple, standalone Redis client instance.  The default value is `true`
* `dataType` (string) - The default is 'string'.  Use 'ReJSON-RL' if you want to store session docs as native JSON.  This checks if the `ReJSON` module is available (nb. either `ReJSON-RL` or `ReJSON` is acceptble as the value to avoid confusion between the data type name and the module name).
* `keyPrefix` (string) - A string key prefix value, to simulate `ioredis's` transparent key prefix feature.  The default is '' (empty string).  If no prefix value is supplied when `RedisStore` is instantiated, the full key path will need to be supplied when using the `RedisStore` methods like `set(key, val, ttl)`, `get(key)`, etc.  Otherwise, if `keyPrefix` is included in the config object, simply use the key name with the methods. (keyPrefix: 'app_name:session:', key: 'user_001', full key path would be 'app_name:session:user_001')


## API
This package provides a minimal api, compatible with `koa-session`, but can be interacted with directly if needed.
```javascript
const redis = await (new redisStore()).init(redisSentinelOpts)
const sess = await redis.get('app_1:sessions:user_0093')
// modify the sess values
await redis.set('app_1:sessions:user_0093', sess, 86400)
// log out the user
await redis.destroy('app_1:sessions:user_0093')
```
### await redis.get(sid)
Gets a session by ID. Returns parsed JSON is exists, `null` if it does not exist, and nothing upon error.

### await redis.set(sid, sess, ttl)
Sets a JSON session by ID with an optional time-to-live (ttl) in seconds.

### await redis.destroy(sid)
Destroys a session (removes it from Redis) by ID.

### await redis.quit()
Stops a Redis session after everything in the queue has completed.

### await redis.end()
Alias to `sentinel.quit()`.

### await redis.mods()
Returns an array of module names available on the server (ex. [ 'timeseries', 'ReJSON', 'bf', 'search', 'vectorset', 'RedisCompat' ]).

### redis.status
This property was specific to `ioredis` and does not have a directly comparable client property in `node-redis`.  Don't use.

### redis.connected
Boolean giving the connection status updated using `client.isReady`.

### redis.isReady
Boolean giving the connection status updated using `client.isReady`.

### redis.isOpen
Boolean giving the connection status updated using `client.isOpen`.

### redis.client
Direct access to the `redis` client object.

## Testing
1. In the config/ dir, copy `readme.redis.env.md` to `redis.env` and fill in your redis server details.
2. If your Redis server uses TLS, copy your PEM formated ca certificate into the `config/keys/redis/` directory.
3. If you want to see debug output, turn on the prompt's `DEBUG=*` flag.
4. Run `npm run test` to run the tests .

## License

[MIT](LICENSE)

## Original Authors (not involved in this fork)
| Name           | Website                    |
| -------------- | -------------------------- |
| **dead_horse** |                            |
| **Nick Baugh** | <http://niftylettuce.com/> |
