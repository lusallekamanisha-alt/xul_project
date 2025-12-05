const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const dbConfig = {
  host: process.env.DB_HOST || sql8.freesqldatabase.com,
  user: process.env.DB_USER || sql8804554,
  password: process.env.DB_PASS || sql8.freesqldatabase.com,
  database: process.env.DB_NAME || sql8804554,
};

async function getConnection() {
  return await mysql.createConnection(dbConfig);
}

function createToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET || 'secret', { expiresIn: '8h' });
}

async function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'Missing token' });
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// nodemailer transporter using env SMTP settings
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.example.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: (process.env.SMTP_SECURE === 'true') || false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
});

async function sendVerificationEmail(toEmail, token, username) {
  const appUrl = process.env.APP_URL || 'http://localhost:5500'; // frontend base URL
  const verifyLink = `${appUrl}/verify.html?token=${encodeURIComponent(token)}`;

  const mailOptions = {
    from: process.env.EMAIL_FROM || 'no-reply@digitallibrary.local',
    to: toEmail,
    subject: 'Verify your Digital Library account',
    html: `
      <p>Hi ${username || ''},</p>
      <p>Thanks for registering. Click the link below to verify your email address:</p>
      <p><a href="${verifyLink}">Verify email</a></p>
      <p>If the link does not work, copy and paste this URL into your browser:<br>${verifyLink}</p>
      <p>This link will expire in 24 hours.</p>
    `
  };

  return transporter.sendMail(mailOptions);
}

// Register
app.post('/api/users/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'Missing fields' });

  try {
    const conn = await getConnection();

    // check existing email
    const [existing] = await conn.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) { await conn.end(); return res.status(400).json({ error: 'Email already registered' }); }

    const hash = await bcrypt.hash(password, 10);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const [result] = await conn.execute(
      'INSERT INTO users (username, email, password_hash, verification_token, verification_expires, email_verified) VALUES (?, ?, ?, ?, ?, 0)',
      [username, email, hash, token, expiresAt]
    );

    await conn.end();

    // send verification email (do not block failure)
    try {
      await sendVerificationEmail(email, token, username);
    } catch (mailErr) {
      console.warn('Verification email failed:', mailErr.message || mailErr);
      // you may choose to return warning to client; we'll continue
    }

    res.status(201).json({ message: 'Registered. Check your email for verification link.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
app.post('/api/users/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const conn = await getConnection();
    const [rows] = await conn.execute('SELECT id, username, email, password_hash FROM users WHERE email = ?', [email]);
    await conn.end();
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = createToken(user);
    res.json({ user: { id: user.id, username: user.username, email: user.email }, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get books
app.get('/api/books', async (req, res) => {
  try {
    const conn = await getConnection();
    const [rows] = await conn.execute(
      'SELECT books.id, books.title, books.author, books.cover_url, books.description, books.status, categories.name AS category FROM books LEFT JOIN categories ON books.category_id = categories.id'
    );
    await conn.end();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Borrow book (authenticated)
app.post('/api/borrows', authMiddleware, async (req, res) => {
  const { book_id } = req.body;
  const userId = req.user.id;
  if (!book_id) return res.status(400).json({ error: 'Missing book_id' });
  try {
    const conn = await getConnection();
    // check availability
    const [brows] = await conn.execute('SELECT status FROM books WHERE id = ?', [book_id]);
    if (!brows.length) { await conn.end(); return res.status(404).json({ error: 'Book not found' }); }
    if (brows[0].status !== 'available') { await conn.end(); return res.status(400).json({ error: 'Book not available' }); }
    await conn.execute('INSERT INTO borrows (user_id, book_id) VALUES (?, ?)', [userId, book_id]);
    await conn.execute('UPDATE books SET status = "borrowed" WHERE id = ?', [book_id]);
    await conn.end();
    res.status(201).json({ message: 'Book borrowed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Return book (authenticated)
app.post('/api/return/:borrow_id', authMiddleware, async (req, res) => {
  const { borrow_id } = req.params;
  try {
    const conn = await getConnection();
    const [rows] = await conn.execute('SELECT book_id, user_id FROM borrows WHERE id = ? AND returned_at IS NULL', [borrow_id]);
    if (!rows.length) { await conn.end(); return res.status(404).json({ error: 'Borrow record not found' }); }
    const record = rows[0];
    if (record.user_id !== req.user.id) { await conn.end(); return res.status(403).json({ error: 'Not your borrow record' }); }
    await conn.execute('UPDATE borrows SET returned_at = NOW() WHERE id = ?', [borrow_id]);
    await conn.execute('UPDATE books SET status = "available" WHERE id = ?', [record.book_id]);
    await conn.end();
    res.json({ message: 'Book returned' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get current user's borrows
app.get('/api/borrows', authMiddleware, async (req, res) => {
  try {
    const conn = await getConnection();
    const [rows] = await conn.execute(
      'SELECT borrows.id, borrows.book_id, borrows.borrowed_at, borrows.returned_at, books.title FROM borrows JOIN books ON borrows.book_id = books.id WHERE borrows.user_id = ?',
      [req.user.id]
    );
    await conn.end();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add verify endpoint
app.get('/api/users/verify', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ error: 'Missing token' });
  try {
    const conn = await getConnection();
    const [rows] = await conn.execute(
      'SELECT id, verification_expires FROM users WHERE verification_token = ? AND email_verified = 0',
      [token]
    );
    if (!rows.length) { await conn.end(); return res.status(400).json({ error: 'Invalid or already used token' }); }
    const rec = rows[0];
    const expires = new Date(rows[0].verification_expires);
    if (expires < new Date()) { await conn.end(); return res.status(400).json({ error: 'Token expired' }); }

    await conn.execute(
      'UPDATE users SET email_verified = 1, verification_token = NULL, verification_expires = NULL WHERE id = ?',
      [rec.id]
    );
    await conn.end();
    res.json({ message: 'Email verified' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));

/* --- Auto-create sample admin/test user on startup --- */
async function createSampleAdmin() {
  try {
    const adminUser = process.env.ADMIN_USER || 'admin';
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@digitallibrary.local';
    const adminPass = process.env.ADMIN_PASS || 'Admin123!';

    const conn = await getConnection();
    const [rows] = await conn.execute('SELECT id FROM users WHERE email = ? OR username = ?', [adminEmail, adminUser]);
    if (rows.length) {
      console.log('Admin user already exists.');
      await conn.end();
      return;
    }

    const hash = await bcrypt.hash(adminPass, 10);
    await conn.execute(
      'INSERT INTO users (username, email, password_hash, email_verified, created_at) VALUES (?, ?, ?, 1, NOW())',
      [adminUser, adminEmail, hash]
    );
    await conn.end();
    console.log(`Sample admin created -> username: ${adminUser}, email: ${adminEmail}`);
    console.log('Change the default password immediately or set ADMIN_PASS in .env');
  } catch (err) {
    console.warn('Failed to create sample admin:', err.message || err);
  }
}

// fire-and-forget
createSampleAdmin().catch(err => console.warn('createSampleAdmin error:', err));