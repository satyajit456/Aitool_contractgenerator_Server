const axios = require('axios');
const redis = require('../config/redisConfig');

// Main controller
exports.prompGenerate = async (req, res) => {
  try {
    const userDataStr = await redis.get('userdata');
    console.log(userDataStr);
    const { prompt, existingText, contractType = 'general', count } = req.body;

    if (!prompt || prompt.trim() === '') {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const forceNew =
      prompt.toLowerCase().includes('force new') ||
      prompt.toLowerCase().includes('create full contract');

    if (existingText && !forceNew) {
      const instruction = generateEditInstruction(existingText, prompt);
      const html = await generateContractHtml(instruction);
      const summary = await generateSummary(html, prompt);

      return res.status(200).json({
        response: html,
        summary,
        metadata: {
          contractType: 'general',
          generatedAt: new Date().toISOString(),
          isEdit: true,
        },
      });
    } else {
      const totalParties = Math.min(Math.max(parseInt(count) || 2, 2), 10);
      const partyNames = new Set();

      // Self-reference detection
      const selfMentioned = /\b(i|me|myself)\b/i.test(prompt);
      let ownerName = '[Owner Name]'; 

      if (selfMentioned ) {
        const userDataStr = await redis.get('userdata');
        if (userDataStr) {
          const userData = JSON.parse(userDataStr);
          if (userData?.name) {
            ownerName = userData.name;
          }
        }
      }

      partyNames.add(ownerName);

      while (partyNames.size < totalParties) {
        partyNames.add(`Participant ${partyNames.size + 1}`);
      }

      const partyList = Array.from(partyNames);
      const instruction = generateNewContractInstruction(prompt, contractType, partyList);
      const html = await generateContractHtml(instruction);
      const summary = await generateSummary(html, prompt);

      return res.status(200).json({
        response: html,
        summary,
        metadata: {
          contractType,
          generatedAt: new Date().toISOString(),
          isEdit: false,
          parties: partyList,
        },
      });
    }
  } catch (error) {
    console.error('Error generating AI response:', error?.response?.data || error.message);
    return res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Generate contract HTML using Gemini
async function generateContractHtml(instruction) {
  const payload = {
    contents: [{ parts: [{ text: instruction }] }],
    generationConfig: {
      temperature: 0.3,
      topP: 0.8,
      topK: 40,
      maxOutputTokens: 8192,
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const response = await axios.post(url, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('AI did not return any content');

  return cleanHtmlResponse(rawText);
}

// Generate detailed summary from contract HTML
async function generateSummary(html, prompt) {
  const instruction = `Summarize the following HTML-formatted contract based on the prompt: "${prompt}". 
Focus on details such as what actually changes in this contract that point mentions.

HTML Contract:
${html}

Return only the plain summary paragraph.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

  const response = await axios.post(
    url,
    {
      contents: [{ parts: [{ text: instruction }] }],
      generationConfig: {
        temperature: 0.3,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 1024,
      },
    },
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );

  return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Summary not available';
}

// Instruction to generate new contract
function generateNewContractInstruction(prompt, contractType, partyNames) {
  const partiesFormatted = partyNames.map(name => `- ${name}`).join('\n');

  return `You are a professional legal document writer specializing in contract drafting. Generate a comprehensive, legally sound contract based on the following requirements:

PROMPT: "${prompt}"
CONTRACT TYPE: ${contractType}

PARTICIPANTS:
${partiesFormatted}

IMPORTANT:
- Do NOT use terms like "Party A", "Party B", or "Party 1". Instead, directly refer to the provided participant names in the contract.
- Maintain a professional tone using actual names in all clauses.

FORMATTING REQUIREMENTS:
- Use proper HTML structure with semantic tags
- Apply Arial font family: style="font-family: Arial, sans-serif"
- Use professional spacing and margins
- Include proper headings hierarchy (H1 for title, H2 for major sections, H3 for subsections)

REQUIRED STRUCTURE:
1. CONTRACT TITLE (centered, bold, larger font)
2. PARTIES SECTION: Use the provided participant names directly
3. RECITALS/BACKGROUND (whereas clauses)
4. TERMS AND CONDITIONS (numbered sections)
5. PAYMENT TERMS (if applicable)
6. DURATION AND TERMINATION
7. GOVERNING LAW AND JURISDICTION
8. SIGNATURE BLOCKS (with provided participant names)

CONTENT REQUIREMENTS:
- Use formal, professional legal language
- Include specific clauses relevant to the contract type
- Add standard boilerplate clauses (force majeure, severability, entire agreement, etc.)
- Ensure all critical terms are clearly defined
- Include appropriate legal disclaimers
- Use proper legal formatting with numbered sections and subsections

STYLE GUIDELINES:
- Professional tone throughout
- Clear, unambiguous language
- Proper legal terminology
- Consistent formatting
- Include placeholders for specific details (e.g., [Date], [Amount])

Return ONLY the HTML-formatted contract content without any markdown code blocks or explanations. Do not include full HTML document structure (no <html>, <head>, <body> tags).`;
}

// Instruction to edit existing contract
function generateEditInstruction(existingText, prompt) {
  return `You are a professional contract editor. Your task is to strictly apply the following requested changes to the existing HTML-formatted contract.

EXISTING CONTRACT:
${existingText}

REQUESTED CHANGES: "${prompt}"

MANDATORY INSTRUCTIONS:
- Ensure ALL requested changes are reflected in the contract.
- If the prompt asks to ADD something (e.g., clause, party, amount), it MUST be added.
- If the prompt asks to REMOVE or MODIFY, ensure those sections are fully updated.
- If the change involves new sections, insert them with appropriate numbering.
- Update references and numbering if affected by edits.

STYLE AND FORMAT RULES:
- Keep existing HTML formatting, tags, and styles (Arial font, spacing, margins).
- Maintain professional legal tone and consistent section structure.
- Return only HTML contract content, not full HTML document structure.

Double-check the final result to ensure all prompt-based edits are included.`;
}

// Clean up HTML from AI
function cleanHtmlResponse(htmlContent) {
  let cleaned = htmlContent.replace(/```html\n?/g, "").replace(/```\n?/g, "").trim();

  cleaned = cleaned.replace(/margin:\s*[^;"']+;?/gi, "");

  cleaned = cleaned.replace(
    /<div([^>]*)style="([^"]*)"/i,
    (_, attrs, style) => `<div${attrs}style="margin: 1cm; ${style.trim()}"`,
  );

  if (!cleaned.includes("font-family")) {
    cleaned = cleaned.replace(
      /<h1>/g,
      '<h1 style="font-family: Arial, sans-serif; text-align: center; font-weight: bold; margin-bottom: 20px;">'
    );
    cleaned = cleaned.replace(
      /<h2>/g,
      '<h2 style="font-family: Arial, sans-serif; font-weight: bold; margin-top: 20px; margin-bottom: 10px;">'
    );
    cleaned = cleaned.replace(
      /<h3>/g,
      '<h3 style="font-family: Arial, sans-serif; font-weight: bold; margin-top: 15px; margin-bottom: 8px;">'
    );
    cleaned = cleaned.replace(
      /<p>/g,
      '<p style="font-family: Arial, sans-serif; line-height: 1.5; margin-bottom: 10px;">'
    );
  }

  return cleaned;
}
