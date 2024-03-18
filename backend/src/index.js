const express = require("express");
const app = express();
const port = 3000;
const pg = require("pg");
const cors = require("cors");
const amqp = require('amqplib/callback_api');
const { spawn } = require('child_process');

require("dotenv").config();

const pool = new pg.Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DB,
  password: process.env.PG_PASS,
  port: process.env.PG_PORT,
});

let channel; 

const conn = () => {
  const rabbitmqHost = process.env.RABBITMQ_URL;
  amqp.connect(rabbitmqHost, (error0, connection) => {
    if (error0) {
      throw error0;
    }
    connection.createChannel((error1, c) => {
      if (error1) {
        throw error1;
      }
      channel = c;
      const queueName = 'image_processing';
      channel.assertQueue(queueName, {
        durable: true
      }, (error2) => {
        if (error2) {
          throw error2;
        }
        channel.consume(queueName, (msg) => {
          console.log(`Received ${msg.content.toString()}`);
        }, {
          noAck: true
        });
      });
    });
  });
};

conn(); 

pool.query(
  "CREATE TABLE IF NOT EXISTS jobs(job_id VARCHAR(255) PRIMARY KEY NOT NULL, status VARCHAR(255) DEFAULT 'IN_QUEUE', result VARCHAR(255) DEFAULT 'null')"
);

app.use(express.json());
app.use(express.urlencoded());
app.use(cors());

app.get('/', async (req, res) => {
  res.send('Nothing here :p')
})
app.get('/jobs', async (req, res) => {
  const result = await pool.query('SELECT * FROM jobs')
  if (!result) {
    return res.send('No job yet')
  }
  res.send({
    results: result.rows,
  });
});

app.get('/jobs/:job_id', async (req, res) => {
  const { job_id } = req.params;
  const result = await pool.query('SELECT * FROM jobs WHERE job_id = $1', [job_id]);
  const job = result.rows[0];
  if (!job) {
    return res.send('No job found')
  }
  res.json(job);
});

app.post('/process', async (req, res) => {
  const { image_name } = req.body;
  const res_job_id = Math.random().toString(36).substring(7);

  const client = await pool.connect();
  console.log(res_job_id)
  try {
    await client.query('INSERT INTO jobs (job_id, status, result) VALUES ($1, $2, $3)', [res_job_id, 'IN_QUEUE', null]);
    await channel.sendToQueue('image_processing', Buffer.from(JSON.stringify({ job_id: res_job_id, image_name })));
    res.send({ job_id: res_job_id });
  } finally {
    client.release();
  }
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

// process for the worker 
const workerProcess = spawn('node', ['worker.js']);

workerProcess.stdout.on('data', (data) => {
  console.log(`${data}`);
});