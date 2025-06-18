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
    const text = req.body.text;

    if (!file || !text) {
      return res.status(400).json({ error: "Missing file or contract text" });
    }

    const userDataRaw = await redis.get("userdata");
    if (!userDataRaw) {
      return res.status(401).json({ error: "User not found in Redis" });
    }

    const {
      user_id,
      api_key,
      name: ownerName,
      email: ownerEmail,
    } = JSON.parse(userDataRaw);
    const normalizedOwnerName = ownerName
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");

    console.log("🧠 Redis Owner:", { ownerName, ownerEmail });

    // Gemini AI Prompt
    const geminiPrompt = `
      Analyze the following contract and extract only the names of people or parties involved in the agreement.
      Return the result as a JSON array like ["Name One", "Name Two"].

      Contract Text:
      ${text}
    `;

    const geminiResponse = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: geminiPrompt }] }],
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const aiText =
      geminiResponse?.data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    console.log("🧠 Gemini Raw Response:", aiText);

    let extractedNames = [];

    try {
      const cleanedText = aiText
        .replace(/```json|```/g, "") 
        .replace(/\n/g, "")
        .trim();

      extractedNames = JSON.parse(cleanedText);

      if (!Array.isArray(extractedNames)) {
        throw new Error("AI response is not an array");
      }
    } catch (error) {
      console.error("❌ Error parsing AI response:", error.message);
      extractedNames = [];
    }

    console.log("📄 Clean Extracted Names:", extractedNames);

    // 🔁 Build signers array
    const signers = extractedNames.map((name) => {
      const normalized = name.trim().toLowerCase().replace(/\s+/g, "");
      const matched = normalized === normalizedOwnerName;
      return {
        name,
        email_address: matched ? ownerEmail : "", // match gets email, others blank
      };
    });

    console.log("✍️ Final Signers:", signers);

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
      signers,
      mail_subject: "Please Sign the document.",
      mail_message: "Kindly sign the document immediately.",
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

    const guid = response?.data?.data?.guid;
    if (!guid) {
      return res.status(500).json({ error: "Missing GUID in response" });
    }

    const editUrl = `${process.env.WESIGNATURE_URL}/doc_prepare/?guid=${guid}`;

    return res.status(200).json({
      message: "Document sent successfully",
      editUrl,
    });
  } catch (error) {
    console.error(
      "❌ Error in sendDocument:",
      error?.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to send document" });
  }
};
