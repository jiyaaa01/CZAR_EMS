const express = require('express');
const path = require('path');
const multer = require('multer');
const { verifyToken, verifyAdmin } = require('../middleware/authMiddleware');
const {
    getAllEmployees,
    getEmployeeById,
    updateEmployee,
    deleteEmployee,
    createEmployee,
    getAdminDetails,
    updateAdminProfile,
    changePassword,
    getAdminDashboard,
} = require('../controller/adminControlle');

const { uploadDocument, getDocumentsByEmployee, deleteDocument, getSalarySlipsByEmployee, uploadSalarySlip, deleteSalarySlip, viewDocument } = require('../controller/employeeDocumentController');
const { getLeaveRequests, reviewLeaveRequest } = require('../controller/adminControlle');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../../uploads/documents/'));
    },
    filename: (req, file, cb) => {
        // Sanitize filename by replacing spaces and special characters
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `doc_${Date.now()}_${sanitizedName}`);
    }
});

const upload = multer({ storage });

// Configure multer for profile photo uploads
const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../../uploads/'));
    },
    filename: (req, file, cb) => {
        cb(null, `profile_${Date.now()}_${file.originalname}`);
    }
});

// File filter to only accept JPG and PNG
const profileFileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only JPG and PNG files are allowed!'));
    }
};

const uploadProfile = multer({
    storage: profileStorage,
    fileFilter: profileFileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Admin routes
router.get('/all-employees', verifyToken, verifyAdmin, getAllEmployees);
router.get('/employee/:id', verifyToken, verifyAdmin, getEmployeeById);
router.put('/update-employee/:employeeId', verifyToken, verifyAdmin, uploadProfile.single('profilePhoto'), updateEmployee);
router.delete('/employee/:id', verifyToken, verifyAdmin, deleteEmployee);
router.post('/add-employee', verifyToken, verifyAdmin, uploadProfile.single('profilephoto'), createEmployee);
router.get('/get-admin-details', verifyToken, verifyAdmin, getAdminDetails);
router.put('/update/:id', verifyToken, verifyAdmin, updateAdminProfile);
router.put('/change-password', verifyToken, verifyAdmin, changePassword);
router.get('/admin-dashboard', verifyToken, verifyAdmin, getAdminDashboard);

// Document routes
router.get('/documents/:employeeId', verifyToken, verifyAdmin, getDocumentsByEmployee);
router.post('/documents/:employeeId', verifyToken, verifyAdmin, upload.single('document'), uploadDocument);
router.get('/documents/view/:docId', verifyToken, verifyAdmin, viewDocument);
router.delete('/documents/:docId', verifyToken, verifyAdmin, deleteDocument);

// Salary slip routes
router.get('/salary-slips/:employeeId', verifyToken, verifyAdmin, getSalarySlipsByEmployee);
router.post('/salary-slips/:employeeId', verifyToken, verifyAdmin, upload.single('salarySlip'), uploadSalarySlip);
router.delete('/salary-slips/:slipId', verifyToken, verifyAdmin, deleteSalarySlip);

// Leave request routes
router.get('/leave-requests', verifyToken, verifyAdmin, getLeaveRequests);
router.put('/leave-requests/:id', verifyToken, verifyAdmin, reviewLeaveRequest);

module.exports = router;
