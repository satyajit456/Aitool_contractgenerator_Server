const axios = require("axios");
const redis = require("../config/redisConfig");
const pdfParse = require('pdf-parse');

exports.redirectionController = async(req, res) => {
  try {
    const { user_id, api_key, name, email } = req.body;

    console.log("Redirection data:", { user_id, api_key, name, email });

    if (!user_id || !api_key || !name || !email) {
      return res.status(400).json({ error: "Missing user data" });
    }

    await redis.set(`userdata`, JSON.stringify({ user_id, api_key, name, email }));


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

    // Get owner info from Redis
    const userDataRaw = await redis.get("userdata");
    if (!userDataRaw) {
      return res.status(401).json({ error: "User not found in Redis" });
    }

    const { user_id, api_key, name: ownerName, email: ownerEmail } = JSON.parse(userDataRaw);

    // Parse the PDF for signer names
    const pdfData = await pdfParse(file.buffer);
    const text = pdfData.text;

    // Extract names from the "SIGNATURES" section
    const signaturesSectionMatch = text.match(/SIGNATURES([\s\S]+)$/i);
    const signerNames = [];

    if (signaturesSectionMatch) {
      const lines = signaturesSectionMatch[1].split('\n').map(line => line.trim()).filter(Boolean);
      for (let i = 0; i < lines.length; i++) {
        if (lines[i] === '_________________________') {
          const nameLine = lines[i + 1];
          if (nameLine && !signerNames.includes(nameLine)) {
            signerNames.push(nameLine);
          }
        }
      }
    }

    // Ensure no duplicates and owner is first with email
    const finalSigners = [
      {
        name: ownerName,
        email_address: ownerEmail,
      },
      ...signerNames
        .filter(name => name !== ownerName)
        .map(name => ({
          name,
          email_address: '',
        })),
    ];

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
      signers: finalSigners,
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
    });

  } catch (error) {
    console.error("Error in sendDocument:", error);
    res.status(500).json({ error: "Failed to send document" });
  }
};
