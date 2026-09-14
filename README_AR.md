# مساعد المدرب الذكي — نسخة Gemini المجانية

هذه النسخة لا تستخدم OpenAI API.

## ما الذي تستخدمه؟
- الواجهة: الموقع نفسه الذي تم اعتماده.
- الاستضافة: Vercel.
- الذكاء الاصطناعي: Gemini Developer API.
- النموذج الافتراضي: gemini-3.8-flash.
- المفتاح يبقى داخل Vercel ولا يظهر للمدربين.

## النشر على Vercel

1. ارفع محتويات هذا المجلد إلى GitHub.
2. اربط مستودع GitHub بـ Vercel.
3. داخل المشروع في Vercel افتح:
   Settings → Environment Variables
4. أضف:
   GEMINI_API_KEY
   وضع في القيمة مفتاح Gemini API الذي تنشئه من Google AI Studio.
5. أضف اختياريًا:
   GEMINI_MODEL = gemini-3.8-flash
6. نفّذ Deploy أو Redeploy.

## مهم
لا تضع GEMINI_API_KEY داخل public/index.html أو في GitHub.

## المجاني
Gemini Developer API يوفّر Free Tier للنموذج المستخدم، لكن توجد حدود طلبات واستخدام على مستوى المشروع.
إذا وصل المستخدمون للحد المجاني، يعرض الموقع رسالة واضحة بدل أن يتعطل.

## تعديل جودة الرد
تعليمات المساعد موجودة في:
api/generate.js
داخل SYSTEM_PROMPT.
