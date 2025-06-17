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
    console.log("User data from Redis:", {
      user_id,
      api_key,
      ownerName,
      ownerEmail,
    });

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

    // Parse AI response to extract names
    let extractedNames;
    try {
      extractedNames = JSON.parse(aiText);
      if (!Array.isArray(extractedNames)) {
        throw new Error("AI response is not a valid array");
      }
    } catch (error) {
      console.error("Error parsing AI response:", error.message);
      extractedNames = [];
    }

    // Log extracted names for debugging
    console.log("Extracted Names:", extractedNames);

    // Initialize signers array
    let signers = [];

    // Normalize ownerName for comparison (remove extra spaces, etc.)
    const normalizedOwnerName = ownerName.trim().toLowerCase();
    console.log("Normalized Owner Name from Redis:", normalizedOwnerName);

    // Find owner (name matching ownerName from Redis)
    const owner = extractedNames.find(
      (name) => name.trim().toLowerCase() === normalizedOwnerName
    );

    // Log owner for debugging
    console.log("Owner Found:", owner);

    if (owner) {
      // Set owner with email from Redis
      signers.push({
        name: owner,
        email_address: ownerEmail,
      });
    }

    // Add other names as signers with blank emails
    const otherSigners = extractedNames.filter(
      (name) => name.trim().toLowerCase() !== normalizedOwnerName
    );
    console.log("Other Signers:", otherSigners);

    otherSigners.forEach((name) => {
      signers.push({
        name,
        email_address: "",
      });
    });

    // If no owner was found in extracted names, add Redis owner as default
    if (!owner) {
      signers.push({
        name: ownerName,
        email_address: ownerEmail,
      });
    }

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
    console.error(
      "❌ Error in sendDocument:",
      error?.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to send document" });
  }
};
