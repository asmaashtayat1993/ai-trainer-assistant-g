# نسخة أسرع لمساعد المدرب الذكي

التعديل الأساسي:
- النموذج الأساسي: `gemini-2.5-flash-lite`
- نموذج احتياطي واحد فقط: `gemini-2.5-flash`
- مهلة قصيرة بدل الانتظار الطويل.
- لا توجد 3 محاولات متتالية.

في Vercel يكفي وجود:
`GEMINI_API_KEY`

اختياري:
`GEMINI_MODEL=gemini-2.5-flash-lite`
`GEMINI_FALLBACK_MODEL=gemini-2.5-flash`
