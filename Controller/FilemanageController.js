const axios = require("axios");

exports.redirectionController = (req, res) => {
  try {
    const { user_id, api_key, name, email } = req.body;

    console.log("Redirection data:", { user_id, api_key, name, email });

    if (!user_id || !api_key || !name || !email) {
      return res.status(400).json({ error: "Missing user data" });
    }

    res.cookie("user_id", user_id, { httpOnly: false });
    res.cookie("api_key", api_key, { httpOnly: false });
    res.cookie("name", name, { httpOnly: false });
    res.cookie("email", email, { httpOnly: false });

    const redirectUrl = process.env.FRONTEND_URL;

    // const redirectUrl = `${
    //   process.env.FRONTEND_URL
    // }?user_id=${encodeURIComponent(user_id)}&api_key=${encodeURIComponent(
    //   api_key
    // )}&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}`;

    res.status(200).json({ redirectUrl });
  } catch (error) {
    console.error("Error in redirectionController:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.sendDocument = async (req, res) => {
  try {
    const file = req.file;
    const { user_id, api_key } = req.body;

    if (!file || !user_id || !api_key) {
      return res
        .status(400)
        .json({ error: "Missing file, user_id or api_key" });
    }

    const base64Content = file.buffer.toString("base64");

    const payload = {
      user_id,
      api_key,
      sign_type: 0,
      uploaddocument: [
        {
          content: base64Content,
          filename: file.originalname,
        },
      ],
      is_for_embedded_signing: 0,
      signers: [
        {
          name: "Jack",
          email_address: "jack@demo-mail.com",
        },
      ],
      mail_subject: "Please Sign the document.",
      mail_message: "Kindly sign document immediately.",
    };

    const response = await axios.post(
      "https://app.wesignature.com/apihandler/senddocumentapi_upload",
      payload,
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      }
    );

    res.status(200).json({
      message: "Document sent successfully",
      //   data: response.data
    });
  } catch (error) {
    console.error(
      "Error sending document:",
      error.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to send document" });
  }
};
