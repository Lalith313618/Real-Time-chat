require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
const connectDB = require('./src/config/db');
const authRoutes = require('./src/routes/auth.routes');
const userRoutes = require('./src/routes/user.routes');
const conversationRoutes = require('./src/routes/conversation.routes');
const messageRoutes = require('./src/routes/message.routes');
const organizationRoutes = require('./src/routes/organization.routes');
const teamRoutes = require('./src/routes/team.routes');
const channelRoutes = require('./src/routes/channel.routes');
const taskRoutes = require('./src/routes/task.routes');
const notificationRoutes = require('./src/routes/notification.routes');
const initChatSockets = require('./src/sockets/chat.socket');

const app = express();
const server = http.createServer(app);

connectDB();

const isOriginAllowed = (origin, callback) => {
  if (!origin) return callback(null, true);
  if (
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin) ||
    /^http:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/.test(origin) ||
    origin === process.env.CLIENT_URL
  ) {
    return callback(null, true);
  }
  return callback(null, true);
};

app.use(cors({
  origin: isOriginAllowed,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const io = new Server(server, {
  cors: {
    origin: isOriginAllowed,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  }
});

app.set('io', io);
initChatSockets(io);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  res.status(200).json({
    status: 'ok',
    message: 'Real-Time Chat Backend API is running smoothly',
    database: states[dbState] || 'unknown',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.send('Real-Time Chat Application API Server');
});

app.use((req, res, next) => {
  res.status(404).json({
    status: 'fail',
    message: `Cannot find ${req.originalUrl} on this server`,
  });
});

app.use((err, req, res, next) => {
  console.error('[Global Error]:', err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    status: 'error',
    message: err.message || 'Internal Server Error',
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`[Server] Running in ${process.env.NODE_ENV || 'development'} mode on http://localhost:${PORT}`);
});
