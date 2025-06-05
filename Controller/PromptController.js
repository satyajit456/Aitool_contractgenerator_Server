const axios = require('axios');

function getRandomName() {
  const firstNames = ['John', 'Emily', 'Michael', 'Sophia', 'David', 'Olivia'];
  const lastNames = ['Smith', 'Johnson', 'Brown', 'Williams', 'Jones', 'Davis'];
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  return `${firstName} ${lastName}`;
}

exports.prompGenerate = async (req, res) => {
  try {
    const { prompt, existingText, contractType = 'general', count } = req.body;

    if (!prompt || prompt.trim() === '') {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (existingText) {
      const instruction = generateEditInstruction(existingText, prompt);
      const response = await callAI(instruction);
      return res.status(200).json(response);
    } else {
      // Dynamically determine number of parties (min 2, max 10)
      const totalParties = Math.min(Math.max(parseInt(count) || 2, 2), 10);
      const partyNames = new Set();
      while (partyNames.size < totalParties) {
        partyNames.add(getRandomName());
      }

      const partyList = Array.from(partyNames);
      const instruction = generateNewContractInstruction(prompt, contractType, partyList);
      const response = await callAI(instruction);

      response.metadata.parties = partyList;

      return res.status(200).json(response);
    }
  } catch (error) {
    console.error('Error generating AI response:', error?.response?.data || error.message);
    return res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

async function callAI(instruction) {
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

  const aiResponse = await axios.post(url, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  const generatedText = aiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!generatedText) {
    throw new Error('AI did not return any content');
  }

  return {
    response: cleanHtmlResponse(generatedText),
    metadata: {
      contractType: 'general',
      generatedAt: new Date().toISOString(),
      isEdit: false,
    },
  };
}

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

function generateEditInstruction(existingText, prompt) {
  return `You are a professional contract editor. Review and modify the existing contract below based on the specified changes.

EXISTING CONTRACT:
${existingText}

REQUESTED CHANGES: "${prompt}"

INSTRUCTIONS:
- Maintain the existing professional format and structure
- Only modify sections relevant to the requested changes
- Preserve all existing HTML formatting and styling
- Ensure legal consistency throughout the document
- Keep the professional tone and legal language
- Update section numbers if new clauses are added
- Maintain Arial font family styling

EDITING GUIDELINES:
- If adding new clauses, place them in the appropriate section
- If modifying existing terms, ensure they align with other contract provisions
- If removing content, ensure no references to removed sections remain
- Update any cross-references as needed
- Maintain proper legal formatting and numbering

Return the complete updated contract in HTML format without any markdown code blocks or explanations. Return only the contract content, not full HTML document structure.`;
}

function cleanHtmlResponse(htmlContent) {
  let cleaned = htmlContent.replace(/```html\n?/g, '').replace(/```\n?/g, '');
  cleaned = cleaned.trim();

  if (!cleaned.includes('font-family') && !cleaned.includes('<style>')) {
    cleaned = cleaned.replace(/<h1>/g, '<h1 style="font-family: Arial, sans-serif; text-align: center; font-weight: bold; margin-bottom: 20px;">');
    cleaned = cleaned.replace(/<h2>/g, '<h2 style="font-family: Arial, sans-serif; font-weight: bold; margin-top: 20px; margin-bottom: 10px;">');
    cleaned = cleaned.replace(/<h3>/g, '<h3 style="font-family: Arial, sans-serif; font-weight: bold; margin-top: 15px; margin-bottom: 8px;">');
    cleaned = cleaned.replace(/<p>/g, '<p style="font-family: Arial, sans-serif; line-height: 1.5; margin-bottom: 10px;">');
  }

  return cleaned;
}
