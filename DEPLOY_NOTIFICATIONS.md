# ============================================================
#  نشر الإشعارات وتطبيق الموبايل — EngChem
# ------------------------------------------------------------
#  ✅ كل شي هنا **مجاني 100%**
#     ❌ ما يحتاج Firebase Cloud Functions
#     ❌ ما يحتاج خطة Blaze المدفوعة
#     ❌ ما يحتاج Firebase Storage
# ============================================================


# ============================================================
#  ١) الإشعارات الفورية (FCM)
# ============================================================

## الفكرة

```
التطبيق  ──① يشترك──►  Topic اسمه all_users
الأدمن  ──② ينشر──►   Render /notify
Render   ──③ يرسل──►  Topic all_users  ──►  كل الأجهزة
```

## الخطوة ١: احصل على مفتاح الخدمة

```
Firebase Console
  → Project Settings (الإعدادات)
  → Service Accounts (حسابات الخدمة)
  → Generate new private key
```

رح ينزل ملف JSON — **لا تشاركه مع أحد**.

## الخطوة ٢: انسخه على Render

```
Render Dashboard
  → engchem-media-proxy
  → Environment
  → Add Environment Variable
```

| الاسم | القيمة |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | **محتوى ملف JSON كامل** — سطر واحد |
| `FCM_TOPIC` | `all_users` |
| `MAX_FILE_MB` | `50` |

> 💡 الـ JSON يحتوي أسطر جديدة. Render يقبلها كسطر واحد
>    — السيرفر يحوّل `\n` لنصائح حقيقية تلقائياً.

## الخطوة ٣: تحقّق

```bash
curl https://engchem-media-proxy.onrender.com/health
```

لازم تشوف:

```json
{ "ok": true, "notifications": true }
```

## الخطوة ٤: جرّب الإشعار

```bash
curl -X POST https://engchem-media-proxy.onrender.com/notify \
  -H "Content-Type: application/json" \
  -H "x-app-secret: 656hytm656" \
  -d '{"title":"تجربة","body":"هذي رسالة تجريبية"}'
```

لازم يرجّع:

```json
{ "ok": true, "messageId": "..." }
```


# ============================================================
#  ٢) استضافة ملف الـ APK
# ============================================================

## ليش مو على Firebase؟

```
Executable files are forbidden on the Spark billing plan
```

خطة Firebase المجانية **تمنع** رفع ملفات `.apk`.

## الحل: نستضيفه على Render

### أ) ارفع الملف (معظم من.file)

```
Render Dashboard → engchem-media-proxy → Shell

cd /opt/render/project/src
mkdir -p public
```

**الطريقة ١ — بـ Git LFS (الأنسب):**

ارفع الملف كـ **Release** على GitHub، وبدّل
`APK_PATH` برابطosten]:

```
APK_PATH=https://github.com/<user>/<repo>/releases/download/v1/EngChem.apk
```

**الطريقة ٢ — Base64 (ملف ٦٩ م.ب):**

على جهازك:

```bash
base64 -w0 EngChem.apk > apk.b64
```

انسخ المحتوى، وبـ Shell على Render:

```bash
mkdir -p public
echo '<ال��حتوى>' | base64 -d > public/EngChem.apk
```

## ب) فعّل مسار الملف

```
Environment  →  APK_PATH  =  ./public/EngChem.apk
```

## ج) تحقّق

```bash
curl -I https://engchem-media-proxy.onrender.com/apk
```

لازم تشوف:

```
HTTP/1.1 200 OK
Content-Type: application/vnd.android.package-archive
Content-Disposition: attachment; filename="EngChem.apk"
```


# ============================================================
#  ٣) ملخص architect
# ============================================================

| الشي | وين |
|---|---|
| الملفات والمواد | Render ← Telegram |
| مرفقات الشات | Render ← Telegram |
| تحميل ملف PDF | `GET /files/:id?download=1` |
| تطبيق الموبايل | `GET /apk` |
| الإشعارات | `POST /notify` ← FCM Topic |
| قاعدة البيانات | Firestore (مجاني) |
| تسجيل الدخول | Firebase Auth (مجاني) |

**ما في أي خدمة مدفوعة.** 🎉