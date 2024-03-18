const amqp = require('amqplib');
const pg = require('pg');

require("dotenv").config();

const pool = new pg.Pool({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DB,
  password: process.env.PG_PASS,
  port: process.env.PG_PORT,
});

const queueName = 'image_processing';

(async () => {
  const rabbitmqHost = process.env.RABBITMQ_URL;
  const conn = await amqp.connect(rabbitmqHost);
  const channel = await conn.createChannel();
  await channel.assertQueue(queueName, { durable: true });
  
  channel.consume(queueName, async (message) => {
    console.log('Received jobs:', message.content.toString());
    const { job_id, image_name } = JSON.parse(message.content.toString());
    await updateJobStatus(job_id, 'STARTED');
    try {
      const processingTime = 3;
      await delay(processingTime * 1000);
      
      await updateJobStatus(job_id, 'SUCCESS', image_name);
      
    } catch (err) {
      console.error(err);
      await updateJobStatus(job_id, 'FAIL');
    } finally {
      channel.ack(message);
    }
  });
})();

async function updateJobStatus(job_id, status, result = null) {
  const client = await pool.connect();
  try {
    await client.query('UPDATE jobs SET status = $1, result = $2 WHERE job_id = $3', [status, result, job_id]);
  } finally {
    client.release();
  }
}
function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
