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
   images: Array,
   sold: {type: Boolean, default: false},
   sale: Object
}, { timestamps: true });

const Listing = mongoose.model('Listing', listingSchema);

module.exports = Listing;
