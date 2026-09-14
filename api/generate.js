import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const SYSTEM_INSTRUCTION = `
أنت مساعد المدرب الذكي.
أعطِ المدرب الناتج الجاهز للاستخدام مباشرة، وليس نصائح عامة.

اكتب بالعربية الواضحة.
خصص الإجابة حسب التخصص والموضوع والمستوى والوقت وعدد المتدربين والهدف.

إذا طلب خطة جلسة:
- أعط خطة كاملة موزعة بالوقت.
- اكتب ماذا يفعل المدرب.
- اكتب ماذا يفعل المتدربون.
- أعط أمثلة فعلية.
- أعط نشاطًا جاهزًا.
- أعط طريقة تقييم واضحة.
- أعط بديلًا إذا لم ينجح النشاط.

إذا طلب نشاطًا أو تقييمًا أو تبسيطًا أو حل مشكلة:
أعطِ الناتج نفسه كاملًا وجاهزًا للتطبيق.

تجنب الكلام العام والحشو.
`;

function buildPrompt(body = {}) {
  return `
المرحلة: ${body.stage || "غير محددة"}
نوع المساعدة: ${body.need || "غير محدد"}
التخصص: ${body.specialty || "غير محدد"}
الموضوع أو الموقف: ${body.topic || "غير محدد"}
مستوى المتدربين: ${body.level || "غير محدد"}
الوقت المتاح: ${body.duration || "غير محدد"}
عدد المتدربين: ${body.trainees || "غير محدد"}
النتيجة المطلوبة: ${body.goal || "غير محددة"}
معلومات إضافية: ${body.extra || "لا يوجد"}

${body.followup ? `طلب المتابعة: ${body.followup}` : ""}

أعطني الآن الناتج الجاهز مباشرة.
`;
}

function extractText(response) {
  if (response?.text && typeof response.text === "string") {
    return response.text.trim();
  }

  const candidates = response?.candidates || [];

  for (const candidate of candidates) {
    const parts = candidate?.content?.parts || [];

    const text = parts
      .map(part => part?.text || "")
      .join("\n")
      .trim();

    if (text) {
      return text;
    }
  }

  return "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "طريقة الطلب غير مدعومة.",
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error: "مفتاح Gemini غير موجود في Vercel.",
    });
  }

  try {
    const prompt = buildPrompt(req.body);

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",

      contents: prompt,

      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.6,
        maxOutputTokens: 4000,
      },
    });

    const text = extractText(response);

    if (!text) {
      console.error(
        "Gemini returned no text:",
        JSON.stringify(response)
      );

      return res.status(502).json({
        error: "وصل رد من Gemini لكنه لم يحتوِ على نص.",
      });
    }

    return res.status(200).json({
      text,
    });

  } catch (error) {
    console.error("Gemini Error:", error);

    const status =
      error?.status ||
      error?.error?.code ||
      500;

    if (status === 503) {
      return res.status(503).json({
        error:
          "خدمة Gemini مشغولة حاليًا. حاولي مرة أخرى بعد قليل.",
      });
    }

    if (status === 429) {
      return res.status(429).json({
        error:
          "تم الوصول إلى الحد المجاني مؤقتًا.",
      });
    }

    return res.status(500).json({
      error:
        "حدث خطأ أثناء الاتصال بالذكاء الاصطناعي.",
    });
  }
}
