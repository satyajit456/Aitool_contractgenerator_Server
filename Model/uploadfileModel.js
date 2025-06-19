const mongoose = require("mongoose");

const UploadedFileSchema = new mongoose.Schema({
  userId: String,
  email: String,
  name: String,
  filename: String,
  content: String,
  action: {
    type: String,
    enum: ["wesignature", "wefile", "template"],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("UploadedFile", UploadedFileSchema);
