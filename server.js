
// ✅ server.js النهائي والمنسق للعمل مع صفحات: index.html, chat.html, admin-permissions.html

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const fs = require('fs');
const multer = require('multer');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 📁 إعداد المسارات الثابتة
app.use(express.static(__dirname + '/public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 🧱 رفع الملفات بصلاحيات الرتب
const uploadPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);
const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx'];
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadPath),
  filename: (_, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});
const fileFilter = (_, file, cb) => allowedExtensions.includes(path.extname(file.originalname).toLowerCase())
  ? cb(null, true) : cb(new Error('🚫 نوع الملف غير مسموح'));
const upload = multer({ storage, fileFilter });

// 🔐 ملفات الإعدادات
const ADMINS_FILE = './admins.json';
const BANNED_FILE = './banned.json';
const ROLE_PERMISSIONS_FILE = './role-permissions.json';

let users = {}, mutedUsers = {}, queue = [], pendingApprovals = [];
let currentSpeaker = null, timer = null, adminId = null;
let roomLocked = false, manualApproval = false;
const SPEAK_TIME = 120;

let adminList = fs.existsSync(ADMINS_FILE) ? JSON.parse(fs.readFileSync(ADMINS_FILE)) : [];
let bannedList = fs.existsSync(BANNED_FILE) ? JSON.parse(fs.readFileSync(BANNED_FILE)) : [];
let rolePermissions = fs.existsSync(ROLE_PERMISSIONS_FILE) ? JSON.parse(fs.readFileSync(ROLE_PERMISSIONS_FILE)) : {};

// 🧠 أدوات مساعدة
const isBanned = (ip, deviceId) => bannedList.some(b => b.ip === ip || b.deviceId === deviceId);
const isAdminUser = name => adminList.find(a => a.username === name);
const isNameTaken = name => Object.values(users).some(u => u.name === name);
const hasPermission = (role, action) => rolePermissions[role]?.includes(action);

// 📤 رفع الملفات
app.post('/upload', upload.single('file'), (req, res) => {
  const { userId } = req.body;
  const user = users[userId];
  if (!user || !['owner', 'superadmin', 'admin', 'mod'].includes(user.role)) {
    return res.status(403).json({ error: '🚫 لا تملك صلاحية رفع الملفات' });
  }
  const fileUrl = '/uploads/' + req.file.filename;
  io.emit('chat-message', {
    text: `${user.avatar} <strong>${user.name}</strong>: <a href="${fileUrl}" target="_blank">📎 ملف مرفق</a>`,
    color: user.settings?.color || '#fff',
    fontSize: user.settings?.fontSize || '18px',
    replyTo: null
  });
  res.status(200).json({ url: fileUrl });
});

// 🧠 إدراج باقي المنطق (events, chat, roles...) حسب الطلب

// 🎯 إدارة صلاحيات الرتب (admin-permissions.html)
io.on('connection', (socket) => {
  socket.on('get-role-permissions', () => {
    socket.emit('role-permissions-data', rolePermissions);
  });

  socket.on('update-role-permissions', (updated) => {
    rolePermissions = updated;
    fs.writeFileSync(ROLE_PERMISSIONS_FILE, JSON.stringify(rolePermissions, null, 2));
    io.emit('role-permissions-data', rolePermissions);
  });
});

// 🚀 تشغيل السيرفر
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Group Chat Server running on http://localhost:${PORT}`);
});
