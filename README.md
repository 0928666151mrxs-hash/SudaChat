# سوداشات - SudaChat

تطبيق مراسلة ويب عربي مبني باستخدام React + Vite + Firebase Authentication + Cloud Firestore.

## الوظائف الموجودة
- تسجيل الدخول برقم الهاتف ورمز SMS عبر Firebase Authentication.
- إنشاء ملف شخصي باسم ظاهر واسم مستخدم.
- البحث في الملفات الشخصية العامة بالاسم أو اسم المستخدم.
- فتح محادثة خاصة ثنائية.
- إرسال واستقبال الرسائل النصية مباشرة.
- عرض قائمة المحادثات وآخر رسالة.

## المتطلبات
- Node.js 20 أو أحدث.
- مشروع Firebase مع تطبيق Web.
- Phone provider مفعّل في Firebase Authentication.
- Cloud Firestore منشأة.

## التشغيل
```bash
npm install
npm run dev
```
افتح العنوان الذي يعرضه Vite.

## البناء للنشر
```bash
npm run build
```
ينتج مجلد `dist` ويمكن نشر محتوياته على Netlify أو Firebase Hosting أو استضافة تدعم تطبيقات Vite.

## إعداد Firebase الضروري
1. من Firebase Console > Authentication > Sign-in method فعّل Phone.
2. من Authentication > Settings > Authorized domains أضف نطاق الاستضافة (مثل نطاق Netlify).
3. أنشئ Cloud Firestore.
4. افتح Firestore > Rules وانسخ محتوى `firestore.rules` ثم اضغط Publish.
5. أضف أرقام اختبار من Authentication إذا أردت تجربة تسجيل الدخول دون إرسال SMS حقيقي.

## ملاحظات أمنية وتشغيلية
- ملف `profiles` مخصص للبيانات العامة فقط: الاسم واسم المستخدم والصورة. لا تخزن رقم الهاتف فيه.
- رقم الهاتف محفوظ في `users/{uid}` ولا يستطيع قراءته إلا صاحبه وفق القواعد.
- هذا الإصدار يدعم الرسائل النصية فقط. لا يحتوي حالياً على رفع صور/ملفات، مكالمات، إشعارات دفع، مزامنة جهات الاتصال، أو تشفير طرفي E2EE.
- قبل الإطلاق العام: اختبر قواعد Firestore في Rules Playground أو Emulator، وأضف سياسة خصوصية وشروط استخدام ومراقبة إساءة الاستخدام وحدوداً للتكاليف.
- لا تشارك مفاتيح حساباتك أو رموز التحقق مع أي شخص.

## بنية المشروع
- `src/firebase.js`: إعداد Firebase.
- `src/App.jsx`: المصادقة والملفات الشخصية والمحادثات.
- `src/style.css`: تصميم الواجهة.
- `firestore.rules`: قواعد Firestore المتوافقة مع بنية التطبيق.
