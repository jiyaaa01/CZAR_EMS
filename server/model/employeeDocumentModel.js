const mongoose = require('mongoose');

const documentSubSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['aadhaar', 'pan', 'bank', 'salary', 'other'],
        required: true
    },
    filename: {
        type: String,
        required: true
    },
    uploadDate: {
        type: Date,
        default: Date.now
    },
    fromMonth: {
        type: Number,
        min: 1,
        max: 12,
        required: function () { return this.type === 'salary'; }
    },
    fromYear: {
        type: Number,
        min: 2000,
        max: new Date().getFullYear() + 10,
        required: function () { return this.type === 'salary'; }
    },
    toMonth: {
        type: Number,
        min: 1,
        max: 12,
        required: function () { return this.type === 'salary'; }
    },
    toYear: {
        type: Number,
        min: 2000,
        max: new Date().getFullYear() + 10,
        required: function () { return this.type === 'salary'; }
    }
}, { _id: true });

const salarySlipSubSchema = new mongoose.Schema({
    fromMonth: {
        type: Number,
        required: true,
        min: 1,
        max: 12
    },
    fromYear: {
        type: Number,
        required: true,
        min: 2000,
        max: new Date().getFullYear() + 10
    },
    toMonth: {
        type: Number,
        required: true,
        min: 1,
        max: 12
    },
    toYear: {
        type: Number,
        required: true,
        min: 2000,
        max: new Date().getFullYear() + 10
    },
    filename: {
        type: String,
        required: true
    },
    uploadDate: {
        type: Date,
        default: Date.now
    }
}, { _id: true });

const employeeDocumentSchema = new mongoose.Schema({
    employeeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true,
        unique: true
    },
    documents: [documentSubSchema],
    salarySlips: [salarySlipSubSchema]
});

module.exports = mongoose.model('EmployeeDocument', employeeDocumentSchema);
