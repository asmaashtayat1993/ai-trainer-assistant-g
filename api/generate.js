import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const SYSTEM_INSTRUCTION = `
أنت "مساعد المدرب الذكي"، مساعد مهني للمدربين.
أعطِ الناتج الجاهز للاستخدام مباشرة، ولا تكتفِ بإرشادات عامة.

قواعد مهمة:
- اكتب بالعربية الواضحة والمهنية.
- خصّص الإجابة حسب التخصص والموضوع ومستوى المتدربين والوقت والعدد والهدف.
- إذا طلب المستخدم خطة جلسة: أعطِ خطة فعلية موزعة زمنيًا، مع ما يقوله أو يفعله المدرب، وما يفعله المتدربون، والأدوات، والتقييم، والخطة البديلة عند الحاجة.
- إذا طلب نشاطًا: أعطِ نشاطًا كاملًا قابلًا للتنفيذ، وليس مجرد اسم استراتيجية.
- إذا طلب تقييمًا: أعطِ الأسئلة أو المهمة والإجابات أو معايير التقييم حسب الحاجة.
- إذا طلب تبسيطًا: اشرح الموضوع فعليًا مع مثال وتشبيه مناسبين.
- إذا كانت لديه مشكلة أثناء الجلسة: أعطِ خطوات عملية فورية قابلة للتطبيق الآن.
- لا تربط استراتيجية تدريبية بالخدمة بشكل آلي؛ استخدمها فقط إذا كانت مناسبة.
- إذا اختار "شيء آخر" أو كتب طلبًا خاصًا، نفّذ الطلب كما هو.
- تجنب الحشو والعبارات العامة.
- قبل الإنهاء تأكد: هل أعطيت المدرب الناتج نفسه أم فقط نصائح لصناعته؟ إن كان مجرد نصائح، حوّله إلى ناتج جاهز.
`;

function buildUserPrompt(body = {}) {
  const {
    stage,
    need,
    specialty,
    topic,
    level,
    duration,
    trainees,
    goal,
    extra,
    followup,
    history = [],
  } = body;

  let text = `
المرحلة: ${stage || "غير محددة"}
نوع المساعدة: ${need || "غير محدد"}
التخصص: ${specialty || "غير محدد"}
الموضوع/الموقف: ${topic || "غير محدد"}
مستوى المتدربين: ${level || "غير محدد"}
الوقت المتاح: ${duration || "غير محدد"}
عدد المتدربين: ${trainees || "غير محدد"}
النتيجة المطلوبة: ${goal || "غير محددة"}
معلومات إضافية: ${extra || "لا يوجد"}
`;

  if (Array.isArray(history) && history.length) {
    text += "\nالسياق السابق:\n";

    for (const item of history.slice(-6)) {
      const who =
        item.role === "assistant" ? "المساعد" : "المستخدم";

      text += `${who}: ${item.content || ""}\n`;
    }
  }

  if (followup) {
    text += `\nطلب المتابعة أو التعديل: ${followup}\n`;
  }

  text += "\nأعطني الآن الناتج الجاهز مباشرة.";

  return text;
}

async function callModel(model, prompt, timeoutMs) {
  const request = ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      maxOutputTokens: 3500,
      temperature: 0.55,
    },
  });

  const timeout = new Promise((_, reject) => {
    setTimeout(() => {
      const err = new Error("TIMEOUT");
      err.status = 504;
      reject(err);
    }, timeoutMs);
  });

  return Promise.race([request, timeout]);
}

function getStatus(err) {
  return Number(
    err?.status ||
    err?.error?.code ||
    err?.response?.status ||
    500
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "طريقة الطلب غير مدعومة.",
    });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error: "مفتاح Gemini غير موجود في إعدادات Vercel.",
    });
  }

  const prompt = buildUserPrompt(req.body);

  const primaryModel =
    process.env.GEMINI_MODEL ||
    "gemini-3.5-flash-lite";

  const fallbackModel =
    process.env.GEMINI_FALLBACK_MODEL ||
    "gemini-3.6-flash";

  try {
    const response = await callModel(
      primaryModel,
      prompt,
      10000
    );

    return res.status(200).json({
      text:
        response.text ||
        "لم يتم توليد نص. حاولي مرة أخرى.",
    });

  } catch (err) {

    const status = getStatus(err);

    const transient =
      status === 503 ||
      status === 504 ||
      status === 429 ||
      String(err?.message || "").includes("UNAVAILABLE") ||
      String(err?.message || "").includes("TIMEOUT");

    if (
      transient &&
      fallbackModel !== primaryModel
    ) {

      try {
        const response2 = await callModel(
          fallbackModel,
          prompt,
          8000
        );

        return res.status(200).json({
          text:
            response2.text ||
            "لم يتم توليد نص. حاولي مرة أخرى.",
        });

      } catch (err2) {

        const status2 = getStatus(err2);

        console.error(
          "Gemini fallback error:",
          err2
        );

        if (status2 === 429) {
          return res.status(429).json({
            error:
              "تم الوصول إلى الحد المجاني مؤقتًا. حاولي بعد قليل.",
          });
        }

        if (
          status2 === 503 ||
          status2 === 504
        ) {
          return res.status(503).json({
            error:
              "خدمة الذكاء الاصطناعي مشغولة مؤقتًا. حاولي بعد قليل.",
          });
        }

        return res.status(500).json({
          error:
            "تعذر توليد الاستجابة حاليًا.",
        });
      }
    }

    console.error(
      "Gemini primary error:",
      err
    );

    if (status === 429) {
      return res.status(429).json({
        error:
          "تم الوصول إلى الحد المجاني مؤقتًا. حاولي بعد قليل.",
      });
    }

    if (
      status === 503 ||
      status === 504
    ) {
      return res.status(503).json({
        error:
          "خدمة الذكاء الاصطناعي مشغولة مؤقتًا. حاولي بعد قليل.",
      });
    }

    return res.status(500).json({
      error:
        "تعذر توليد الاستجابة حاليًا.",
    });
  }
}
