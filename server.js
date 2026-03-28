// ─── NetX MVP Server ───
// Run: npm install express cors nodemailer
// Then: node server.js
// Access: http://localhost:3000

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─── Optional: Email support ───
// To enable real emails, install nodemailer: npm install nodemailer
// Then set the environment variables below before running:
//   NETX_EMAIL_USER=yourname@gmail.com
//   NETX_EMAIL_PASS=your_gmail_app_password
//   (Create an App Password at https://myaccount.google.com/apppasswords)
let nodemailer;
try { nodemailer = require('nodemailer'); } catch(e) { nodemailer = null; }

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'netx-db.json');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Database helpers ───
function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (e) { console.error('DB read error:', e.message); }
  return { users: [], messages: [] };
}

function saveDB(db) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) { console.error('DB write error:', e.message); }
}

// ─── Password hashing ───
function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw + 'netx_salt_2026').digest('hex');
}

// ─── Auth tokens (simple session tokens) ───
const sessions = {}; // token -> userId

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function authenticate(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token || !sessions[token]) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  req.userId = sessions[token];
  next();
}

// ─── Email transporter ───
let emailTransporter = null;
const EMAIL_USER = process.env.NETX_EMAIL_USER;
const EMAIL_PASS = process.env.NETX_EMAIL_PASS;

if (nodemailer && EMAIL_USER && EMAIL_PASS) {
  emailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: EMAIL_USER, pass: EMAIL_PASS }
  });
  emailTransporter.verify((err) => {
    if (err) {
      console.log('⚠️  Email setup failed:', err.message);
      console.log('   Emails will be logged to console instead.');
      emailTransporter = null;
    } else {
      console.log('✅ Email notifications enabled via', EMAIL_USER);
    }
  });
} else {
  console.log('ℹ️  Email not configured. Set NETX_EMAIL_USER and NETX_EMAIL_PASS env vars to enable.');
  console.log('   Emails will be logged to console instead.');
}

async function sendEmail(to, subject, html) {
  console.log(`\n📧 [EMAIL] To: ${to}`);
  console.log(`   Subject: ${subject}`);
  console.log(`   Body: ${html.replace(/<[^>]*>/g, '').substring(0, 120)}...`);

  if (emailTransporter) {
    try {
      await emailTransporter.sendMail({
        from: `"NetX" <${EMAIL_USER}>`,
        to,
        subject,
        html
      });
      console.log('   ✅ Email sent successfully!');
      return true;
    } catch (e) {
      console.log('   ❌ Email failed:', e.message);
      return false;
    }
  }
  return false;
}

// ─── Interest matching taxonomy ───
const interestClusters = {
  sports:['basketball','nba','football','soccer','mma','boxing','running','cycling','sports','golf','baseball','tennis','swimming','volleyball','hockey','wrestling','rugby','cricket','skiing','snowboarding','skateboarding','surfing','fitness','gym','crossfit','weightlifting'],
  music:['music','music production','hip hop','jazz','rock','concerts','vinyl records','piano','guitar','singing','dj','edm','r&b','country','classical','blues','reggae','pop'],
  outdoors:['hiking','camping','rock climbing','travel','gardening','bird watching','fishing','kayaking','surfing','backpacking','trail running'],
  creative:['photography','drawing','painting','street art','writing','manga','anime','design','pottery','crafts','woodworking','knitting'],
  gaming:['gaming','video games','streaming','esports','board games','card games','dungeons and dragons','chess'],
  food:['cooking','baking','wine tasting','coffee','nutrition','food','restaurants','grilling','mixology'],
  wellness:['yoga','meditation','fitness','nutrition','mindfulness','self-improvement'],
  tech:['coding','tech gadgets','3d printing','robotics','ai','vr','crypto'],
  pets:['dogs','cats','pets','horses','aquariums'],
  reading:['reading','books','podcasts','audiobooks','comics']
};

function getCluster(interest) {
  const lower = interest.toLowerCase().trim();
  for (const [cluster, keywords] of Object.entries(interestClusters)) {
    if (keywords.includes(lower)) return cluster;
  }
  return null;
}

function getClusters(interests) {
  const s = new Set();
  interests.forEach(i => { const c = getCluster(i); if (c) s.add(c); });
  return s;
}

function computeMatches(user, allUsers) {
  const userInterests = user.interests.map(i => i.toLowerCase().trim());
  const userClusters = getClusters(userInterests);
  const userPassion = user.passion ? user.passion.toLowerCase().trim() : '';
  const passionCluster = getCluster(userPassion);

  return allUsers.filter(c => c.id !== user.id).map(cand => {
    let score = 0, reasons = [];
    const ci = cand.interests.map(i => i.toLowerCase().trim());
    const cc = getClusters(ci);

    const dm = userInterests.filter(i => ci.includes(i));
    score += dm.length * 30;
    if (dm.length > 0) reasons.push(`You both love ${dm.slice(0, 2).join(' & ')}`);

    if (userPassion && ci.includes(userPassion)) {
      score += 25;
      if (!dm.includes(userPassion)) reasons.push(`Shares your passion for ${userPassion}`);
    }

    const co = [...userClusters].filter(c => cc.has(c));
    score += co.length * 18;
    if (reasons.length === 0 && co.length > 0) {
      const cn = co[0];
      const ti = ci.find(i => getCluster(i) === cn) || cn;
      const yi = userInterests.find(i => getCluster(i) === cn) || cn;
      reasons.push(ti !== yi ? `You like ${yi}, they like ${ti}` : `Similar interests in ${cn}`);
    }

    if (passionCluster && cc.has(passionCluster)) score += 15;

    const go = user.connections.filter(c => cand.connections.includes(c));
    score += go.length * 8;
    if (reasons.length === 0 && go.length > 0) reasons.push(`Both looking for ${go[0].toLowerCase()}`);

    if (user.career === cand.career) score += 3;

    const careerOrder = ['Student', 'Early Career', 'Mid Career', 'Late Career'];
    const uI = careerOrder.indexOf(user.career);
    const cI = careerOrder.indexOf(cand.career);
    if (user.connections.includes('Mentorship') && cand.connections.includes('Mentorship') && Math.abs(uI - cI) >= 2) {
      score += 10;
      reasons.push('Great mentorship pairing');
    }

    return {
      id: cand.id, name: cand.name, interests: cand.interests,
      passion: cand.passion, photoData: cand.photoData, email: cand.email,
      connections: cand.connections, career: cand.career,
      score: Math.min(score, 99),
      reasons: reasons.length ? reasons : ['Part of the NetX community']
    };
  }).sort((a, b) => b.score - a.score).slice(0, 5);
}

// ═══════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════

// ─── Register ───
app.post('/api/register', async (req, res) => {
  const { name, email, password, career, focus, connections, interests, passion, photoData } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const db = loadDB();
  if (db.users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const user = {
    id: 'user_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex'),
    name, email: email.toLowerCase(), passwordHash: hashPassword(password),
    career: career || '', focus: focus || '',
    connections: connections || [], interests: interests || [],
    passion: passion || '', photoData: photoData || null,
    acceptedUsers: {}, declinedUsers: {},
    createdAt: new Date().toISOString()
  };

  db.users.push(user);
  saveDB(db);

  // Generate session
  const token = generateToken();
  sessions[token] = user.id;

  // Compute matches and send email notifications
  const matches = computeMatches(user, db.users);
  if (matches.length > 0) {
    const matchNames = matches.slice(0, 3).map(m => m.name).join(', ');
    sendEmail(user.email,
      '🎉 Welcome to NetX — You have matches!',
      `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="color:#ff9149;">Welcome to NetX, ${user.name}!</h2>
        <p>Great news — we found connections for you right away!</p>
        <p>Your top matches include: <strong>${matchNames}</strong></p>
        <p style="color:#0097b2;font-weight:600;">Log in to NetX to start connecting!</p>
      </div>`
    );
    // Also notify the matched users
    for (const match of matches.slice(0, 3)) {
      sendEmail(match.email,
        `🔗 New match on NetX — ${user.name} just joined!`,
        `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
          <h2 style="color:#ff9149;">You have a new match!</h2>
          <p>Hey ${match.name}, someone interesting just joined NetX.</p>
          <p><strong>${user.name}</strong> shares similar interests with you!</p>
          <p style="color:#0097b2;font-weight:600;">Log in to NetX to check them out.</p>
        </div>`
      );
    }
  } else {
    sendEmail(user.email,
      '🌱 Welcome to NetX — You\'re early!',
      `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="color:#ff9149;">Welcome to NetX, ${user.name}!</h2>
        <p>You're one of our first members — that's awesome!</p>
        <p>We'll email you as soon as we find a match for you.</p>
        <p style="color:#0097b2;font-weight:600;">Stay tuned!</p>
      </div>`
    );
  }

  // Return safe user data (no passwordHash)
  const { passwordHash, ...safeUser } = user;
  res.json({ token, user: safeUser, matches });
});

// ─── Login ───
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const db = loadDB();
  const user = db.users.find(u => u.email === email.toLowerCase() && u.passwordHash === hashPassword(password));
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = generateToken();
  sessions[token] = user.id;

  const matches = computeMatches(user, db.users);
  const messages = db.messages.filter(m => m.fromId === user.id || m.toId === user.id);

  const { passwordHash, ...safeUser } = user;
  res.json({ token, user: safeUser, matches, messages });
});

// ─── Get current user + matches ───
app.get('/api/me', authenticate, (req, res) => {
  const db = loadDB();
  const user = db.users.find(u => u.id === req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const matches = computeMatches(user, db.users);
  const messages = db.messages.filter(m => m.fromId === user.id || m.toId === user.id);

  const { passwordHash, ...safeUser } = user;
  res.json({ user: safeUser, matches, messages });
});

// ─── Update profile ───
app.put('/api/profile', authenticate, (req, res) => {
  const db = loadDB();
  const idx = db.users.findIndex(u => u.id === req.userId);
  if (idx < 0) return res.status(404).json({ error: 'User not found' });

  const { name, career, focus, connections, interests, passion, photoData } = req.body;
  if (name !== undefined) db.users[idx].name = name;
  if (career !== undefined) db.users[idx].career = career;
  if (focus !== undefined) db.users[idx].focus = focus;
  if (connections !== undefined) db.users[idx].connections = connections;
  if (interests !== undefined) db.users[idx].interests = interests;
  if (passion !== undefined) db.users[idx].passion = passion;
  if (photoData !== undefined) db.users[idx].photoData = photoData;

  saveDB(db);

  const matches = computeMatches(db.users[idx], db.users);
  const { passwordHash, ...safeUser } = db.users[idx];
  res.json({ user: safeUser, matches });
});

// ─── Accept match ───
app.post('/api/accept', authenticate, async (req, res) => {
  const { matchId } = req.body;
  const db = loadDB();
  const user = db.users.find(u => u.id === req.userId);
  const match = db.users.find(u => u.id === matchId);
  if (!user || !match) return res.status(404).json({ error: 'User not found' });

  if (!user.acceptedUsers) user.acceptedUsers = {};
  user.acceptedUsers[matchId] = true;
  saveDB(db);

  // Send email to the matched user
  sendEmail(match.email,
    `✅ ${user.name} accepted your connection on NetX!`,
    `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
      <h2 style="color:#10b981;">Connection accepted!</h2>
      <p>Hey ${match.name}, <strong>${user.name}</strong> wants to connect with you on NetX.</p>
      <p style="color:#0097b2;font-weight:600;">Log in to start the conversation!</p>
    </div>`
  );

  res.json({ success: true });
});

// ─── Decline match ───
app.post('/api/decline', authenticate, (req, res) => {
  const { matchId } = req.body;
  const db = loadDB();
  const user = db.users.find(u => u.id === req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (!user.declinedUsers) user.declinedUsers = {};
  user.declinedUsers[matchId] = true;
  saveDB(db);

  res.json({ success: true });
});

// ─── Send message ───
app.post('/api/message', authenticate, async (req, res) => {
  const { toId, text } = req.body;
  if (!toId || !text) return res.status(400).json({ error: 'Recipient and text are required' });

  const db = loadDB();
  const sender = db.users.find(u => u.id === req.userId);
  const recipient = db.users.find(u => u.id === toId);
  if (!sender || !recipient) return res.status(404).json({ error: 'User not found' });

  const message = {
    id: 'msg_' + Date.now(),
    fromId: sender.id,
    fromName: sender.name,
    toId: recipient.id,
    toName: recipient.name,
    text,
    time: new Date().toISOString()
  };

  db.messages.push(message);
  saveDB(db);

  // Send email notification to recipient
  sendEmail(recipient.email,
    `💬 New message from ${sender.name} on NetX`,
    `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
      <h2 style="color:#0097b2;">New message!</h2>
      <p><strong>${sender.name}</strong> sent you a message:</p>
      <div style="background:#f3f4f6;padding:16px;border-radius:12px;margin:12px 0;">
        <p style="color:#1a1a2e;">"${text.substring(0, 200)}${text.length > 200 ? '...' : ''}"</p>
      </div>
      <p style="color:#0097b2;font-weight:600;">Log in to NetX to reply!</p>
    </div>`
  );

  res.json({ message });
});

// ─── Delete account ───
app.delete('/api/account', authenticate, (req, res) => {
  const db = loadDB();
  db.users = db.users.filter(u => u.id !== req.userId);
  db.messages = db.messages.filter(m => m.fromId !== req.userId && m.toId !== req.userId);
  saveDB(db);

  // Clear session
  for (const [token, id] of Object.entries(sessions)) {
    if (id === req.userId) delete sessions[token];
  }

  res.json({ success: true });
});

// ─── Logout ───
app.post('/api/logout', authenticate, (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  delete sessions[token];
  res.json({ success: true });
});

// ─── Check email availability ───
app.get('/api/check-email', (req, res) => {
  const email = (req.query.email || '').toLowerCase();
  const db = loadDB();
  res.json({ exists: db.users.some(u => u.email === email) });
});

// ─── Start server ───
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 NetX server running at http://localhost:${PORT}`);
  console.log(`   Open this URL in your browser to use NetX.\n`);
  console.log(`   To access from other devices on your network:`);
  const nets = require('os').networkInterfaces();
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`   → http://${iface.address}:${PORT}`);
      }
    }
  }
  console.log('');
});
