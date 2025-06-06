import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Search, 
  Mail, 
  Users, 
  FileSpreadsheet, 
  Download, 
  Eye, 
  CheckCircle, 
  AlertCircle, 
  Copy, 
  RefreshCw 
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import EmailEditor from 'react-email-editor';

const API_BASE_URL = 'http://localhost:3000';

const SheetsApiFrontend = () => {
  const spreadsheetId = '1zm0XY3dMdik7mC4hkRK5Phyf0FAlF6putMoQbbJpNks';
  const [activeTab, setActiveTab] = useState('contacts');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [sheetMetadata, setSheetMetadata] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRange, setSelectedRange] = useState('Sheet1');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSendResult, setEmailSendResult] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const emailEditorRef = useRef(null);
  const [_editorLoaded, setEditorLoaded] = useState(false);
  const [templates, setTemplates] = useState({});

  // Load certificate template
  const loadCertificateTemplate = useCallback(async () => {
    try {
      const response = await fetch('/templates/certificate.json');
      if (!response.ok) {
        throw new Error('Failed to load certificate template');
      }
      const template = await response.json();
      setTemplates(prev => ({
        ...prev,
        certificate: template
      }));
      return template;
    } catch (error) {
      console.error('Error loading certificate template:', error);
      setError('Failed to load certificate template');
      return null;
    }
  }, []);

  // Load template into editor
  const loadTemplateInEditor = useCallback(async (templateName) => {
    console.log('Loading template:', templateName);
    if (!emailEditorRef.current) {
      console.error('Editor ref not available');
      return;
    }
    
    try {
      let template = templates[templateName];
      
      if (!template && templateName === 'certificate') {
        console.log('Loading certificate template...');
        template = await loadCertificateTemplate();
      }
      
      if (!template) {
        console.error('Template not found:', templateName);
        setError(`Template '${templateName}' not found`);
        return;
      }
      
      console.log('Template loaded, attempting to load design...', template);
      
      // Ensure we have the editor instance
      const loadDesign = () => {
        if (emailEditorRef.current?.editor) {
          console.log('Loading design into editor...');
          // Use the full template object, not just template.body
          emailEditorRef.current.editor.loadDesign(template);
          setSelectedTemplate(templateName);
          console.log('Design loaded successfully');
          return true;
        }
        return false;
      };

      // Try to load immediately
      if (!loadDesign()) {
        // If editor not ready, wait and try again
        console.log('Editor not ready, waiting...');
        const checkInterval = setInterval(() => {
          if (loadDesign()) {
            clearInterval(checkInterval);
          }
        }, 500);
        
        // Stop trying after 5 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          if (!emailEditorRef.current?.editor) {
            setError('Editor initialization timed out. Please refresh the page.');
          }
        }, 5000);
      }
    } catch (error) {
      console.error('Error in loadTemplateInEditor:', error);
      setError(`Failed to load template: ${error.message}`);
    }
  }, [templates, loadCertificateTemplate]);

  // API Functions
  const apiCall = useCallback(async (endpoint, options = {}) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSheetMetadata = useCallback(async () => {
    try {
      const metadata = await apiCall(`/sheets/${spreadsheetId}/metadata`);
      setSheetMetadata(metadata);
    } catch (err) {
      console.error('Failed to fetch metadata:', err);
    }
  }, [apiCall, spreadsheetId]);

  const fetchSheetData = useCallback(async (range = selectedRange) => {
    try {
      const sheetData = await apiCall(`/sheets/${spreadsheetId}/${range}`);
      setData(sheetData);
      return sheetData;
    } catch (err) {
      console.error('Failed to fetch sheet data:', err);
    }
  }, [apiCall, selectedRange, spreadsheetId]);

  // Load data when component mounts
  useEffect(() => {
    const loadInitialData = async () => {
      await fetchSheetMetadata();
      await fetchSheetData();
    };
    loadInitialData();
  }, [fetchSheetData, fetchSheetMetadata]);

  const fetchContacts = useCallback(async (range = selectedRange) => {
    try {
      const contacts = await apiCall(`/contacts/${spreadsheetId}/${range}`);
      setData(contacts);
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
    }
  }, [apiCall, selectedRange, spreadsheetId]);

  const fetchEmails = useCallback(async (range = selectedRange) => {
    try {
      const emails = await apiCall(`/emails/${spreadsheetId}/${range}`);
      setData(emails);
    } catch (err) {
      console.error('Failed to fetch emails:', err);
    }
  }, [apiCall, selectedRange, spreadsheetId]);

  const searchContacts = useCallback(async () => {
    if (!searchQuery) return;
    try {
      const results = await apiCall(`/contacts/${spreadsheetId}/${selectedRange}/search?query=${encodeURIComponent(searchQuery)}`);
      setData(results);
    } catch (err) {
      console.error('Failed to search contacts:', err);
    }
  }, [apiCall, searchQuery, selectedRange, spreadsheetId]);

  const validateContacts = useCallback(async () => {
    try {
      const validation = await apiCall(`/contacts/${spreadsheetId}/${selectedRange}/validate`);
      setData(validation);
    } catch (err) {
      console.error('Failed to validate contacts:', err);
    }
  }, [apiCall, selectedRange, spreadsheetId]);

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const downloadData = () => {
    if (!data) return;

    const dataStr = JSON.stringify(data, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = `sheet-data-${Date.now()}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && activeTab === 'search') {
      searchContacts();
    }
  };

  // Send emails to all valid emails in the selected range
  const sendEmails = async () => {
    setLoading(true);
    setEmailSendResult(null);
    setError('');
    try {
      // Get the HTML content from the editor
      const htmlContent = await new Promise((resolve) => {
        if (emailEditorRef.current && emailEditorRef.current.editor) {
          emailEditorRef.current.editor.exportHtml(data => {
            resolve(data.html);
          });
        } else {
          resolve(emailBody);
        }
      });

      const response = await fetch(`${API_BASE_URL}/send-emails/${spreadsheetId}/${selectedRange}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          subject: emailSubject, 
          body: htmlContent,
          templateType: 'certificate' // Add this to indicate we're sending certificates
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to send emails');
      setEmailSendResult(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditorLoad = (unlayer) => {
    console.log('Editor loaded, instance:', unlayer);
    setEditorLoaded(true);
    
    // Store the unlayer instance for direct access if needed
    if (emailEditorRef.current) {
      emailEditorRef.current.unlayer = unlayer;
    }
    
    // Load the certificate template
    loadTemplateInEditor('certificate');
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="w-auto min-h-screen p-4">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 w-full">
          <div className="flex items-center gap-3 mb-4">
            <FileSpreadsheet className="h-8 w-8 text-indigo-600" />
            <h1 className="text-3xl font-bold text-gray-900">Google Sheets API Dashboard</h1>
          </div>

          {/* Sheet Info */}
          {sheetMetadata && (
            <div className="space-y-4">
              {/* Range Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sheet Range
                </label>
                <select
                  value={selectedRange}
                  onChange={(e) => setSelectedRange(e.target.value)}
                  className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 w-full"
                >
                  {sheetMetadata.sheets.map((sheet) => (
                    <option key={sheet.sheetId} value={sheet.title}>
                      {sheet.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Spreadsheet Metadata */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="font-semibold text-gray-900 mb-2">
                  Spreadsheet: {sheetMetadata.title}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Sheets:</span>
                    <span className="ml-2 font-medium">{sheetMetadata.sheets.length}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">ID:</span>
                    <span className="ml-2 font-mono text-xs">
                      {sheetMetadata.spreadsheetId.slice(0, 20)}...
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="bg-white rounded-2xl shadow-xl mb-6">
          <div className="flex border-b border-gray-200">
            {[
              { id: 'contacts', label: 'Contacts', icon: Users },
              { id: 'emails', label: 'Emails', icon: Mail },
              { id: 'sheet', label: 'Sheet Data', icon: FileSpreadsheet },
              { id: 'search', label: 'Search', icon: Search },
              { id: 'validate', label: 'Validate', icon: CheckCircle },
              { id: 'sendmail', label: 'Send Email', icon: Mail },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {/* Contacts Tab */}
            {activeTab === 'contacts' && (
              <div>
                <div className="flex items-center gap-4 mb-6">
                  <button
                    onClick={() => fetchContacts()}
                    disabled={!spreadsheetId || loading}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Users className="h-4 w-4" />
                    {loading ? 'Loading...' : 'Fetch Contacts'}
                  </button>
                  
                  {data && (
                    <button
                      onClick={downloadData}
                      className="flex items-center gap-2 bg-gray-600 text-white px-4 py-3 rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </button>
                  )}
                </div>

                {data && data.contacts && (
                  <div>
                    {/* Statistics */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">{data.totalContacts || 0}</div>
                        <div className="text-sm text-blue-800">Total Contacts</div>
                      </div>
                      <div className="bg-green-50 p-4 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">{data.validEmails || 0}</div>
                        <div className="text-sm text-green-800">Valid Emails</div>
                      </div>
                      <div className="bg-red-50 p-4 rounded-lg">
                        <div className="text-2xl font-bold text-red-600">{data.invalidEmails || 0}</div>
                        <div className="text-sm text-red-800">Invalid Emails</div>
                      </div>
                      <div className="bg-purple-50 p-4 rounded-lg">
                        <div className="text-2xl font-bold text-purple-600">{data.contactsWithBoth || 0}</div>
                        <div className="text-sm text-purple-800">Complete Contacts</div>
                      </div>
                    </div>

                    {/* Contacts List */}
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border border-gray-300">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="border border-gray-300 px-4 py-2 text-left">ID</th>
                            <th className="border border-gray-300 px-4 py-2 text-left">Name</th>
                            <th className="border border-gray-300 px-4 py-2 text-left">Email</th>
                            <th className="border border-gray-300 px-4 py-2 text-center">Valid</th>
                            <th className="border border-gray-300 px-4 py-2 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.contacts.slice(0, 50).map((contact, index) => (
                            <tr key={contact.id || index} className="hover:bg-gray-50">
                              <td className="border border-gray-300 px-4 py-2">{contact.id || index + 1}</td>
                              <td className="border border-gray-300 px-4 py-2">{contact.name || '-'}</td>
                              <td className="border border-gray-300 px-4 py-2 font-mono text-sm">{contact.email || '-'}</td>
                              <td className="border border-gray-300 px-4 py-2 text-center">
                                {contact.email && (
                                  contact.isValidEmail ? (
                                    <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                                  ) : (
                                    <AlertCircle className="h-4 w-4 text-red-500 mx-auto" />
                                  )
                                )}
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-center">
                                {contact.email && (
                                  <button
                                    onClick={() => copyToClipboard(contact.email)}
                                    className="text-indigo-600 hover:text-indigo-800"
                                    title="Copy email"
                                  >
                                    <Copy className="h-4 w-4" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {data.contacts.length > 50 && (
                        <p className="text-sm text-gray-500 mt-2">Showing first 50 contacts of {data.contacts.length}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Emails Tab */}
            {activeTab === 'emails' && (
              <div>
                <div className="flex items-center gap-4 mb-6">
                  <button
                    onClick={() => fetchEmails()}
                    disabled={!spreadsheetId || loading}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Mail className="h-4 w-4" />
                    {loading ? 'Loading...' : 'Fetch Emails'}
                  </button>
                  
                  {data && data.emails && (
                    <button
                      onClick={() => copyToClipboard(data.emails.join(', '))}
                      className="flex items-center gap-2 bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <Copy className="h-4 w-4" />
                      Copy All Emails
                    </button>
                  )}
                </div>

                {data && data.emails && (
                  <div>
                    {/* Email Statistics */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">{data.totalEmails || 0}</div>
                        <div className="text-sm text-blue-800">Total Emails</div>
                      </div>
                      <div className="bg-green-50 p-4 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">{data.uniqueEmails || 0}</div>
                        <div className="text-sm text-green-800">Unique Emails</div>
                      </div>
                    </div>

                    {/* Email List */}
                    <div className="bg-gray-50 p-4 rounded-lg max-h-96 overflow-y-auto">
                      <div className="grid gap-2">
                        {data.emails.map((email, index) => (
                          <div key={index} className="flex items-center justify-between bg-white p-3 rounded border">
                            <span className="font-mono text-sm">{email}</span>
                            <button
                              onClick={() => copyToClipboard(email)}
                              className="text-indigo-600 hover:text-indigo-800"
                              title="Copy email"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sheet Data Tab */}
            {activeTab === 'sheet' && (
              <div>
                <div className="flex items-center gap-4 mb-6">
                  <button
                    onClick={() => fetchSheetData()}
                    disabled={!spreadsheetId || loading}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    {loading ? 'Loading...' : 'Fetch Sheet Data'}
                  </button>
                </div>

                {data && data.data && (
                  <div>
                    {/* Data Statistics */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">{data.rowCount || 0}</div>
                        <div className="text-sm text-blue-800">Total Rows</div>
                      </div>
                      <div className="bg-green-50 p-4 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">{data.columnCount || 0}</div>
                        <div className="text-sm text-green-800">Total Columns</div>
                      </div>
                    </div>

                    {/* Data Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border border-gray-300">
                        <thead>
                          <tr className="bg-gray-50">
                            {data.rawData && data.rawData[0] && data.rawData[0].map((header, index) => (
                              <th key={index} className="border border-gray-300 px-4 py-2 text-left">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {data.data.slice(0, 20).map((row, index) => (
                            <tr key={index} className="hover:bg-gray-50">
                              {Object.values(row).map((cell, cellIndex) => (
                                <td key={cellIndex} className="border border-gray-300 px-4 py-2 text-sm">
                                  {cell || '-'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {data.data.length > 20 && (
                        <p className="text-sm text-gray-500 mt-2">Showing first 20 rows of {data.data.length}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Search Tab */}
            {activeTab === 'search' && (
              <div>
                <div className="flex gap-4 mb-6">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Search contacts by name or email..."
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    onClick={searchContacts}
                    disabled={!spreadsheetId || !searchQuery || loading}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Search className="h-4 w-4" />
                    {loading ? 'Searching...' : 'Search'}
                  </button>
                </div>

                {data && data.results && (
                  <div>
                    <div className="mb-4">
                      <p className="text-gray-600">
                        Found {data.totalFound || 0} results for "{data.searchQuery}"
                      </p>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border border-gray-300">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="border border-gray-300 px-4 py-2 text-left">Name</th>
                            <th className="border border-gray-300 px-4 py-2 text-left">Email</th>
                            <th className="border border-gray-300 px-4 py-2 text-center">Valid</th>
                            <th className="border border-gray-300 px-4 py-2 text-center">Row</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.results.map((result, index) => (
                            <tr key={result.id || index} className="hover:bg-gray-50">
                              <td className="border border-gray-300 px-4 py-2">{result.name || '-'}</td>
                              <td className="border border-gray-300 px-4 py-2 font-mono text-sm">{result.email || '-'}</td>
                              <td className="border border-gray-300 px-4 py-2 text-center">
                                {result.email && (
                                  result.isValidEmail ? (
                                    <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                                  ) : (
                                    <AlertCircle className="h-4 w-4 text-red-500 mx-auto" />
                                  )
                                )}
                              </td>
                              <td className="border border-gray-300 px-4 py-2 text-center">{result.originalRow || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Validate Tab */}
            {activeTab === 'validate' && (
              <div>
                <div className="flex items-center gap-4 mb-6">
                  <button
                    onClick={() => validateContacts()}
                    disabled={!spreadsheetId || loading}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <CheckCircle className="h-4 w-4" />
                    {loading ? 'Validating...' : 'Validate Contacts'}
                  </button>
                </div>

                {data && data.summary && (
                  <div>
                    {/* Validation Summary */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">{data.summary.totalRows || 0}</div>
                        <div className="text-sm text-blue-800">Total Rows</div>
                      </div>
                      <div className="bg-green-50 p-4 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">{data.summary.validContacts || 0}</div>
                        <div className="text-sm text-green-800">Valid Contacts</div>
                      </div>
                      <div className="bg-red-50 p-4 rounded-lg">
                        <div className="text-2xl font-bold text-red-600">{data.summary.invalidContacts || 0}</div>
                        <div className="text-sm text-red-800">Invalid Contacts</div>
                      </div>
                      <div className="bg-yellow-50 p-4 rounded-lg">
                        <div className="text-2xl font-bold text-yellow-600">{data.summary.invalidEmails || 0}</div>
                        <div className="text-sm text-yellow-800">Invalid Emails</div>
                      </div>
                    </div>

                    {/* Validation Results */}
                    {data.validation && (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse border border-gray-300">
                          <thead>
                            <tr className="bg-gray-50">
                              <th className="border border-gray-300 px-4 py-2 text-left">Row</th>
                              <th className="border border-gray-300 px-4 py-2 text-left">Name</th>
                              <th className="border border-gray-300 px-4 py-2 text-left">Email</th>
                              <th className="border border-gray-300 px-4 py-2 text-center">Status</th>
                              <th className="border border-gray-300 px-4 py-2 text-left">Issues</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.validation.slice(0, 50).map((item, index) => (
                              <tr key={item.row || index} className={`hover:bg-gray-50 ${item.hasIssues ? 'bg-red-50' : 'bg-green-50'}`}>
                                <td className="border border-gray-300 px-4 py-2">{item.row || index + 1}</td>
                                <td className="border border-gray-300 px-4 py-2">{item.name || '-'}</td>
                                <td className="border border-gray-300 px-4 py-2 font-mono text-sm">{item.cleanedEmail || '-'}</td>
                                <td className="border border-gray-300 px-4 py-2 text-center">
                                  {item.hasIssues ? (
                                    <AlertCircle className="h-4 w-4 text-red-500 mx-auto" />
                                  ) : (
                                    <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                                  )}
                                </td>
                                <td className="border border-gray-300 px-4 py-2 text-sm">
                                  {item.issues && item.issues.length > 0 ? item.issues.join(', ') : 'No issues'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {data.validation.length > 50 && (
                          <p className="text-sm text-gray-500 mt-2">Showing first 50 rows of {data.validation.length}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Send Email Tab */}
            {activeTab === 'sendmail' && (
              <div>
                <div className="mb-6">
                  <h2 className="text-xl font-bold mb-2">Send Email to All Valid Emails</h2>
                  {/* Template Selector */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Choose Template</label>
                    <div className="flex gap-2 w-full">
                      <select 
                        value={selectedTemplate} 
                        onChange={(e) => setSelectedTemplate(e.target.value)}
                        className="bg-gray-700 text-white px-3 py-2 rounded-md flex-1"
                      >
                        <option value="">Select Template</option>
                        <option value="welcome">Welcome Email</option>
                        <option value="newsletter">Newsletter</option>
                        <option value="certificate">Certificate Template</option>
                      </select>
                      <button
                        onClick={() => selectedTemplate && loadTemplateInEditor(selectedTemplate)}
                        disabled={!selectedTemplate}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md disabled:bg-gray-600 disabled:cursor-not-allowed"
                      >
                        Load Template
                      </button>
                    </div>
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      placeholder="Enter email subject"
                    />
                  </div>
                  {/* Email Editor */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
                    <div className="w-full border rounded-lg overflow-hidden">
                      <div className="flex-1 flex flex-col" style={{ minHeight: '600px' }}>
                        <div className="flex-1 flex flex-col border border-gray-200 rounded-lg overflow-hidden">
                          <EmailEditor
                            ref={emailEditorRef}
                            onLoad={handleEditorLoad}
                            style={{
                              flex: 1,
                              minHeight: '600px',
                              width: '100%',
                              display: 'flex',
                              flexDirection: 'column'
                            }}
                            options={{
                              displayMode: 'email',
                              safeHtml: true,
                              features: {
                                stockImages: false,
                                undoRedo: true,
                                textEditor: {
                                  minHeight: '500px'
                                },
                                imageEditor: {
                                  enabled: true
                                }
                              },
                              appearance: {
                                theme: 'light',
                                panels: {
                                  tools: {
                                    dock: 'left',
                                    enabled: true
                                  }
                                },
                                panels2: {
                                  tools: {
                                    dock: 'right'
                                  }
                                }
                              },
                              locale: 'en-US',
                              customCSS: `
                                #__next, body, html {
                                  height: 100% !important;
                                  margin: 0 !important;
                                  padding: 0 !important;
                                  overflow: hidden !important;
                                }
                                .container {
                                  height: 100% !important;
                                  min-height: 100% !important;
                                }
                                .builder-sidebar, .builder-preview, .builder-canvas {
                                  min-height: 100% !important;
                                }
                              `,
                              mergeTags: [],
                              customJS: []
                            }}
                            minHeight={600}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      if (emailEditorRef.current && emailEditorRef.current.editor) {
                        emailEditorRef.current.editor.exportHtml(data => {
                          setEmailBody(data.html);
                          sendEmails();
                        });
                      } else {
                        sendEmails();
                      }
                    }}
                    disabled={!emailSubject || loading}
                    className="bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? 'Sending...' : 'Send Email'}
                  </button>
                </div>
                {emailSendResult && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                    <div className="font-semibold text-green-700 mb-2">{emailSendResult.message}</div>
                    {emailSendResult.errors && emailSendResult.errors.length > 0 && (
                      <div>
                        <div className="font-medium text-red-700 mb-1">Failed Emails:</div>
                        <ul className="list-disc ml-6 text-sm text-red-700">
                          {emailSendResult.errors.map((err, idx) => (
                            <li key={idx}>{err.email}: {err.error}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <p className="text-red-700">Error: {error}</p>
            </div>
          </div>
        )}

        {/* Loading Indicator */}
        {loading && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 flex items-center gap-3">
              <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
              <p className="text-gray-700">Loading...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SheetsApiFrontend;