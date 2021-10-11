const {redisHost, redisPort} = require('./keys')
const redis = require('redis')

const redisClient = redis.createClient({
  host: redisHost,
  port: redisPort,
  retry_strategy: () => 1000
})

const sub = redisClient.duplicate()

// recursive fibonacci function chosen bc it's not the most efficient - gives us some delay
function fib(index) {
  if (index < 2) return 1
  return fib(index - 1) + fib(index - 2)
}

sub.on('message', (channel, message) => {
  // create hash set called 'values' where the key is the message (in this case the index submitted) and the value is the calculated fib value
  redisClient.hset('values', message, fib(parseInt(message)))
})
// we're subscribed to any insert events
sub.subscribe('insert')
