const express = require('express'),
      app = express(),
      dotenv = require('dotenv'),
      mongoose = require('mongoose'),
      passport = require('passport'),
      bodyParser = require('body-parser'),
      methodOverride = require('method-override'),
      flash = require('connect-flash'),
      User = require('./models/User'),
      Listing = require('./models/Listing'),
      AWS = require('aws-sdk'),
      fileupload = require('express-fileupload'),
      path = require('path');

dotenv.config();


// ===
// AWS
// ===
const s3 = new AWS.S3({
   accessKeyId: process.env.aws_id,
   secretAccessKey: process.env.aws_secret
});

const uploadFile = (file, ext) => {
   return new Promise((resolve, reject) => {
      // Setting up S3 upload parameters
      const params = {
         Bucket: process.env.bucket_name,
         Key: Math.random().toString(36).substr(2, 9) + ext,
         Body: file,
         ACL: 'public-read'
      };

      // Uploading files to the bucket
      s3.upload(params, function(err, data) {
         if (err) {
            reject(err);
         }
         console.log(`File uploaded successfully. ${data.Location}`);
         resolve(data)
      });
   });
};

// ===
// APP
// ===
app.set("view engine", "ejs");
app.use('/assets', express.static(__dirname + '/public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(flash())
app.use(fileupload())
app.use(methodOverride('_method'))

// ===========
// MONGOOSE
// ===========
mongoose.connect(process.env.db, { useNewUrlParser: true, useUnifiedTopology: true }).then(db => {
   console.log(`Loaded database.`)
})


// ===========
// PASSPORT
// ===========
app.use(require('express-session')({ secret: 'klo', resave: true, saveUninitialized: true }));
app.use(passport.initialize())
app.use(passport.session());

app.use((req, res, next) => { res.locals.message = req.flash(); next(); })

const LocalStrategy = require('passport-local').Strategy
passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.get('/', (req, res) => {
   res.redirect('/listings');
});

app.get('/listings', (req, res) => {
   Listing.find({}, (err, listings) => {
      if(err){return res.redirect('/')}
      res.render('listings', {css: "listings", title: "Listings", listings: listings, user: req.user ? req.user : undefined});
   })
});

app.get('/listings/:id', (req, res) => {
   Listing.findById(req.params.id, (err, listing) => {
      if(err){return res.redirect('/')}
      res.render('listing', {css: "listing", title: `${listing.year} ${listing.model}`, listing: listing, user: req.user ? req.user : undefined});
   })
});

app.get('/dashboard/reset', loggedIn, (req, res) => {
   res.render('dashboard/reset', {css: "login", title: "Dashboard", user: req.user});
});

app.post('/dashboard/reset', loggedIn, (req, res) => {
   if(req.body.password === process.env.rootPass){
      User.findByIdAndUpdate(req.user._id, {admin: true}, {useFindAndModify: true}, (err, newUser) => {
         if(err){return res.redirect('/')}
         res.redirect('/dashboard');
      })
   }
});

app.get('/dashboard', loggedIn, isAdmin, (req, res) => {
   res.redirect('/dashboard/listings')
   // res.render('dashboard/index', {css: "dashboard/index", title: "Dashboard", user: req.user});
});

app.get('/dashboard/listings/:id', loggedIn, isAdmin, (req, res) => {
   Listing.findById(req.params.id, (err, listing) => {
      if(err){return res.redirect('/')}
      res.render('dashboard/listing', {css: "dashboard/index", title: "Dashboard", page: 'listings', listing: listing,  user: req.user});
   })
});

app.put('/dashboard/listings/:id', loggedIn, isAdmin, (req, res) => {
   Listing.findByIdAndUpdate(req.params.id, req.body, (err, newListing) => {
      if(err){return res.redirect('/')}
      res.redirect(`/dashboard/listings/${newListing._id}`);
   })
});

app.delete('/dashboard/listings/:id', loggedIn, isAdmin, (req, res) => {
   Listing.findByIdAndRemove(req.params.id, (err, deletedListing) => {
      if(err){return res.redirect('/')}
      res.redirect(`/dashboard/listings`);
      deletedListing.images.forEach(image => {
         s3.deleteObject({
            Bucket: process.env.bucket_name,
            Key: image.key
         }, (err, data) => {});
      });
   });
});

app.get('/dashboard/listings', loggedIn, isAdmin, (req, res) => {
   Listing.find({}, (err, listings) => {
      if(err){return res.redirect('/')}
      res.render('dashboard/listings', {css: "dashboard/index", title: "Dashboard", page: 'listings', listings: listings,  user: req.user});
   })
});

app.post('/dashboard/listings/new', loggedIn, isAdmin, async (req, res) => {
   let images = [];
   if(req.files){
      if(req.files.images.length > 1){
         for(image of req.files.images){
            if(!image.mimetype.startsWith('image')){return}
            let img = await uploadFile(image.data, path.extname(image.name));
            images.push(img);
         }
      } else {
         let img = await uploadFile(req.files.images.data, path.extname(req.files.images.name));
         images.push(img);
      }
   }
   req.body.images = images
   Listing.create(req.body, (err, newListing) => {
      if(err){return res.redirect('/')}
      console.log(newListing);
      res.redirect('/dashboard/listings');
   })
});

// =====
// AUTH
// =====
app.get('/login', (req, res) => {
   if (req.user) { return res.redirect('/'); }
   res.render('dashboard/login',  {css: "login", title: "Login"});
});

app.post('/login',
  passport.authenticate('local', {failureRedirect: '/login', failureFlash: true}),
  (req, res) => {
   if (req.session.returnTo) {
      res.redirect(req.session.returnTo)
      delete req.session.returnTo
   }
   else {res.redirect('/')}
});

app.get('/register', (req, res) => {
   res.render('dashboard/register',  {css: "login", title: "Register"});
});

app.post('/register', (req, res) => {
   User.register({username:req.body.username}, req.body.password, function(err, user) {
      if (err) {return res.redirect('/')}
      var authenticate = User.authenticate();
      authenticate(req.body.username, req.body.password, function(err, result) {
        if (err) {return res.redirect('/')}
        if (req.session.returnTo) {return req.redirect(req.session.returnTo)}
        else {res.redirect('/')}
      });
    });
});

app.get('/logout', (req, res) => {
   req.logOut();
   res.redirect('/');
});

// APP LISTEN
app.listen(process.env.PORT || 80, function () {
   console.log(`Web server is listening!`);
});

function loggedIn(req, res, next){
   if (req.user) {
      next();
   } else {
      req.session.returnTo = req.url
      res.redirect('/login');
   }
}

function isAdmin(req, res, next){
   if(req.user.admin){return next();}
   res.redirect('/');
}