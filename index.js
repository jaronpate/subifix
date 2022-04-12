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
      Quote = require('./models/Quote'),
      AWS = require('aws-sdk'),
      fileupload = require('express-fileupload'),
      path = require('path');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));


dotenv.config();
mongoose.set('useFindAndModify', false);

// ===
// AWS
// ===
const s3 = new AWS.S3({
   accessKeyId: process.env.aws_id,
   secretAccessKey: process.env.aws_secret
});

const uploadFile = (file, ext, type) => {
   return new Promise((resolve, reject) => {
      // Setting up S3 upload parameters
      const params = {
         Bucket: process.env.bucket_name,
         Key: Math.random().toString(36).substr(2, 9) + ext,
         Body: file,
         ACL: 'public-read',
         ContentType: type
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
   res.render('index', {css: "index", title: "Home", user: req.user ? req.user : undefined, siteKey: process.env.captchaSiteKey});
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

app.put('/dashboard/listings/:id/image/thumbnail', loggedIn, isAdmin, (req, res) => {
   Listing.findById(req.params.id, (err, listing) => {
      if(err){return res.redirect('/')}
      let thumb = listing.images.splice(req.body.key, 1);
      listing.images.unshift(thumb[0]);
      listing.save().then(newListing => {
         res.redirect(`/dashboard/listings/${newListing._id}`);
      })
   });
});

app.put('/dashboard/listings/:id/image/remove', loggedIn, isAdmin, (req, res) => {
   // Remove image
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

app.post('/dashboard/listings/:id/sold', loggedIn, isAdmin, (req, res) => {
   req.body.sale.date = new Date();
   Listing.findByIdAndUpdate(req.params.id, {
      sold: true,
      sale: req.body.sale
   }, (err, newListing) => {
      if(err){return res.redirect('/')}
      console.log(newListing)
      res.redirect(`/dashboard/listings`);
   })
});

app.get('/dashboard/listings', loggedIn, isAdmin, (req, res) => {
   Listing.find({}, (err, listings) => {
      if(err){return res.redirect('/')}
      res.render('dashboard/listings', {css: "dashboard/index", title: "Dashboard", page: 'listings', listings: listings,  user: req.user});
   });
});

app.post("/quotes/new", async (req, res) => {   
   const params = new URLSearchParams();
   params.append('secret', process.env.captchaSecret);
   params.append('response', req.body["g-recaptcha-response"]);

   const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST', 
      body: params,
   });
   const data = await response.json();

   if(data.success){
      Quote.create(req.body, (err, newQuote) => {
         if(err){return res.redirect('/')}
         req.flash("form", "success")
         res.redirect('/')
      })
   } else {
      res.redirect('/');
   }
});

app.post('/dashboard/listings/new', loggedIn, isAdmin, async (req, res) => {
   let images = [];
   if(req.files){
      if(req.files.images.length > 1){
         for(image of req.files.images){
            if(!image.mimetype.startsWith('image')){return}
            let img = await uploadFile(image.data, path.extname(image.name), image.mimetype);
            images.push(img);
         }
      } else {
         let img = await uploadFile(req.files.images.data, path.extname(req.files.images.name), req.files.images.mimetype);
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
   User.register({username: req.body.username}, req.body.password, function(err, user) {
      if (err) {
         req.flash("error", err.message)
         return res.redirect('/register')
      }
      user.authenticate(req.body.password, function(err, result) {
        if (err) {console.log(err)}
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

/**
 * Error Handler.
 */
 if (process.env.NODE_ENV === 'development') {
   // only use in development
   app.use(errorHandler());
 } else {
   app.use((err, req, res, next) => {
     console.error(err);
     res.status(500).send('Server Error');
   });
 }