const UploadedFile = require("../Model/uploadfileModel");

const storeFileInDb = async ({ userId, email, filename, content, action }) => {
  try {
    await UploadedFile.create({
      userId,
      email,
      filename,
      content,
      action,
    });
    console.log(`File saved to DB for action: ${action}`);
  } catch (err) {
    console.error(" Error saving file to DB:", err.message);
  }
};

module.exports = storeFileInDb;
