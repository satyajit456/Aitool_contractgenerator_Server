const axios = require("axios");
const redis = require("../config/redisConfig");
const pdfParse = require("pdf-parse");


exports.redirectionController = async (req, res) => {
  try {
    const { user_id, api_key, name, email } = req.body;

    console.log("Redirection data:", { user_id, api_key, name, email });

    if (!user_id || !api_key || !name || !email) {
      return res.status(400).json({ error: "Missing user data" });
    }

    await redis.set(
      `userdata`,
      JSON.stringify({ user_id, api_key, name, email })
    );

    const redirectUrl = process.env.FRONTEND_URL;

    res.status(200).json({ redirectUrl });
  } catch (error) {
    console.error("Error in redirectionController:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.sendDocument = async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "Missing file" });
    }

    const userDataRaw = await redis.get("userdata");
    if (!userDataRaw) {
      return res.status(401).json({ error: "User not found in Redis" });
    }

    const { user_id, api_key } = JSON.parse(userDataRaw);

    console.log("User data from Redis:>>>>>>>>>>>>>", { user_id, api_key });

    // const base64Content = file.buffer.toString("base64");
    const pdfData = await pdfParse(file.buffer);
    const extractedText = pdfData.text;

    const geminiPrompt = `
      Analyze the following contract and extract only the names of people or parties involved in the agreement. 
      Return them as a comma-separated list or JSON array. 
      
      Contract Text:
      ${extractedText}
    `;

    const geminiResponse = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [{ text: geminiPrompt }],
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const aiResult =
      geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No names found";

    console.log("🧠 Names Extracted by Gemini Flash AI:\n", aiResult);

    const base64Content = file.buffer.toString("base64");
    const payload = {
      user_id,
      api_key,
      sign_type: 3,
      uploaddocument: [
        {
          content: base64Content,
          filename: file.originalname,
        },
      ],
      is_for_embedded_signing: 0,
      signers: [], // You can use names extracted from AI here dynamically if needed
      mail_subject: "Please Sign the document.",
      mail_message: "Kindly sign document immediately.",
    };

    const response = await axios.post(
      `${process.env.WESIGNATURE_URL}/apihandler/senddocumentapi_upload`,
      payload,
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      }
    );

    const originalGuid = response?.data?.data?.guid;
    if (!originalGuid) {
      return res.status(500).json({ error: "Missing GUID in response" });
    }

    const originalEditUrl = `${process.env.WESIGNATURE_URL}/doc_prepare/?guid=${originalGuid}`;

    res.status(200).json({
      editUrl: originalEditUrl,
      extractedNames: aiResult, // Optional: return the names to frontend too
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({ error: "Failed to send document" });
  }
};
