const mongoose = require('mongoose')
// const validator = require('validator')
const { mongoUrl } = require('../config.json')
// import secrets from './secrets.js'

// Set up default mongoose connection
mongoose.connect(mongoUrl, {
  useNewUrlParser: true,
})

// Get the default connection
const db = mongoose.connection
// Bind connection to error event (to get notification of connection errors)
db.on('error', console.error.bind(console, 'MongoDB connection error:'))

// Define user schema
const songsSchema = new mongoose.Schema({
  // firstName: {
  // 	type: String,
  // 	max: [20, 'First name too long.'],
  // 	required: [true, 'First name required.'],
  // },
  // lastName: {
  // 	type: String,
  // 	max: [20, 'Last name too long.'],
  // 	required: [true, 'Last name required.'],
  // },
  // email: {
  // 	type: String,
  // 	required: [true, 'Email address required.'],
  // 	unique: [true, 'Email address already in use.'],
  // 	lowercase: true,
  // 	validate: (value) => {
  // 		return validator.isEmail(value)
  // 	},
  // },
  title: {
    type: String,
  },
  videoUrl: {
    type: String,
  },
  requestedById: {
    type: String,
  },
  requestedByUsername: {
    type: String,
  },
  source: {
    type: String,
  },
  playedAt: {
    type: Date,
    default: () => Date.now(),
  },
})

const songs = mongoose.models.Songs || mongoose.model('Songs', songsSchema, 'songs')

module.exports = { songs }
