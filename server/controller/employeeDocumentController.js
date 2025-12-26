const EmployeeDocument = require('../model/employeeDocumentModel');
const Employee = require('../model/employeeModel');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Upload document
const uploadDocument = async (req, res) => {
    try {
        console.log('Upload request received:', req.params, req.body, req.file ? 'File present' : 'No file');
        const { employeeId } = req.params;
        const { type, fromMonth, fromYear, toMonth, toYear } = req.body; // type and dates from form data
        const file = req.file;

        if (!mongoose.Types.ObjectId.isValid(employeeId)) {
            return res.status(400).json({ message: 'Invalid employee ID' });
        }

        if (!file) {
            console.log('No file uploaded');
            return res.status(400).json({ message: 'No file uploaded' });
        }

        if (!['aadhaar', 'pan', 'bank', 'salary', 'other'].includes(type)) {
            return res.status(400).json({ message: 'Invalid document type' });
        }

        // Validate dates for salary slips
        if (type === 'salary') {
            console.log('Validating salary slip dates:', { fromMonth, fromYear, toMonth, toYear });
            if (!fromMonth || !fromYear || !toMonth || !toYear) {
                console.log('Missing required fields for salary slip');
                return res.status(400).json({ message: 'From month/year and to month/year are required for salary slips' });
            }
            const fromMonthNum = parseInt(fromMonth);
            const fromYearNum = parseInt(fromYear);
            const toMonthNum = parseInt(toMonth);
            const toYearNum = parseInt(toYear);
            console.log('Parsed values:', { fromMonthNum, fromYearNum, toMonthNum, toYearNum });
            if (fromMonthNum < 1 || fromMonthNum > 12 || toMonthNum < 1 || toMonthNum > 12) {
                console.log('Invalid month values');
                return res.status(400).json({ message: 'Invalid month' });
            }
            if (fromYearNum < 2000 || fromYearNum > new Date().getFullYear() + 10 || toYearNum < 2000 || toYearNum > new Date().getFullYear() + 10) {
                console.log('Invalid year values');
                return res.status(400).json({ message: 'Invalid year' });
            }
            const fromDate = new Date(fromYearNum, fromMonthNum - 1);
            const toDate = new Date(toYearNum, toMonthNum - 1);
            if (fromDate > toDate) {
                console.log('From date after to date');
                return res.status(400).json({ message: 'From date cannot be after to date' });
            }
        }


        let employeeDoc = await EmployeeDocument.findOne({ employeeId });

        if (!employeeDoc) {
            employeeDoc = new EmployeeDocument({ employeeId, documents: [], salarySlips: [] });
        }

        if (type === 'salary') {
            // Handle salary slips separately in salarySlips array
            // Check if salary slip for this period already exists
            const existingIndex = employeeDoc.salarySlips.findIndex(slip =>
                slip.fromMonth === parseInt(fromMonth) && slip.fromYear === parseInt(fromYear) &&
                slip.toMonth === parseInt(toMonth) && slip.toYear === parseInt(toYear)
            );
            if (existingIndex !== -1) {
                // Delete old file if exists
                const oldFilePath = path.join(__dirname, '../../uploads/documents/', employeeDoc.salarySlips[existingIndex].filename);
                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath);
                }
                // Replace the salary slip
                employeeDoc.salarySlips[existingIndex] = {
                    fromMonth: parseInt(fromMonth),
                    fromYear: parseInt(fromYear),
                    toMonth: parseInt(toMonth),
                    toYear: parseInt(toYear),
                    filename: file.filename, // Use sanitized filename
                    uploadDate: new Date()
                };
            } else {
                // Add new salary slip
                employeeDoc.salarySlips.push({
                    fromMonth: parseInt(fromMonth),
                    fromYear: parseInt(fromYear),
                    toMonth: parseInt(toMonth),
                    toYear: parseInt(toYear),
                    filename: file.filename, // Use sanitized filename
                    uploadDate: new Date()
                });
            }
        } else {
            // Handle other documents in documents array
            // Check if document of this type already exists
            const existingIndex = employeeDoc.documents.findIndex(doc => doc.type === type);
            if (existingIndex !== -1) {
                // Delete old file if exists
                const oldFilePath = path.join(__dirname, '../../uploads/documents/', employeeDoc.documents[existingIndex].filename);
                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath);
                }
                // Replace the document
                employeeDoc.documents[existingIndex] = {
                    type,
                    filename: file.filename, // Use sanitized filename
                    uploadDate: new Date()
                };
            } else {
                // Add new document
                employeeDoc.documents.push({
                    type,
                    filename: file.filename, // Use sanitized filename
                    uploadDate: new Date()
                });
            }
        }

        await employeeDoc.save();

        res.status(201).json({ message: 'Document uploaded successfully', document: employeeDoc });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ message: 'Server error uploading document' });
    }
};

// Get documents by employee
const getDocumentsByEmployee = async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { year } = req.query; // Get year filter from query params

        if (!mongoose.Types.ObjectId.isValid(employeeId)) {
            return res.status(400).json({ message: 'Invalid employee ID' });
        }

        const employeeDoc = await EmployeeDocument.findOne({ employeeId });

        if (!employeeDoc) {
            return res.json({ documents: [] });
        }

        // Filter salary slips by year if specified
        let filteredSalarySlips = employeeDoc.salarySlips;
        if (year && year !== 'all') {
            const yearNum = parseInt(year);
            filteredSalarySlips = employeeDoc.salarySlips.filter(slip => slip.fromYear === yearNum);
        }

        // Combine regular documents and filtered salary slips into a single array
        const documents = [
            ...employeeDoc.documents.map(doc => ({ ...doc.toObject(), _id: doc._id })),
            ...filteredSalarySlips.map(slip => ({
                ...slip.toObject(),
                _id: slip._id,
                type: 'salary'
            }))
        ].sort((a, b) => b.uploadDate - a.uploadDate);

        res.json({ documents });
    } catch (error) {
        console.error('Get documents error:', error);
        res.status(500).json({ message: 'Server error fetching documents' });
    }
};

const getMyDocuments = async (req, res) => {
    try {
        const { userId } = req.user;
        const employee = await Employee.findOne({ userId });
        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }
        const employeeDoc = await EmployeeDocument.findOne({ employeeId: employee._id });
        const documents = employeeDoc ? employeeDoc.documents.sort((a, b) => b.uploadDate - a.uploadDate) : [];
        res.json({ documents });
    } catch (error) {
        console.error('Get my documents error:', error);
        res.status(500).json({ message: 'Server error fetching documents' });
    }
};

// Delete document
const deleteDocument = async (req, res) => {
    try {
        const { docId } = req.params; // This is the subdocument _id
        let employeeDoc = await EmployeeDocument.findOne({
            $or: [
                { 'documents._id': docId },
                { 'salarySlips._id': docId }
            ]
        });

        if (!employeeDoc) {
            return res.status(404).json({ message: 'Document not found' });
        }

        let docIndex = employeeDoc.documents.findIndex(doc => doc._id.toString() === docId);
        let isSalarySlip = false;
        let filename = '';

        if (docIndex !== -1) {
            // It's a regular document
            filename = employeeDoc.documents[docIndex].filename;
        } else {
            // Check if it's a salary slip
            docIndex = employeeDoc.salarySlips.findIndex(slip => slip._id.toString() === docId);
            if (docIndex !== -1) {
                isSalarySlip = true;
                filename = employeeDoc.salarySlips[docIndex].filename;
            } else {
                return res.status(404).json({ message: 'Document not found' });
            }
        }

        // Delete file from filesystem
        const filePath = path.join(__dirname, '../../uploads/documents/', filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Remove from appropriate array
        if (!isSalarySlip) {
            employeeDoc.documents.splice(docIndex, 1);
        } else {
            employeeDoc.salarySlips.splice(docIndex, 1);
        }
        await employeeDoc.save();

        res.json({ message: 'Document deleted successfully' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ message: 'Server error deleting document' });
    }
};

const uploadMyDocument = async (req, res) => {
    try {
        const { documentType, month, year } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const typeMap = {
            'Aadhar Card': 'aadhaar',
            'PAN Card': 'pan',
            'Bank Passbook': 'bank',
            'Salary Slip': 'salary',
            'Other Document': 'other'
        };
        const type = typeMap[documentType];
        if (!type) {
            return res.status(400).json({ message: 'Invalid document type' });
        }

        // Validate month and year for salary slips
        if (type === 'salary') {
            if (!month || !year) {
                return res.status(400).json({ message: 'Month and year are required for salary slips' });
            }
            const monthNum = parseInt(month);
            const yearNum = parseInt(year);
            if (monthNum < 1 || monthNum > 12) {
                return res.status(400).json({ message: 'Invalid month' });
            }
            if (yearNum < 2000 || yearNum > new Date().getFullYear() + 10) {
                return res.status(400).json({ message: 'Invalid year' });
            }
        }

        const { userId } = req.user;
        const employee = await Employee.findOne({ userId });
        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        let employeeDoc = await EmployeeDocument.findOne({ employeeId: employee._id });

        if (!employeeDoc) {
            employeeDoc = new EmployeeDocument({ employeeId: employee._id, documents: [], salarySlips: [] });
        }

        if (type === 'salary') {
            // Handle salary slips separately in salarySlips array
            // For profile upload, use month/year as both from and to
            const fromMonthNum = parseInt(month);
            const fromYearNum = parseInt(year);
            const toMonthNum = parseInt(month);
            const toYearNum = parseInt(year);

            // Check if salary slip for this period already exists
            const existingIndex = employeeDoc.salarySlips.findIndex(slip =>
                slip.fromMonth === fromMonthNum && slip.fromYear === fromYearNum &&
                slip.toMonth === toMonthNum && slip.toYear === toYearNum
            );
            if (existingIndex !== -1) {
                // Delete old file if exists
                const oldFilePath = path.join(__dirname, '../../uploads/documents/', employeeDoc.salarySlips[existingIndex].filename);
                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath);
                }
                // Replace the salary slip
                employeeDoc.salarySlips[existingIndex] = {
                    fromMonth: fromMonthNum,
                    fromYear: fromYearNum,
                    toMonth: toMonthNum,
                    toYear: toYearNum,
                    filename: file.filename,
                    uploadDate: new Date()
                };
            } else {
                // Add new salary slip
                employeeDoc.salarySlips.push({
                    fromMonth: fromMonthNum,
                    fromYear: fromYearNum,
                    toMonth: toMonthNum,
                    toYear: toYearNum,
                    filename: file.filename,
                    uploadDate: new Date()
                });
            }
        } else {
            // Handle other documents in documents array
            // Check if document of this type already exists
            const existingIndex = employeeDoc.documents.findIndex(doc => doc.type === type);
            if (existingIndex !== -1) {
                // Delete old file if exists
                const oldFilePath = path.join(__dirname, '../../uploads/documents/', employeeDoc.documents[existingIndex].filename);
                if (fs.existsSync(oldFilePath)) {
                    fs.unlinkSync(oldFilePath);
                }
                // Replace the document
                employeeDoc.documents[existingIndex] = {
                    type,
                    filename: file.filename,
                    uploadDate: new Date()
                };
            } else {
                // Add new document
                employeeDoc.documents.push({
                    type,
                    filename: file.filename,
                    uploadDate: new Date()
                });
            }
        }

        await employeeDoc.save();

        res.status(201).json({ message: 'Document uploaded successfully', document: employeeDoc });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ message: 'Server error uploading document' });
    }
};

// Upload salary slip
const uploadSalarySlip = async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { fromMonth, fromYear, toMonth, toYear } = req.body;
        const file = req.file;

        if (!mongoose.Types.ObjectId.isValid(employeeId)) {
            return res.status(400).json({ message: 'Invalid employee ID' });
        }

        if (!file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        if (!fromMonth || !fromYear || !toMonth || !toYear) {
            return res.status(400).json({ message: 'All period fields are required' });
        }

        const fromMonthNum = parseInt(fromMonth);
        const fromYearNum = parseInt(fromYear);
        const toMonthNum = parseInt(toMonth);
        const toYearNum = parseInt(toYear);

        if (fromMonthNum < 1 || fromMonthNum > 12 || toMonthNum < 1 || toMonthNum > 12) {
            return res.status(400).json({ message: 'Invalid month' });
        }

        if (fromYearNum < 2000 || fromYearNum > new Date().getFullYear() + 10 ||
            toYearNum < 2000 || toYearNum > new Date().getFullYear() + 10) {
            return res.status(400).json({ message: 'Invalid year' });
        }

        // Validate period: from date should be before or equal to to date
        const fromDate = new Date(fromYearNum, fromMonthNum - 1);
        const toDate = new Date(toYearNum, toMonthNum - 1);
        if (fromDate > toDate) {
            return res.status(400).json({ message: 'From date cannot be after to date' });
        }

        let employeeDoc = await EmployeeDocument.findOne({ employeeId });

        if (!employeeDoc) {
            employeeDoc = new EmployeeDocument({ employeeId, documents: [], salarySlips: [] });
        }

        // Check if salary slip for this period already exists
        const existingIndex = employeeDoc.salarySlips.findIndex(slip =>
            slip.fromMonth === fromMonthNum && slip.fromYear === fromYearNum &&
            slip.toMonth === toMonthNum && slip.toYear === toYearNum
        );
        if (existingIndex !== -1) {
            // Delete old file if exists
            const oldFilePath = path.join(__dirname, '../../uploads/documents/', employeeDoc.salarySlips[existingIndex].filename);
            if (fs.existsSync(oldFilePath)) {
                fs.unlinkSync(oldFilePath);
            }
            // Replace the salary slip
            employeeDoc.salarySlips[existingIndex] = {
                fromMonth: fromMonthNum,
                fromYear: fromYearNum,
                toMonth: toMonthNum,
                toYear: toYearNum,
                filename: file.filename,
                uploadDate: new Date()
            };
        } else {
            // Add new salary slip
            employeeDoc.salarySlips.push({
                fromMonth: fromMonthNum,
                fromYear: fromYearNum,
                toMonth: toMonthNum,
                toYear: toYearNum,
                filename: file.filename,
                uploadDate: new Date()
            });
        }

        await employeeDoc.save();

        res.status(201).json({ message: 'Salary slip uploaded successfully', document: employeeDoc });
    } catch (error) {
        console.error('Upload salary slip error:', error);
        res.status(500).json({ message: 'Server error uploading salary slip' });
    }
};

// Get salary slips by employee
const getSalarySlipsByEmployee = async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { year } = req.query; // Get year filter from query params

        if (!mongoose.Types.ObjectId.isValid(employeeId)) {
            return res.status(400).json({ message: 'Invalid employee ID' });
        }

        const employeeDoc = await EmployeeDocument.findOne({ employeeId });

        if (!employeeDoc) {
            return res.json({ salarySlips: [] });
        }

        // Filter salary slips by year if specified
        let filteredSalarySlips = employeeDoc.salarySlips;
        if (year && year !== 'all') {
            const yearNum = parseInt(year);
            filteredSalarySlips = employeeDoc.salarySlips.filter(slip => slip.fromYear === yearNum);
        }

        const salarySlips = filteredSalarySlips.sort((a, b) => {
            if (a.toYear !== b.toYear) return b.toYear - a.toYear;
            return b.toMonth - a.toMonth;
        });

        res.json({ salarySlips });
    } catch (error) {
        console.error('Get salary slips error:', error);
        res.status(500).json({ message: 'Server error fetching salary slips' });
    }
};

// Get my salary slips
const getMySalarySlips = async (req, res) => {
    try {
        const { userId } = req.user;
        const employee = await Employee.findOne({ userId });
        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }
        const employeeDoc = await EmployeeDocument.findOne({ employeeId: employee._id });
        const salarySlips = employeeDoc ? employeeDoc.salarySlips.sort((a, b) => {
            if (a.toYear !== b.toYear) return b.toYear - a.toYear;
            return b.toMonth - a.toMonth;
        }) : [];
        res.json({ salarySlips });
    } catch (error) {
        console.error('Get my salary slips error:', error);
        res.status(500).json({ message: 'Server error fetching salary slips' });
    }
};

// Delete salary slip
const deleteSalarySlip = async (req, res) => {
    try {
        const { slipId } = req.params; // This is the subdocument _id
        const employeeDoc = await EmployeeDocument.findOne({ 'salarySlips._id': slipId });

        if (!employeeDoc) {
            return res.status(404).json({ message: 'Salary slip not found' });
        }

        const slipIndex = employeeDoc.salarySlips.findIndex(slip => slip._id.toString() === slipId);
        if (slipIndex === -1) {
            return res.status(404).json({ message: 'Salary slip not found' });
        }

        // Delete file from filesystem
        const filePath = path.join(__dirname, '../../uploads/documents/', employeeDoc.salarySlips[slipIndex].filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Remove from array
        employeeDoc.salarySlips.splice(slipIndex, 1);
        await employeeDoc.save();

        res.json({ message: 'Salary slip deleted successfully' });
    } catch (error) {
        console.error('Delete salary slip error:', error);
        res.status(500).json({ message: 'Server error deleting salary slip' });
    }
};

// Upload my salary slip
const uploadMySalarySlip = async (req, res) => {
    try {
        const { fromMonth, fromYear, toMonth, toYear } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        if (!fromMonth || !fromYear || !toMonth || !toYear) {
            return res.status(400).json({ message: 'All period fields are required' });
        }

        const fromMonthNum = parseInt(fromMonth);
        const fromYearNum = parseInt(fromYear);
        const toMonthNum = parseInt(toMonth);
        const toYearNum = parseInt(toYear);

        if (fromMonthNum < 1 || fromMonthNum > 12 || toMonthNum < 1 || toMonthNum > 12) {
            return res.status(400).json({ message: 'Invalid month' });
        }

        if (fromYearNum < 2000 || fromYearNum > new Date().getFullYear() + 10 ||
            toYearNum < 2000 || toYearNum > new Date().getFullYear() + 10) {
            return res.status(400).json({ message: 'Invalid year' });
        }

        // Validate period: from date should be before or equal to to date
        const fromDate = new Date(fromYearNum, fromMonthNum - 1);
        const toDate = new Date(toYearNum, toMonthNum - 1);
        if (fromDate > toDate) {
            return res.status(400).json({ message: 'From date cannot be after to date' });
        }

        const { userId } = req.user;
        const employee = await Employee.findOne({ userId });
        if (!employee) {
            return res.status(404).json({ message: 'Employee not found' });
        }

        let employeeDoc = await EmployeeDocument.findOne({ employeeId: employee._id });

        if (!employeeDoc) {
            employeeDoc = new EmployeeDocument({ employeeId: employee._id, documents: [], salarySlips: [] });
        }

        // Check if salary slip for this period already exists
        const existingIndex = employeeDoc.salarySlips.findIndex(slip =>
            slip.fromMonth === fromMonthNum && slip.fromYear === fromYearNum &&
            slip.toMonth === toMonthNum && slip.toYear === toYearNum
        );
        if (existingIndex !== -1) {
            // Delete old file if exists
            const oldFilePath = path.join(__dirname, '../../uploads/documents/', employeeDoc.salarySlips[existingIndex].filename);
            if (fs.existsSync(oldFilePath)) {
                fs.unlinkSync(oldFilePath);
            }
            // Replace the salary slip
            employeeDoc.salarySlips[existingIndex] = {
                fromMonth: fromMonthNum,
                fromYear: fromYearNum,
                toMonth: toMonthNum,
                toYear: toYearNum,
                filename: file.filename,
                uploadDate: new Date()
            };
        } else {
            // Add new salary slip
            employeeDoc.salarySlips.push({
                fromMonth: fromMonthNum,
                fromYear: fromYearNum,
                toMonth: toMonthNum,
                toYear: toYearNum,
                filename: file.filename,
                uploadDate: new Date()
            });
        }

        await employeeDoc.save();

        res.status(201).json({ message: 'Salary slip uploaded successfully', document: employeeDoc });
    } catch (error) {
        console.error('Upload my salary slip error:', error);
        res.status(500).json({ message: 'Server error uploading salary slip' });
    }
};

// View document
const viewDocument = async (req, res) => {
    try {
        const { docId } = req.params; // This is the subdocument _id
        const employeeDoc = await EmployeeDocument.findOne({
            $or: [
                { 'documents._id': docId },
                { 'salarySlips._id': docId }
            ]
        });

        if (!employeeDoc) {
            return res.status(404).json({ message: 'Document not found' });
        }

        let doc = employeeDoc.documents.find(doc => doc._id.toString() === docId);
        let filename = '';

        if (doc) {
            filename = doc.filename;
        } else {
            // Check if it's a salary slip
            doc = employeeDoc.salarySlips.find(slip => slip._id.toString() === docId);
            if (doc) {
                filename = doc.filename;
            } else {
                return res.status(404).json({ message: 'Document not found' });
            }
        }

        // Serve the file
        const filePath = path.join(__dirname, '../../uploads/documents/', filename);
        if (fs.existsSync(filePath)) {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
            res.sendFile(filePath);
        } else {
            res.status(404).json({ message: 'File not found' });
        }
    } catch (error) {
        console.error('View document error:', error);
        res.status(500).json({ message: 'Server error viewing document' });
    }
};

module.exports = { uploadDocument, getDocumentsByEmployee, deleteDocument, getMyDocuments, uploadMyDocument, uploadSalarySlip, getSalarySlipsByEmployee, getMySalarySlips, deleteSalarySlip, uploadMySalarySlip, viewDocument };
