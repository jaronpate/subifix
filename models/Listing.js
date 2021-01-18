const mongoose = require('mongoose');

const listingSchema = new mongoose.Schema({
   year: String,
   model: String,
   title: String,
   description: String,
   price: String,
   miles: String,
   engine: String,
   trans: String,
   color: String,
   images: Array
}, { timestamps: true });

const Listing = mongoose.model('Listing', listingSchema);

module.exports = Listing;
