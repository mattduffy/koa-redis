# config data for testing redis connections
# If you are going to run the test suite (npm run test), you need to fill
# in the values for your redis server, below, and rename the file redis.env 
# for the tests to run.
REDIS_CACERT=config/keys/redis/<your-tls-CA-CERT-pem-file>
REDIS_KEY_PREFIX=
REDIS_USER=
REDIS_PASSWORD=
REDIS_DB=0
REDIS_SENTINEL_USER=
REDIS_SENTINEL_PASSWORD=
REDIS_SENTINEL_PORT=<your-sentinel-port-number>
REDIS_SENTINEL_01=<your-first-sentinel-host>
REDIS_SENTINEL_02=<your-second-sentinel-host>
REDIS_SENTINEL_03=<your-third-sentinel-host>
REDIS_HOST=<your-standalone-redis-host>
REDIS_HOST_PORT=<your-redis-port-number>
