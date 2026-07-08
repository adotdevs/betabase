const mongoose = require('mongoose');

// Ticket Schema
const ticketSchema = new mongoose.Schema({

    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true
    },
    ticketId: {
        type: String,
        unique: true,
        required: true
    },
    status: {
        type: String,
        enum: ['open', 'solved', 'awaiting reply'],
        default: 'open'
    },
    ticketContent: [{

        sender: {
            type: String, // 'admin' or 'user'
            required: true, enum: ['user', 'admin'],
        },
        description: {
            type: String,
            required: true
        },
        createdAt: {
            type: Date,
            default: Date.now
        },
        editedAt: {
            type: Date,
            default: null
        },
        editHistory: [{
            previousDescription: {
                type: String,
                required: true
            },
            editedAt: {
                type: Date,
                default: Date.now
            },
            editedBy: {
                type: String,
                enum: ['user', 'admin'],
                required: true
            }
        }],
        emailFailed: {
            type: Boolean,
            default: false
        }
    }],
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});
const Ticket = mongoose.model('Ticket', ticketSchema);


module.exports = Ticket;
