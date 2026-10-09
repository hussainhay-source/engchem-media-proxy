// اختبار parseServiceAccount بكل الأشكال المحتملة للخطأ
const fs = require('fs');
const path = require('path');

// ---------- ننسخ الدالة من server.js ----------
const src = fs.readFileSync(
  path.join(__dirname, 'server.js'),
  'utf8'
);
const start = src.indexOf('function parseServiceAccount');
const end = src.indexOf('\n(function initNotifications');
const fnSrc = src.slice(start, end);
// eslint-disable-next-line no-eval
const parseServiceAccount = eval('(' + fnSrc.replace(/^function parseServiceAccount/, 'function') + ')');

// ---------- مفتاح وهمي ----------
const key = {
  type: 'service_account',
  project_id: 'engchem-test',
  private_key_id: 'abc123',
  // فيه أسطر جديدة — مثل ملف Firebase الحقيقي
  private_key:
    '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\nCB8=\n-----END PRIVATE KEY-----\n',
  client_email: 'test@engchem-test.iam.gserviceaccount.com',
  client_id: '123',
};

// ---------- الحالات ----------
const cases = [
  ['سليم — أسطر حقيقية', JSON.stringify(key, null, 2)],
  ['سليم — سطر واحد', JSON.stringify(key)],
  ['مفلوب \\\\n', JSON.stringify(key).replace(/\\n/g, '\\\\n')],
  ['مقتبس بـ " "', '"' + JSON.stringify(key).replace(/\\n/g, '\\\\n') + '"'],
  ['مقتبس بـ \' \'', "'" + JSON.stringify(key).replace(/\\n/g, '\\\\n') + "'"],
  ['بمسافة قبل وبعد', '   ' + JSON.stringify(key) + '  '],
  ['مع CRLF', JSON.stringify(key).replace(/\\n/g, '\\r\\n')],
];

let pass = 0;
let fail = 0;

for (const [name, value] of cases) {
  try {
    const r = parseServiceAccount(value);
    const okKey = typeof r.private_key === 'string' &&
      r.private_key.includes('BEGIN PRIVATE KEY');
    if (r.project_id === 'engchem-test' && okKey) {
      console.log('✅  ' + name);
      pass++;
    } else {
      console.log('❌  ' + name + '  (نتيجة ناقصة)');
      fail++;
    }
  } catch (e) {
    console.log('❌  ' + name + '  →  ' + e.message);
    fail++;
  }
}

// حالة فاضية
try {
  parseServiceAccount('');
  console.log('❌  فاضي — ما انرفض');
  fail++;
} catch (e) {
  console.log('✅  فاضي — انرفض بشكل صحيح');
  pass++;
}

console.log('\nالنتيجة: ' + pass + ' نجح · ' + fail + ' فشل');
process.exit(fail === 0 ? 0 : 1);