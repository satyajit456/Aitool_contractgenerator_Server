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

    const { user_id, api_key, name: ownerName, email: ownerEmail } = JSON.parse(userDataRaw);
    console.log("User data from Redis:", { user_id, api_key, ownerName, ownerEmail });

    // 🧠 Prompt Gemini to extract names
    const geminiPrompt = `
      Analyze the following contract and extract only the names of people or parties involved in the agreement.
      Return them as a JSON array of strings.

      Contract Text:
      ${text}
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

    const aiText =
      geminiResponse?.data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";

    console.log("🧠 AI Raw Response:", aiText);

    // 🧹 Clean and parse name array
    const nameArray = JSON.parse(
      aiText.replace(/`/g, "").replace(/^\s*["']?|["']?\s*$/g, "")
    );

    if (!Array.isArray(nameArray)) {
      return res.status(400).json({ error: "Invalid name list from AI" });
    }

    // 🔁 Match names and prepare signer objects
    const signers = nameArray.map((name) => {
      const normalizedAIName = name.trim().toLowerCase().replace(/\s+/g, "");
      const normalizedOwnerName = ownerName.trim().toLowerCase().replace(/\s+/g, "");

      return {
        name: name,
        email_address: normalizedAIName === normalizedOwnerName ? ownerEmail : "",
      };
    });

    console.log("✍️ Final Signers:", signers);

    // 📄 Convert file to base64
    const base64Content = file.buffer.toString("base64");

    // 📦 Final payload
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
      mail_message: "Kindly sign document immediately.",
    };

    // 📤 Send to WeSignature
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
      message: "Document sent successfully",
      editUrl: originalEditUrl,
    });

  } catch (error) {
    console.error("❌ Error in sendDocument:", error?.response?.data || error.message);
    res.status(500).json({ error: "Failed to send document" });
  }
};
