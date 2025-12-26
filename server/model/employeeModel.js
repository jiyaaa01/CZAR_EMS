// const mongoose = require('mongoose');

// const DEPARTMENT = ["RESEARCH AND DEVELOPMENT","PRODUCTION","HUMAN RESOURCE","MAINTANENCE"]

// const employeeSchema = new mongoose.Schema({
//   employeeId: { type: String, unique: true },
//   name: String,
//   personalEmail: String,
//   workEmail: String,
//   dateOfBirth: Date,
//   dateOfJoining: Date,
//   availableLeaves: { type: Number, default: 20 },
//   department: String,
//   position: String,
//   role: { 
//   type: String, 
//   enum: ['Employee', 'Admin'], 
//   default: 'Employee' 
// },
//   phone: String,
//   address: String,
//   profilePhoto: String,
//   salary: Number,
//   workPassword: String,
//   userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   updatedAt: { type: Date, default: Date.now }
// });

// module.exports = mongoose.model('Employee', employeeSchema);

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const DEPARTMENTS = [
  'HR',
  'SALES',
  'IT',
  'FINANCE',
  'MARKETING',
  'OPERATIONS',
  'RESEARCH AND DEVELOPMENT',
  'PRODUCTION',
  'SUPPORT'
];

const employeeSchema = new mongoose.Schema({
  employeeId: { type: Number, unique: true },
  name: { type: String, required: true },
  personalEmail: { type: String, lowercase: true },
  workEmail: { type: String, lowercase: true, unique: true },
  dateOfBirth: Date,
  dateOfJoining: { type: Date, default: Date.now },
  allocatedLeaves: { type: Number, default: 20 },
  availableLeaves: { type: Number, default: 20 },

  department: {
    type: String,
    enum: DEPARTMENTS,
    required: true
  },

  position: String,

  role: {
    type: String,
    enum: ['Employee', 'Admin'],
    default: 'Employee'
  },

  phone: String,
  address: String,
  profilePhoto: String,
  salary: { type: Number, min: 0 },

  workPassword: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  updatedAt: { type: Date, default: Date.now }
});

// Auto-update timestamp on save
employeeSchema.pre('save', async function (next) {
  this.updatedAt = Date.now();

  // Hash workPassword if modified
  if (this.isModified('workPassword')) {
    const salt = await bcrypt.genSalt(10);
    this.workPassword = await bcrypt.hash(this.workPassword, salt);
  }

  next();
});

module.exports = mongoose.model('Employee', employeeSchema);
