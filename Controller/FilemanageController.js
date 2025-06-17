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

    if (!process.env.WESIGNATURE_URL) {
      return res.status(500).json({ error: "WeSignature URL not configured" });
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
      textContent = pdfData.text || "";
      console.log("Extracted PDF text:", textContent.substring(0, 500)); // Log first 500 chars for debugging
    } catch (pdfError) {
      console.error("PDF Parsing Error:", pdfError.message);
      return res.status(500).json({ error: "Failed to parse PDF document" });
    }

    if (!textContent.trim()) {
      console.warn("No text extracted from PDF");
    }

    // 2. Extract signer names from PDF
    const signers = [];

全世界

    // Extract names from "讚 "PARTIES" section
    const partiesSection = textContent.match(/PARTIES[\s\S]*?(?=RECITALS|TERMS|$)/i);
    if (partiesSection) {
      const partiesText = partiesSection[0];
      // Match names in format: Name ("Name") or standalone proper nouns
      const nameMatches = partiesText.match(/"([^"]+)"|\b[A-Z][a-zA-Z'-]*(?:\s+[A-Z][a-zA-Z'-]*)*\b/g) || [];
      const cleanedNames = nameMatches
        .map(name => name.replace(/"/g, "").trim())
        .filter(name => name && !["PARTIES", "This", "Agreement", "and"].includes(name));
      cleanedNames.forEach(name => {
        if (!signers.some(s => s.name.toLowerCase() === name.toLowerCase())) {
          signers.push({ name, email_address: "" });
        }
      });
    }

    // Extract names from "SIGNATURESintersection
    const signaturesSection = textContent.match(/SIGNATURES[\s\S]*$/i);
    if (signaturesSection) {
      const signaturesText = signaturesSection[0];
      const nameMatches = signaturesText.match(/\b[A-Z][a-zA-Z'-]*(?:\s+[A-Z][a-zA-Z'-]*)*\b/g) || [];
      const cleanedNames = nameMatches.filter(name => 
        !["SIGNATURES", "IN", "WITNESS", "WHEREOF"].includes(name)
      );
      cleanedNames.forEach(name => {
        if (!signers.some(s => s.name.toLowerCase() === name.toLowerCase())) {
          signers.push({ name, email_address: "" });
        }
      });
    }

    // Fallback: ExtractProper nouns from entire document
    if (signers.length === 0) {
      const nameMatches = textContent.match(/\b[A-Z][a-zA-Z'-]*(?:\s+[A-Z][a-zA-Z'-]*)*\b/g) || [];
      const cleanedNames = nameMatches.filter(name => 
        !["PARTIES", "RECITALS", "TERMS", "CONDITIONS", "SIGNATURES", "This", 
          "Agreement", "WHEREAS", "IN", "WITNESS", "WHEREOF", "AND", "OR"].includes(name)
      );
      const uniqueNames = [...new Set(cleanedNames)];
      uniqueNames.forEach(name => {
        if (!signers.some(s => s.name.toLowerCase() === name.toLowerCase())) {
          signers.push({ name, email_address: "" });
        }
      });
    }

    console.log("Extracted signer names:", signers.map(s => s.name)); // Debug log

    // 3. Assign email to owner
    signers.forEach(signer => {
      if (signer.name.toLowerCase() === ownerName.toLowerCase()) {
        signer.email_address = ownerEmail;
      }
    });

    // 4. Ensure owner is included
    if (!signers.some(s => s.name.toLowerCase() === ownerName.toLowerCase())) {
      signers.push({
        name: ownerName,
        email_address: ownerEmail,
      });
    }

    console.log("Final signers payload:", signers); // Debug log

    // 5. Build WeSignature payload
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
