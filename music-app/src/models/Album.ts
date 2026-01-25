import mongoose from 'mongoose';

const TrackSchema = new mongoose.Schema({
    title: String,
    trackNumber: Number,
    audioFile: String,
    duration: Number,
});

const AlbumSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    title: {
        type: String,
        required: true,
    },
    artist: {
        type: String,
        required: true,
    },
    coverArt: String,
    tracks: [TrackSchema],
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

export default mongoose.models.Album || mongoose.model('Album', AlbumSchema);
