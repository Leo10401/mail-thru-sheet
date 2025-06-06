const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
require('dotenv').config();
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Google Sheets API setup
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE, // Path to your service account key file
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });

// SMTP Transporter setup
const smtpTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT, 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

// Helper function to convert range to object array
function convertToObjects(values, headers = null) {
  if (!values || values.length === 0) return [];
  
  const headerRow = headers || values[0];
  const dataRows = headers ? values : values.slice(1);
  
  return dataRows.map(row => {
    const obj = {};
    headerRow.forEach((header, index) => {
      obj[header] = row[index] || '';
    });
    return obj;
  });
}

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Google Sheets API Backend is running' });
});

// Get all data from a specific sheet
app.get(['/sheets/:spreadsheetId', '/sheets/:spreadsheetId/:range'], async (req, res) => {
  try {
    const { spreadsheetId } = req.params;
    const range = req.params.range || 'Sheet1';
    const { format = 'objects' } = req.query;
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    
    const values = response.data.values;
    
    if (!values || values.length === 0) {
      return res.json({ 
        message: 'No data found',
        data: [],
        rawData: []
      });
    }
    
    const result = {
      rawData: values,
      data: format === 'objects' ? convertToObjects(values) : values,
      rowCount: values.length,
      columnCount: values[0]?.length || 0
    };
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching sheet data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch sheet data',
      message: error.message 
    });
  }
});

// Get contacts (name and email) from sheet - Optimized for contact data
// Get contacts with optional range parameter
app.get(['/contacts/:spreadsheetId', '/contacts/:spreadsheetId/:range'], async (req, res) => {
  try {
    const { spreadsheetId } = req.params;
    const range = req.params.range || 'Sheet1'; // Default to Sheet1 if no range specified
    const { nameColumn = 'name', emailColumn = 'email', validateEmails = 'true' } = req.query;
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    
    const values = response.data.values;
    
    if (!values || values.length === 0) {
      return res.json({ 
        message: 'No data found',
        contacts: [],
        totalContacts: 0,
        validEmails: 0,
        invalidEmails: 0
      });
    }
    
    const objects = convertToObjects(values);
    
    // Email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    // Extract contacts with name and email
    const contacts = objects.map((row, index) => {
      // Try to find name and email columns with flexible matching
      const name = row[nameColumn] || 
                   row['Name'] || 
                   row['name'] || 
                   row['Full Name'] || 
                   row['full_name'] ||
                   row[Object.keys(row).find(key => key.toLowerCase().includes('name'))] || '';
      
      const email = row[emailColumn] || 
                    row['Email'] || 
                    row['email'] || 
                    row['Email Address'] || 
                    row['email_address'] ||
                    row[Object.keys(row).find(key => key.toLowerCase().includes('email') || key.toLowerCase().includes('mail'))] || '';
      
      const isValidEmail = validateEmails === 'true' ? emailRegex.test(email) : true;
      
      return {
        id: index + 1,
        name: name.toString().trim(),
        email: email.toString().trim().toLowerCase(),
        isValidEmail,
        originalRow: index + 2 // +2 because arrays are 0-indexed and we skip header
      };
    }).filter(contact => contact.name || contact.email); // Filter out completely empty rows
    
    // Statistics
    const validEmails = contacts.filter(c => c.isValidEmail).length;
    const invalidEmails = contacts.filter(c => c.email && !c.isValidEmail).length;
    const contactsWithBoth = contacts.filter(c => c.name && c.email && c.isValidEmail).length;
    
    res.json({
      contacts,
      totalContacts: contacts.length,
      validEmails,
      invalidEmails,
      contactsWithBoth,
      statistics: {
        hasName: contacts.filter(c => c.name).length,
        hasEmail: contacts.filter(c => c.email).length,
        hasBoth: contactsWithBoth,
        emptyRows: objects.length - contacts.length
      }
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    res.status(500).json({ 
      error: 'Failed to fetch contacts',
      message: error.message 
    });
  }
});

// Get only valid email addresses
// Get emails with optional range parameter
app.get(['/emails/:spreadsheetId', '/emails/:spreadsheetId/:range'], async (req, res) => {
  try {
    const { spreadsheetId } = req.params;
    const range = req.params.range || 'Sheet1';
    const { emailColumn = 'email', unique = 'true' } = req.query;
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    
    const values = response.data.values;
    
    if (!values || values.length === 0) {
      return res.json({ 
        message: 'No data found',
        emails: [],
        totalEmails: 0
      });
    }
    
    const objects = convertToObjects(values);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    // Extract emails
    let emails = objects.map(row => {
      const email = row[emailColumn] || 
                    row['Email'] || 
                    row['email'] || 
                    row['Email Address'] || 
                    row['email_address'] ||
                    row[Object.keys(row).find(key => key.toLowerCase().includes('email') || key.toLowerCase().includes('mail'))] || '';
      
      return email.toString().trim().toLowerCase();
    }).filter(email => email && emailRegex.test(email));
    
    // Remove duplicates if requested
    if (unique === 'true') {
      emails = [...new Set(emails)];
    }
    
    res.json({
      emails,
      totalEmails: emails.length,
      uniqueEmails: unique === 'true' ? emails.length : [...new Set(emails)].length
    });
  } catch (error) {
    console.error('Error fetching emails:', error);
    res.status(500).json({ 
      error: 'Failed to fetch emails',
      message: error.message 
    });
  }
});

// Get multiple ranges from a sheet
app.post('/sheets/:spreadsheetId/batch', async (req, res) => {
  try {
    const { spreadsheetId } = req.params;
    const { ranges } = req.body;
    
    if (!ranges || !Array.isArray(ranges)) {
      return res.status(400).json({ 
        error: 'Invalid request',
        message: 'ranges array is required' 
      });
    }
    
    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges,
    });
    
    const result = response.data.valueRanges.map((range, index) => ({
      range: ranges[index],
      values: range.values || [],
      data: convertToObjects(range.values || [])
    }));
    
    res.json({ ranges: result });
  } catch (error) {
    console.error('Error fetching batch data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch batch data',
      message: error.message 
    });
  }
});

// Get sheet metadata
app.get('/sheets/:spreadsheetId/metadata', async (req, res) => {
  try {
    const { spreadsheetId } = req.params;
    
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
    });
    
    const spreadsheet = response.data;
    const sheetNames = spreadsheet.sheets.map(sheet => ({
      title: sheet.properties.title,
      sheetId: sheet.properties.sheetId,
      gridProperties: sheet.properties.gridProperties
    }));
    
    res.json({
      title: spreadsheet.properties.title,
      spreadsheetId: spreadsheet.spreadsheetId,
      sheets: sheetNames
    });
  } catch (error) {
    console.error('Error fetching metadata:', error);
    res.status(500).json({ 
      error: 'Failed to fetch metadata',
      message: error.message 
    });
  }
});

// Search for contacts by name or email
app.get('/contacts/:spreadsheetId/:range/search', async (req, res) => {
  try {
    const { spreadsheetId, range } = req.params;
    const { query, type = 'both' } = req.query; // type: 'name', 'email', or 'both'
    
    if (!query) {
      return res.status(400).json({ 
        error: 'Invalid request',
        message: 'query parameter is required' 
      });
    }
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    
    const values = response.data.values;
    if (!values || values.length === 0) {
      return res.json({ results: [] });
    }
    
    const objects = convertToObjects(values);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const searchQuery = query.toLowerCase();
    
    const results = objects.map((row, index) => {
      const name = row['name'] || row['Name'] || row['Full Name'] || 
                   row[Object.keys(row).find(key => key.toLowerCase().includes('name'))] || '';
      const email = row['email'] || row['Email'] || row['Email Address'] || 
                    row[Object.keys(row).find(key => key.toLowerCase().includes('email') || key.toLowerCase().includes('mail'))] || '';
      
      return {
        id: index + 1,
        name: name.toString().trim(),
        email: email.toString().trim().toLowerCase(),
        isValidEmail: emailRegex.test(email),
        originalRow: index + 2
      };
    }).filter(contact => {
      const nameMatch = contact.name.toLowerCase().includes(searchQuery);
      const emailMatch = contact.email.toLowerCase().includes(searchQuery);
      
      switch (type) {
        case 'name':
          return nameMatch;
        case 'email':
          return emailMatch;
        case 'both':
        default:
          return nameMatch || emailMatch;
      }
    });
    
    res.json({ 
      results,
      totalFound: results.length,
      searchQuery: query,
      searchType: type
    });
  } catch (error) {
    console.error('Error searching contacts:', error);
    res.status(500).json({ 
      error: 'Failed to search contacts',
      message: error.message 
    });
  }
});

// Validate and clean email list
app.get('/contacts/:spreadsheetId/:range/validate', async (req, res) => {
  try {
    const { spreadsheetId, range } = req.params;
    const { fix = 'false' } = req.query;
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    
    const values = response.data.values;
    if (!values || values.length === 0) {
      return res.json({ message: 'No data found' });
    }
    
    const objects = convertToObjects(values);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    const validation = objects.map((row, index) => {
      const name = row['name'] || row['Name'] || row['Full Name'] || 
                   row[Object.keys(row).find(key => key.toLowerCase().includes('name'))] || '';
      const email = row['email'] || row['Email'] || row['Email Address'] || 
                    row[Object.keys(row).find(key => key.toLowerCase().includes('email') || key.toLowerCase().includes('mail'))] || '';
      
      const originalEmail = email.toString().trim();
      const cleanedEmail = originalEmail.toLowerCase().replace(/\s+/g, '');
      const isValid = emailRegex.test(cleanedEmail);
      
      const issues = [];
      if (!name) issues.push('Missing name');
      if (!email) issues.push('Missing email');
      if (email && !isValid) issues.push('Invalid email format');
      if (email !== cleanedEmail) issues.push('Email has formatting issues');
      
      return {
        row: index + 2,
        name: name.toString().trim(),
        originalEmail,
        cleanedEmail: fix === 'true' ? cleanedEmail : originalEmail,
        isValid: fix === 'true' ? emailRegex.test(cleanedEmail) : isValid,
        issues,
        hasIssues: issues.length > 0
      };
    });
    
    const summary = {
      totalRows: validation.length,
      validContacts: validation.filter(v => !v.hasIssues).length,
      invalidContacts: validation.filter(v => v.hasIssues).length,
      missingNames: validation.filter(v => v.issues.includes('Missing name')).length,
      missingEmails: validation.filter(v => v.issues.includes('Missing email')).length,
      invalidEmails: validation.filter(v => v.issues.includes('Invalid email format')).length,
      formattingIssues: validation.filter(v => v.issues.includes('Email has formatting issues')).length
    };
    
    res.json({
      validation,
      summary,
      fixApplied: fix === 'true'
    });
  } catch (error) {
    console.error('Error validating contacts:', error);
    res.status(500).json({ 
      error: 'Failed to validate contacts',
      message: error.message 
    });
  }
});

// Get specific row by row number
app.get('/sheets/:spreadsheetId/:sheetName/row/:rowNumber', async (req, res) => {
  try {
    const { spreadsheetId, sheetName, rowNumber } = req.params;
    const range = `${sheetName}!${rowNumber}:${rowNumber}`;
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    
    const values = response.data.values;
    if (!values || values.length === 0) {
      return res.status(404).json({ 
        error: 'Row not found',
        message: `Row ${rowNumber} not found in sheet ${sheetName}` 
      });
    }
    
    // Get headers for context
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!1:1`,
    });
    
    const headers = headerResponse.data.values?.[0] || [];
    const rowData = values[0];
    const rowObject = {};
    
    headers.forEach((header, index) => {
      rowObject[header] = rowData[index] || '';
    });
    
    res.json({
      rowNumber: parseInt(rowNumber),
      rawData: rowData,
      data: rowObject
    });
  } catch (error) {
    console.error('Error fetching row:', error);
    res.status(500).json({ 
      error: 'Failed to fetch row',
      message: error.message 
    });
  }
});

// Send emails to all valid emails in the sheet
app.post('/send-emails/:spreadsheetId/:range', async (req, res) => {
  try {
    const { spreadsheetId, range } = req.params;
    const { subject, body, templateType } = req.body;
    if (!subject || !body) {
      return res.status(400).json({ error: 'Subject and body are required' });
    }

    // Fetch contacts from the sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    const values = response.data.values;
    if (!values || values.length === 0) {
      return res.status(404).json({ error: 'No data found in sheet' });
    }
    const objects = convertToObjects(values);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    // Get contacts with name, email, and certificate link
    const contacts = objects.map(row => {
      const name = row['name'] || row['Name'] || row['Full Name'] || 
                   row[Object.keys(row).find(key => key.toLowerCase().includes('name'))] || '';
      const email = row['email'] || row['Email'] || row['Email Address'] || 
                    row[Object.keys(row).find(key => key.toLowerCase().includes('email') || key.toLowerCase().includes('mail'))] || '';
      const certificateLink = row['certificate'] || row['Certificate'] || 
                              row[Object.keys(row).find(key => key.toLowerCase().includes('certificate'))] || '';

      return {
        name: name.toString().trim(),
        email: email.toString().trim().toLowerCase(),
        certificateLink: certificateLink.toString().trim()
      };
    }).filter(contact => contact.email && emailRegex.test(contact.email) && contact.certificateLink); // Filter for valid emails and existing certificate links

    if (contacts.length === 0) {
      return res.status(400).json({ error: 'No valid contacts with certificate links found' });
    }

    // Send emails (sequentially for simplicity)
    let sent = 0, failed = 0, errors = [];
    for (const contact of contacts) {
      try {
        let personalizedBody = body;
        
        // If this is a certificate template, replace the name placeholder and the certificate link
        if (templateType === 'certificate') {
          // Replace any instance of "Congratulations!" with personalized message
          personalizedBody = personalizedBody.replace(
            /Congratulations!/g, 
            `Congratulations ${contact.name}!`
          );
          
          // Find and replace the certificate link in the HTML body
          personalizedBody = personalizedBody.replace(
            /<a href="#"([^>]*)>\s*Get Your Certificate\s*<\/a>/g,
            `<a href="${contact.certificateLink}"$1> 📜 Get your certificate </a>`
          );
        }

        await smtpTransporter.sendMail({
          from: process.env.SMTP_USER,
          to: contact.email,
          subject,
          html: personalizedBody,
        });
        sent++;
      } catch (err) {
        failed++;
        errors.push({ email: contact.email, error: err.message });
      }
    }
    res.json({
      message: `Emails sent: ${sent}, failed: ${failed}`,
      sent,
      failed,
      errors,
    });
  } catch (error) {
    console.error('Error sending emails:', error);
    res.status(500).json({ error: 'Failed to send emails', message: error.message });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: error.message 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    message: `Route ${req.method} ${req.path} not found` 
  });
});

app.listen(PORT, () => {
  console.log(`Google Sheets API Backend running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

module.exports = app;