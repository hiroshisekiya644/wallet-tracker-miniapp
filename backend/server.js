const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const Prisma = require('./prisma');
const cron = require('node-cron');
const checkMarketcap = require('./checkMarketcap');
const tokenSubscribe = require('./tokenSubscribe');
const walletSubscribe = require('./walletSubscribe');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.connect()
  .then(client => {
    console.log('Connected to PostgreSQL');
    client.release();
  })
  .catch(err => console.error('Database connection error:', err.stack));

app.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.send(`Backend is running! DB time: ${result.rows[0].now}`);
  } catch (err) {
    res.status(500).send('Database error');
  }
});

tokenSubscribe();

cron.schedule("*/10 * * * *", async () => {
  console.log('Running scheduled marketcap check...');
  
  try {
    await checkMarketcap(); // Wait for checkMarketcap to finish
    console.log('Marketcap check completed. Running walletSubscribe...');
    await walletSubscribe(); // Call walletSubscribe after checkMarketcap finishes
  } catch (error) {
    console.error('Error in scheduled tasks:', error);
  }
});

app.listen(5000, () => console.log('Server running on port 5000'));
