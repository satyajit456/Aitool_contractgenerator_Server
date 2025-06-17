const axios = require("axios");
const redis = require("../config/redisConfig");
const pdfParse = require("pdf-parse");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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

    // 1. Get owner info from Redis
    const userDataRaw = await redis.get("userdata");
    if (!userDataRaw) {
      return res.status(401).json({ error: "User not found in Redis" });
    }

    const { user_id, api_key, name: ownerName, email: ownerEmail } = JSON.parse(userDataRaw);
    console.log("Owner:", { user_id, ownerName, ownerEmail });

    // 2. Convert file to base64 & plain text
    const base64Content = file.buffer.toString("base64");
    const textContent = file.buffer.toString("utf8");

    // 3. Use Gemini to extract signer names
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = `
      Read this legal agreement and extract the names of the  parties involved in the contract.
      Return only the party names in JSON format like:
      { "parties": ["Party A", "Party B"] }

      Document Content:
      """
      ${textContent}
      """`;

    const result = await model.generateContent(prompt);
    const aiText = await result.response.text();

    console.log("Gemini AI raw response:", aiText);

    let signerNames = [];
    try {
      const parsed = JSON.parse(aiText);
      signerNames = parsed.parties || [];
    } catch (err) {
      console.error("Gemini output parse error:", aiText);
      return res.status(500).json({ error: "Could not extract signer names from document." });
    }

    // 4. Normalize function for fuzzy match
    const normalize = (str) => str.toLowerCase().replace(/\s+/g, "");

    // 5. Construct signer array
    const signers = signerNames.map((name) => {
      const isOwner = normalize(name).includes(normalize(ownerName));
      return {
        name,
        email_address: isOwner ? ownerEmail : "", // only send email for owner
      };
    });

    console.log("Final signers:", signers);

    // 6. Prepare payload
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

    // 7. Send to WeSignature
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
      signers,
    });

  } catch (error) {
    console.error("Error in sendDocument:", error);
    res.status(500).json({ error: "Failed to send document" });
  }
};
