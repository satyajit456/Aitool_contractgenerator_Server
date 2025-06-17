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
    let textContent;
    try {
      const pdfData = await pdfParse(file.buffer);
      textContent = pdfData.text;
    } catch (pdfError) {
      console.error("PDF Parsing Error:", pdfError.message);
      return res.status(500).json({ error: "Failed to parse PDF document" });
    }

    // 2. Known clients (consider fetching from Redis or DB)
    const knownClients = [
      { name: "Jill", email: "jill@demo-mail.com" },
      { name: "Jack", email: "jack@demo-mail.com" },
      { name: "Tom Hardy", email: "tom@client.com" },
      { name: "Nihar", email: "nihar@client.com" }, // Added for testing
      { name: "Frenkie De", email: "frenkie@client.com" }, // Added for testing
    ];

    // 3. Extract signer names from the "PARTIES" section
    const signers = [];
    const partiesSectionMatch = textContent.match(/PARTIES[\s\S]*?between\s+([^\(]+)\s*\("([^\)]+)"\),\s*and\s+([^\(]+)\s*\("([^\)]+)"\)/i);
    if (partiesSectionMatch) {
      const [, frenkieFull, frenkieName, niharFull, niharName] = partiesSectionMatch;
      [frenkieName, niharName].forEach(name => {
        if (name && !signers.some(s => s.name.toLowerCase() === name.toLowerCase())) {
          signers.push({ name, email_address: "" });
        }
      });
    }

    // 4. Fallback: Extract names from the entire document using a more flexible regex
    if (signers.length === 0) {
      const nameMatches = textContent.match(/\b[A-Z][a-zA-Z'-]*(?:\s+[A-Z][a-zA-Z'-]*)*\b/g) || [];
      const uniqueNames = [...new Set(nameMatches.filter(name => 
        // Filter out common words or invalid names
        !["This", "Agreement", "WHEREAS", "IN", "WITNESS", "WHEREOF"].includes(name)
      ))];
      uniqueNames.forEach(name => {
        if (!signers.some(s => s.name.toLowerCase() === name.toLowerCase())) {
          signers.push({ name, email_address: "" });
        }
      });
    }

    // 5. Assign emails to signers
    signers.forEach(signer => {
      if (signer.name.toLowerCase() === ownerName.toLowerCase()) {
        signer.email_address = ownerEmail;
      } else {
        const known = knownClients.find(client => client.name.toLowerCase() === signer.name.toLowerCase());
        if (known) {
          signer.email_address = known.email;
        }
      }
    });

    // 6. Ensure owner is included
    if (!signers.some(s => s.name.toLowerCase() === ownerName.toLowerCase())) {
      signers.push({
        name: ownerName,
        email_address: ownerEmail,
      });
    }

    // 7. Validate signers
    const validSigners = signers.filter(signer => signer.email_address);
    if (validSigners.length === 0) {
      return res.status(400).json({ error: "No valid signers with email addresses found" });
    }

    console.log(">>>>>>>>>>>",signers);
    

    // 8. Build WeSignature payload
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
