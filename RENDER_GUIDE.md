# 🚀 نشر السيرفر الوسيط على Render

##Architecture

```
┌──────────┐   ملف    ┌─────────────┐   تلغرام   ┌──────────┐
│ التطبيق  │ ───────► │  Render      │ ──────────► │ تلغرام   │
│ (Flutter)│          │  (العقدة)   │             │  API     │
└──────────┘          └─────────────┘             └──────────┘
     ▲                       │
     │  رابط مباشر           │ 🔒 مفتاح البوت
     └───────────────────────┘    (ما يطلع أبداً)
```

**النقطة المهمة:** التطبيق ما يعرف `BOT_TOKEN` أبداً.

---

## ⚠️ أولاً: ألغِ المفتاح القديم

المفتاح اللي نشرته بالمحادثة صار مكشوف. ألغه وخذ وحدة جديدة.

1. افتح [@BotFather](https://t.me/BotFather)
2. أرسل `/revoke`
3. اختر البوت
4. خذ المفتاح الجديد

---

## ثانياً: تجهيز محلي (اختياري بس مستحسن)

```powershell
cd C:\Users\kdsod\Desktop\EngChem\server
npm install
copy .env.example .env
notepad .env          # ← حط المفتاح الجديد + APP_SECRET
node server.js
```

### توليد `APP_SECRET`

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### اختبار

```powershell
curl http://localhost:3000/health
```

لازم يطلع:
```json
{ "ok": true, "service": "engchem-media-proxy" }
```

---

## ثالثاً: الرفع على GitHub

```powershell
cd C:\Users\kdsod\Desktop\EngChem\server
git init
git add .
git commit -m "media proxy"
```

ارفعه على GitHub (مستودع جديد، خاص).

> `.env` مستثنى بـ `.gitignore` ✅ — **ما ينرفع أبداً**

---

## رابعاً: الربط بـ Render

من [dashboard.render.com](https://dashboard.render.com):

### ١. إنشاء Web Service

- **New** → **Web Service** → اربط مستودع GitHub
- **Name**: `engchem-media-proxy`
- **Region**: `Frankfurt` (أقرب لأوروبا)
- **Branch**: `main`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Instance Type**: **Free**

### ٢. المتغيرات (Environment)

اضغط **Environment** وحط:

| Name | Value |
|---|---|
| `BOT_TOKEN` | المفتاح الجديد من BotFather |
| `CHAT_ID` | `-1003422631933` |
| `APP_SECRET` | القيمة العشوائية اللي ولّدتها |
| `MAX_FILE_MB` | `20` |

> `PORT` — Render يحطه تلقائياً، لا تضيفه

### ٣. النشر

**Create Web Service** ← انتظر البناء (دقيقتين).

بيطلع لك رابط مثل:
```
https://engchem-media-proxy.onrender.com
```

### ٤. اختبار

```powershell
curl https://engchem-media-proxy.onrender.com/health
```

---

## خامساً: ربطه بالتطبيق

افتح `lib/services/media_service.dart` وعدّل:

```dart
static const String defaultBaseUrl =
    'https://engchem-media-proxy.onrender.com';   // ← رابطك

static const String defaultAppSecret =
    'القيمة_العشوائية_اللي_حطيتها';              // ← نفس APP_SECRET
```

---

## ⚠️ حدود الخطة المجانية

Render الخطة المجانية:

| الشي | الحد |
|---|---|
| وقت التشغيل | ٧٥٠ ساعة/شهر |
| السكون | بعد ١٥ دقيقة عدم استخدام |
| الحجم | الحد اللي حددته (٢٠ ميغا) |

**"السكون بعد ١٥ دقيقة"** يعني أول طلب بعد فترة的长 ياخذ **٣٠-٥٠ ثانية** (السيرفر يصحّو).
التطبيق يعرض رسالة "جاري الرفع…" طول هالوقت — مقبول لمشروع طلبي.

---

## 🔒 ملاحظات أمنية مهمة

### اللي محمي ✅
- `BOT_TOKEN` ما يطلع للتطبيق أبداً
- الرابط اللي ينحفظ بـ Firestore هو `engchem-media-proxy.onrender.com/files/xxx` — **ما فيه مفتاح**
- السيرفر يتحقق من `x-app-secret` قبل كل رفع

### اللي يحتاج انتباه ⚠️
- **`APP_SECRET` موجود بالتطبيق** — أي حد يفكّ التطبيق يقدر يشوفه ويترفع ملفات
- هذا **أفضل من حط مفتاح البوت بالتطبيق**، بس مو مثالي
- للحماية الكاملة → Cloud Function (مدفوع)

### تلغرام ما يسمح بالحذف
`DELETE /files/:id` **يحذف السجل عندنا بس** — الملف يبقى بمحادثة تلغرام.
لو بدّك تحذف فعلياً، لازم تحذف الرسالة يدوياً من المحادثة.

---

## 🔄 بديل: لو Firebase Storage فعّلته

شاشة الرفع صارت فيها زرّان:
- ☁️ **تلغرام** (عبر السيرفر)
- 🔥 **Firebase** (مباشر)

إذا السيرفر نايم أو مطفي، التطبيق **يحوّل تلقائياً** لـ Firebase.
تقدر تستخدم الاثنين مع بعض — كل شي يشتغل.
