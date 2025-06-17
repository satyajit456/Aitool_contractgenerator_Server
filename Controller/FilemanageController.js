const axios = require("axios");
const redis = require("../config/redisConfig");
const pdfParse = require("pdf-parse");

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

    const userDataRaw = await redis.get("userdata");
    if (!userDataRaw) {
      return res.status(401).json({ error: "User not found in Redis" });
    }

    const { user_id, api_key, name: ownerName, email: ownerEmail } = JSON.parse(userDataRaw);
    const base64Content = file.buffer.toString("base64");

    // 1. Extract text from PDF
    const pdfData = await pdfParse(file.buffer);
    const textContent = pdfData.text;

    // 2. Known clients (extendable)
    const knownClients = [
      { name: "Jill", email: "jill@demo-mail.com" },
      { name: "Jack", email: "jack@demo-mail.com" },
      { name: "Tom Hardy", email: "tom@client.com" },
    ];

    // 3. Extract names using basic capitalized name patterns
    const nameMatches = textContent.match(/\b[A-Z][a-z]+\s[A-Z][a-z]+\b/g) || [];
    const uniqueNames = [...new Set(nameMatches)];

    const signers = [];

    uniqueNames.forEach(name => {
      let email = "";

      if (name.toLowerCase() === ownerName.toLowerCase()) {
        email = ownerEmail;
      } else {
        const known = knownClients.find(client => client.name.toLowerCase() === name.toLowerCase());
        if (known) {
          email = known.email;
        }
      }

      signers.push({
        name,
        email_address: email,
      });
    });

    // Ensure owner is added if not found by match
    if (!signers.some(s => s.name.toLowerCase() === ownerName.toLowerCase())) {
      signers.push({
        name: ownerName,
        email_address: ownerEmail,
      });
    }

    // 4. Build WeSignature payload
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
    console.log("WeSignature Error:", error?.response?.data || error.message);
    res.status(500).json({ error: "Failed to send document" });
  }
};
