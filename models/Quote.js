const mongoose = require('mongoose');

const quoteSchema = new mongoose.Schema({
   firstname: String,
   lastname: String,
   email: String,
   tel: String,
   msg: String,
}, { timestamps: true });

const Quote = mongoose.model('Quote', quoteSchema);

module.exports = Quote;
