const mongoose = require('mongoose');

const listingSchema = new mongoose.Schema({
   year: String,
   model: String,
   description: String,
   price: String,
   images: Array
}, { timestamps: true });

const Listing = mongoose.model('Listing', listingSchema);

module.exports = Listing;
