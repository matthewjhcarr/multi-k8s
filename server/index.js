const {pgDatabase, pgHost, pgPassword, pgPort, pgUser, redisHost, redisPort} = require('./keys')

// Express app setup
const express = require('express')
const cors = require('cors')

const app = express()
app.use(cors())
app.use(express.json())


// Postgres client setup
const { Pool } = require('pg')
const pgClient = new Pool({
  user: pgUser,
  host: pgHost,
  database: pgDatabase,
  password: pgPassword,
  port: pgPort
})
pgClient.on('connect', (client) => {
  // Creates a table named 'values' with a single column named 'number' of type int
  client
    .query('CREATE TABLE IF NOT EXISTS values (number INT)')
    .catch(err => console.error(err))
})


// Redis client setup
const redis = require('redis')
const redisClient = redis.createClient({
  host: redisHost,
  port: redisPort,
  retry_strategy: () => 1000
})
const redisPublisher = redisClient.duplicate()

// Express route handlers

app.get('/', (req, res) => {
  return res.send('Hi!')
})

app.get('/values/all', async (req, res) => {
  const values = await pgClient.query('SELECT * FROM values')

  return res.send(values.rows)
})

app.get('/values/current', async (req, res) => {
  redisClient.hgetall('values', (err, values) => {
    return res.send(values)
  })
})

app.post('/values', async (req, res) => {
  const index = req.body.index

  if (parseInt(index) > 40) {
    return res.status(422).send('Index too high!')
  }

  redisClient.hset('values', index, 'Nothing yet!')
  // This wakes up the worker process, since it is subscribed to insert events
  redisPublisher.publish('insert', index)
  pgClient.query('INSERT INTO values(number) VALUES($1)', [index])

  return res.send({working: true})
})

app.listen(5000, err => {
  console.log('Listening on port 5000...')
})
