const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Please provide a username'],
        unique: true,
        trim: true,
        maxlength: [60, 'Username cannot be more than 60 characters'],
    },
    email: {
        type: String,
        sparse: true,
        unique: true,
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
            'Please add a valid email',
        ],
    },
    password: {
        type: String,
        required: [true, 'Please provide a password'],
        minlength: [6, 'Password cannot be less than 6 characters'],
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
