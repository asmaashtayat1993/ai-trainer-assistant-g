const SYSTEM_INSTRUCTION = `
أنت "مساعد المدرب الذكي"، مساعد مهني للمدربين.
أعطِ الناتج الجاهز للاستخدام مباشرة، ولا تكتفِ بإرشادات عامة.

قواعد مهمة:
- اكتب بالعربية الواضحة والمهنية.
- خصّص الإجابة حسب التخصص والموضوع ومستوى المتدربين والوقت والعدد والهدف.
- إذا طلب المستخدم خطة جلسة: أعطِ خطة فعلية موزعة زمنيًا، مع ما يقوله/يفعله المدرب، وما يفعله المتدربون، والأدوات، والتقييم، والبديل عند الحاجة.
- إذا طلب نشاطًا: أعطِ نشاطًا كاملًا قابلًا للتنفيذ، لا مجرد اسم استراتيجية.
- إذا طلب تقييمًا: أعطِ الأسئلة/المهمة والإجابات أو معايير التقييم حسب الحاجة.
- إذا طلب تبسيطًا: اشرح الموضوع فعليًا مع مثال وتشبيه مناسبين.
- إذا كانت لديه مشكلة أثناء الجلسة: أعطِ خطوات عملية فورية قابلة للتطبيق الآن.
- لا تربط استراتيجية تدريبية بالخدمة بشكل آلي؛ استخدمها فقط إذا كانت مناسبة.
- إذا اختار "شيء آخر" أو كتب طلبًا خاصًا، نفّذ الطلب كما هو.
- تجنب الحشو والعبارات العامة.
- أعطِ محتوى محددًا وعمليًا ومناسبًا للموضوع نفسه، وليس قالبًا عامًا.
- قبل الإنهاء تأكد: هل أعطيت المدرب الناتج نفسه أم فقط نصائح لصناعته؟ إن كان مجرد نصائح، حوّله إلى ناتج جاهز.
`;

function buildPrompt(body = {}) {
  const stage = body.stageLabel || body.stage || "غير محددة";
  let need = body.needLabel || body.need || "غير محدد";
  if (body.need === "other" && body.otherNeed) need = body.otherNeed;

  const duration = body.time || body.duration || "غير محدد";
  const trainees = body.traineeCount || body.trainees || "غير محدد";
  const followup = body.followUp || body.followup || "";
  const history = body.conversation || body.history || [];

  let text = `
المرحلة: ${stage}
نوع المساعدة: ${need}
التخصص: ${body.specialty || "غير محدد"}
الموضوع/الموقف: ${body.topic || "غير محدد"}
مستوى المتدربين: ${body.level || "غير محدد"}
الوقت المتاح: ${duration}
عدد المتدربين: ${trainees}
النتيجة المطلوبة: ${body.goal || "غير محددة"}
معلومات إضافية: ${body.extra || "لا يوجد"}
`;

  if (Array.isArray(history) && history.length) {
    text += "\nالسياق السابق:\n";
    for (const item of history.slice(-6)) {
      const who = item.role === "assistant" ? "المساعد" : "المستخدم";
      text += `${who}: ${item.content || ""}\n`;
    }
  }

  if (followup) {
    text += `\nطلب المتابعة أو التعديل: ${followup}\n`;
  }

  text += "\nأعطني الآن الناتج الجاهز مباشرة وبعمق مناسب للحالة.";
  return text;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store"
    }
  });
}

export async function onRequestPost(context) {
  const apiKey = context.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json({ error: "مفتاح Gemini غير موجود في إعدادات Cloudflare." }, 500);
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "بيانات الطلب غير صحيحة." }, 400);
  }

  const prompt = buildPrompt(body);
  const model = context.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const payload = {
    system_instruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }]
    },
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      maxOutputTokens: 4000
    }
  };

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await r.json();

    if (!r.ok) {
      console.log("Gemini error", r.status, JSON.stringify(data));
      if (r.status === 429) {
        return json({ error: "تم الوصول إلى الحد المجاني مؤقتًا. حاولي بعد قليل." }, 429);
      }
      if (r.status === 503) {
        return json({ error: "خدمة Gemini مشغولة مؤقتًا. حاولي بعد قليل." }, 503);
      }
      return json({ error: data?.error?.message || "تعذر توليد الاستجابة حاليًا." }, r.status);
    }

    const answer =
      data?.candidates?.[0]?.content?.parts
        ?.map(p => p?.text || "")
        .join("")
        .trim() || "";

    if (!answer) {
      return json({ error: "لم يصل نص من Gemini. حاولي مرة أخرى." }, 502);
    }

    return json({ answer });
  } catch (e) {
    console.log("Request error", e);
    return json({ error: "تعذر الاتصال بخدمة Gemini حاليًا." }, 502);
  }
}

export function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return json({ error: "طريقة الطلب غير مدعومة." }, 405);
}
