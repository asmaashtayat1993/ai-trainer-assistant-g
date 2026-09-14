
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM = `
أنت مساعد مدرب مهني ذكي. مهمتك إعطاء الناتج الجاهز للاستخدام مباشرة، وليس نصائح عامة لصناعته.
اكتب بالعربية الواضحة. إذا طلب المستخدم خطة جلسة، أعط خطة فعلية بالوقت والخطوات وكلام المدرب ونشاط المتدربين والأدوات والتقييم وخطة بديلة متى كان ذلك مناسباً.
إذا طلب نشاطاً، أعط نشاطاً كاملاً قابلاً للتنفيذ. إذا طلب تقييماً، أعط الأسئلة والإجابات أو المهمة ومعيار التقييم. إذا طلب تبسيطاً، اشرح فعلياً مع أمثلة وتشبيهات مناسبة للسياق.
تجنب الحشو. استخدم أمثلة مرتبطة بتخصص المستخدم وموضوعه ومستواه. لا تفرض قالباً ثابتاً إذا لم يكن مناسباً.
إذا اختار "شيء آخر" أو كتب طلباً خاصاً، نفذه كما هو.
قبل الإنهاء اسأل نفسك: هل أعطيت المدرب الناتج نفسه أم مجرد إرشاد لصناعته؟ إذا كان مجرد إرشاد، حوّله إلى ناتج جاهز.
`;

function buildPrompt(body) {
  const {
    stage, need, specialty, topic, level, duration, trainees, goal, extra, followup, history = []
  } = body || {};

  let prompt = `
المرحلة: ${stage || "غير محددة"}
نوع المساعدة: ${need || "غير محدد"}
التخصص: ${specialty || "غير محدد"}
الموضوع أو الموقف: ${topic || "غير محدد"}
مستوى المتدربين: ${level || "غير محدد"}
الوقت المتاح: ${duration || "غير محدد"}
عدد المتدربين: ${trainees || "غير محدد"}
النتيجة المطلوبة: ${goal || "غير محددة"}
معلومات إضافية: ${extra || "لا يوجد"}
`;

  if (history?.length) {
    prompt += "\nالسياق السابق المختصر:\n";
    for (const item of history.slice(-6)) {
      prompt += `${item.role === "assistant" ? "المساعد" : "المستخدم"}: ${item.content}\n`;
    }
  }

  if (followup) {
    prompt += `\nطلب التعديل أو المتابعة: ${followup}\n`;
  }

  prompt += "\nأعطني الآن النتيجة الجاهزة مباشرة.";
  return prompt;
}

async function generateWithTimeout(model, prompt, ms = 12000) {
  const request = ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: SYSTEM,
      maxOutputTokens: 2800,
      temperature: 0.6
    }
  });

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(Object.assign(new Error("TIMEOUT"), { status: 504 })), ms)
  );

  return Promise.race([request, timeout]);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY غير موجود." });
  }

  const prompt = buildPrompt(req.body);

  // Fast-first strategy: one quick attempt, then one quick fallback only on transient failure.
  const primary = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  const fallback = process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash";

  try {
    const r = await generateWithTimeout(primary, prompt, 12000);
    return res.status(200).json({ text: r.text || "" });
  } catch (err) {
    const status = err?.status || err?.error?.code || 500;
    const msg = String(err?.message || "");

    const transient = status === 503 || status === 429 || status === 504 || msg.includes("UNAVAILABLE") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("TIMEOUT");

    if (transient && fallback && fallback !== primary) {
      try {
        const r2 = await generateWithTimeout(fallback, prompt, 10000);
        return res.status(200).json({ text: r2.text || "" });
      } catch (err2) {
        const status2 = err2?.status || err2?.error?.code || 500;
        if (status2 === 429) {
          return res.status(429).json({ error: "تم الوصول إلى الحد المجاني مؤقتًا. حاولي بعد قليل." });
        }
        if (status2 === 503 || status2 === 504) {
          return res.status(503).json({ error: "خدمة الذكاء الاصطناعي مشغولة مؤقتًا. حاولي بعد دقيقة." });
        }
        return res.status(500).json({ error: "تعذر توليد الاستجابة حاليًا." });
      }
    }

    if (status === 429) {
      return res.status(429).json({ error: "تم الوصول إلى الحد المجاني مؤقتًا. حاولي بعد قليل." });
    }
    if (status === 503 || status === 504) {
      return res.status(503).json({ error: "خدمة الذكاء الاصطناعي مشغولة مؤقتًا. حاولي بعد دقيقة." });
    }

    console.error(err);
    return res.status(500).json({ error: "تعذر توليد الاستجابة حاليًا." });
  }
}
