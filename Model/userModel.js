const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  user_id: {
    type: String,
    required: true,
    unique: true,
  },
  api_key: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  last_name: {
    type: String,
    required: false,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
  },
  parent_url: {
    type: String,
    required: false,
  },
  profile_image: {
    type: String, 
    required: false,
  }
}, {
  timestamps: true,
});

module.exports = mongoose.model('User', userSchema);
