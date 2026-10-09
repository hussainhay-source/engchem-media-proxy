/* ============================================================
 *  EngChem — سيرفر وسيط لتخزين الملفات
 *  ------------------------------------------------------------
 *  الفكرة:
 *    التطبيق  ──►  هذا السيرفر  ──►  تلغرام
 *                  (هنا يبقى مفتاح البوت)
 *
 *  التطبيق ما يشوف مفتاح البوت أبداً — بس يستقبل رابط.
 * ============================================================ */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const https = require('https');

// ============================================================
//  إشعارات Firebase — اختيارية (تشتغل بس لو متغيرات البيئة موجودة)
//
//  ما في دوال سحابية (Cloud Functions) — وفّرنا اشتراك.
//  الإدارة تتم من هذا السيرفر مباشرة.
// ============================================================
let getMessaging = null;
let notificationsReady = false;

(function initNotifications() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.warn(
      '⚠️  FIREBASE_SERVICE_ACCOUNT مو موجود — الإشعارات معطّلة'
    );
    return;
  }

  try {
    // نبدّل \\n إلى أسطر حقيقية — بيطلعون من متغيرات البيئة
    const json = raw.replace(/\\n/g, '\n');
    const credentials =
      process.env.FIREBASE_PROJECT_ID
        ? JSON.parse(json)
        : JSON.parse(json);

    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(credentials),
      });
    }
    getMessaging = admin.messaging;
    notificationsReady = true;
    console.log('✅  إشعارات FCM مفعّلة — topic: ' + FCM_TOPIC);
  } catch (e) {
    console.error('❌ ما قدرنا نهيّئ الإشعارات:', e.message);
  }
})();

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- الإعدادات ----------
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// مفتاح سرّي يميّز تطبيقنا عن أي حد ثاني (اختياري بس مستحسن)
const APP_SECRET = process.env.APP_SECRET || '';

const MAX_FILE_MB = Number(process.env.MAX_FILE_MB || 50);

// ---------- ملف الـ APK ----------
// Firebase Hosting forbids .apk on the free plan —
// so we serve it from here instead.
const APK_PATH =
  process.env.APK_PATH || path.join(__dirname, 'public', 'EngChem.apk');

// ---------- إشعارات FCM ----------
// Topic name everyone subscribes to.
const FCM_TOPIC = process.env.FCM_TOPIC || 'all_users';

// أنواع الملفات — عشان المتصفح يعرضها صح
const MIME_TYPES = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  zip: 'application/zip',
};

// ---------- تحقق من الإعدادات ----------
if (!BOT_TOKEN || !CHAT_ID) {
  console.error('❌ ناقص BOT_TOKEN أو CHAT_ID — شوف ملف .env.example');
  process.exit(1);
}

// ---------- الوسطيات ----------
// ⚠️ CORS مفتوح — ضروري لأن التطبيق يعرض الملفات من المتصفح
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-app-secret', 'Range'],
    exposedHeaders: ['Content-Length', 'Content-Range', 'Content-Disposition'],
    maxAge: 86400,
  })
);
app.use(express.json());

// نستقبل ملف واحد بحجم محدود
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 1 },
});

// ---------- طلب لوج ---
function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

// ============================================================
//  فحص الحالة — Render يستخدمه للتأكد أن السيرفر حيّ
// ============================================================
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'engchem-media-proxy',
    apk: fs.existsSync(APK_PATH),
    notifications: notificationsReady,
    time: new Date(),
  });
});

// ============================================================
//  تحميل تطبيق الموبايل (APK)
//  GET /apk
//
//  Firebase Hosting ما يسمح برفع ملفات تنفيذية بالخطة المجانية،
//  فنستضيفه هنا وننزّله مباشرة من المتصفح.
// ============================================================
app.get('/apk', (req, res) => {
  if (!fs.existsSync(APK_PATH)) {
    return res
      .status(404)
      .json({ error: 'ملف التطبيق غير موجود على السيرفر' });
  }

  const stat = fs.statSync(APK_PATH);
  const fileName = 'EngChem.apk';

  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Length', stat.size);
  // attachment = المتصفح ينزّل الملف فوراً بدون ما يعرضه
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${fileName}"`
  );
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  const stream = fs.createReadStream(APK_PATH);
  stream.on('error', () => {
    if (!res.headersSent) res.status(500).end();
  });
  stream.pipe(res);
});

// ============================================================
//  إرسال إشعار لكل المستخدمين
//  POST /notify   { title, body, url? }
//
//  ⚠️ مجاني 100% — ما يحتاج Firebase Functions ولا خطة مدفوعة.
//     بيشتغل بـ firebase-admin من السيرفر هذا مباشرة.
//     لازم متغير البيئة FIREBASE_SERVICE_ACCOUNT (JSON كامل).
// ============================================================
app.post('/notify', async (req, res) => {
  if (APP_SECRET && req.headers['x-app-secret'] !== APP_SECRET) {
    return res.status(401).json({ error: 'مفتاح التطبيق غير صحيح' });
  }

  if (!notificationsReady) {
    return res.status(503).json({
      error: 'خدمة الإشعارات غير مهيّأة',
      hint: 'حط FIREBASE_SERVICE_ACCOUNT بمتغيرات البيئة على Render',
    });
  }

  const { title, body, url } = req.body || {};

  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: 'العنوان مطلوب' });
  }

  try {
    const message = {
      topic: FCM_TOPIC,
      notification: {
        title: String(title).slice(0, 120),
        body: String(body || '').slice(0, 200),
      },
      webpush: {
        notification: {
          icon: '/icons/Icon-192.png',
          badge: '/icons/Icon-192.png',
        },
        fcmOptions: {
          link: url || 'https://engchem.web.app',
        },
      },
      android: {
        notification: {
          icon: 'ic_launcher',
          color: '#0D7C6E',
        },
      },
    };

    const id = await getMessaging().send(message);
    log('🔔 إشعار مُرسل إلى', FCM_TOPIC, '→', id);

    res.json({ ok: true, messageId: id, topic: FCM_TOPIC });
  } catch (e) {
    log('❌ فشل الإرسال:', e.message);
    res.status(502).json({ error: 'فشل إرسال الإشعار', detail: e.message });
  }
});

// ============================================================
//  رفع ملف
//  POST /upload    (multipart/formaworkd, الحقل: file)
// ============================================================
app.post('/upload', (req, res) => {
  // التحقق من المفتاح السرّي
  if (APP_SECRET && req.headers['x-app-secret'] !== APP_SECRET) {
    return res.status(401).json({
      error: 'مفتاح التطبيق غير صحيح',
      hint: 'تأكد إنك ترسل الترويسة x-app-secret',
    });
  }

  upload.single('file')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: `الملف أكبر من الحد (${MAX_FILE_MB} ميغابايت)`,
        });
      }
      log('❌ خطأ بالرفع:', err.message);
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'ماكو ملف — تأكد إن الحقل اسمه file' });
    }

    try {
      log(`📤 رفع: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);

      const result = await sendToTelegram(req.file);

      // نرجّع الرابط المباشر من عندنا (مو من تلغرام)
      const publicUrl = `${getBaseUrl(req)}/files/${result.fileId}`;

      log(`✅ نجح: ${result.fileId}`);

      res.json({
        ok: true,
        fileId: result.fileId,
        url: publicUrl,
        name: req.file.originalname,
        sizeBytes: req.file.size,
        mimeType: req.file.mimetype,
      });
    } catch (e) {
      log('❌ فشل الإرسال لتلغرام:', e.message);
      res.status(502).json({
        error: 'فشل الإرسال لتلغرام',
        detail: e.message,
      });
    }
  });
});

// ============================================================
//  تحميل ملف — يرجّع الملف من عندنا
//  GET /files/:fileId
//
//  ⚠️ مهم للويب: نمرّر المحتوى عبر السيرفر بدل التحويل (redirect)
//     لأن تلغرام ما يرسل CORS headers — و redirect يخلي المتصفح
//     يروح لـ api.telegram.org فيرفض الطلب.
// ============================================================
app.get('/files/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;

    // نجيب معلومات الملف من تلغرام
    const info = await getFileInfo(fileId);
    const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${info.file_path}`;

    // نوع الملف من الامتداد
    const ext = (info.file_path || '').split('.').pop().toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';

    // تحقّق من الطلب: تحميل (attachment) ولا عرض (inline)
    const asDownload = req.query.download === '1';

    res.setHeader('Content-Type', mime);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader(
      'Content-Disposition',
      `${asDownload ? 'attachment' : 'inline'}; filename="${fileId}.${ext}"`
    );

    if (asDownload) {
      // التحميل: نوجّه مباشرة (سريع وما يحتاج تمرير)
      res.redirect(302, downloadUrl);
      return;
    }

    // العرض: نمرّر المحتوى مع ترويسات CORS
    const pass = https.get(
      downloadUrl,
      (upstream) => {
        if (upstream.statusCode !== 200) {
          res.status(upstream.statusCode || 502).end();
          return;
        }
        const len = upstream.headers['content-length'];
        if (len) res.setHeader('Content-Length', len);

        upstream.pipe(res);
      },
      (err) => {
        log('❌ فشل تمرير الملف:', err.message);
        if (!res.headersSent) res.status(502).end();
      }
    );

    pass.on('error', () => {
      if (!res.headersSent) res.status(502).end();
    });
  } catch (e) {
    log('❌ فشل التحميل:', e.message);
    res.status(404).json({ error: 'الملف مو موجود', detail: e.message });
  }
});

// ============================================================
//  حذف ملف
//  DELETE /files/:fileId
// ============================================================
app.delete('/files/:fileId', async (req, res) => {
  if (APP_SECRET && req.headers['x-app-secret'] !== APP_SECRET) {
    return res.status(401).json({ error: 'مفتاح التطبيق غير صحيح' });
  }

  // ⚠️ تلغرام ما يسمح بحذف الرسائل عن طريق البوت.
  //    لكن بمكاننا نشيل السجل من عندنا.
  //    الملف بيوصل بتلغرام يبقى — اقرأ README.
  res.json({
    ok: true,
    message: 'تم استلام طلب الحذف',
    warning: 'تلغرام ما يسمح بالحذف النهائي — الملف بيوصل',
  });
});

// ============================================================
//  دوال مساعدة
// ============================================================

/** يرسل الملف لروبوت تلغرام بالـ API */
function sendToTelegram(file) {
  return new Promise((resolve, reject) => {
    const form = new FormData();

    form.append('chat_id', CHAT_ID);

    // نحدّد المحتوى — مهم لأن تلغرام يحتاج يعرف نوع الملف
    form.append('document', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype || 'application/octet-stream',
    });

    // نبني الـ body يدوياً — أكثر موثوقية من الاعتماد على form.pipe()
    const body = form.getBuffer();

    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${BOT_TOKEN}/sendDocument`,
      method: 'POST',
      headers: {
        ...form.getHeaders(),
        'Content-Length': body.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.ok) {
            reject(new Error(parsed.description || 'رفض تلغرام الطلب'));
            return;
          }
          resolve({
            fileId: parsed.result.document.file_id,
            messageId: parsed.result.message_id,
          });
        } catch (e) {
          reject(new Error('رد غير مفهوم من تلغرام: ' + data.slice(0, 200)));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** يجيب معلومات الملف (المسار الحقيقي) من تلغرام */
function getFileInfo(fileId) {
  return new Promise((resolve, reject) => {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`;

    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (!parsed.ok) {
              reject(new Error(parsed.description || 'الملف مو موجود'));
              return;
            }
            resolve(parsed.result);
          } catch (e) {
            reject(new Error('رد غير مفهوم: ' + data.slice(0, 200)));
          }
        });
      })
      .on('error', reject);
  });
}

/** يحسب عنوان السيرفر الحالي */
function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${req.headers.host}`;
}

app.listen(PORT, '0.0.0.0', () => {
  log('🚀 EngChem Media Proxy شغّال');
  log(`   المنفذ : ${PORT}`);
  log(`   الحد الأقصى: ${MAX_FILE_MB} ميغابايت`);
  log(`   المفتاح السرّي: ${APP_SECRET ? 'مفعّل ✅' : 'غير مفعّل ⚠️'}`);
  log(`   تطبيق الموبايل: ${fs.existsSync(APK_PATH) ? 'موجود ✅' : 'غير موجود ❌'}`);
  log(`   الإشعارات: ${notificationsReady ? `مفعّلة ✅ (${FCM_TOPIC})` : 'معطّلة ⚠️'}`);
});
