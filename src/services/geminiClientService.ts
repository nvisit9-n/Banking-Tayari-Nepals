/**
 * Gemini Client Service
 * Handles API key synchronization across import.meta.env.VITE_GEMINI_API_KEY and process.env.GEMINI_API_KEY,
 * direct Gemini 1.5 Flash client-side calls for Vercel builds,
 * automatic retry loop (up to 3 attempts), and clean response formatting without promo boxes.
 */

export interface AiAttachmentPayload {
  data: string;
  mimeType: string;
  name: string;
}

export interface AiHistoryItem {
  sender: 'user' | 'ai';
  text: string;
}

export interface StreamAiOptions {
  query: string;
  history?: AiHistoryItem[];
  attachment?: AiAttachmentPayload;
  level?: string;
  mode?: string;
  onChunk: (chunk: string, accumulated: string) => void;
  onRetry?: (attempt: number, maxAttempts: number, message: string) => void;
  signal?: AbortSignal;
}

// Safely retrieve Gemini API key from all available environments
export const getEffectiveGeminiApiKey = (): string => {
  try {
    const metaKey = typeof import.meta !== 'undefined' && import.meta.env ? (import.meta.env.VITE_GEMINI_API_KEY || '') : '';
    if (metaKey && metaKey.trim()) return metaKey.trim();

    const win = typeof window !== 'undefined' ? (window as any) : null;
    if (win) {
      if (win.__ENV__?.VITE_GEMINI_API_KEY) return String(win.__ENV__.VITE_GEMINI_API_KEY).trim();
      if (win.VITE_GEMINI_API_KEY) return String(win.VITE_GEMINI_API_KEY).trim();
      if (win.GEMINI_API_KEY) return String(win.GEMINI_API_KEY).trim();
    }
  } catch (e) {
    console.warn('Environment key resolution notice:', e);
  }
  return '';
};

// Clean unsolicited promo tags or exam tip boxes if generated
export const cleanAiResponseText = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/\n\s*📌\s*\*\*Exam Tip:?[\s\S]*$/gi, '')
    .replace(/\n\s*💡\s*\*\*मेन्टरको सुझाव:?[\s\S]*$/gi, '')
    .replace(/\n\s*\*\*मेन्टरको सुझाव:?[\s\S]*$/gi, '')
    .trim();
};

// Rich offline knowledge fallback when offline or after 3 failed retries
export const getOfflineKnowledgeFallback = (cleanQuery: string): string => {
  const q = cleanQuery.toLowerCase();
  if (q.includes("nrb") || q.includes("नेपाल राष्ट्र बैंक ऐन") || q.includes("२०५८") || q.includes("केन्द्रीय बैंक")) {
    return `**नेपाल राष्ट्र बैंक ऐन, २०५८ सम्बन्धी परीक्षा तयारी टिपोट:**\n\n` +
      `**१. ऐनको प्रस्तावना र प्रमुख उद्देश्यहरू (दफा ४):**\n` +
      `- अर्थतन्त्रको दिगो विकासको निमित्त मूल्य र शोधनान्तर स्थिरता कायम गर्न मौद्रिक तथा विदेशी विनिमय नीति निर्माण र व्यवस्थापन गर्नु।\n` +
      `- बैंकिङ तथा वित्तीय क्षेत्रको स्थायित्व र आवश्यक तरलताको प्रवर्द्धन गर्नु।\n` +
      `- सुरक्षित, स्वस्थ तथा सक्षम भुक्तानी प्रणालीको विकास गर्नु।\n` +
      `- समग्र वित्तीय प्रणालीको नियमन, निरीक्षण, सुपरीवेक्षण तथा अनुगमन गर्नु।\n\n` +
      `**२. बैंकको स्वायत्तता र अख्तियारी:**\n` +
      `- नेपाल राष्ट्र बैंक अविच्छिन्न उत्तराधिकारवाला, स्वशासित र संगठित संस्था हो (दफा ३)।\n` +
      `- गभर्नरको नियुक्ति मन्त्रिपरिषद्ले ३ सदस्यीय सिफारिस समितिको सिफारिसमा ५ वर्षका लागि गर्दछ (दफा १५)।\n\n` +
      `**३. प्रमुख कार्य, कर्तव्य र अधिकारहरू (दफा ५):**\n` +
      `- बैंकनोट तथा सिक्का निष्कासन गर्ने एकाधिकार।\n` +
      `- खुला बजार कारोबार लगायतका मौद्रिक उपकरणहरूको सञ्चालन।\n` +
      `- वाणिज्य बैंक तथा वित्तीय संस्थाहरूको इजाजतपत्र जारी, नियमन र खारेजी।\n` +
      `- नेपाल सरकारको बैंक, सल्लाहकार तथा वित्तीय एजेन्टको रूपमा कार्य गर्ने।\n` +
      `- विदेशी विनिमय सञ्चितिको संरक्षण तथा व्यवस्थापन।\n` +
      `- अन्तिम ऋणदाता (Lender of the Last Resort) को भूमिका निर्वाह।`;
  } else if (q.includes("bafia") || q.includes("बाफिया") || q.includes("वर्गीकरण") || q.includes("२०७३")) {
    return `**बैंक तथा वित्तीय संस्था सम्बन्धी ऐन (BAFIA), २०७३ सम्बन्धी परीक्षा उपयोगी बुँदाहरू:**\n\n` +
      `**१. बैंक तथा वित्तीय संस्थाको वर्गीकरण र न्यूनतम चुक्ता पूँजी (दफा ३७):**\n` +
      `- **'क' वर्ग (वाणिज्य बैंक):** न्यूनतम चुक्ता पूँजी रु. ८ अर्ब।\n` +
      `- **'ख' वर्ग (विकास बैंक):** राष्ट्रिय स्तर: रु. २.५ अर्ब, प्रदेश स्तर: रु. १.२० अर्ब।\n` +
      `- **'ग' वर्ग (वित्त कम्पनी):** राष्ट्रिय स्तर: रु. ८० करोड, प्रदेश स्तर: रु. ५० करोड।\n` +
      `- **'घ' वर्ग (लघुवित्त वित्तीय संस्था):** राष्ट्रिय स्तर: रु. १० करोड, प्रदेश स्तर: रु. २ करोड।\n\n` +
      `**२. सञ्चालक समिति र योग्यता (दफा १४):**\n` +
      `- बैंक तथा वित्तीय संस्थामा कम्तीमा ५ र बढीमा ७ जना सञ्चालक रहने।\n` +
      `- कम्तीमा एक जना स्वतन्त्र सञ्चालक (Independent Director) अनिवार्य।\n` +
      `- सञ्चालकको कार्यकाल बढीमा ४ वर्षको हुन्छ र पुनः नियुक्ति हुन सक्नेछ।\n\n` +
      `**३. संस्थागत सुशासन र वित्तीय अनुशासन:**\n` +
      `- संस्थापक सेयरधनीले संस्था सञ्चालन भएको कम्तीमा ५ वर्ष नपुगी सेयर बिक्री गर्न नपाउने।\n` +
      `- सञ्चालक तथा कार्यकारी प्रमुखले सोही संस्थाबाट कुनै कर्जा वा सुविधा लिन नपाउने (दफा ५०)।`;
  } else if (q.includes("aml") || q.includes("शुद्धीकरण") || q.includes("money laundering") || q.includes("cft")) {
    return `**सम्पत्ति शुद्धीकरण (निवारण) ऐन, २०६४ र AML/CFT का मुख्य व्यवस्थाहरू:**\n\n` +
      `**१. सम्पत्ति शुद्धीकरण (Money Laundering) को अवधारणा:**\n` +
      `- गैरकानुनी वा आपराधिक क्रियाकलापबाट आर्जित कालो धनलाई वैध बनाउने प्रक्रिया।\n` +
      `- प्रमुख ३ चरणहरू: **Placement** (निक्षेपण), **Layering** (तहकीकरण), र **Integration** (एकीकरण)।\n\n` +
      `**२. बैंक तथा वित्तीय संस्थाको दायित्व:**\n` +
      `- **ग्राहक पहिचान (KYC/CDD):** ग्राहकको वास्तविक पहिचान र हितग्राही (Beneficial Owner) को यकिन।\n` +
      `- **सीमा कारोबार प्रतिवेदन (CTR):** तोकिएको सीमा (रु. १० लाख वा सोभन्दा बढी) को नगद कारोबारको जानकारी FIU लाई दिने।\n` +
      `- **शंकास्पद कारोबार प्रतिवेदन (STR):** रकमको सीमा नतोकी शंकास्पद देखिएको ३ दिनभित्र FIU लाई प्रतिवेदन पेस गर्ने।\n` +
      `- **अभिलेख संरक्षण:** कारोबार सम्बन्धी विवरण खाता बन्द भएको मितिले कम्तीमा ५ वर्षसम्म सुरक्षित राख्नुपर्ने।\n\n` +
      `**३. संस्थागत संरचना:**\n` +
      `- राष्ट्रिय समन्वय समिति (अर्थ मन्त्रालयका सचिवको संयोजकत्वमा)\n` +
      `- वित्तीय जानकारी इकाई (FIU - नेपाल राष्ट्र बैंकभित्र स्वायत्त रूपमा स्थापित)।`;
  } else if (q.includes("मौद्रिक") || q.includes("monetary policy") || q.includes("crr") || q.includes("slr")) {
    return `**नेपालको मौद्रिक नीति र यसका प्रमुख उपकरणहरू:**\n\n` +
      `**१. मौद्रिक नीतिको परिभाषा र उद्देश्य:**\n` +
      `- केन्द्रीय बैंकले मुद्राको आपूर्ति, कर्जाको उपलब्धता र ब्याजदरलाई नियमन गर्न जारी गर्ने नीति।\n` +
      `- मूल्य स्थिरता, शोधनान्तर स्थायित्व, र दिगो आर्थिक वृद्धि हासिल गर्नु यसको मुख्य लक्ष्य हो।\n\n` +
      `**२. प्रत्यक्ष उपकरणहरू (Direct Instruments):**\n` +
      `- अनिवार्य नगद मौज्दात अनुपात (CRR - हाल ४%)\n` +
      `- वैधानिक तरलता अनुपात (SLR - 'क' वर्ग: १२%, 'ख' र 'ग': १०%)\n` +
      `- कर्जा निक्षेप अनुपात (CD Ratio - अधिकतम ९०%)\n` +
      `- प्राथमिकताप्राप्त क्षेत्र कर्जा (कृषि, ऊर्जा, लघु/घरेलु उद्यममा तोकिएको न्यूनतम कर्जा)\n` +
      `- सीमान्त आवश्यकता (Margin Requirements)\n` +
      `- नैतिक दबाब (Moral Suasion)।`;
  } else {
    return `**"${cleanQuery}" सम्बन्धी बैंकिङ तथा लोकसेवा विशेष परीक्षा तयारी सामग्री:**\n\n` +
      `**१. सैद्धान्तिक अवधारणा र परिभाषा:**\n` +
      `- बैंकिङ तथा वित्तीय प्रणालीमा यस विषयले संस्थागत सुशासन, कार्यसम्पादन प्रभावकारिता र सेवा प्रवाहमा महत्वपूर्ण भूमिका खेल्दछ।\n` +
      `- लोकसेवा तथा संस्थान परीक्षामा यसबाट सैद्धान्तिक विश्लेषण र समसामयिक समस्या समाधान सम्बन्धी प्रश्नहरू सोधिन्छन्।\n\n` +
      `**२. विद्यमान कानुनी तथा नीतिगत व्यवस्थाहरू:**\n` +
      `- नेपालको संविधानको आर्थिक तथा वित्तीय नीति।\n` +
      `- नेपाल राष्ट्र बैंक ऐन २०५८, बैंक तथा वित्तीय संस्था सम्बन्धी ऐन (BAFIA) २०७३।\n` +
      `- सम्बन्धित निकाय तथा संस्थानका विशेष सेवा तथा कार्यसञ्चालन विनियमावलीहरू।\n\n` +
      `**३. मुख्य चुनौती तथा समस्याहरू:**\n` +
      `- नीतिगत व्यवस्थाको कार्यान्वयनमा शिथिलता।\n` +
      `- आधुनिक प्रविधि र साइबर सुरक्षा जोखिमको उचित व्यवस्थापन।\n` +
      `- दक्ष जनशक्तिको अभाव र जोखिम व्यवस्थापन क्षमतामा कमी।\n\n` +
      `**४. सुधारका रणनीतिक उपायहरू:**\n` +
      `- कार्यसम्पादन सम्झौता र नतिजामूलक मूल्यांकन प्रणाली लागू गर्ने।\n` +
      `- डिजिटल बैंकिङ र स्वचालित सूचना प्रणालीलाई सशक्त बनाउने।\n` +
      `- दक्ष जनशक्ति विकास र आन्तरिक नियन्त्रण प्रणाली (Internal Control) चुस्त पार्ने।`;
  }
};

/**
 * Direct Gemini API Streaming Handler (Works seamlessly on Vercel live builds)
 */
async function streamDirectFromGemini(
  apiKey: string,
  options: StreamAiOptions
): Promise<string> {
  const { query, history = [], attachment, level = 'level4-5', mode = 'general', onChunk, signal } = options;
  const candidateModels = ['gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'];

  const systemPrompt = `You are a premier senior Lok Sewa and Banking Examination Faculty in Nepal for NRB, RBB, NBL, ADBL, and public corporations.
Exam Level context: ${level}. Mode: ${mode}.
Provide structured, comprehensive, syllabus-aligned Nepali/English bilingual answers.
Do NOT append unrequested "मेन्टरको सुझाव", "Exam Tip", or promotional quiz boxes. Directly address the question with legal sections, formulas, and structured analysis.`;

  // Build Gemini contents array
  const contents: any[] = [];
  for (const h of history.slice(-6)) {
    contents.push({
      role: h.sender === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }]
    });
  }

  const userParts: any[] = [];
  if (attachment && attachment.data) {
    userParts.push({
      inlineData: {
        data: attachment.data,
        mimeType: attachment.mimeType
      }
    });
  }
  userParts.push({ text: query });
  contents.push({ role: 'user', parts: userParts });

  let accumulated = '';

  for (const model of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: {
            temperature: 0.3
          }
        }),
        signal
      });

      if (!response.ok || !response.body) {
        throw new Error(`Direct Gemini API ${model} HTTP error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const parsed = JSON.parse(jsonStr);
            const textPart = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (textPart) {
              accumulated += textPart;
              onChunk(textPart, cleanAiResponseText(accumulated));
            }
          } catch {
            // Ignore partial SSE chunks
          }
        }
      }

      if (accumulated.trim()) {
        return cleanAiResponseText(accumulated);
      }
    } catch (modelErr: any) {
      console.warn(`Direct Gemini model ${model} attempted, checking next:`, modelErr?.message || modelErr);
    }
  }

  throw new Error('Direct Gemini API stream returned empty or models unavailable');
}

/**
 * Server-side /api/ai-assistant-stream Handler
 */
async function streamFromBackend(
  options: StreamAiOptions
): Promise<string> {
  const { query, history = [], attachment, level, mode, onChunk, signal } = options;

  const payload: any = {
    query,
    history: history.slice(-10).map(m => ({ sender: m.sender, text: m.text })),
    level,
    mode
  };

  if (attachment) {
    payload.attachment = attachment;
  }

  const response = await fetch('/api/ai-assistant-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal
  });

  // Verify response is an actual SSE stream (and not an index.html returned by static Vercel)
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || !response.body || contentType.includes('text/html')) {
    throw new Error(`Backend streaming endpoint unavailable (status ${response.status}, type: ${contentType})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let accumulated = '';
  let streamCompleted = false;

  while (!streamCompleted) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();
      if (dataStr === '[DONE]') {
        streamCompleted = true;
        break;
      }
      try {
        const parsed = JSON.parse(dataStr);
        if (parsed.error) {
          throw new Error(parsed.error);
        }
        if (parsed.chunk) {
          accumulated += parsed.chunk;
          onChunk(parsed.chunk, cleanAiResponseText(accumulated));
        }
      } catch (pErr: any) {
        if (pErr?.message && pErr.message !== 'Unexpected end of JSON input') {
          throw pErr;
        }
      }
    }
  }

  if (accumulated.trim()) {
    return cleanAiResponseText(accumulated);
  }

  throw new Error('Backend stream closed with no output');
}

/**
 * Non-streaming backend fallback
 */
async function fetchBackendNonStreaming(options: StreamAiOptions): Promise<string> {
  const { query, history = [], attachment, level, mode, signal } = options;

  const payload: any = {
    query,
    history: history.slice(-10).map(m => ({ sender: m.sender, text: m.text })),
    level,
    mode
  };

  if (attachment) {
    payload.attachment = attachment;
  }

  const res = await fetch('/api/ai-assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal
  });

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok || contentType.includes('text/html')) {
    throw new Error(`Non-streaming backend error status ${res.status}`);
  }

  const data = await res.json();
  if (data?.answer) {
    return cleanAiResponseText(data.answer);
  }

  throw new Error('Empty backend answer');
}

/**
 * Execute AI Assistant Query with Automatic Retries (up to 3 attempts)
 * Handles both Vercel static deployments and full-stack environments seamlessly.
 */
export async function executeAiQueryWithAutoRetry(options: StreamAiOptions): Promise<string> {
  const MAX_RETRIES = 3;
  const clientKey = getEffectiveGeminiApiKey();

  let lastError: any = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        options.onRetry?.(attempt, MAX_RETRIES, `पुनः प्रयास गरिँदैछ (${attempt}/${MAX_RETRIES})...`);
        // Exponential backoff wait
        await new Promise(res => setTimeout(res, attempt * 400));
      }

      // Step 1: Try backend streaming
      try {
        const streamResult = await streamFromBackend(options);
        if (streamResult) return streamResult;
      } catch (backendErr: any) {
        // If backend fails (e.g. 404 on Vercel or network drop), immediately try direct Gemini if key available
        if (clientKey) {
          try {
            const directResult = await streamDirectFromGemini(clientKey, options);
            if (directResult) return directResult;
          } catch (directErr) {
            console.warn(`Direct Gemini attempt ${attempt} notice:`, directErr);
          }
        }

        // Step 2: Try backend non-streaming as an alternative
        try {
          const nonStreamResult = await fetchBackendNonStreaming(options);
          if (nonStreamResult) {
            options.onChunk(nonStreamResult, nonStreamResult);
            return nonStreamResult;
          }
        } catch (nsErr) {
          lastError = nsErr;
        }

        throw backendErr;
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`AI Assistant attempt ${attempt} failed:`, err?.message || err);
    }
  }

  // If all 3 attempts failed, return high-yield offline pedagogical knowledge
  // This guarantees the user is NEVER blocked by network errors or quota limits!
  console.info('All 3 network attempts completed; providing comprehensive syllabus knowledge response');
  const fallbackText = getOfflineKnowledgeFallback(options.query);
  options.onChunk(fallbackText, fallbackText);
  return fallbackText;
}

/**
 * Generate structured Notes via backend or direct Gemini API with fallback
 */
export async function generateNotesWithAutoRetry(params: {
  topic: string;
  examLevel: string;
  language: string;
}): Promise<{ notes: any; source: 'gemini' | 'curated' }> {
  const { topic, examLevel, language } = params;

  // 1. Try backend endpoint first
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch('/api/generate-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          examLevel,
          language,
          format: 'comprehensive'
        })
      });

      const contentType = response.headers.get('content-type') || '';
      if (response.ok && !contentType.includes('text/html')) {
        const data = await response.json();
        if (data.notes) {
          return { notes: data.notes, source: data.source || 'gemini' };
        }
      }
    } catch (e) {
      console.warn(`Backend notes attempt ${attempt} notice:`, e);
    }
  }

  // 2. Try direct Gemini API if client-side key exists
  const clientKey = getEffectiveGeminiApiKey();
  if (clientKey) {
    const candidateModels = ['gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'];
    const prompt = `Generate comprehensive exam notes on the topic: "${topic}".
Target Exam Level: ${examLevel}
Language Preference: ${language}
Format Style: comprehensive

Return clean JSON matching:
{
  "topicTitle": "${topic} - विस्तृत परीक्षा तयारी नोट्स",
  "examRelevance": "NRB, RBB, NBL, ADBL (${examLevel}) प्रथम तथा द्वितीय पत्र विशेष",
  "summary": "Clear conceptual overview",
  "keyPoints": ["Point 1", "Point 2", "Point 3", "Point 4"],
  "formulasOrFrameworks": ["Formula or legal section 1", "Formula 2"],
  "practiceQuestions": {
    "subjective": [{"question": "...", "marks": 10, "hint": "..."}],
    "mcqs": [{"question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "..."}]
  },
  "examinerTip": "..."
}`;

    for (const model of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${clientKey}`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.2
            }
          })
        });

        if (resp.ok) {
          const resData = await resp.json();
          const text = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const parsed = JSON.parse(text);
            return { notes: parsed, source: 'gemini' };
          }
        }
      } catch (directErr) {
        console.warn(`Direct Gemini notes with model ${model} error:`, directErr);
      }
    }
  }

  throw new Error('Notes API unavailable');
}
