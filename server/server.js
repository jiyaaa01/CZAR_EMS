const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const routes = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');
const { connectToDB  } = require('./config/db');


const app = express();
const PORT = process.env.PORT || 5002;


app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://192.168.0.221:5173', // Local network access
    'https://czarcore.netlify.app',
    /\.netlify\.app$/
  ],
  credentials: true
}));

// Custom JSON parser to handle leading/trailing whitespace
app.use((req, res, next) => {
  if (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      data = data.trim();
      try {
        req.body = JSON.parse(data);
        next();
      } catch (err) {
        next(err);
      }
    });
  } else {
    next();
  }
});

app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use('/uploads', cors({
  origin: [
    'http://localhost:5173',
    'http://192.168.0.221:5173',
    'https://czarcore.netlify.app',
    /\.netlify\.app$/
  ],
  credentials: true
}), express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api', routes);

// Error handler
app.use(errorHandler);

const startServer = async () => {
  await connectToDB();
  app.listen(PORT, '0.0.0.0', () => console.log(`server running on port ${PORT}`));
};

startServer();
