const axios = require("axios");
const redis = require("../config/redisConfig");
const pdfParse = require("pdf-parse");
const crypto = require("crypto");
const User = require("../Model/userModel");
const storeFileInDb = require("../utils/StoreFile");

// redirection controller
exports.redirectionController = async (req, res) => {
  try {
    const {
      user_id,
      api_key,
      name,
      last_name,
      email,
      parent_url,
      profile_image,
    } = req.body;

    console.log("Redirection data:", {
      user_id,
      api_key,
      name,
      last_name,
      email,
      parent_url,
      profile_image,
    });

    if (!user_id || !api_key || !name || !email) {
      return res.status(400).json({ error: "Missing user data" });
    }

    await redis.set(
      `userdata`,
      JSON.stringify({ user_id, api_key, name, email })
    );

    const existingUser = await User.findOne({ user_id });

    if (!existingUser) {
      await User.create({
        user_id,
        api_key,
        name,
        last_name,
        email,
        parent_url,
        profile_image,
      });
      console.log("New user saved to MongoDB.");
    } else {
      console.log("User already exists. Skipping save.");
    }

    const redirectUrl = process.env.FRONTEND_URL;

    res.status(200).json({ redirectUrl });
  } catch (error) {
    console.error("Error in redirectionController:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

//navlink url controller
exports.navlinkController = async (req, res) => {
  try {
    const redisData = await redis.get("userdata");

    if (!redisData) {
      return res
        .status(401)
        .json({ error: "User not authenticated or Redis expired" });
    }

    const { user_id } = JSON.parse(redisData);

    const user = await User.findOne({ user_id });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const fullName = `${user.name}`.trim();
    const baseUrl = user.parent_url?.replace(/\/$/, "") || "";
    const profileImage = user.profile_image;

    const response = {
      user_id,
      name: fullName,
      dashboard: `${baseUrl}/home_dashboard`,
      team: `${baseUrl}/setting/teams`,
      documents: `${baseUrl}/documents/documentslistbeta`,
      wefile: `${baseUrl}/wefile`,
      payment: `${baseUrl}/payments`,
      templates: `${baseUrl}/templates`,
      videos: `${baseUrl}/videos`,
      settings: `${baseUrl}/setting`,
      profileImage: profileImage,
      upgrade: `${baseUrl}/subscription/new-plans`,
      logout: `${baseUrl}/logout`,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error in navlinkController:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// Function to send document to WeSignature
exports.sendToWesignature = async (req, res) => {
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

    console.log("Clean Extracted Names:", extractedNames);

    // 🔁 Build signers array
    const signers = extractedNames.map((name) => {
      const normalized = name.trim().toLowerCase().replace(/\s+/g, "");
      const matched = normalized === normalizedOwnerName;
      return {
        name,
        email_address: matched ? ownerEmail : "",
      };
    });

    console.log("✍️ Final Signers:", signers);

    const base64Content = file.buffer.toString("base64");

    await storeFileInDb({
      userId: user_id,
      name: ownerName,
      email: ownerEmail,
      filename: file.originalname,
      content: base64Content,
      action: "wesignature",
    });

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
      " Error in sendDocument:",
      error?.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to send document" });
  }
};

//function to send document to wefile
exports.sendToWefile = async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const base64Content = file.buffer.toString("base64");

    const userDataRaw = await redis.get("userdata");
    if (!userDataRaw) {
      return res.status(401).json({ error: "User not found in Redis" });
    }

    const { user_id, email, name } = JSON.parse(userDataRaw);

    const randomName = crypto.randomBytes(6).toString("hex");
    const customFileName = `${randomName}-wesignature-ai.pdf`;

    await storeFileInDb({
      userId: user_id,
      email,
      name,
      filename: customFileName,
      content: base64Content,
      action: "wefile",
    });

    const payload = {
      user_id,
      uploaddocument: [
        {
          content: base64Content,
          filename: customFileName,
        },
      ],
    };

    const response = await axios.post(
      `${process.env.WESIGNATURE_URL}/apihandler/sendFileToWefile`,
      payload,
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      }
    );

    const Wefileurl = response?.data?.wefile_link;

    return res.status(200).json({
      message: "File uploaded successfully",
      Wefileurl: Wefileurl,
    });
  } catch (error) {
    console.error("Error in sendToWefile:", error);
    res.status(500).json({ error: "Failed to upload file" });
  }
};

//function to send file to save template
exports.sendToSaveTemplate = async (req, res) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const base64Content = file.buffer.toString("base64");

    const userDataRaw = await redis.get("userdata");

    if (!userDataRaw) {
      return res.status(401).json({ error: "User not found in Redis" });
    }

    const { user_id, email,name } = JSON.parse(userDataRaw);

    const randomName = crypto.randomBytes(6).toString("hex");
    const customFileName = `${randomName}-wesignature-ai.pdf`;

    await storeFileInDb({
      userId: user_id,
      email,
      name,
      filename: customFileName,
      content: base64Content,
      action: "template",
    });

    const payload = {
      user_id,
      uploaddocument: [
        {
          content: base64Content,
          filename: customFileName,
        },
      ],
    };

    const response = await axios.post(
      `${process.env.WESIGNATURE_URL}/apihandler/signaction`,
      payload,
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      }
    );

    const templateUrl = response?.data?.temp_link;

    return res.status(200).json({
      message: "Template saved successfully",
      templateUrl: templateUrl,
    });
  } catch (error) {
    console.error("Error in sendToSaveTemplate:", error);
    res.status(500).json({ error: "Failed to save template" });
  }
};
